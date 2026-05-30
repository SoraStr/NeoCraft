//! Resource monitor — poll CPU/memory stats for a running Minecraft process.

use crate::protocol::Event;
use sysinfo::System;
use tokio::sync::broadcast;

pub struct ResourceMonitor {
    instance_id: String,
    pid: u32,
    event_tx: broadcast::Sender<Event>,
}

impl ResourceMonitor {
    pub fn new(instance_id: String, pid: u32, event_tx: broadcast::Sender<Event>) -> Self {
        Self {
            instance_id,
            pid,
            event_tx,
        }
    }

    pub async fn run(self, mut cancel: tokio::sync::watch::Receiver<bool>) {
        let mut sys = System::new_all();
        let start_time = std::time::Instant::now();

        loop {
            if *cancel.borrow() {
                break;
            }

            sys.refresh_all();

            // Get process info
            let cpu_percent = sys
                .process(sysinfo::Pid::from(self.pid as usize))
                .map(|p| p.cpu_usage() as f64)
                .unwrap_or(0.0);

            let memory_mb = sys
                .process(sysinfo::Pid::from(self.pid as usize))
                .map(|p| p.memory() / 1024 / 1024) // bytes -> MB
                .unwrap_or(0);

            let uptime_secs = start_time.elapsed().as_secs();

            let _ = self.event_tx.send(Event::InstanceStats {
                instance_id: self.instance_id.clone(),
                cpu_percent,
                memory_mb,
                uptime_secs,
            });

            tokio::select! {
                _ = tokio::time::sleep(std::time::Duration::from_secs(1)) => {}
                _ = cancel.changed() => {
                    if *cancel.borrow() {
                        break;
                    }
                }
            }
        }
    }
}
