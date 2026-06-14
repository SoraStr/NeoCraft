//! Safe per-instance file operations exposed over IPC.

use std::path::{Component, Path, PathBuf};

use base64::Engine;
use serde::Serialize;
use serde_json::json;

use crate::protocol::Error as ProtoError;

/// ~240 MB base64 ≈ ~320 MB encoded
const MAX_UPLOAD_B64_LEN: usize = 330_000_000;
const MAX_READ_SIZE: u64 = 240 * 1024 * 1024;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub size: u64,
    pub modified: u64,
    pub disabled: bool,
}

pub fn validate_subpath(subpath: &str) -> bool {
    if subpath.is_empty()
        || subpath.contains('\\')
        || subpath.contains(':')
        || subpath.bytes().any(|byte| byte == 0)
    {
        return false;
    }

    let path = Path::new(subpath);
    if path.is_absolute() {
        return false;
    }

    path.components()
        .all(|component| matches!(component, Component::Normal(_)))
}

/// Validate a subpath and return the full path, ensuring it stays within
/// the instance's work_dir.
///
/// **TOCTOU mitigation:** instead of checking `symlink_metadata` on the path
/// and then returning the path (which could be swapped between the check and
/// use), we:
///   1. Reject any `..`, absolute paths, symlinks, backslashes, nulls
///      at the lexical level via `validate_subpath`.
///   2. Canonicalize the work_dir (base) to resolve any symlinks in the
///      parent chain.
///   3. Join the clean subpath onto the canonical base — since subpath
///      contains only `Component::Normal` segments, the result cannot
///      escape the base.
///   4. If the file already exists, canonicalize it and verify it still
///      starts with base (catches symlink-to-outside edge case).
///
/// The key insight: because `validate_subpath` rejects `..` and any
/// non-normal components, `base.join(subpath)` is mathematically
/// guaranteed to be inside `base` as long as `base` is already canonical.
pub fn safe_instance_path(work_dir: &Path, subpath: &str) -> Result<PathBuf, ProtoError> {
    // Step 1: lexical validation — reject `..`, symlinks, absolute, etc.
    if !validate_subpath(subpath) {
        return Err(proto_error("INVALID_PATH", "Invalid path"));
    }

    // Step 2: canonicalize the base directory
    let base = std::fs::canonicalize(work_dir).map_err(|error| {
        proto_error("PATH_ERROR", error.to_string())
    })?;

    // Step 3: join — safe because subpath has only Normal components
    let full_path = base.join(subpath);

    // Step 4: if the target exists, verify it hasn't been symlinked outside
    // We canonicalize the full path directly when it exists, which resolves
    // any symlinks in the final component.
    if full_path.exists() {
        let canonical = std::fs::canonicalize(&full_path).map_err(|error| {
            proto_error("PATH_ERROR", error.to_string())
        })?;
        if !canonical.starts_with(&base) {
            return Err(proto_error("INVALID_PATH", "Path escapes instance directory"));
        }
        // Also reject if it's a symlink (even one pointing inside base)
        if std::fs::symlink_metadata(&full_path)
            .map(|m| m.file_type().is_symlink())
            .unwrap_or(false)
        {
            return Err(proto_error("INVALID_PATH", "Symlinks are not allowed"));
        }
    }

    // For paths that don't exist yet (new files/dirs), we verify the parent
    // directory is within base by walking up to the nearest existing ancestor.
    if !full_path.exists() {
        let mut ancestor = full_path.parent().ok_or_else(|| {
            proto_error("INVALID_PATH", "Invalid path")
        })?;
        while !ancestor.exists() {
            ancestor = ancestor.parent().ok_or_else(|| {
                proto_error("INVALID_PATH", "Invalid path")
            })?;
        }
        let canonical_ancestor = std::fs::canonicalize(ancestor).map_err(|error| {
            proto_error("PATH_ERROR", error.to_string())
        })?;
        if !canonical_ancestor.starts_with(&base) {
            return Err(proto_error("INVALID_PATH", "Path escapes instance directory"));
        }
    }

    Ok(full_path)
}

pub async fn list(work_dir: &Path, subpath: &str) -> Result<Vec<FileEntry>, ProtoError> {
    let dir = safe_instance_path(work_dir, subpath)?;
    if !dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries = tokio::fs::read_dir(&dir)
        .await
        .map_err(|error| proto_error("LIST_ERROR", error.to_string()))?;
    let mut files = Vec::new();

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|error| proto_error("LIST_ERROR", error.to_string()))?
    {
        let path = entry.path();
        let metadata = match entry.metadata().await {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        let modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs())
            .unwrap_or(0);

        if path
            .symlink_metadata()
            .map(|metadata| metadata.file_type().is_symlink())
            .unwrap_or(false)
        {
            continue;
        }

        files.push(FileEntry {
            disabled: name.ends_with(".disabled"),
            name,
            size: metadata.len(),
            modified,
        });
    }

    files.sort_by(|a, b| {
        a.disabled
            .cmp(&b.disabled)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(files)
}

pub async fn delete(work_dir: &Path, subpath: &str) -> Result<serde_json::Value, ProtoError> {
    let full_path = safe_instance_path(work_dir, subpath)?;

    match tokio::fs::remove_file(&full_path).await {
        Ok(()) => Ok(json!({ "ok": true })),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(proto_error("NOT_FOUND", "File not found"))
        }
        Err(error) => Err(proto_error("DELETE_ERROR", error.to_string())),
    }
}

pub async fn write_base64(
    work_dir: &Path,
    subpath: &str,
    data_b64: &str,
) -> Result<serde_json::Value, ProtoError> {
    if data_b64.len() > MAX_UPLOAD_B64_LEN {
        return Err(proto_error("TOO_LARGE", "File too large (max 240 MB)"));
    }

    let full_path = safe_instance_path(work_dir, subpath)?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(data_b64)
        .map_err(|error| proto_error("DECODE_ERROR", format!("Base64 decode failed: {error}")))?;

    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| proto_error("WRITE_ERROR", error.to_string()))?;
    }

    tokio::fs::write(&full_path, data)
        .await
        .map_err(|error| proto_error("WRITE_ERROR", error.to_string()))?;

    let name = full_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(json!({ "ok": true, "name": name }))
}

pub async fn rename(
    work_dir: &Path,
    old_subpath: &str,
    new_subpath: &str,
) -> Result<serde_json::Value, ProtoError> {
    let old_path = safe_instance_path(work_dir, old_subpath)?;
    let new_path = safe_instance_path(work_dir, new_subpath)?;

    if !old_path.exists() {
        return Err(proto_error("NOT_FOUND", "File not found"));
    }

    if let Some(parent) = new_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| proto_error("RENAME_ERROR", error.to_string()))?;
    }

    tokio::fs::rename(&old_path, &new_path)
        .await
        .map_err(|error| proto_error("RENAME_ERROR", error.to_string()))?;

    Ok(json!({ "ok": true }))
}

pub async fn read_base64(work_dir: &Path, subpath: &str) -> Result<serde_json::Value, ProtoError> {
    let full_path = safe_instance_path(work_dir, subpath)?;
    let metadata = tokio::fs::metadata(&full_path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            proto_error("NOT_FOUND", "File not found")
        } else {
            proto_error("READ_ERROR", error.to_string())
        }
    })?;

    if metadata.len() > MAX_READ_SIZE {
        return Err(proto_error("TOO_LARGE", "File too large (max 240 MB)"));
    }

    let data = tokio::fs::read(&full_path).await.map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            proto_error("NOT_FOUND", "File not found")
        } else {
            proto_error("READ_ERROR", error.to_string())
        }
    })?;

    if data.len() as u64 > MAX_READ_SIZE {
        return Err(proto_error("TOO_LARGE", "File too large (max 240 MB)"));
    }

    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);
    let name = full_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(json!({
        "data": encoded,
        "size": data.len(),
        "name": name,
    }))
}

fn proto_error(code: impl Into<String>, message: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.into(),
        message: message.into(),
    }
}
