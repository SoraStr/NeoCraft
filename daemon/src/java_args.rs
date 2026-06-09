//! JVM launch command construction and Minecraft version comparison.

use std::path::Path;
use crate::instance::ServerType;

/// Append G1GC tuning flags shared by Paper, Spigot, and Forge servers.
fn push_g1gc_args(args: &mut Vec<String>) {
    args.extend([
        "-XX:+UseG1GC".to_string(), "-XX:+ParallelRefProcEnabled".to_string(), "-XX:MaxGCPauseMillis=200".to_string(),
        "-XX:+UnlockExperimentalVMOptions".to_string(), "-XX:+DisableExplicitGC".to_string(), "-XX:+AlwaysPreTouch".to_string(),
        "-XX:G1NewSizePercent=30".to_string(), "-XX:G1MaxNewSizePercent=40".to_string(), "-XX:G1HeapRegionSize=8M".to_string(),
        "-XX:G1ReservePercent=20".to_string(), "-XX:G1HeapWastePercent=5".to_string(), "-XX:G1MixedGCCountTarget=4".to_string(),
        "-XX:InitiatingHeapOccupancyPercent=15".to_string(), "-XX:G1MixedGCLiveThresholdPercent=90".to_string(),
        "-XX:G1RSetUpdatingPauseTimePercent=5".to_string(), "-XX:SurvivorRatio=32".to_string(),
        "-XX:+PerfDisableSharedMem".to_string(), "-XX:MaxTenuringThreshold=1".to_string(),
    ]);
}

/// Build the Java launch command based on server type.
pub fn build_java_command(java_path: &str, jar_path: &Path, server_type: &ServerType, java_args: &str) -> (String, Vec<String>) {
    let java = java_path.to_string();
    let mut args: Vec<String> = Vec::new();

    let mem_xmx = java_args.split_whitespace()
        .find(|a| a.starts_with("-Xmx")).unwrap_or("-Xmx2G");
    let mem_xms = java_args.split_whitespace()
        .find(|a| a.starts_with("-Xms")).unwrap_or("-Xms2G");

    match server_type {
        ServerType::Paper | ServerType::Spigot => {
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
            push_g1gc_args(&mut args);
        }
        ServerType::Vanilla | ServerType::Fabric => {
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
        }
        ServerType::Forge => {
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
            push_g1gc_args(&mut args);
        }
        ServerType::Custom => {
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
        }
    }

    args.push("-jar".to_string());
    args.push(jar_path.to_string_lossy().to_string());
    args.push("nogui".to_string());

    (java, args)
}

/// Compare a Minecraft version string (e.g. "1.21.9") against a minimum required
/// major.minor.patch. Returns true if the version is at least the given target.
pub fn version_at_least(version: &str, major: u32, minor: u32, patch: u32) -> bool {
    let clean = version.split_whitespace().next().unwrap_or(version);
    let parts: Vec<&str> = clean.split('.').collect();
    if parts.len() < 2 {
        tracing::warn!(version, "Unparseable version string in version_at_least");
        return false;
    }
    let v_major: u32 = match parts[0].parse() {
        Ok(v) => v,
        Err(_) => { tracing::warn!(version, "Non-numeric major version"); return false; }
    };
    let v_minor: u32 = match parts[1].parse() {
        Ok(v) => v,
        Err(_) => { tracing::warn!(version, "Non-numeric minor version"); return false; }
    };
    let v_patch: u32 = if parts.len() >= 3 {
        match parts[2].parse() {
            Ok(v) => v,
            Err(_) => { tracing::warn!(version, "Non-numeric patch version — treating as 0"); 0 }
        }
    } else { 0 };

    if v_major != major { return v_major > major; }
    if v_minor != minor { return v_minor > minor; }
    v_patch >= patch
}
