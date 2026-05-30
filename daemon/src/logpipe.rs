//! Log pipeline — capture stdout/stderr from the Minecraft process and emit log events.

use crate::protocol::Event;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{ChildStderr, ChildStdout};
use tokio::sync::broadcast;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct LogPipe {
    instance_id: String,
    event_tx: broadcast::Sender<Event>,
}

impl LogPipe {
    pub fn new(instance_id: String, event_tx: broadcast::Sender<Event>) -> Self {
        Self { instance_id, event_tx }
    }

    fn timestamp() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }

    pub async fn pipe_stdout(self, stdout: ChildStdout) {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = self.event_tx.send(Event::InstanceLog {
                instance_id: self.instance_id.clone(),
                line,
                timestamp: Self::timestamp(),
            });
        }
    }

    pub async fn pipe_stderr(self, stderr: ChildStderr) {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = self.event_tx.send(Event::InstanceLog {
                instance_id: self.instance_id.clone(),
                line,
                timestamp: Self::timestamp(),
            });
        }
    }
}
