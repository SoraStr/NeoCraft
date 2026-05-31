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

    /// Merge stdout and stderr into a single event stream, avoiding duplicates.
    /// Uses a small dedup window to suppress identical lines that appear on both streams
    /// within a short time window (common with Minecraft/Java process output).
    pub async fn pipe_both(self, stdout: ChildStdout, stderr: ChildStderr) {
        let mut stdout_lines = BufReader::new(stdout).lines();
        let mut stderr_lines = BufReader::new(stderr).lines();
        let mut last_line: String = String::new();
        let mut last_time: std::time::Instant = std::time::Instant::now();

        loop {
            tokio::select! {
                result = stdout_lines.next_line() => {
                    match result {
                        Ok(Some(line)) => {
                            Self::emit(&self, &line, &mut last_line, &mut last_time);
                        }
                        Ok(None) => break, // stdout closed
                        Err(_) => break,
                    }
                }
                result = stderr_lines.next_line() => {
                    match result {
                        Ok(Some(line)) => {
                            Self::emit(&self, &line, &mut last_line, &mut last_time);
                        }
                        Ok(None) => break, // stderr closed
                        Err(_) => break,
                    }
                }
            }
        }
    }

    /// Emit a log line, suppressing duplicates that appear within 50ms on both streams.
    fn emit(&self, line: &str, last_line: &mut String, last_time: &mut std::time::Instant) {
        let now = std::time::Instant::now();
        // If this is the same line as the last one, and within 50ms, skip as duplicate
        if line == last_line.as_str() && now.duration_since(*last_time).as_millis() < 50 {
            return;
        }
        *last_line = line.to_string();
        *last_time = now;
        let _ = self.event_tx.send(Event::InstanceLog {
            instance_id: self.instance_id.clone(),
            line: line.to_string(),
            timestamp: Self::timestamp(),
        });
    }

    // Keep old methods for backward compat in tests
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
