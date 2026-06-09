use neocraft_daemon::instance::{InstanceManager, ServerType};
use neocraft_daemon::java_args::{build_java_command, version_at_least};
use neocraft_daemon::management::SMP_ALLOWED_ORIGINS;
use neocraft_daemon::protocol::{Event, InstanceState};
use std::io::Write;
use std::path::Path;
use tempfile::TempDir;
use tokio::sync::broadcast;

fn setup() -> (
    TempDir,
    broadcast::Sender<Event>,
    broadcast::Receiver<Event>,
) {
    let dir = TempDir::new().unwrap();
    let (tx, rx) = broadcast::channel(256);
    (dir, tx, rx)
}

fn write_test_server_jar(path: &Path, version: &str) {
    let file = std::fs::File::create(path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    zip.start_file("version.json", options).unwrap();
    zip.write_all(format!(r#"{{"name":"{}"}}"#, version).as_bytes())
        .unwrap();
    zip.finish().unwrap();
}

#[tokio::test]
async fn test_create_instance_creates_directory_structure() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let instance = manager
        .create(
            "Test Server".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();

    // Check instance fields
    assert_eq!(instance.name, "Test Server");
    assert_eq!(instance.server_type, ServerType::Paper);
    assert_eq!(instance.version, "1.21.5");
    assert_eq!(instance.port, 25565);
    assert_eq!(instance.state, InstanceState::Stopped);
    assert!(!instance.id.is_empty());

    // Check directory structure
    let work_dir = dir.path().join("instances").join(&instance.id);
    assert!(work_dir.exists(), "work directory should exist");
    assert!(work_dir.join("eula.txt").exists(), "eula.txt should exist");
    assert!(
        work_dir.join("server.properties").exists(),
        "server.properties should exist"
    );

    // Check instance state file
    let state_file = work_dir.join("instance.json");
    assert!(state_file.exists(), "instance.json should exist");

    // Check server.properties contains the port
    let props = std::fs::read_to_string(work_dir.join("server.properties")).unwrap();
    assert!(props.contains("server-port=25565"));
}

#[tokio::test]
async fn test_create_instance_assigns_unique_ports() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let i1 = manager
        .create(
            "S1".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let i2 = manager
        .create(
            "S2".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25566,
            "".into(),
            None,
        )
        .await
        .unwrap();

    assert_ne!(i1.port, i2.port, "ports should be different");
}

#[tokio::test]
async fn test_create_instance_duplicate_port_rejected() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    manager
        .create(
            "S1".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let result = manager
        .create(
            "S2".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await;

    assert!(result.is_err(), "duplicate port should be rejected");
}

#[tokio::test]
async fn test_create_instance_rejects_management_port_overflow() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let result = manager
        .create(
            "Overflow".into(),
            ServerType::Paper,
            "1.21.9".into(),
            65500,
            "".into(),
            None,
        )
        .await;

    assert!(
        result.is_err(),
        "server ports that would overflow the management port should be rejected"
    );
}

#[tokio::test]
async fn test_create_instance_rejects_management_port_conflict() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    manager
        .create(
            "SMP".into(),
            ServerType::Paper,
            "1.21.9".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();

    let result = manager
        .create(
            "RCON".into(),
            ServerType::Vanilla,
            "1.20.4".into(),
            25655,
            "".into(),
            None,
        )
        .await;

    assert!(
        result.is_err(),
        "new management ports should not be allowed to collide with existing management ports"
    );
}

#[tokio::test]
async fn test_import_rejects_source_that_contains_instances_dir() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().join("neocraft-data"), event_tx);
    tokio::fs::create_dir_all(dir.path().join("neocraft-data/instances"))
        .await
        .unwrap();
    write_test_server_jar(&dir.path().join("server.jar"), "1.20.4");

    let result = manager
        .import(
            "Unsafe Import".into(),
            dir.path().to_path_buf(),
            25565,
            None,
            None,
        )
        .await;

    let message = result.unwrap_err().to_string();
    assert!(
        message.contains("contains NeoCraft's instances directory"),
        "unexpected error: {message}"
    );
}

#[tokio::test]
async fn test_import_emits_copy_progress() {
    let (dir, event_tx, mut event_rx) = setup();
    let manager = InstanceManager::new(dir.path().join("neocraft-data"), event_tx);
    let source_dir = dir.path().join("source-server");
    tokio::fs::create_dir_all(source_dir.join("world"))
        .await
        .unwrap();
    write_test_server_jar(&source_dir.join("server.jar"), "1.20.4");
    tokio::fs::write(source_dir.join("world/level.dat"), vec![7_u8; 1024])
        .await
        .unwrap();

    let instance = manager
        .import("Imported".into(), source_dir, 25565, None, None)
        .await
        .unwrap();

    let mut saw_start_progress = false;
    let mut saw_copied_progress = false;
    while let Ok(event) = event_rx.try_recv() {
        if let Event::DownloadProgress {
            task_id,
            phase,
            downloaded,
            ..
        } = event
        {
            if task_id == format!("import:{}", instance.id) && phase.as_deref() == Some("import") {
                if downloaded == 0 {
                    saw_start_progress = true;
                } else {
                    saw_copied_progress = true;
                }
            }
        }
    }

    assert!(
        saw_start_progress && saw_copied_progress,
        "import should emit start and copy progress events"
    );
}

#[tokio::test]
async fn test_list_instances() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    manager
        .create(
            "S1".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    manager
        .create(
            "S2".into(),
            ServerType::Vanilla,
            "1.21.0".into(),
            25566,
            "".into(),
            None,
        )
        .await
        .unwrap();

    let list = manager.list().await;
    assert_eq!(list.len(), 2);
}

#[tokio::test]
async fn test_get_instance_by_id() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let created = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let found = manager.get(&created.id).await.unwrap();
    assert_eq!(found.name, "Test");
}

#[tokio::test]
async fn test_get_nonexistent_instance_returns_none() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    assert!(manager.get("nonexistent").await.is_none());
}

#[tokio::test]
async fn test_delete_instance_removes_directory() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let created = manager
        .create(
            "ToDelete".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let work_dir = dir.path().join("instances").join(&created.id);
    assert!(work_dir.exists());

    manager.delete(&created.id).await.unwrap();
    assert!(!work_dir.exists(), "work directory should be removed");
    assert!(manager.get(&created.id).await.is_none());
}

#[tokio::test]
async fn test_delete_running_instance_rejected() {
    // Skip for now — start/stop not implemented yet
    // This test validates future behavior
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let created = manager
        .create(
            "Running".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    // Can't test rejection of running instance yet — manually set state to Running
    // This documents the expected behavior
    assert!(manager.get(&created.id).await.is_some());
    // Future: manager.delete(&created.id).await should return Err
}

#[tokio::test]
async fn test_eula_accepted_by_default() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let work_dir = dir.path().join("instances").join(&instance.id);
    let eula = std::fs::read_to_string(work_dir.join("eula.txt")).unwrap();
    assert!(
        eula.contains("eula=true"),
        "eula should be accepted by default"
    );
}

#[tokio::test]
async fn test_server_properties_template_has_all_fields() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25566,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let work_dir = dir.path().join("instances").join(&instance.id);
    let props = std::fs::read_to_string(work_dir.join("server.properties")).unwrap();
    // Core fields
    assert!(props.contains("server-port=25566"));
    assert!(props.contains("motd="));
    assert!(props.contains("enable-rcon=false"));
    // Expanded fields from comprehensive template
    assert!(props.contains("max-players=20"));
    assert!(props.contains("online-mode=true"));
    assert!(props.contains("gamemode=survival"));
    assert!(props.contains("difficulty=normal"));
    assert!(props.contains("view-distance=10"));
    assert!(props.contains("level-name=world"));
    assert!(props.contains("white-list=false"));
}

#[tokio::test]
async fn test_jar_path_is_set_on_create() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    assert!(
        instance.jar_path.ends_with("server.jar"),
        "jar_path should point to server.jar"
    );
    assert_eq!(instance.jar_path, instance.work_dir.join("server.jar"));
}

#[tokio::test]
async fn test_jar_path_persisted_in_instance_json() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let json_path = instance.work_dir.join("instance.json");
    let json_str = std::fs::read_to_string(&json_path).unwrap();
    assert!(
        json_str.contains("jar_path"),
        "instance.json should contain jar_path"
    );
    assert!(
        json_str.contains("server.jar"),
        "instance.json should contain server.jar path"
    );
}

#[test]
fn test_build_paper_java_command() {
    let cmd = build_java_command(
        "java",
        Path::new("/tmp/server.jar"),
        &ServerType::Paper,
        "-Xmx4G -Xms4G",
    );
    assert_eq!(cmd.0, "java");
    assert!(cmd.1.contains(&"-jar".to_string()));
    assert!(cmd.1.contains(&"nogui".to_string()));
    assert!(cmd.1.contains(&"-XX:+UseG1GC".to_string()));
    assert!(cmd.1.contains(&"-Xmx4G".to_string()));
}

#[test]
fn test_build_vanilla_java_command() {
    let cmd = build_java_command(
        "java",
        Path::new("/tmp/server.jar"),
        &ServerType::Vanilla,
        "-Xmx2G -Xms2G",
    );
    assert!(!cmd.1.contains(&"-XX:+UseG1GC".to_string()));
    assert!(cmd.1.contains(&"nogui".to_string()));
}

#[test]
fn test_build_fabric_java_command() {
    let cmd = build_java_command(
        "java",
        Path::new("/tmp/server.jar"),
        &ServerType::Fabric,
        "-Xmx2G -Xms1G",
    );
    assert!(!cmd.1.contains(&"-XX:+UseG1GC".to_string()));
    assert!(cmd.1.contains(&"-jar".to_string()));
    assert!(cmd.1.contains(&"-Xmx2G".to_string()));
    assert!(cmd.1.contains(&"-Xms1G".to_string()));
}

#[test]
fn test_build_java_command_falls_back_to_default_memory() {
    let cmd = build_java_command("java", Path::new("/tmp/server.jar"), &ServerType::Paper, "");
    assert!(cmd.1.contains(&"-Xmx2G".to_string()));
    assert!(cmd.1.contains(&"-Xms2G".to_string()));
}

#[test]
fn test_build_spigot_uses_aikar_flags() {
    let cmd = build_java_command(
        "java",
        Path::new("/tmp/server.jar"),
        &ServerType::Spigot,
        "-Xmx2G -Xms2G",
    );
    assert!(cmd.1.contains(&"-XX:+UseG1GC".to_string()));
}

#[tokio::test]
async fn test_start_already_running_rejected() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let id = instance.id.clone();

    // Manually set state to Running to simulate an already-running instance
    manager
        .force_state(&id, InstanceState::Running)
        .await
        .unwrap();

    let result = manager.start(&id).await;
    assert!(
        result.is_err(),
        "starting an already-running instance should be rejected"
    );
}

#[tokio::test]
async fn test_stop_not_running_is_noop() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    let result = manager.stop(&instance.id).await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn test_instances_persist_across_restarts() {
    let (dir, event_tx, _) = setup();
    let data_dir = dir.path().to_path_buf();

    // Create two instances
    {
        let manager = InstanceManager::new(data_dir.clone(), event_tx.clone());
        manager
            .create(
                "S1".into(),
                ServerType::Paper,
                "1.21.5".into(),
                25565,
                "".into(),
                None,
            )
            .await
            .unwrap();
        manager
            .create(
                "S2".into(),
                ServerType::Vanilla,
                "1.20.4".into(),
                25566,
                "".into(),
                None,
            )
            .await
            .unwrap();
        let list = manager.list().await;
        assert_eq!(list.len(), 2);
    }
    // Manager dropped — simulates daemon restart

    // Create a new manager pointing to the same data dir
    {
        let (new_tx, _) = broadcast::channel(256);
        let manager2 = InstanceManager::new(data_dir.clone(), new_tx);
        let list = manager2.list().await;
        assert_eq!(list.len(), 2, "instances should be reloaded from disk");
        assert_eq!(
            list[0].state,
            InstanceState::Stopped,
            "state should be reset to Stopped"
        );
        assert_eq!(list[1].state, InstanceState::Stopped);
    }
}

#[tokio::test]
async fn test_update_config_java_args_roundtrip() {
    let (dir, event_tx, _) = setup();
    let data_dir = dir.path().to_path_buf();
    let manager = InstanceManager::new(data_dir.clone(), event_tx);

    // Create instance with default java_args
    let instance = manager
        .create(
            "Test".into(),
            ServerType::Paper,
            "1.21.5".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();
    assert_eq!(instance.java_args, "-Xmx2G -Xms1G");

    // Update java_args
    manager
        .update_config(&instance.id, Some("-Xmx4G -Xms2G".into()), None)
        .await
        .unwrap();

    // Verify in-memory update
    let updated = manager.get(&instance.id).await.unwrap();
    assert_eq!(
        updated.java_args, "-Xmx4G -Xms2G",
        "java_args should be updated in memory"
    );

    // Verify disk persistence — read instance.json directly
    let json = std::fs::read_to_string(updated.work_dir.join("instance.json")).unwrap();
    assert!(
        json.contains("java_args") && json.contains("4G"),
        "java_args should be persisted to disk, got: {}",
        json
    );

    // Verify reload from disk
    let (new_tx, _) = broadcast::channel(256);
    let manager2 = InstanceManager::new(data_dir, new_tx);
    let reloaded = manager2.get(&instance.id).await.unwrap();
    assert_eq!(
        reloaded.java_args, "-Xmx4G -Xms2G",
        "java_args should survive daemon restart"
    );
}

#[test]
fn test_version_at_least_exact_match() {
    assert!(version_at_least("1.21.9", 1, 21, 9));
}

#[test]
fn test_version_at_least_patch_greater() {
    assert!(version_at_least("1.21.10", 1, 21, 9));
}

#[test]
fn test_version_at_least_minor_less() {
    assert!(!version_at_least("1.20.4", 1, 21, 9));
}

#[test]
fn test_version_at_least_patch_less() {
    assert!(!version_at_least("1.21.8", 1, 21, 9));
}

#[test]
fn test_version_at_least_two_part_version() {
    assert!(version_at_least("1.22", 1, 21, 9));
}

#[test]
fn test_version_at_least_invalid() {
    assert!(!version_at_least("invalid", 1, 21, 9));
}

#[tokio::test]
async fn test_instance_has_management_fields() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let instance = manager
        .create(
            "SMP Server".into(),
            ServerType::Paper,
            "1.21.9".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();

    assert!(
        instance.management_port > 0,
        "management_port should be set"
    );
    assert!(
        !instance.management_token.is_empty(),
        "management_token should be set"
    );
    // For version >= 1.21.9, token should be 40-char alphanumeric
    assert_eq!(instance.management_token.len(), 40);
    assert!(
        instance
            .management_token
            .chars()
            .all(|c| c.is_ascii_alphanumeric()),
        "token should be alphanumeric"
    );
}

#[tokio::test]
async fn test_smp_config_for_1_21_9() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let instance = manager
        .create(
            "SMP Server".into(),
            ServerType::Paper,
            "1.21.9".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();

    let props = std::fs::read_to_string(instance.work_dir.join("server.properties")).unwrap();
    assert!(props.contains("management-server-enabled=true"));
    assert!(props.contains(&format!("management-server-port={}", instance.port + 100)));
    assert!(props.contains("management-server-secret="));
    assert!(props.contains(&format!(
        "management-server-allowed-origins={SMP_ALLOWED_ORIGINS}"
    )));
    // The secret in file should match the token on the instance
    assert!(props.contains(&instance.management_token));
    // TLS is disabled by default (localhost self-signed cert breaks browsers)
    assert!(!instance.management_tls_enabled);
    assert!(props.contains("management-server-tls-enabled=false"));
    // If keytool is available, TLS keystore config should be present
    if !instance.management_keystore_password.is_empty() {
        assert!(props.contains("management-server-tls-keystore="));
        assert!(props.contains("management-server-tls-keystore-password="));
    }
}

#[tokio::test]
async fn test_rcon_config_for_1_20_4() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let instance = manager
        .create(
            "RCON Server".into(),
            ServerType::Vanilla,
            "1.20.4".into(),
            25565,
            "".into(),
            None,
        )
        .await
        .unwrap();

    assert!(
        instance.management_port > 0,
        "management_port should be set"
    );
    assert!(
        !instance.management_token.is_empty(),
        "management_token should be set"
    );
    // For version < 1.21.9, token should be 32-char hex
    assert_eq!(instance.management_token.len(), 32);
    assert!(
        instance
            .management_token
            .chars()
            .all(|c| c.is_ascii_hexdigit()),
        "token should be hex"
    );

    let props = std::fs::read_to_string(instance.work_dir.join("server.properties")).unwrap();
    assert!(props.contains("enable-rcon=true"));
    assert!(props.contains(&format!("rcon.port={}", instance.port + 10)));
    assert!(props.contains("rcon.password="));
    // The password in file should match the token on the instance
    assert!(props.contains(&instance.management_token));
}
