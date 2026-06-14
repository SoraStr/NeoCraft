//! Instance manager — create, delete, start, stop, restart Minecraft server instances.

use crate::detect::detect_server;
use crate::downloader::CacheInfo;
use crate::files::copy_dir_all_with_progress;
use crate::java_args::build_java_command;
use crate::logpipe::LogPipe;
use crate::management;
use crate::protocol::{Event, InstanceState};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command as TokioCommand;
use tokio::sync::{Mutex, RwLock, broadcast, oneshot};

/// Supported Minecraft server types.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ServerType {
    Vanilla,
    Paper,
    Spigot,
    Fabric,
    Forge,
    Custom,
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
    /// Absolute path to the Java binary (default: "java" — uses system PATH).
    #[serde(default = "default_java_path")]
    pub java_path: String,
    pub created_at: String, // ISO 8601
    pub download_url: String,
    #[serde(default)]
    pub management_port: u16,
    #[serde(default)]
    pub management_token: String,
    #[serde(default)]
    pub management_keystore_password: String,
    #[serde(default)]
    pub management_tls_enabled: bool,
    /// Runtime mode: "process" (default) or "docker"
    #[serde(default = "default_runtime_mode")]
    pub runtime_mode: String,
    /// Docker image for containerised servers
    #[serde(default = "default_docker_image")]
    pub docker_image: String,
}

fn default_runtime_mode() -> String {
    "process".into()
}

fn default_docker_image() -> String {
    "itzg/minecraft-server:latest".into()
}

fn default_java_path() -> String {
    "java".into()
}

/// Manages the lifecycle of Minecraft server instances.
pub struct InstanceManager {
    data_dir: PathBuf,
    instances_dir: PathBuf,
    instances: Arc<RwLock<HashMap<String, Instance>>>,
    event_tx: broadcast::Sender<Event>,
    process_killers: Arc<Mutex<HashMap<String, oneshot::Sender<()>>>>,
    stdins: Arc<Mutex<HashMap<String, tokio::process::ChildStdin>>>,
}

impl InstanceManager {
    /// Create a new instance manager rooted at `data_dir`.
    /// Loads previously persisted instances from disk.
    pub fn new(data_dir: PathBuf, event_tx: broadcast::Sender<Event>) -> Self {
        let instances_dir = data_dir.join("instances");
        let instances: Arc<RwLock<HashMap<String, Instance>>> =
            Arc::new(RwLock::new(HashMap::new()));

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
            process_killers: Arc::new(Mutex::new(HashMap::new())),
            stdins: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Create a new Minecraft server instance with the given parameters.
    ///
    /// Writes `eula.txt`, `server.properties`, and persists `instance.json` to
    /// `data_dir/instances/<id>/`.
    pub async fn create(
        &self,
        name: String,
        server_type: ServerType,
        version: String,
        port: u16,
        download_url: String,
        java_path: Option<String>,
        runtime_mode: Option<String>,
        docker_image: Option<String>,
    ) -> Result<Instance, InstanceError> {
        let management_port = management::management_port(&version, port)
            .map_err(|e| InstanceError::PortUnavailable(e.to_string()))?;
        self.ensure_ports_available(port, management_port).await?;

        let id = uuid::Uuid::new_v4().to_string();
        let work_dir = self.instances_dir.join(&id);

        // Create directory structure
        tokio::fs::create_dir_all(&work_dir).await?;

        // Write eula.txt (accepted by default so the server can start)
        tokio::fs::write(work_dir.join("eula.txt"), crate::files::eula_accepted()).await?;

        // Write server.properties template
        tokio::fs::write(
            work_dir.join("server.properties"),
            crate::files::default_server_properties(port, &name),
        )
        .await?;

        let management_settings = management::configure(
            &work_dir.join("server.properties"),
            &work_dir,
            &version,
            port,
            &id,
        )
        .await
        .map_err(|e| InstanceError::PortUnavailable(e.to_string()))?;

        let jar_path = work_dir.join("server.jar");

        // Download the server JAR if a URL is provided (before persisting instance)
        if !download_url.is_empty() {
            use std::hash::{Hash, Hasher};
            let mut h = std::collections::hash_map::DefaultHasher::new();
            download_url.hash(&mut h);
            let url_hash = Some(format!("{:08x}", h.finish()));
            let cache = CacheInfo {
                cache_dir: self.data_dir.join("cache"),
                server_type: format!("{:?}", server_type).to_lowercase(),
                version: version.clone(),
                url_hash,
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
            java_path: java_path.unwrap_or_else(|| "java".into()),
            created_at: chrono::Utc::now().to_rfc3339(),
            download_url,
            management_port: management_settings.port,
            management_token: management_settings.token,
            management_keystore_password: management_settings.keystore_password,
            management_tls_enabled: management_settings.tls_enabled,
            runtime_mode: runtime_mode.unwrap_or_else(|| "process".into()),
            docker_image: docker_image.unwrap_or_else(|| "itzg/minecraft-server:latest".into()),
        };

        // Persist instance state to disk
        let json = serde_json::to_string_pretty(&instance)?;
        tokio::fs::write(instance.work_dir.join("instance.json"), json).await?;

        self.instances
            .write()
            .await
            .insert(instance.id.clone(), instance.clone());
        Ok(instance)
    }

    /// Import a Minecraft server from an existing directory (modpack, pre-configured server).
    ///
    /// Copies the entire source directory into `data_dir/instances/<id>/`, then
    /// detects server type/version via three strategies:
    /// 1. `install.properties` inside JAR → Fabric type
    /// 2. `version.json` inside JAR → Custom type
    /// 3. `versions/minecraft.txt` (+ `versions/forge.txt`) inside JAR → Forge/Custom
    ///
    /// Writes `eula.txt` and `server.properties` only if missing, then persists `instance.json`.
    pub async fn import(
        &self,
        name: String,
        source_dir: PathBuf,
        port: u16,
        java_args: Option<String>,
        java_path: Option<String>,
    ) -> Result<Instance, InstanceError> {
        // Validate the source directory exists
        if !source_dir.is_dir() {
            return Err(InstanceError::JarRead(format!(
                "Source directory not found or not a directory: {}",
                source_dir.display()
            )));
        }
        self.ensure_import_source_safe(&source_dir).await?;

        let id = uuid::Uuid::new_v4().to_string();
        emit_import_progress(&self.event_tx, &id, 0, 0, "detecting");

        // Detect server type, version, and JAR in the source directory
        let detect_source_dir = source_dir.clone();
        let detected = tokio::time::timeout(
            Duration::from_secs(30),
            tokio::task::spawn_blocking(move || detect_server(&detect_source_dir)),
        )
            .await
            .map_err(|_| {
                InstanceError::JarRead(
                    "Server detection timed out while reading JAR metadata. Check for unusually large, corrupt, or special .jar files in the server folder.".into(),
                )
            })?
            .map_err(|e| InstanceError::JarRead(format!("Server detection task failed: {e}")))??;

        // Extract just the Minecraft version number for version comparison.
        // The full version string may be compound (e.g. "1.21.5 Forge 52.0.1").
        let mc_version = detected
            .version
            .split_whitespace()
            .next()
            .unwrap_or(&detected.version);

        let management_port = management::management_port(mc_version, port)
            .map_err(|e| InstanceError::PortUnavailable(e.to_string()))?;
        self.ensure_ports_available(port, management_port).await?;

        let work_dir = self.instances_dir.join(&id);

        // Create the instance directory
        tokio::fs::create_dir_all(&work_dir).await?;
        emit_import_progress(&self.event_tx, &id, 0, 0, "copying");

        // Copy entire source directory contents into the work directory.
        // Use recursive copy — this brings in mods/, config/, world/, etc.
        copy_dir_all_with_progress(
            &source_dir,
            &work_dir,
            format!("import:{id}"),
            &self.event_tx,
        )
        .await
        .map_err(|e| {
            InstanceError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                format!(
                    "Failed to copy directory from {} to {}: {}",
                    source_dir.display(),
                    work_dir.display(),
                    e,
                ),
            ))
        })?;

        let jar_path = work_dir.join(&detected.jar_filename);

        // Write eula.txt (only if it doesn't already exist from the copied directory)
        let eula_path = work_dir.join("eula.txt");
        if !eula_path.exists() {
            tokio::fs::write(&eula_path, crate::files::eula_accepted()).await?;
        }

        // Write server.properties template (only if it doesn't already exist)
        let props_path = work_dir.join("server.properties");
        if !props_path.exists() {
            tokio::fs::write(
                &props_path,
                crate::files::default_server_properties(port, &name),
            )
            .await?;
        }

        let management_settings =
            management::configure(&props_path, &work_dir, mc_version, port, &id)
                .await
                .map_err(|e| InstanceError::PortUnavailable(e.to_string()))?;

        let java_args_val = java_args.unwrap_or_else(|| "-Xmx2G -Xms1G".into());

        let instance = Instance {
            id,
            name,
            server_type: detected.server_type,
            version: detected.version,
            port,
            work_dir,
            jar_path,
            state: InstanceState::Stopped,
            java_args: java_args_val,
            java_path: java_path.unwrap_or_else(|| "java".into()),
            created_at: chrono::Utc::now().to_rfc3339(),
            download_url: String::new(),
            management_port: management_settings.port,
            management_token: management_settings.token,
            management_keystore_password: management_settings.keystore_password,
            management_tls_enabled: management_settings.tls_enabled,
            runtime_mode: "process".into(),
            docker_image: "itzg/minecraft-server:latest".into(),
        };

        // Persist instance state to disk
        let json = serde_json::to_string_pretty(&instance)?;
        tokio::fs::write(instance.work_dir.join("instance.json"), json).await?;

        self.instances
            .write()
            .await
            .insert(instance.id.clone(), instance.clone());
        Ok(instance)
    }

    async fn ensure_import_source_safe(
        &self,
        source_dir: &std::path::Path,
    ) -> Result<(), InstanceError> {
        tokio::fs::create_dir_all(&self.instances_dir).await?;

        let source = source_dir.canonicalize().map_err(|e| {
            InstanceError::Io(std::io::Error::new(
                e.kind(),
                format!(
                    "Cannot resolve source directory {}: {}",
                    source_dir.display(),
                    e
                ),
            ))
        })?;
        let instances_dir = self.instances_dir.canonicalize().map_err(|e| {
            InstanceError::Io(std::io::Error::new(
                e.kind(),
                format!(
                    "Cannot resolve instances directory {}: {}",
                    self.instances_dir.display(),
                    e
                ),
            ))
        })?;

        if instances_dir.starts_with(&source) {
            return Err(InstanceError::JarRead(format!(
                "Source directory {} contains NeoCraft's instances directory {}. Choose the actual server folder instead of a parent directory.",
                source.display(),
                instances_dir.display(),
            )));
        }

        Ok(())
    }

    /// Look up an instance by id (cloned).
    pub async fn get(&self, id: &str) -> Option<Instance> {
        self.instances.read().await.get(id).cloned()
    }

    /// Return all managed instances (cloned).
    pub async fn list(&self) -> Vec<Instance> {
        self.instances.read().await.values().cloned().collect()
    }

    async fn ensure_ports_available(
        &self,
        server_port: u16,
        management_port: u16,
    ) -> Result<(), InstanceError> {
        let map = self.instances.read().await;
        for instance in map.values() {
            if instance.port == server_port {
                return Err(InstanceError::PortInUse(server_port));
            }
            if instance.port == management_port {
                return Err(InstanceError::PortUnavailable(format!(
                    "Management port {management_port} conflicts with server port used by {}",
                    instance.name
                )));
            }
            if instance.management_port != 0 && instance.management_port == server_port {
                return Err(InstanceError::PortUnavailable(format!(
                    "Server port {server_port} conflicts with management port used by {}",
                    instance.name
                )));
            }
            if instance.management_port != 0 && instance.management_port == management_port {
                return Err(InstanceError::PortUnavailable(format!(
                    "Management port {management_port} is already used by {}",
                    instance.name
                )));
            }
        }
        Ok(())
    }

    /// Directly update an instance's state (for testing).
    pub async fn force_state(&self, id: &str, state: InstanceState) -> Result<(), InstanceError> {
        let mut map = self.instances.write().await;
        match map.get_mut(id) {
            Some(inst) => {
                inst.state = state;
                Ok(())
            }
            None => Err(InstanceError::NotFound(id.into())),
        }
    }

    /// Update instance-level config fields (java_args, java_path) and persist to disk.
    pub async fn update_config(
        &self,
        id: &str,
        java_args: Option<String>,
        java_path: Option<String>,
        port: Option<u16>,
    ) -> Result<(), InstanceError> {
        let mut map = self.instances.write().await;
        let inst = map
            .get_mut(id)
            .ok_or_else(|| InstanceError::NotFound(id.into()))?;
        if let Some(ref j) = java_args {
            inst.java_args = j.clone();
        }
        if let Some(ref p) = java_path {
            inst.java_path = p.clone();
        }
        if let Some(p) = port {
            let old_port = inst.port;
            inst.port = p;
            // Also update management port: new = server_port + 100
            if inst.management_port != 0 {
                let new_mgmt = p.saturating_add(100);
                inst.management_port = new_mgmt;
                // Update server.properties management port
                let props_path = inst.work_dir.join("server.properties");
                let mut props = crate::files::read_properties(&props_path)
                    .await
                    .map_err(|e| InstanceError::ConfigError(e.to_string()))?;
                props.insert("management-server-port".into(), new_mgmt.to_string());
                crate::files::write_properties(&props_path, &props)
                    .await
                    .map_err(|e| InstanceError::ConfigError(e.to_string()))?;
                tracing::info!(instance_id = %id, old_port, new_port = p, "Instance port updated");
            }
        }
        // Persist updated instance to disk
        let json = serde_json::to_string_pretty(&*inst)?;
        tokio::fs::write(inst.work_dir.join("instance.json"), json).await?;
        tracing::info!(instance_id = %id, "Instance config persisted to disk");
        Ok(())
    }

    /// Update Docker-related configuration for an instance (runtime mode, image).
    pub async fn update_docker_config(
        &self,
        id: &str,
        runtime_mode: Option<String>,
        docker_image: Option<String>,
    ) -> Result<(), InstanceError> {
        let mut map = self.instances.write().await;
        let inst = map
            .get_mut(id)
            .ok_or_else(|| InstanceError::NotFound(id.into()))?;
        if let Some(m) = runtime_mode {
            inst.runtime_mode = m;
        }
        if let Some(img) = docker_image {
            inst.docker_image = img;
        }
        let json = serde_json::to_string_pretty(&*inst)?;
        tokio::fs::write(inst.work_dir.join("instance.json"), json).await?;
        Ok(())
    }

    /// Deletes a stopped instance and removes its directory from disk.
    pub async fn delete(&self, id: &str) -> Result<(), InstanceError> {
        let instance = {
            let map = self.instances.read().await;
            map.get(id)
                .ok_or_else(|| InstanceError::NotFound(id.into()))?
                .clone()
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
    ///
    /// Acquires a write lock to atomically check-and-transition state, preventing
    /// concurrent start requests from double-spawning the process. The lock is
    /// dropped before the slow EULA check and process spawn.
    pub async fn start(&self, id: &str) -> Result<(), InstanceError> {
        let (jar_path, work_dir, server_type, java_args, java_path, runtime_mode, _docker_image) = {
            let mut map = self.instances.write().await;
            let inst = map
                .get_mut(id)
                .ok_or_else(|| InstanceError::NotFound(id.into()))?;
            if inst.state != InstanceState::Stopped && inst.state != InstanceState::Crashed {
                return Err(InstanceError::NotStopped(id.into()));
            }
            // Atomically transition to Starting under the write lock
            inst.state = InstanceState::Starting;
            let _ = self.event_tx.send(Event::InstanceStateChange {
                instance_id: id.into(),
                state: InstanceState::Starting,
            });
            (
                inst.jar_path.clone(),
                inst.work_dir.clone(),
                inst.server_type.clone(),
                inst.java_args.clone(),
                inst.java_path.clone(),
                inst.runtime_mode.clone(),
                inst.docker_image.clone(),
            )
        };

        // Ensure EULA is accepted BEFORE spawning the process
        let eula_path = work_dir.join("eula.txt");
        if eula_path.exists() {
            let content = tokio::fs::read_to_string(&eula_path)
                .await
                .unwrap_or_default();
            if content.contains("eula=false") {
                if let Err(e) =
                    tokio::fs::write(&eula_path, content.replace("eula=false", "eula=true")).await
                {
                    self.transition_state(id, InstanceState::Crashed).await;
                    return Err(InstanceError::Io(e));
                }
            }
        } else {
            if let Err(e) = tokio::fs::write(&eula_path, crate::files::eula_accepted()).await {
                self.transition_state(id, InstanceState::Crashed).await;
                return Err(InstanceError::Io(e));
            }
        }

        // Build and run the command
        if runtime_mode == "docker" {
            // Docker mode: use docker run instead of java process
            let inst = {
                let map = self.instances.read().await;
                map.get(id).cloned()
            };
            if let Some(inst) = inst {
                let mut cmd = crate::docker::build_docker_command(&inst);
                match self.start_process_with_cmd(id, &mut cmd).await {
                    Ok(()) => Ok(()),
                    Err(error) => {
                        self.transition_state(id, InstanceState::Crashed).await;
                        Err(error)
                    }
                }
            } else {
                self.transition_state(id, InstanceState::Crashed).await;
                Err(InstanceError::NotFound(id.into()))
            }
        } else {
            let (java_bin, java_args_vec) =
                build_java_command(&java_path, &jar_path, &server_type, &java_args);
            let args_refs: Vec<&str> = java_args_vec.iter().map(|s| s.as_str()).collect();

            match self.start_process(id, &java_bin, &args_refs).await {
                Ok(()) => Ok(()),
                Err(error) => {
                    self.transition_state(id, InstanceState::Crashed).await;
                    Err(error)
                }
            }
        }
    }

    /// Start a pre-built command (used for Docker mode where the command is already configured).
    async fn start_process_with_cmd(
        &self,
        id: &str,
        cmd: &mut TokioCommand,
    ) -> Result<(), InstanceError> {
        let work_dir = {
            let map = self.instances.read().await;
            let inst = map.get(id).unwrap();
            inst.work_dir.clone()
        };
        cmd.current_dir(&work_dir);
        cmd.kill_on_drop(true);
        let mut child = cmd.spawn()?;

        let stdout = child.stdout.take().expect("stdout pipe");
        let stderr = child.stderr.take().expect("stderr pipe");

        self.transition_state(id, InstanceState::Running).await;

        let stdin = child.stdin.take();
        if let Some(s) = stdin {
            self.stdins.lock().await.insert(id.to_string(), s);
        }

        self.transition_state(id, InstanceState::Running).await;

        // Pipe logs
        let log_pipe = LogPipe::new(id.to_string(), self.event_tx.clone());
        tokio::spawn(async move {
            log_pipe.pipe_both(stdout, stderr).await;
        });

        let (kill_tx, kill_rx) = oneshot::channel::<()>();
        self.process_killers
            .lock()
            .await
            .insert(id.to_string(), kill_tx);

        // Background exit monitor
        {
            let instances = Arc::clone(&self.instances);
            let process_killers = Arc::clone(&self.process_killers);
            let stdins = Arc::clone(&self.stdins);
            let event_tx = self.event_tx.clone();
            let id_str = id.to_string();
            tokio::spawn(async move {
                let exit_state = tokio::select! {
                    status = child.wait() => match status {
                        Ok(exit) if exit.success() => InstanceState::Stopped,
                        _ => InstanceState::Crashed,
                    },
                    _ = kill_rx => {
                        match child.kill().await {
                            Ok(()) => {
                                let _ = child.wait().await;
                                InstanceState::Stopped
                            }
                            Err(_) => InstanceState::Crashed,
                        }
                    }
                };
                // Cleanup
                process_killers.lock().await.remove(&id_str);
                stdins.lock().await.remove(&id_str);
                // Transition and broadcast
                {
                    let mut map = instances.write().await;
                    if let Some(inst) = map.get_mut(&id_str) {
                        inst.state = exit_state.clone();
                    }
                }
                let _ = event_tx.send(Event::InstanceStateChange {
                    instance_id: id_str,
                    state: exit_state,
                });
            });
        }

        Ok(())
    }

    /// Low-level process spawn with error capture.
    async fn start_process(
        &self,
        id: &str,
        command: &str,
        args: &[&str],
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

        let stdout = child.stdout.take().expect("stdout pipe");
        let stderr = child.stderr.take().expect("stderr pipe");

        self.transition_state(id, InstanceState::Running).await;

        // Take stdin out and store separately for send_command().
        let stdin = child.stdin.take();
        if let Some(s) = stdin {
            self.stdins.lock().await.insert(id.to_string(), s);
        }

        // Pipe stdout+stderr merged — avoids duplicate lines common with Java process output
        let log_pipe = LogPipe::new(id.to_string(), self.event_tx.clone());
        tokio::spawn(async move {
            log_pipe.pipe_both(stdout, stderr).await;
        });

        let (kill_tx, kill_rx) = oneshot::channel::<()>();
        self.process_killers
            .lock()
            .await
            .insert(id.to_string(), kill_tx);

        // Background exit monitor owns the child so it can detect natural exits,
        // while stop() can still request a force-kill through `process_killers`.
        {
            let instances = Arc::clone(&self.instances);
            let process_killers = Arc::clone(&self.process_killers);
            let stdins = Arc::clone(&self.stdins);
            let event_tx = self.event_tx.clone();
            let id_str = id.to_string();
            tokio::spawn(async move {
                let exit_state = tokio::select! {
                    status = child.wait() => match status {
                        Ok(exit) if exit.success() => InstanceState::Stopped,
                        _ => InstanceState::Crashed,
                    },
                    _ = kill_rx => {
                        match child.kill().await {
                            Ok(()) => {
                                let _ = child.wait().await;
                                InstanceState::Stopped
                            }
                            Err(_) => InstanceState::Crashed,
                        }
                    }
                };

                process_killers.lock().await.remove(&id_str);
                stdins.lock().await.remove(&id_str);

                let mut map = instances.write().await;
                if let Some(inst) = map.get_mut(&id_str) {
                    if inst.state == InstanceState::Running
                        || inst.state == InstanceState::Starting
                        || inst.state == InstanceState::Stopping
                    {
                        inst.state = exit_state.clone();
                        let _ = event_tx.send(Event::InstanceStateChange {
                            instance_id: id_str,
                            state: exit_state,
                        });
                    }
                }
            });
        }

        Ok(())
    }

    /// Send an arbitrary command to the instance's stdin (e.g., "say Hello").
    pub async fn send_command(&self, id: &str, command: &str) -> Result<(), InstanceError> {
        let mut stdins = self.stdins.lock().await;
        let stdin = stdins
            .get_mut(id)
            .ok_or_else(|| InstanceError::NotFound(id.into()))?;
        let mut line = command.to_string();
        if !line.ends_with('\n') {
            line.push('\n');
        }
        stdin.write_all(line.as_bytes()).await.map_err(|e| {
            InstanceError::Io(std::io::Error::new(
                e.kind(),
                format!("Failed to send command to instance {}: {}", id, e),
            ))
        })?;
        Ok(())
    }

    /// Stop a running instance by sending "stop\n" to its stdin.
    /// Waits for the process to exit (with a 60s timeout, then force-kill).
    /// No-op if the instance is not running.
    pub async fn stop(&self, id: &str) -> Result<(), InstanceError> {
        let (state, is_docker) = {
            let map = self.instances.read().await;
            let instance = map
                .get(id)
                .ok_or_else(|| InstanceError::NotFound(id.into()))?;
            (instance.state.clone(), instance.runtime_mode == "docker")
        };

        // No-op for non-running instances
        if state != InstanceState::Running && state != InstanceState::Starting {
            return Ok(());
        }

        self.transition_state(id, InstanceState::Stopping).await;

        if is_docker {
            // Docker mode: use docker stop
            let inst = {
                let map = self.instances.read().await;
                map.get(id).cloned()
            };
            if let Some(inst) = inst {
                let container_name = format!("neocraft-{}", &inst.id[..8].to_string());
                // Issue docker stop with timeout
                let _ = TokioCommand::new("docker")
                    .arg("stop")
                    .arg("-t")
                    .arg("30")
                    .arg(&container_name)
                    .output()
                    .await;
                // Remove container (--rm flag in run should handle this, but just in case)
                let _ = TokioCommand::new("docker")
                    .arg("rm")
                    .arg("-f")
                    .arg(&container_name)
                    .output()
                    .await;
                self.transition_state(id, InstanceState::Stopped).await;
                return Ok(());
            }
        } else {
            // Process mode: send stop command via stdin
            {
                let mut stdins = self.stdins.lock().await;
                if let Some(mut stdin) = stdins.remove(id) {
                    let _ = stdin.write_all(b"stop\n").await;
                }
            }
        }

        // Wait for the exit monitor to detect the process exit (up to 60s)
        for _ in 0..600 {
            let state = {
                let map = self.instances.read().await;
                map.get(id).map(|i| i.state.clone())
            };
            if state != Some(InstanceState::Stopping) {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }

        let timed_out = {
            let map = self.instances.read().await;
            map.get(id).map(|i| i.state.clone()) == Some(InstanceState::Stopping)
        };

        if timed_out {
            if let Some(kill_tx) = self.process_killers.lock().await.remove(id) {
                let _ = kill_tx.send(());
            }

            for _ in 0..50 {
                let state = {
                    let map = self.instances.read().await;
                    map.get(id).map(|i| i.state.clone())
                };
                if state != Some(InstanceState::Stopping) {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_millis(100)).await;
            }
        }

        Ok(())
    }

    /// Restart an instance: stop it, then start it again.
    pub async fn restart(&self, id: &str) -> Result<(), InstanceError> {
        self.stop(id).await?;
        // Brief pause to let the OS reap the old process
        tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        self.start(id).await
    }

    async fn transition_state(&self, id: &str, state: InstanceState) {
        {
            let mut map = self.instances.write().await;
            if let Some(inst) = map.get_mut(id) {
                inst.state = state.clone();
            }
        }
        let _ = self.event_tx.send(Event::InstanceStateChange {
            instance_id: id.into(),
            state,
        });
    }
}

fn emit_import_progress(
    event_tx: &broadcast::Sender<Event>,
    id: &str,
    downloaded: u64,
    total: u64,
    status: &str,
) {
    let percent = if total > 0 {
        (downloaded as f64 / total as f64 * 100.0).min(100.0)
    } else {
        0.0
    };
    let _ = event_tx.send(Event::DownloadProgress {
        task_id: format!("import:{id}"),
        downloaded,
        total,
        percent,
        phase: Some("import".into()),
        status: Some(status.into()),
    });
}

#[derive(Debug, thiserror::Error)]
pub enum InstanceError {
    #[error("Port {0} is already in use")]
    PortInUse(u16),
    #[error("{0}")]
    PortUnavailable(String),
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
    #[error("JAR read error: {0}")]
    JarRead(String),
    #[error("Config error: {0}")]
    ConfigError(String),
}
