//! Server type and version detection for imported server directories.
//!
//! Strategies (tried in order for each JAR file):
//! 1. `install.properties` → Fabric
//! 2. `version.json` → Custom
//! 3. `versions/minecraft.txt` (+ `versions/forge.txt`) → Custom or Forge

use std::path::{Path, PathBuf};
use crate::instance::{ServerType, InstanceError};

/// Result of server detection in an imported directory.
pub struct DetectedServer {
    /// The JAR filename (relative to the source directory).
    pub jar_filename: PathBuf,
    /// Detected server type.
    pub server_type: ServerType,
    /// Human-readable version string (e.g. "1.21.5" or "1.21.5 Forge 52.0.1").
    pub version: String,
}

/// Parse the Minecraft version from a server JAR file by reading `version.json`
/// inside the ZIP archive. Returns the `name` field (e.g. "1.21.5").
pub fn parse_jar_version(jar_path: &Path) -> Result<String, InstanceError> {
    let file = std::fs::File::open(jar_path).map_err(|e| {
        InstanceError::Io(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            format!("Cannot open JAR at {}: {}", jar_path.display(), e),
        ))
    })?;

    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| InstanceError::JarRead(format!("Failed to read JAR as ZIP: {}", e)))?;

    let version_entry = archive.by_name("version.json").map_err(|_| {
        InstanceError::JarRead(
            "version.json not found in JAR — this may not be a modern Minecraft server JAR".into(),
        )
    })?;

    let json: serde_json::Value =
        serde_json::from_reader(version_entry).map_err(|e| {
            InstanceError::JarRead(format!("Failed to parse version.json: {}", e))
        })?;

    json["name"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| InstanceError::JarRead("version.json missing 'name' field".into()))
}

/// Try to read version info from `versions/minecraft.txt` (and optionally
/// `versions/forge.txt`) inside a JAR (ZIP) archive.
fn detect_from_jar_txt(archive: &mut zip::ZipArchive<std::fs::File>) -> Result<Option<(ServerType, String)>, InstanceError> {
    let mc_entry = match archive.by_name("versions/minecraft.txt") {
        Ok(entry) => entry,
        Err(_) => return Ok(None),
    };

    use std::io::Read;
    let mut minecraft_version = String::new();
    std::io::BufReader::new(mc_entry).read_to_string(&mut minecraft_version)
        .map_err(|e| InstanceError::JarRead(format!("Failed to read versions/minecraft.txt from JAR: {}", e)))?;
    let minecraft_version = minecraft_version.trim().to_string();

    if minecraft_version.is_empty() {
        return Ok(None);
    }

    if let Ok(forge_entry) = archive.by_name("versions/forge.txt") {
        let mut forge_version = String::new();
        std::io::BufReader::new(forge_entry).read_to_string(&mut forge_version)
            .map_err(|e| InstanceError::JarRead(format!("Failed to read versions/forge.txt from JAR: {}", e)))?;
        let forge_version = forge_version.trim().to_string();

        if !forge_version.is_empty() {
            tracing::info!(mc = %minecraft_version, forge = %forge_version, "Detected Forge server via versions/*.txt inside JAR");
            return Ok(Some((ServerType::Forge, format!("{} Forge {}", minecraft_version, forge_version))));
        }
    }

    tracing::info!(mc = %minecraft_version, "Detected custom server via versions/minecraft.txt inside JAR");
    Ok(Some((ServerType::Custom, minecraft_version)))
}

/// Try to detect Fabric server from `install.properties` inside a JAR (ZIP).
fn detect_fabric_jar(
    jar: &Path,
    archive: &mut zip::ZipArchive<std::fs::File>,
) -> Option<(String, String)> {
    let entry = archive.by_name("install.properties").ok()?;
    use std::io::Read;
    let mut content = String::new();
    std::io::BufReader::new(entry).read_to_string(&mut content).ok()?;

    let mut loader_ver = None;
    let mut game_ver = None;
    for line in content.lines() {
        let trimmed = line.trim();
        if let Some(val) = trimmed.strip_prefix("fabric-loader-version=") {
            loader_ver = Some(val.to_string());
        } else if let Some(val) = trimmed.strip_prefix("game-version=") {
            game_ver = Some(val.to_string());
        }
    }

    let loader_ver = loader_ver?;
    let game_ver = game_ver?;
    if loader_ver.is_empty() || game_ver.is_empty() { return None; }

    tracing::info!(jar = %jar.display(), mc = %game_ver, loader = %loader_ver, "Detected Fabric server from install.properties inside JAR");
    Some((loader_ver, game_ver))
}

/// Scan a directory for a valid Minecraft server and detect its type/version.
pub fn detect_server(dir: &Path) -> Result<DetectedServer, InstanceError> {
    let mut jar_candidates: Vec<PathBuf> = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "jar").unwrap_or(false) {
                jar_candidates.push(path);
            }
        }
    }

    if jar_candidates.is_empty() {
        return Err(InstanceError::JarRead(format!("No .jar files found in {}", dir.display())));
    }

    let mut errors: Vec<String> = Vec::new();

    for jar in &jar_candidates {
        let file = std::fs::File::open(jar).map_err(|e| {
            InstanceError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Cannot open JAR at {}: {}", jar.display(), e),
            ))
        })?;

        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| InstanceError::JarRead(format!("Failed to read JAR as ZIP: {}", e)))?;

        // Strategy 0: install.properties → Fabric
        if let Some((loader_ver, mc_ver)) = detect_fabric_jar(jar, &mut archive) {
            return Ok(DetectedServer {
                jar_filename: jar.file_name().unwrap_or_default().into(),
                server_type: ServerType::Fabric,
                version: format!("{} Fabric {}", mc_ver, loader_ver),
            });
        }

        // Strategy 1: version.json → Custom
        if let Ok(entry) = archive.by_name("version.json") {
            let json: serde_json::Value = serde_json::from_reader(entry)
                .map_err(|e| InstanceError::JarRead(format!("Failed to parse version.json: {}", e)))?;
            if let Some(version) = json["name"].as_str() {
                tracing::info!(jar = %jar.display(), version = %version, "Found server JAR with version.json");
                return Ok(DetectedServer {
                    jar_filename: jar.file_name().unwrap_or_default().into(),
                    server_type: ServerType::Custom,
                    version: version.to_string(),
                });
            }
        }

        // Strategy 2: versions/minecraft.txt (+ versions/forge.txt)
        match detect_from_jar_txt(&mut archive) {
            Ok(Some((server_type, version))) => {
                return Ok(DetectedServer {
                    jar_filename: jar.file_name().unwrap_or_default().into(),
                    server_type,
                    version,
                });
            }
            Ok(None) => {
                errors.push(format!(
                    "  {}: no version.json and no versions/minecraft.txt inside JAR",
                    jar.display()
                ));
            }
            Err(e) => {
                errors.push(format!("  {}: {}", jar.display(), e));
            }
        }
    }

    Err(InstanceError::JarRead(format!(
        "Could not determine server version in {}. Tried {} JAR file(s):\n{}",
        dir.display(), jar_candidates.len(), errors.join("\n"),
    )))
}
