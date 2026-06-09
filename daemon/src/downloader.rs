//! Downloader — fetch Minecraft server JARs with progress reporting and cache.

use crate::protocol::Event;
use std::path::{Path, PathBuf};
use tokio::sync::broadcast;

#[derive(Debug, thiserror::Error)]
pub enum DownloadError {
    #[error("HTTP request failed: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Download URL is empty")]
    EmptyUrl,
    #[error("Server returned status {0}")]
    BadStatus(u16),
}

/// Cache info for reusing downloaded JARs across instances.
pub struct CacheInfo {
    pub cache_dir: PathBuf,
    pub server_type: String,
    pub version: String,
    /// Optional download URL hash to disambiguate same-type+version variants
    /// (e.g. Fabric with different loader/installer combinations).
    pub url_hash: Option<String>,
}

impl CacheInfo {
    /// Build the cached file path.
    /// If `url_hash` is set, the filename includes a short hash to prevent
    /// collisions between different builds of the same type+version.
    pub fn cached_path(&self) -> PathBuf {
        if let Some(ref hash) = self.url_hash {
            self.cache_dir.join(format!(
                "{}-{}-{}.jar",
                self.server_type, self.version, hash
            ))
        } else {
            self.cache_dir
                .join(format!("{}-{}.jar", self.server_type, self.version))
        }
    }
}

/// Download a JAR file with progress events emitted via broadcast channel.
/// If `cache` is provided, checks the cache first — reuses cached file if it exists.
/// On fresh download, the file is downloaded to the cache first, then copied to dest.
pub async fn download_jar(
    url: &str,
    dest: &Path,
    instance_id: &str,
    event_tx: &broadcast::Sender<Event>,
    cache: Option<&CacheInfo>,
) -> Result<u64, DownloadError> {
    if url.is_empty() {
        return Err(DownloadError::EmptyUrl);
    }

    // Ensure parent directory exists
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let task_id = format!("download:{}", instance_id);

    // ── Cache hit: copy from cache ──────────────────────────────
    if let Some(c) = cache {
        let cached = c.cached_path();
        if cached.exists() {
            let size = cached.metadata()?.len();
            // Emit a quick 0→100 progress
            let _ = event_tx.send(Event::DownloadProgress {
                task_id: task_id.clone(),
                downloaded: 0,
                total: size,
                percent: 0.0,
                phase: Some("download".into()),
                status: None,
            });
            tokio::fs::copy(&cached, dest).await?;
            let _ = event_tx.send(Event::DownloadProgress {
                task_id: task_id.clone(),
                downloaded: size,
                total: size,
                percent: 100.0,
                phase: Some("download".into()),
                status: None,
            });
            return Ok(size);
        }

        // Ensure cache dir exists
        tokio::fs::create_dir_all(&c.cache_dir).await?;
    }

    // ── Download ────────────────────────────────────────────────
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(DownloadError::Http)?;
    let response = client
        .get(url)
        .header("User-Agent", "NeoCraft/0.1")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(DownloadError::BadStatus(response.status().as_u16()));
    }

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    // Determine the actual download target: cache file if provided, otherwise dest
    let dl_target = if let Some(c) = cache {
        c.cached_path()
    } else {
        dest.to_path_buf()
    };

    let mut file = tokio::fs::File::create(&dl_target).await?;
    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();

    // Emit initial progress
    let _ = event_tx.send(Event::DownloadProgress {
        task_id: task_id.clone(),
        downloaded: 0,
        total,
        percent: 0.0,
        phase: Some("download".into()),
        status: None,
    });

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
        downloaded += chunk.len() as u64;

        let now = std::time::Instant::now();
        let elapsed = now.duration_since(last_emit).as_millis();
        let is_first = downloaded <= chunk.len() as u64;
        if is_first || elapsed >= 100 {
            last_emit = now;
            let percent = if total > 0 {
                (downloaded as f64 / total as f64) * 100.0
            } else {
                (elapsed as f64 / 30_000.0 * 100.0).min(99.0)
            };
            let _ = event_tx.send(Event::DownloadProgress {
                task_id: task_id.clone(),
                downloaded,
                total,
                percent,
                phase: Some("download".into()),
                status: None,
            });
        }
    }

    // If downloaded to cache, copy to actual destination
    if dl_target != *dest {
        tokio::fs::copy(&dl_target, dest).await?;
    }

    // Final 100%
    let final_total = if total == 0 { downloaded } else { total };
    let _ = event_tx.send(Event::DownloadProgress {
        task_id,
        downloaded,
        total: final_total,
        percent: 100.0,
        phase: Some("download".into()),
        status: None,
    });

    Ok(downloaded)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cache_path_format() {
        let cache = CacheInfo {
            cache_dir: PathBuf::from("/tmp/neocraft-cache"),
            server_type: "paper".into(),
            version: "1.21.5".into(),
            url_hash: None,
        };
        assert_eq!(
            cache.cached_path(),
            PathBuf::from("/tmp/neocraft-cache/paper-1.21.5.jar")
        );
    }

    #[test]
    fn test_cache_path_with_different_types() {
        let vanilla = CacheInfo {
            cache_dir: PathBuf::from("/cache"),
            server_type: "vanilla".into(),
            version: "1.21.0".into(),
            url_hash: None,
        };
        assert_eq!(
            vanilla.cached_path(),
            PathBuf::from("/cache/vanilla-1.21.0.jar")
        );

        let fabric = CacheInfo {
            cache_dir: PathBuf::from("/cache"),
            server_type: "fabric".into(),
            version: "1.20.4".into(),
            url_hash: None,
        };
        assert_eq!(
            fabric.cached_path(),
            PathBuf::from("/cache/fabric-1.20.4.jar")
        );
    }
}
