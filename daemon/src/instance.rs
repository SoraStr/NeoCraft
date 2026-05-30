//! Instance manager — create, delete, start, stop, restart Minecraft server instances.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tokio::sync::broadcast;
use crate::protocol::{Event, InstanceState};

/// Supported Minecraft server types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerType {
    Vanilla,
    Paper,
    Spigot,
    Fabric,
}

/// Represents a managed Minecraft server instance.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub server_type: ServerType,
    pub version: String,
    pub port: u16,
    pub work_dir: PathBuf,
    pub state: InstanceState,
    pub java_args: String,
    pub created_at: String, // ISO 8601
}

/// Manages the lifecycle of Minecraft server instances.
pub struct InstanceManager {
    data_dir: PathBuf,
    instances_dir: PathBuf,
    instances: HashMap<String, Instance>,
    event_tx: broadcast::Sender<Event>,
}

impl InstanceManager {
    /// Create a new instance manager rooted at `data_dir`.
    pub fn new(data_dir: PathBuf, event_tx: broadcast::Sender<Event>) -> Self {
        let instances_dir = data_dir.join("instances");
        Self {
            data_dir,
            instances_dir,
            instances: HashMap::new(),
            event_tx,
        }
    }

    /// Create a new Minecraft server instance with the given parameters.
    ///
    /// Writes `eula.txt`, `server.properties`, and persists `instance.json` to
    /// `data_dir/instances/<id>/`.
    pub async fn create(
        &mut self,
        name: String,
        server_type: ServerType,
        version: String,
        port: u16,
    ) -> Result<Instance, InstanceError> {
        // Reject duplicate ports
        for inst in self.instances.values() {
            if inst.port == port {
                return Err(InstanceError::PortInUse(port));
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let work_dir = self.instances_dir.join(&id);

        // Create directory structure
        std::fs::create_dir_all(&work_dir)?;

        // Write eula.txt (accepted by default so the server can start)
        std::fs::write(
            work_dir.join("eula.txt"),
            crate::files::eula_accepted(),
        )?;

        // Write server.properties template
        std::fs::write(
            work_dir.join("server.properties"),
            crate::files::default_server_properties(port, &name),
        )?;

        let instance = Instance {
            id,
            name,
            server_type,
            version,
            port,
            work_dir,
            state: InstanceState::Stopped,
            java_args: "-Xmx2G -Xms1G".into(),
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        // Persist instance state to disk
        let json = serde_json::to_string_pretty(&instance)?;
        std::fs::write(instance.work_dir.join("instance.json"), json)?;

        self.instances.insert(instance.id.clone(), instance.clone());
        Ok(instance)
    }

    /// Look up an instance by id.
    pub fn get(&self, id: &str) -> Option<&Instance> {
        self.instances.get(id)
    }

    /// Look up an instance by id (mutable).
    pub fn get_mut(&mut self, id: &str) -> Option<&mut Instance> {
        self.instances.get_mut(id)
    }

    /// Return all managed instances.
    pub fn list(&self) -> Vec<&Instance> {
        self.instances.values().collect()
    }

    /// Delete a stopped instance and remove its directory from disk.
    pub async fn delete(&mut self, id: &str) -> Result<(), InstanceError> {
        let instance = self
            .instances
            .get(id)
            .ok_or_else(|| InstanceError::NotFound(id.into()))?;

        if instance.state != InstanceState::Stopped {
            return Err(InstanceError::NotStopped(id.into()));
        }

        let work_dir = instance.work_dir.clone();
        std::fs::remove_dir_all(&work_dir)?;
        self.instances.remove(id);
        Ok(())
    }
}

#[derive(Debug, thiserror::Error)]
pub enum InstanceError {
    #[error("Port {0} is already in use")]
    PortInUse(u16),
    #[error("Instance {0} not found")]
    NotFound(String),
    #[error("Instance {0} is not stopped")]
    NotStopped(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
}
