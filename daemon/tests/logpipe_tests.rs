use neocraft_daemon::logpipe::LogPipe;
use neocraft_daemon::protocol::Event;
use tokio::sync::broadcast;
use tokio::process::Command;
use std::process::Stdio;

#[tokio::test]
async fn test_logpipe_captures_stdout_lines() {
    let (tx, mut rx) = broadcast::channel(256);
    let instance_id = "test-instance".to_string();

    // Spawn a process that outputs multiple lines via printf (macOS compatible)
    let mut child = Command::new("printf")
        .arg("line1\\nline2\\nline3\\n")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    drop(stderr);

    let logpipe = LogPipe::new(instance_id.clone(), tx.clone());

    // Pipe stdout
    let handle = tokio::spawn(async move {
        logpipe.pipe_stdout(stdout).await;
    });

    // Wait for lines
    let mut lines = Vec::new();
    for _ in 0..3 {
        match tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await {
            Ok(Ok(Event::InstanceLog { instance_id: id, line, .. })) => {
                assert_eq!(id, "test-instance");
                lines.push(line);
            }
            _ => break,
        }
    }

    handle.await.unwrap();
    assert_eq!(lines.len(), 3);
    assert!(lines.contains(&"line1".to_string()));
    assert!(lines.contains(&"line2".to_string()));
    assert!(lines.contains(&"line3".to_string()));
}

#[tokio::test]
async fn test_logpipe_handles_stderr() {
    let (tx, mut rx) = broadcast::channel(256);
    let instance_id = "test-instance".to_string();

    // Spawn a process that writes to stderr
    let mut child = Command::new("sh")
        .arg("-c")
        .arg("echo 'error line' >&2")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    drop(stdout);

    let _logpipe_stdout = LogPipe::new(instance_id.clone(), tx.clone());
    let logpipe_stderr = LogPipe::new(instance_id.clone(), tx.clone());

    tokio::spawn(async move { logpipe_stderr.pipe_stderr(stderr).await; });

    let mut found_error = false;
    while let Ok(Ok(Event::InstanceLog { line, .. })) =
        tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv()).await
    {
        if line.contains("error line") {
            found_error = true;
            break;
        }
    }
    assert!(found_error, "Should have captured stderr output");
}

#[tokio::test]
async fn test_logpipe_includes_timestamps() {
    let (tx, mut rx) = broadcast::channel(256);

    let mut child = Command::new("printf")
        .arg("hello\\n")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();

    let stdout = child.stdout.take().unwrap();
    let logpipe = LogPipe::new("inst1".into(), tx);

    tokio::spawn(async move { logpipe.pipe_stdout(stdout).await; });

    let event = tokio::time::timeout(std::time::Duration::from_secs(2), rx.recv())
        .await.unwrap().unwrap();

    if let Event::InstanceLog { timestamp, .. } = event {
        assert!(timestamp > 0, "timestamp should be set");
    } else {
        panic!("Expected InstanceLog event");
    }
}
