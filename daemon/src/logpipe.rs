//! Log pipeline — capture stdout/stderr from the Minecraft process and emit log events.

use crate::protocol::Event;
use std::collections::VecDeque;
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
    /// Keeps a ring buffer of recent lines (across both streams) to suppress
    /// duplicates that appear on stdout + stderr with arbitrary interleaving.
    pub async fn pipe_both(self, stdout: ChildStdout, stderr: ChildStderr) {
        let mut stdout_lines = BufReader::new(stdout).lines();
        let mut stderr_lines = BufReader::new(stderr).lines();
        let mut recent: VecDeque<String> = VecDeque::with_capacity(16);

        loop {
            tokio::select! {
                result = stdout_lines.next_line() => {
                    match result {
                        Ok(Some(line)) => Self::emit_dedup(&self, line, &mut recent),
                        Ok(None) => {
                            // stdout closed — drain remaining stderr before exiting
                            while let Ok(Some(line)) = stderr_lines.next_line().await {
                                Self::emit_dedup(&self, line, &mut recent);
                            }
                            break;
                        }
                        Err(_) => break,
                    }
                }
                result = stderr_lines.next_line() => {
                    match result {
                        Ok(Some(line)) => Self::emit_dedup(&self, line, &mut recent),
                        Ok(None) => break,
                        Err(_) => break,
                    }
                }
            }
        }
    }

    fn emit_dedup(&self, line: String, recent: &mut VecDeque<String>) {
        // Skip if this exact line appeared recently (within the last 16 lines)
        if recent.contains(&line) {
            return;
        }
        if recent.len() >= 16 {
            recent.pop_front();
        }
        recent.push_back(line.clone());
        let _ = self.event_tx.send(Event::InstanceLog {
            instance_id: self.instance_id.clone(),
            line,
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
