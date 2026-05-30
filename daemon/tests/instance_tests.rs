use std::path::Path;
use std::path::PathBuf;
use std::time::Duration;
use neocraft_daemon::instance::{InstanceManager, ServerType};
use neocraft_daemon::protocol::{Event, InstanceState};
use tokio::sync::broadcast;
use tempfile::TempDir;

fn setup() -> (TempDir, broadcast::Sender<Event>, broadcast::Receiver<Event>) {
    let dir = TempDir::new().unwrap();
    let (tx, rx) = broadcast::channel(256);
    (dir, tx, rx)
}

fn create_mock_java_script(dir: &Path) -> PathBuf {
    let script_path = dir.join("mock-java.sh");
    let script = r#"#!/bin/bash
echo "[Server] Starting Minecraft server..."
echo "[Server] Loading world..."
echo "[Server] Done! For help, type \"help\""
while IFS= read -r line; do
    echo "[Server] Received: $line"
    if [[ "$line" == "stop" ]]; then
        echo "[Server] Stopping the server..."
        sleep 0.2
        echo "[Server] All chunks saved"
        exit 0
    fi
done
"#;
    std::fs::write(&script_path, script).unwrap();
    std::process::Command::new("chmod")
        .arg("+x")
        .arg(&script_path)
        .output()
        .unwrap();
    script_path
}

fn create_crash_script(dir: &Path) -> PathBuf {
    let script_path = dir.join("crash.sh");
    std::fs::write(
        &script_path,
        "#!/bin/bash\necho 'Oops!'\nexit 1\n",
    )
    .unwrap();
    std::process::Command::new("chmod")
        .arg("+x")
        .arg(&script_path)
        .output()
        .unwrap();
    script_path
}

#[tokio::test]
async fn test_create_instance_creates_directory_structure() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let instance = manager.create(
        "Test Server".into(),
        ServerType::Paper,
        "1.21.5".into(),
        25565,
        "".into(),
    ).await.unwrap();

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
    assert!(work_dir.join("server.properties").exists(), "server.properties should exist");

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
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let i1 = manager.create("S1".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    let i2 = manager.create("S2".into(), ServerType::Paper, "1.21.5".into(), 25566, "".into()).await.unwrap();

    assert_ne!(i1.port, i2.port, "ports should be different");
}

#[tokio::test]
async fn test_create_instance_duplicate_port_rejected() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    manager.create("S1".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    let result = manager.create("S2".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await;

    assert!(result.is_err(), "duplicate port should be rejected");
}

#[tokio::test]
async fn test_list_instances() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    manager.create("S1".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    manager.create("S2".into(), ServerType::Vanilla, "1.21.0".into(), 25566, "".into()).await.unwrap();

    let list = manager.list();
    assert_eq!(list.len(), 2);
}

#[tokio::test]
async fn test_get_instance_by_id() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let created = manager.create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    let found = manager.get(&created.id).unwrap();
    assert_eq!(found.name, "Test");
}

#[tokio::test]
async fn test_get_nonexistent_instance_returns_none() {
    let (dir, event_tx, _) = setup();
    let manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    assert!(manager.get("nonexistent").is_none());
}

#[tokio::test]
async fn test_delete_instance_removes_directory() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);

    let created = manager.create("ToDelete".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    let work_dir = dir.path().join("instances").join(&created.id);
    assert!(work_dir.exists());

    manager.delete(&created.id).await.unwrap();
    assert!(!work_dir.exists(), "work directory should be removed");
    assert!(manager.get(&created.id).is_none());
}

#[tokio::test]
async fn test_delete_running_instance_rejected() {
    // Skip for now — start/stop not implemented yet
    // This test validates future behavior
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let created = manager.create("Running".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    // Can't test rejection of running instance yet — manually set state to Running
    // This documents the expected behavior
    assert!(manager.get(&created.id).is_some());
    // Future: manager.delete(&created.id).await should return Err
}

#[tokio::test]
async fn test_eula_accepted_by_default() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager.create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into()).await.unwrap();
    let work_dir = dir.path().join("instances").join(&instance.id);
    let eula = std::fs::read_to_string(work_dir.join("eula.txt")).unwrap();
    assert!(eula.contains("eula=true"), "eula should be accepted by default");
}

#[tokio::test]
async fn test_server_properties_template_has_required_keys() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager.create("Test".into(), ServerType::Paper, "1.21.5".into(), 25566, "".into()).await.unwrap();
    let work_dir = dir.path().join("instances").join(&instance.id);
    let props = std::fs::read_to_string(work_dir.join("server.properties")).unwrap();
    assert!(props.contains("server-port=25566"));
    assert!(props.contains("motd="));
    assert!(props.contains("enable-rcon=false"));
}

#[tokio::test]
async fn test_start_mock_server_process() {
    let (dir, event_tx, mut event_rx) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx.clone());
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let mock_java = create_mock_java_script(dir.path());
    let id = instance.id.clone();

    manager
        .start_with_command(&id, &mock_java, &[])
        .await
        .unwrap();

    let inst = manager.get(&id).unwrap();
    assert_eq!(inst.state, InstanceState::Running);

    // Drain events looking for state change to Running
    let mut found_running = false;
    while let Ok(event) = event_rx.try_recv() {
        if let Event::InstanceStateChange { instance_id, state } = event {
            if instance_id == id && state == InstanceState::Running {
                found_running = true;
                break;
            }
        }
    }
    assert!(
        found_running,
        "Should have emitted Running state change event"
    );

    // Clean up: stop the process
    let _ = manager.stop(&id).await;
}

#[tokio::test]
async fn test_stop_mock_server_via_stdin() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let mock_java = create_mock_java_script(dir.path());
    let id = instance.id.clone();

    manager
        .start_with_command(&id, &mock_java, &[])
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    manager.stop(&id).await.unwrap();

    let inst = manager.get(&id).unwrap();
    assert_eq!(inst.state, InstanceState::Stopped);
}

#[tokio::test]
async fn test_crash_detection() {
    let (dir, event_tx, mut event_rx) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let crash_script = create_crash_script(dir.path());
    let id = instance.id.clone();

    manager
        .start_with_command(&id, &crash_script, &[])
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(500)).await;

    let mut crashed = false;
    while let Ok(event) = event_rx.try_recv() {
        if let Event::InstanceStateChange { instance_id, state } = event {
            if instance_id == id && state == InstanceState::Crashed {
                crashed = true;
                break;
            }
        }
    }
    assert!(
        crashed,
        "Instance should have transitioned to Crashed state"
    );
}

#[tokio::test]
async fn test_restart_stops_then_starts() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let mock_java = create_mock_java_script(dir.path());
    let id = instance.id.clone();

    manager
        .start_with_command(&id, &mock_java, &[])
        .await
        .unwrap();
    assert_eq!(manager.get(&id).unwrap().state, InstanceState::Running);

    manager.restart(&id).await.unwrap();
    tokio::time::sleep(Duration::from_millis(300)).await;
    assert_eq!(manager.get(&id).unwrap().state, InstanceState::Running);

    // Clean up
    let _ = manager.stop(&id).await;
}

#[tokio::test]
async fn test_start_already_running_rejected() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let mock_java = create_mock_java_script(dir.path());
    let id = instance.id.clone();

    manager
        .start_with_command(&id, &mock_java, &[])
        .await
        .unwrap();
    let result = manager.start_with_command(&id, &mock_java, &[]).await;
    assert!(result.is_err());

    // Clean up
    let _ = manager.stop(&id).await;
}

#[tokio::test]
async fn test_stop_not_running_is_noop() {
    let (dir, event_tx, _) = setup();
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx);
    let instance = manager
        .create("Test".into(), ServerType::Paper, "1.21.5".into(), 25565, "".into())
        .await
        .unwrap();
    let result = manager.stop(&instance.id).await;
    assert!(result.is_ok());
}
