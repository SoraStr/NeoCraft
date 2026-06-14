//! Detect installed Java versions by scanning common paths and querying version info.

use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub struct JavaInstallation {
    pub path: String,
    pub version: String,
    pub major_version: u32,
    pub vendor: String,
}

/// Scan common JDK/JRE install paths and run `java -version` to discover installations.
pub fn detect_java_versions() -> Vec<JavaInstallation> {
    let mut seen = std::collections::HashSet::new();
    let mut results = Vec::new();

    // Common search directories per platform
    let search_roots = if cfg!(target_os = "macos") {
        vec![
            "/usr/lib/jvm",
            "/opt/homebrew/opt",
            "/Library/Java/JavaVirtualMachines",
            "/usr/local/opt",
        ]
    } else if cfg!(target_os = "linux") {
        vec!["/usr/lib/jvm", "/usr/local/lib/jvm", "/usr/java"]
    } else if cfg!(target_os = "windows") {
        vec!["C:\\Program Files\\Java", "C:\\Program Files\\Eclipse Adoptium"]
    } else {
        vec![]
    };

    // Check each root for java binaries
    for root in &search_roots {
        let root_path = std::path::Path::new(root);
        if !root_path.exists() {
            continue;
        }
        find_java_in_dir(root_path, &mut seen, &mut results);
    }

    // Also check the default system "java" in PATH
    if let Some(info) = query_java_version("java") {
        let canonical = if let Ok(p) = std::fs::canonicalize(&info.path) {
            p.to_string_lossy().to_string()
        } else {
            info.path.clone()
        };
        if seen.insert(canonical.clone()) {
            results.push(JavaInstallation {
                path: canonical,
                ..info
            });
        }
    }

    // Sort by major version descending (newest first)
    results.sort_by(|a, b| b.major_version.cmp(&a.major_version));
    results
}

fn find_java_in_dir(
    dir: &std::path::Path,
    seen: &mut std::collections::HashSet<String>,
    results: &mut Vec<JavaInstallation>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().map(|n| n.to_string_lossy().to_lowercase()).unwrap_or_default();

        // Skip symlinks to already-seen paths
        if path.is_symlink() {
            if let Ok(target) = std::fs::canonicalize(&path) {
                let key = format!("sym:{}", target.to_string_lossy());
                if !seen.insert(key) {
                    continue;
                }
            }
        }

        if path.is_dir() {
            // macOS: /Library/Java/JavaVirtualMachines/<name>/Contents/Home/bin/java
            let home_bin = path.join("Contents").join("Home").join("bin").join(java_binary());
            if home_bin.exists() {
                check_and_add(&home_bin, seen, results);
            }

            // Homebrew: /opt/homebrew/opt/openjdk@21/bin/java
            let bin_java = path.join("bin").join(java_binary());
            if bin_java.exists() {
                check_and_add(&bin_java, seen, results);
            }

            // Recursively search one level for known patterns
            if name.contains("java") || name.contains("jdk") || name.contains("jre") || name.contains("openjdk") {
                find_java_in_dir(&path, seen, results);
            }
        }
    }
}

fn check_and_add(
    path: &std::path::Path,
    seen: &mut std::collections::HashSet<String>,
    results: &mut Vec<JavaInstallation>,
) {
    let canonical = std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| path.to_string_lossy().to_string());

    if !seen.insert(canonical.clone()) {
        return;
    }

    if let Some(info) = query_java_version(&canonical) {
        results.push(JavaInstallation {
            path: canonical,
            ..info
        });
    }
}

fn query_java_version(java_path: &str) -> Option<JavaInstallation> {
    let output = Command::new(java_path)
        .arg("-XshowSettings:all")
        .arg("-version")
        .output()
        .or_else(|_| {
            Command::new(java_path)
                .arg("-version")
                .output()
        })
        .ok()?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);

    // Parse version from "openjdk version \"21.0.6\" 2025-04-15" or
    // "java version \"1.8.0_402\"" or "openjdk 21.0.6 2025-04-15"
    let version_str = stderr
        .lines()
        .chain(stdout.lines())
        .find_map(|line| {
            let line = line.trim();
            if let Some(start) = line.find("version \"") {
                let rest = &line[start + 9..];
                rest.split('"').next()
            } else if line.starts_with("openjdk ") {
                line.split_whitespace().nth(1)
            } else {
                None
            }
        })
        .unwrap_or("unknown");

    let major = parse_major_version(version_str);

    // Parse vendor from stderr
    let vendor = stderr
        .lines()
        .find_map(|line| {
            let line = line.trim().to_lowercase();
            if line.contains("openjdk") { Some("OpenJDK") }
            else if line.contains("graalvm") { Some("GraalVM") }
            else if line.contains("zulu") { Some("Azul Zulu") }
            else if line.contains("corretto") { Some("Amazon Corretto") }
            else if line.contains("temurin") || line.contains("adoptium") { Some("Eclipse Temurin") }
            else if line.contains("ibm") || line.contains("semeru") { Some("IBM Semeru") }
            else { None }
        })
        .unwrap_or("Unknown");

    let full_version = if major == 8 {
        format!("1.8 ({})", version_str)
    } else {
        version_str.to_string()
    };

    Some(JavaInstallation {
        path: java_path.to_string(),
        version: full_version,
        major_version: major,
        vendor: vendor.to_string(),
    })
}

fn parse_major_version(version: &str) -> u32 {
    // "21.0.6" -> 21
    // "1.8.0_402" -> 8
    let parts: Vec<&str> = version.split(|c: char| c == '.' || c == '_').collect();
    if parts.len() >= 2 && parts[0] == "1" {
        // JDK 1.8.x style
        parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0)
    } else {
        parts.first().and_then(|s| s.parse().ok()).unwrap_or(0)
    }
}

#[cfg(not(target_os = "windows"))]
fn java_binary() -> &'static str {
    "java"
}

#[cfg(target_os = "windows")]
fn java_binary() -> &'static str {
    "java.exe"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_major_new() {
        assert_eq!(parse_major_version("21.0.6"), 21);
        assert_eq!(parse_major_version("17.0.10"), 17);
        assert_eq!(parse_major_version("11.0.22"), 11);
    }

    #[test]
    fn test_parse_major_old() {
        assert_eq!(parse_major_version("1.8.0_402"), 8);
        assert_eq!(parse_major_version("1.7.0_80"), 7);
    }

    #[test]
    fn test_parse_major_unknown() {
        assert_eq!(parse_major_version("unknown"), 0);
        assert_eq!(parse_major_version(""), 0);
    }
}
