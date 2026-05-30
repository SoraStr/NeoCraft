//! Instance manager — create, delete, start, stop, restart Minecraft server instances.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command as TokioCommand};
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
    pub download_url: String,
}

/// Manages the lifecycle of Minecraft server instances.
pub struct InstanceManager {
    data_dir: PathBuf,
    instances_dir: PathBuf,
    instances: HashMap<String, Instance>,
    event_tx: broadcast::Sender<Event>,
    children: HashMap<String, (tokio::process::ChildStdin, Arc<AtomicBool>)>,
    /// Remembers the last command used to start an instance so `restart` can reuse it.
    last_start_commands: HashMap<String, (PathBuf, Vec<String>)>,
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
            children: HashMap::new(),
            last_start_commands: HashMap::new(),
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
        download_url: String,
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
            download_url,
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

    /// Start an instance using the given command. The command is remembered so
    /// that `start()` and `restart()` can reuse it.
    pub async fn start_with_command(
        &mut self,
        id: &str,
        command: impl AsRef<std::path::Path>,
        extra_args: &[&str],
    ) -> Result<(), InstanceError> {
        // Validate state: must be Stopped or Crashed
        {
            let instance = self
                .instances
                .get(id)
                .ok_or_else(|| InstanceError::NotFound(id.into()))?;
            if instance.state != InstanceState::Stopped
                && instance.state != InstanceState::Crashed
            {
                return Err(InstanceError::NotStopped(id.into()));
            }
        }

        // Remember the command so restart/start can reuse it
        self.last_start_commands.insert(
            id.to_string(),
            (
                command.as_ref().to_path_buf(),
                extra_args.iter().map(|s| s.to_string()).collect(),
            ),
        );

        // Emit Starting
        {
            let instance = self.instances.get_mut(id).unwrap();
            instance.state = InstanceState::Starting;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Starting,
        });

        // Build and spawn the child process
        let instance = self.instances.get(id).unwrap();
        let work_dir = instance.work_dir.clone();

        let mut cmd = TokioCommand::new(command.as_ref());
        cmd.current_dir(&work_dir);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        for arg in extra_args {
            cmd.arg(arg);
        }
        cmd.kill_on_drop(true);

        let mut child: Child = cmd.spawn()?;

        // Take stdin so we can write "stop" later
        let stdin = child
            .stdin
            .take()
            .expect("stdin pipe must be available");
        let deliberate_stop = Arc::new(AtomicBool::new(false));

        self.children
            .insert(id.to_string(), (stdin, deliberate_stop.clone()));

        // Emit Running
        {
            let instance = self.instances.get_mut(id).unwrap();
            instance.state = InstanceState::Running;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Running,
        });

        // Spawn background watcher for crash / natural exit detection
        let event_tx = self.event_tx.clone();
        let id_clone = id.to_string();
        tokio::spawn(async move {
            let status = child.wait().await;
            // If we deliberately stopped, do not emit any event
            if deliberate_stop.load(Ordering::Acquire) {
                return;
            }
            let state = match status {
                Ok(exit_status) if exit_status.success() => InstanceState::Stopped,
                _ => InstanceState::Crashed,
            };
            let _ = event_tx.send(Event::InstanceStateChange {
                instance_id: id_clone,
                state,
            });
        });

        Ok(())
    }

    /// Start an instance using the default `java -jar server.jar` command.
    /// If the instance was previously started via `start_with_command`, that
    /// command is reused.
    pub async fn start(&mut self, id: &str) -> Result<(), InstanceError> {
        let (cmd, args) = match self.last_start_commands.get(id) {
            Some((cmd, args)) => (cmd.clone(), args.clone()),
            None => {
                let instance = self
                    .instances
                    .get(id)
                    .ok_or_else(|| InstanceError::NotFound(id.into()))?;
                let java = PathBuf::from("java");
                let mut args: Vec<String> = instance
                    .java_args
                    .split_whitespace()
                    .map(|s| s.to_string())
                    .collect();
                args.push("-jar".into());
                args.push(
                    instance
                        .work_dir
                        .join("server.jar")
                        .to_string_lossy()
                        .to_string(),
                );
                args.push("nogui".into());
                (java, args)
            }
        };
        let arg_refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
        self.start_with_command(id, &cmd, &arg_refs).await
    }

    /// Stop a running instance by sending "stop\n" to its stdin.
    /// No-op if the instance is not running.
    pub async fn stop(&mut self, id: &str) -> Result<(), InstanceError> {
        let state = {
            let instance = self
                .instances
                .get(id)
                .ok_or_else(|| InstanceError::NotFound(id.into()))?;
            instance.state.clone()
        };

        // No-op for non-running instances
        if state != InstanceState::Running && state != InstanceState::Starting {
            return Ok(());
        }

        // Emit Stopping
        {
            let instance = self.instances.get_mut(id).unwrap();
            instance.state = InstanceState::Stopping;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Stopping,
        });

        // Send "stop\n" to the process stdin if we have a handle
        if let Some((mut stdin, stop_flag)) = self.children.remove(id) {
            stop_flag.store(true, Ordering::Release);
            let _ = stdin.write_all(b"stop\n").await;
            // Dropping stdin signals EOF to the child
            drop(stdin);
        }

        // Emit Stopped
        {
            let instance = self.instances.get_mut(id).unwrap();
            instance.state = InstanceState::Stopped;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Stopped,
        });

        Ok(())
    }

    /// Restart an instance: stop it, then start it again.
    pub async fn restart(&mut self, id: &str) -> Result<(), InstanceError> {
        self.stop(id).await?;
        // Brief pause to let the OS reap the old process
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        self.start(id).await
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
