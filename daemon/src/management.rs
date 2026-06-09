//! Management protocol provisioning for Minecraft instances.
//!
//! Minecraft 1.21.9+ exposes the Server Management Protocol. Older versions use
//! RCON. This module centralizes token generation, port planning, and the
//! server.properties patch so instance creation/import stay small.

use std::path::Path;
use thiserror::Error;

use crate::java_args::version_at_least;
use crate::util::{random_alphanumeric, random_hex};

const SMP_PORT_OFFSET: u16 = 100;
const RCON_PORT_OFFSET: u16 = 10;
pub const SMP_ALLOWED_ORIGINS: &str = "http://localhost:1145,http://127.0.0.1:1145,http://localhost:3001,http://127.0.0.1:3001";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManagementProtocol {
    Smp,
    Rcon,
}

#[derive(Debug, Clone)]
pub struct ManagementSettings {
    pub protocol: ManagementProtocol,
    pub port: u16,
    pub token: String,
    pub keystore_password: String,
    pub tls_enabled: bool,
}

#[derive(Debug, Error)]
pub enum ManagementError {
    #[error("Management port would exceed 65535 for server port {port} and offset {offset}")]
    PortOutOfRange { port: u16, offset: u16 },
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn protocol_for_version(version: &str) -> ManagementProtocol {
    if version_at_least(version, 1, 21, 9) {
        ManagementProtocol::Smp
    } else {
        ManagementProtocol::Rcon
    }
}

pub fn management_port(version: &str, server_port: u16) -> Result<u16, ManagementError> {
    let offset = match protocol_for_version(version) {
        ManagementProtocol::Smp => SMP_PORT_OFFSET,
        ManagementProtocol::Rcon => RCON_PORT_OFFSET,
    };

    server_port
        .checked_add(offset)
        .ok_or(ManagementError::PortOutOfRange {
            port: server_port,
            offset,
        })
}

pub fn template_rcon_port(server_port: u16) -> u16 {
    server_port.checked_add(RCON_PORT_OFFSET).unwrap_or(server_port)
}

pub async fn configure(
    props_path: &Path,
    work_dir: &Path,
    version: &str,
    server_port: u16,
    instance_id: &str,
) -> Result<ManagementSettings, ManagementError> {
    match protocol_for_version(version) {
        ManagementProtocol::Smp => configure_smp(props_path, work_dir, server_port, instance_id).await,
        ManagementProtocol::Rcon => configure_rcon(props_path, server_port).await,
    }
}

async fn configure_smp(
    props_path: &Path,
    work_dir: &Path,
    server_port: u16,
    instance_id: &str,
) -> Result<ManagementSettings, ManagementError> {
    let port = server_port
        .checked_add(SMP_PORT_OFFSET)
        .ok_or(ManagementError::PortOutOfRange {
            port: server_port,
            offset: SMP_PORT_OFFSET,
        })?;
    let token = random_alphanumeric(40);
    let keystore_result = generate_tls_keystore(work_dir, instance_id).await;

    let (tls_config, keystore_password) = match keystore_result {
        Ok((path, password)) => {
            let config = format!(
                "# TLS keystore ready. Set management-server-tls-enabled=true to activate.\n\
                 management-server-tls-keystore={}\n\
                 management-server-tls-keystore-password={}\n",
                path.display(),
                password,
            );
            (config, password)
        }
        Err(e) => {
            tracing::warn!(%instance_id, %e, "TLS keystore generation failed, continuing without TLS");
            (String::new(), String::new())
        }
    };

    let smp_config = format!(
        "management-server-enabled=true\n\
         management-server-port={port}\n\
         management-server-secret={token}\n\
         management-server-allowed-origins={SMP_ALLOWED_ORIGINS}\n\
         management-server-tls-enabled=false\n\
         {tls_config}",
    );

    append_properties(props_path, &smp_config).await?;

    Ok(ManagementSettings {
        protocol: ManagementProtocol::Smp,
        port,
        token,
        keystore_password,
        tls_enabled: false,
    })
}

async fn configure_rcon(
    props_path: &Path,
    server_port: u16,
) -> Result<ManagementSettings, ManagementError> {
    let port = server_port
        .checked_add(RCON_PORT_OFFSET)
        .ok_or(ManagementError::PortOutOfRange {
            port: server_port,
            offset: RCON_PORT_OFFSET,
        })?;
    let token = random_hex(32);
    let rcon_config = format!("enable-rcon=true\nrcon.port={port}\nrcon.password={token}\n");

    append_properties(props_path, &rcon_config).await?;

    Ok(ManagementSettings {
        protocol: ManagementProtocol::Rcon,
        port,
        token,
        keystore_password: String::new(),
        tls_enabled: false,
    })
}

async fn append_properties(path: &Path, text: &str) -> Result<(), std::io::Error> {
    let mut existing = tokio::fs::read_to_string(path).await.unwrap_or_default();
    if !existing.ends_with('\n') {
        existing.push('\n');
    }
    existing.push_str(text);
    tokio::fs::write(path, existing).await
}

async fn generate_tls_keystore(work_dir: &Path, instance_id: &str) -> Result<(std::path::PathBuf, String), ManagementError> {
    let password = random_alphanumeric(32);
    let path = work_dir.join("management-keystore.p12");
    let path_string = path.to_string_lossy().into_owned();

    let output = tokio::process::Command::new("keytool")
        .arg("-genkeypair")
        .arg("-keystore")
        .arg(&path_string)
        .arg("-alias")
        .arg("server")
        .arg("-keyalg")
        .arg("RSA")
        .arg("-keysize")
        .arg("2048")
        .arg("-validity")
        .arg("3650")
        .arg("-storepass")
        .arg(&password)
        .arg("-keypass")
        .arg(&password)
        .arg("-dname")
        .arg("CN=localhost")
        .arg("-storetype")
        .arg("PKCS12")
        .arg("-noprompt")
        .output()
        .await;

    match output {
        Ok(out) if out.status.success() => {
            tracing::info!(%instance_id, keystore = %path.display(), "TLS keystore generated");
            Ok((path, password))
        }
        Ok(out) => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            tracing::warn!(%instance_id, error = %stderr, "keytool failed, TLS keystore not generated");
            Err(ManagementError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!("keytool failed: {}", stderr),
            )))
        }
        Err(error) => {
            tracing::warn!(%instance_id, %error, "keytool not found, TLS keystore not generated");
            Err(ManagementError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "keytool not found in PATH",
            )))
        }
    }
}
