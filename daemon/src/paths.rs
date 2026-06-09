//! Cross-platform path helpers for daemon bootstrap.

use std::path::PathBuf;

pub fn resolve_user_path(path: &str) -> PathBuf {
    if path == "~" {
        return dirs::home_dir().expect("could not determine home directory");
    }

    if let Some(rest) = path.strip_prefix("~/") {
        return dirs::home_dir()
            .expect("could not determine home directory")
            .join(rest);
    }

    PathBuf::from(path)
}
