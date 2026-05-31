//! Instance manager — create, delete, start, stop, restart Minecraft server instances.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::{broadcast, RwLock};
use crate::affinity;
use crate::downloader::CacheInfo;
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
    #[serde(rename = "type", alias = "server_type")]
    pub server_type: ServerType,
    pub version: String,
    pub port: u16,
    pub work_dir: PathBuf,
    pub jar_path: PathBuf,
    pub state: InstanceState,
    pub java_args: String,
    /// CPU affinity mask: e.g. "0,1,2,3" or "0-3". Empty string means no affinity.
    #[serde(default)]
    pub cpu_affinity: String,
    pub created_at: String, // ISO 8601
    pub download_url: String,
}

/// Manages the lifecycle of Minecraft server instances.
pub struct InstanceManager {
    data_dir: PathBuf,
    instances_dir: PathBuf,
    instances: Arc<RwLock<HashMap<String, Instance>>>,
    event_tx: broadcast::Sender<Event>,
    children: HashMap<String, (Arc<tokio::sync::Mutex<Option<tokio::process::Child>>>, Arc<AtomicBool>)>,
}

impl InstanceManager {
    /// Create a new instance manager rooted at `data_dir`.
    /// Loads previously persisted instances from disk.
    pub fn new(data_dir: PathBuf, event_tx: broadcast::Sender<Event>) -> Self {
        let instances_dir = data_dir.join("instances");
        let instances: Arc<RwLock<HashMap<String, Instance>>> = Arc::new(RwLock::new(HashMap::new()));

        // Load existing instances from disk
        {
            let mut map = HashMap::new();
            if let Ok(entries) = std::fs::read_dir(&instances_dir) {
                for entry in entries.flatten() {
                    let instance_json = entry.path().join("instance.json");
                    if let Ok(json) = std::fs::read_to_string(&instance_json) {
                        if let Ok(mut instance) = serde_json::from_str::<Instance>(&json) {
                            // Reset state — daemon just restarted, no processes are running
                            instance.state = InstanceState::Stopped;
                            map.insert(instance.id.clone(), instance);
                        }
                    }
                }
            }
            // Use try_write to avoid deadlock in tests (tokio Runtime not yet running)
            if let Ok(mut guard) = instances.try_write() {
                *guard = map;
            }
        }

        // Spawn a background task that listens for InstanceStateChange events
        // and updates the in-memory instance state accordingly.
        {
            let instances_clone = Arc::clone(&instances);
            let mut event_rx = event_tx.subscribe();
            tokio::spawn(async move {
                while let Ok(event) = event_rx.recv().await {
                    if let Event::InstanceStateChange { instance_id, state } = event {
                        let mut map = instances_clone.write().await;
                        if let Some(inst) = map.get_mut(&instance_id) {
                            inst.state = state;
                        }
                    }
                }
            });
        }

        Self {
            data_dir,
            instances_dir,
            instances,
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
        {
            let map = self.instances.read().await;
            for inst in map.values() {
                if inst.port == port {
                    return Err(InstanceError::PortInUse(port));
                }
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let work_dir = self.instances_dir.join(&id);

        // Create directory structure
        tokio::fs::create_dir_all(&work_dir).await?;

        // Write eula.txt (accepted by default so the server can start)
        tokio::fs::write(
            work_dir.join("eula.txt"),
            crate::files::eula_accepted(),
        ).await?;

        // Write server.properties template
        tokio::fs::write(
            work_dir.join("server.properties"),
            crate::files::default_server_properties(port, &name),
        ).await?;

        let jar_path = work_dir.join("server.jar");

        // Download the server JAR if a URL is provided (before persisting instance)
        if !download_url.is_empty() {
            let cache = CacheInfo {
                cache_dir: self.data_dir.join("cache"),
                server_type: format!("{:?}", server_type).to_lowercase(),
                version: version.clone(),
            };
            crate::downloader::download_jar(
                &download_url,
                &jar_path,
                &id,
                &self.event_tx,
                Some(&cache),
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
            cpu_affinity: String::new(),
            created_at: chrono::Utc::now().to_rfc3339(),
            download_url,
        };

        // Persist instance state to disk
        let json = serde_json::to_string_pretty(&instance)?;
        tokio::fs::write(instance.work_dir.join("instance.json"), json).await?;

        self.instances.write().await.insert(instance.id.clone(), instance.clone());
        Ok(instance)
    }

    /// Look up an instance by id (cloned).
    pub async fn get(&self, id: &str) -> Option<Instance> {
        self.instances.read().await.get(id).cloned()
    }

    /// Return all managed instances (cloned).
    pub async fn list(&self) -> Vec<Instance> {
        self.instances.read().await.values().cloned().collect()
    }

    /// Directly update an instance's state (for testing).
    pub async fn force_state(&mut self, id: &str, state: InstanceState) -> Result<(), InstanceError> {
        let mut map = self.instances.write().await;
        match map.get_mut(id) {
            Some(inst) => {
                inst.state = state;
                Ok(())
            }
            None => Err(InstanceError::NotFound(id.into())),
        }
    }

    /// Update instance-level config fields (cpu_affinity, java_args) and persist to disk.
    pub async fn update_config(
        &mut self,
        id: &str,
        cpu_affinity: Option<String>,
        java_args: Option<String>,
    ) -> Result<(), InstanceError> {
        let mut map = self.instances.write().await;
        let inst = map.get_mut(id).ok_or_else(|| InstanceError::NotFound(id.into()))?;
        if let Some(a) = cpu_affinity {
            inst.cpu_affinity = a;
        }
        if let Some(j) = java_args {
            inst.java_args = j;
        }
        // Persist updated instance to disk
        let json = serde_json::to_string_pretty(&*inst)?;
        tokio::fs::write(inst.work_dir.join("instance.json"), json).await?;
        Ok(())
    }

    /// Deletes a stopped instance and removes its directory from disk.
    pub async fn delete(&mut self, id: &str) -> Result<(), InstanceError> {
        let instance = {
            let map = self.instances.read().await;
            map.get(id).ok_or_else(|| InstanceError::NotFound(id.into()))?.clone()
        };

        // Only block deletion if the server process is actively running
        if instance.state == InstanceState::Running
            || instance.state == InstanceState::Starting
            || instance.state == InstanceState::Stopping
        {
            return Err(InstanceError::NotStopped(id.into()));
        }

        let work_dir = instance.work_dir.clone();
        tokio::fs::remove_dir_all(&work_dir).await?;
        self.instances.write().await.remove(id);
        Ok(())
    }

    /// Start an instance. Ensures EULA is accepted before spawning the process.
    pub async fn start(&mut self, id: &str) -> Result<(), InstanceError> {
        let (jar_path, work_dir, server_type, java_args, cpu_affinity) = {
            let map = self.instances.read().await;
            let inst = map.get(id).ok_or_else(|| InstanceError::NotFound(id.into()))?;
            if inst.state != InstanceState::Stopped && inst.state != InstanceState::Crashed {
                return Err(InstanceError::NotStopped(id.into()));
            }
            (inst.jar_path.clone(), inst.work_dir.clone(), inst.server_type.clone(), inst.java_args.clone(), inst.cpu_affinity.clone())
        };

        // Emit Starting
        {
            let mut map = self.instances.write().await;
            if let Some(inst) = map.get_mut(id) {
                inst.state = InstanceState::Starting;
            }
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Starting,
        });

        // Ensure EULA is accepted BEFORE spawning the process
        let eula_path = work_dir.join("eula.txt");
        if eula_path.exists() {
            let content = tokio::fs::read_to_string(&eula_path).await.unwrap_or_default();
            if content.contains("eula=false") {
                tokio::fs::write(&eula_path, content.replace("eula=false", "eula=true"))
                    .await
                    .map_err(|e| InstanceError::Io(e))?;
            }
        } else {
            // EULA file doesn't exist — create it with eula=true
            tokio::fs::write(&eula_path, crate::files::eula_accepted())
                .await
                .map_err(|e| InstanceError::Io(e))?;
        }

        // Build and run the command
        let (java_bin, java_args_vec) = build_java_command(&jar_path, &server_type, &java_args);
        let args_refs: Vec<&str> = java_args_vec.iter().map(|s| s.as_str()).collect();

        self.start_process(id, &java_bin, &args_refs, &cpu_affinity).await
    }

    /// Low-level process spawn with error capture.
    async fn start_process(
        &mut self,
        id: &str,
        command: &str,
        args: &[&str],
        cpu_affinity: &str,
    ) -> Result<(), InstanceError> {
        let work_dir = {
            let map = self.instances.read().await;
            let inst = map.get(id).unwrap();
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

        // Set CPU affinity if configured (macOS only; no-op elsewhere)
        if !cpu_affinity.is_empty() {
            if let Some(pid) = child.id() {
                if let Err(e) = affinity::set_process_affinity(pid, cpu_affinity) {
                    tracing::warn!(instance_id = %id, error = %e, "Failed to set CPU affinity");
                }
            }
        }

        let stdout = child.stdout.take().expect("stdout pipe");
        let stderr = child.stderr.take().expect("stderr pipe");
        let deliberate_stop = Arc::new(AtomicBool::new(false));

        // Emit Running
        {
            let mut map = self.instances.write().await;
            if let Some(inst) = map.get_mut(id) {
                inst.state = InstanceState::Running;
            }
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Running,
        });

        // Store child handle so stop() can wait for the process.
        // Use Arc<Mutex<Option<Child>>> so the exit monitor and stop()
        // can coordinate: only one of them takes the child.
        let child_opt = Arc::new(tokio::sync::Mutex::new(Some(child)));
        self.children.insert(id.to_string(), (child_opt.clone(), deliberate_stop.clone()));

        // Pipe stdout+stderr merged — avoids duplicate lines common with Java process output
        let log_pipe = LogPipe::new(id.to_string(), self.event_tx.clone());
        tokio::spawn(async move { log_pipe.pipe_both(stdout, stderr).await; });

        // Background exit monitor: detects crashes and unexpected stops
        let id_clone = id.to_string();
        let event_tx = self.event_tx.clone();
        let deliberate = deliberate_stop.clone();

        tokio::spawn(async move {
            let child = child_opt.lock().await.take();
            if let Some(mut child) = child {
                let status = child.wait().await;

                if deliberate.load(Ordering::Acquire) {
                    // stop() was called — it will handle everything, just emit
                    // the Stopped event so the background listener updates state.
                    let _ = event_tx.send(Event::InstanceStateChange {
                        instance_id: id_clone,
                        state: InstanceState::Stopped,
                    });
                } else {
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
            }
            // If stop() already took the child, nothing to do — it handles everything.
        });

        Ok(())
    }

    /// Stop a running instance by sending "stop\n" to its stdin.
    /// Waits for the process to exit (with a 60s timeout, then force-kill).
    /// No-op if the instance is not running.
    pub async fn stop(&mut self, id: &str) -> Result<(), InstanceError> {
        let state = {
            let map = self.instances.read().await;
            let instance = map
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
            let mut map = self.instances.write().await;
            if let Some(inst) = map.get_mut(id) {
                inst.state = InstanceState::Stopping;
            }
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state: InstanceState::Stopping,
        });

        // Try to take the child and wait for it
        if let Some((child_opt, stop_flag)) = self.children.remove(id) {
            // Set deliberate flag BEFORE trying to take the child so the
            // exit monitor knows this is a deliberate stop (even if it
            // already acquired the lock).
            stop_flag.store(true, Ordering::Release);

            let mut child_guard = child_opt.lock().await;
            if let Some(mut child) = child_guard.take() {
                // We have the child — send stop command, wait, kill on timeout
                if let Some(mut stdin) = child.stdin.take() {
                    let _ = stdin.write_all(b"stop\n").await;
                }

                match tokio::time::timeout(std::time::Duration::from_secs(60), child.wait()).await {
                    Ok(Ok(_)) => {
                        // Clean exit
                    }
                    Ok(Err(e)) => return Err(InstanceError::Io(e)),
                    Err(_) => {
                        // Force kill after timeout
                        let _ = child.kill().await;
                        let _ = child.wait().await;
                    }
                }
            } else {
                // Exit monitor already took the child. Wait for the
                // Stopped/Crashed event that the exit monitor will emit.
                let mut event_rx = self.event_tx.subscribe();
                let id_clone = id.to_string();
                loop {
                    match event_rx.recv().await {
                        Ok(Event::InstanceStateChange { instance_id, state })
                            if instance_id == id_clone =>
                        {
                            if state == InstanceState::Stopped || state == InstanceState::Crashed {
                                // State already updated by the background listener.
                                return Ok(());
                            }
                        }
                        Err(_) => break,
                        _ => {}
                    }
                }
            }
        }

        // Only set Stopped if WE waited for the process (i.e. we took the child).
        // If the exit monitor took the child, it already handled the state change.
        // Check if state is still Stopping — if so, we handled the exit.
        {
            let mut map = self.instances.write().await;
            if let Some(inst) = map.get_mut(id) {
                if inst.state == InstanceState::Stopping {
                    inst.state = InstanceState::Stopped;
                }
            }
        }
        // Still emit the event so the background listener picks it up
        // (harmless if the exit monitor already emitted it).
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
}
