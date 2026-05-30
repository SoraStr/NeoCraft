//! Downloader — fetch Minecraft server JARs with progress reporting.

use crate::protocol::Event;
use std::path::Path;
use tokio::sync::broadcast;
use std::time::{SystemTime, UNIX_EPOCH};

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

/// Download a JAR file with progress events emitted via broadcast channel.
/// Returns the number of bytes written.
pub async fn download_jar(
    url: &str,
    dest: &Path,
    instance_id: &str,
    event_tx: &broadcast::Sender<Event>,
) -> Result<u64, DownloadError> {
    if url.is_empty() {
        return Err(DownloadError::EmptyUrl);
    }

    // Ensure parent directory exists
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let client = reqwest::Client::new();
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
    let mut file = tokio::fs::File::create(dest).await?;

    let mut stream = response.bytes_stream();
    let mut last_emit = std::time::Instant::now();
    let task_id = format!("download:{}", instance_id);

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk).await?;
        downloaded += chunk.len() as u64;

        // Emit progress every 100ms to avoid flooding
        let now = std::time::Instant::now();
        if now.duration_since(last_emit).as_millis() >= 100 || downloaded == total {
            last_emit = now;
            let percent = if total > 0 {
                (downloaded as f64 / total as f64) * 100.0
            } else {
                0.0
            };
            let _ = event_tx.send(Event::DownloadProgress {
                task_id: task_id.clone(),
                downloaded,
                total,
                percent,
            });
        }
    }

    Ok(downloaded)
}
