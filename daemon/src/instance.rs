//! Instance manager — create, delete, start, stop, restart Minecraft server instances.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::broadcast;
use crate::logpipe::LogPipe;
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
    pub jar_path: PathBuf,
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

        let jar_path = work_dir.join("server.jar");

        // Download the server JAR if a URL is provided (before persisting instance)
        if !download_url.is_empty() {
            crate::downloader::download_jar(
                &download_url,
                &jar_path,
                &id,
                &self.event_tx,
            )
            .await
            .map_err(|e| InstanceError::Download(e.to_string()))?;
        }

        let instance = Instance {
            id,
            name,
            server_type,
            version,
            port,
            work_dir,
            jar_path,
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

    /// Start an instance. Handles EULA auto-accept on first launch.
    pub async fn start(&mut self, id: &str) -> Result<(), InstanceError> {
        let (jar_path, work_dir, server_type, java_args) = {
            let inst = self.instances.get(id).ok_or_else(|| InstanceError::NotFound(id.into()))?;
            if inst.state != InstanceState::Stopped && inst.state != InstanceState::Crashed {
                return Err(InstanceError::NotStopped(id.into()));
            }
            (inst.jar_path.clone(), inst.work_dir.clone(), inst.server_type.clone(), inst.java_args.clone())
        };

        // Emit Starting
        {
            let inst = self.instances.get_mut(id).unwrap();
            inst.state = InstanceState::Starting;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Starting,
        });

        // Ensure EULA is accepted
        let eula_path = work_dir.join("eula.txt");
        if eula_path.exists() {
            let content = std::fs::read_to_string(&eula_path).unwrap_or_default();
            if content.contains("eula=false") {
                std::fs::write(&eula_path, content.replace("eula=false", "eula=true"))
                    .map_err(|e| InstanceError::Io(e))?;
            }
        } else {
            // EULA file doesn't exist yet — will be generated on first launch
            // We'll detect the failure and auto-accept
        }

        // Build and run the command
        let (java_bin, java_args_vec) = build_java_command(&jar_path, &server_type, &java_args);
        let args_refs: Vec<&str> = java_args_vec.iter().map(|s| s.as_str()).collect();

        let result = self.start_process(id, &java_bin, &args_refs).await;

        // If failed with EULA error, accept EULA and retry once
        if let Err(ref e) = result {
            if let InstanceError::StartFailed(msg) = e {
                if msg.contains("EULA") || msg.contains("eula") {
                    // Accept EULA and retry
                    let _ = std::fs::write(&eula_path, "eula=true\n");
                    return self.start_process(id, &java_bin, &args_refs).await;
                }
            }
        }

        result
    }

    /// Low-level process spawn with error capture.
    async fn start_process(
        &mut self,
        id: &str,
        command: &str,
        args: &[&str],
    ) -> Result<(), InstanceError> {
        let work_dir = {
            let inst = self.instances.get(id).unwrap();
            inst.work_dir.clone()
        };

        let mut cmd = TokioCommand::new(command);
        cmd.current_dir(&work_dir);
        cmd.stdin(Stdio::piped());
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        for arg in args {
            cmd.arg(arg);
        }
        cmd.kill_on_drop(true);

        let mut child = cmd.spawn()?;
        let stdin = child.stdin.take().expect("stdin pipe");
        let stdout = child.stdout.take().expect("stdout pipe");
        let stderr = child.stderr.take().expect("stderr pipe");
        let deliberate_stop = Arc::new(AtomicBool::new(false));

        // Emit Running
        {
            let inst = self.instances.get_mut(id).unwrap();
            inst.state = InstanceState::Running;
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Running,
        });

        // Store child info for stop()
        self.children.insert(id.to_string(), (stdin, deliberate_stop.clone()));

        // Pipe stdout+stderr merged — avoids duplicate lines common with Java process output
        let log_pipe = LogPipe::new(id.to_string(), self.event_tx.clone());
        tokio::spawn(async move { log_pipe.pipe_both(stdout, stderr).await; });

        // Wait for process exit with a short grace period to detect quick failures
        let id_clone = id.to_string();
        let event_tx = self.event_tx.clone();
        let deliberate = deliberate_stop.clone();

        tokio::spawn(async move {
            let status = child.wait().await;
            if !deliberate.load(Ordering::Relaxed) {
                match status {
                    Ok(s) if !s.success() => {
                        let _ = event_tx.send(Event::InstanceStateChange {
                            instance_id: id_clone.clone(),
                            state: InstanceState::Crashed,
                        });
                    }
                    Ok(_) => {
                        let _ = event_tx.send(Event::InstanceStateChange {
                            instance_id: id_clone,
                            state: InstanceState::Stopped,
                        });
                    }
                    Err(_) => {}
                }
            }
        });

        Ok(())
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

/// Build the Java launch command based on server type using Command.md guidelines.
pub fn build_java_command(jar_path: &Path, server_type: &ServerType, java_args: &str) -> (String, Vec<String>) {
    let java = "java".to_string();
    let mut args: Vec<String> = Vec::new();

    // Parse user-provided memory args (-Xmx, -Xms)
    let mem_xmx = java_args.split_whitespace()
        .find(|a| a.starts_with("-Xmx")).unwrap_or("-Xmx2G");
    let mem_xms = java_args.split_whitespace()
        .find(|a| a.starts_with("-Xms")).unwrap_or("-Xms2G");

    match server_type {
        ServerType::Paper | ServerType::Spigot => {
            // Aikar's Flags for G1GC (Command.md section 五.2)
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
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
        ServerType::Vanilla => {
            // Simple flags (Command.md section 五.1)
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
        }
        ServerType::Fabric => {
            // Lightweight flags (Command.md section 五.4)
            args.push(mem_xms.to_string());
            args.push(mem_xmx.to_string());
        }
    }

    args.push("-jar".to_string());
    args.push(jar_path.to_string_lossy().to_string());
    args.push("nogui".to_string());

    (java, args)
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
    #[error("Download failed: {0}")]
    Download(String),
    #[error("Start failed: {0}")]
    StartFailed(String),
}
