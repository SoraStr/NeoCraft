use neocraft_daemon::monitor::ResourceMonitor;
use neocraft_daemon::protocol::Event;
use std::time::Duration;
use tokio::sync::broadcast;

#[tokio::test]
async fn test_monitor_emits_stats_periodically() {
    let (tx, mut rx) = broadcast::channel(256);

    // Start monitoring with the current process PID
    let monitor = ResourceMonitor::new(
        "test-instance".into(),
        std::process::id(),
        tx,
    );

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let handle = tokio::spawn(async move {
        monitor.run(cancel_rx).await;
    });

    // Wait for at least one stats event
    let event = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await;
    match event {
        Ok(Ok(Event::InstanceStats {
            instance_id,
            cpu_percent: _,
            memory_mb,
            uptime_secs: _,
        })) => {
            assert_eq!(instance_id, "test-instance");
            // CPU can be 0 for idle process, that's fine
            assert!(memory_mb > 0, "memory should be > 0");
            // First event fires immediately, uptime can be 0 (u64 is always >= 0)
        }
        Ok(Ok(other)) => panic!("Expected InstanceStats, got {:?}", other),
        Ok(Err(e)) => panic!("Channel error: {}", e),
        Err(_) => panic!("Timeout waiting for stats event"),
    }

    // Cancel
    cancel_tx.send(true).unwrap();
    handle.await.unwrap();
}

#[tokio::test]
async fn test_monitor_stops_when_cancelled() {
    let (tx, mut rx) = broadcast::channel(256);

    let monitor = ResourceMonitor::new(
        "test-instance".into(),
        std::process::id(),
        tx,
    );

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let handle = tokio::spawn(async move {
        monitor.run(cancel_rx).await;
    });

    // Get one event
    let _ = tokio::time::timeout(Duration::from_secs(5), rx.recv()).await;

    // Cancel
    cancel_tx.send(true).unwrap();
    handle.await.unwrap();

    // After cancel, no more events should arrive quickly
    let _more = tokio::time::timeout(Duration::from_millis(500), rx.recv()).await;
    // Should timeout (no more events) or succeed (one last event in flight) — either is fine
}

#[tokio::test]
async fn test_monitor_interval_is_one_second() {
    let (tx, mut rx) = broadcast::channel(256);

    let monitor = ResourceMonitor::new(
        "test-instance".into(),
        std::process::id(),
        tx,
    );

    let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);
    let cancel_tx_clone = cancel_tx.clone();
    tokio::spawn(async move {
        monitor.run(cancel_rx).await;
    });

    // Collect two events and check timing
    let t0 = std::time::Instant::now();
    let _ = tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .unwrap();
    let _ = tokio::time::timeout(Duration::from_secs(5), rx.recv())
        .await
        .unwrap();
    let elapsed = t0.elapsed();

    // Should be roughly >= 1 second between two events
    assert!(
        elapsed >= Duration::from_millis(800),
        "interval should be ~1s, got {:?}",
        elapsed
    );

    cancel_tx_clone.send(true).unwrap();
}
