//! Docker runtime support for containerised Minecraft servers.

use std::process::Stdio;

use tokio::process::Command as TokioCommand;

use crate::instance::Instance;

/// Check if Docker is available on the system.
pub async fn is_docker_available() -> bool {
    TokioCommand::new("docker")
        .arg("info")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Build the `docker run` command for a containerised instance.
pub fn build_docker_command(instance: &Instance) -> TokioCommand {
    let container_name = format!("neocraft-{}", &instance.id[..8].to_string());
    let work_dir = instance.work_dir.to_string_lossy().to_string();
    let port = instance.port.to_string();

    let mut cmd = TokioCommand::new("docker");
    cmd.arg("run")
        .arg("--rm")
        .arg("--name")
        .arg(&container_name)
        .arg("-p")
        .arg(format!("{}:25565", port))
        .arg("-v")
        .arg(format!("{}:/data", work_dir))
        .arg("-e")
        .arg("EULA=true")
        .arg("-e")
        .arg(format!("TYPE={}", docker_type(&instance.server_type)))
        .arg("-e")
        .arg(format!("VERSION={}", instance.version))
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if !instance.java_args.is_empty() {
        cmd.arg("-e").arg(format!("MEMORY={}", extract_memory(&instance.java_args)));
    }

    cmd.arg(&instance.docker_image);
    cmd
}

/// Build the `docker stop` + `docker rm` command sequence.
pub fn build_docker_stop(instance: &Instance) -> TokioCommand {
    let container_name = format!("neocraft-{}", &instance.id[..8].to_string());
    let mut cmd = TokioCommand::new("docker");
    cmd.arg("stop").arg("-t").arg("30").arg(&container_name);
    cmd
}

/// Stream logs from a running Docker container.
pub fn build_docker_logs(instance: &Instance) -> TokioCommand {
    let container_name = format!("neocraft-{}", &instance.id[..8].to_string());
    let mut cmd = TokioCommand::new("docker");
    cmd.arg("logs").arg("-f").arg("--since").arg("0s").arg(&container_name);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd
}

fn docker_type(server_type: &crate::instance::ServerType) -> &'static str {
    match server_type {
        crate::instance::ServerType::Vanilla => "VANILLA",
        crate::instance::ServerType::Paper => "PAPER",
        crate::instance::ServerType::Spigot => "SPIGOT",
        crate::instance::ServerType::Fabric => "FABRIC",
        crate::instance::ServerType::Forge => "FORGE",
        crate::instance::ServerType::Custom => "CUSTOM",
    }
}

fn extract_memory(java_args: &str) -> String {
    for part in java_args.split_whitespace() {
        if part.starts_with("-Xmx") {
            return part[4..].to_string();
        }
    }
    "2G".into()
}
