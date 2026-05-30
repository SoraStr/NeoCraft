//! Unix Domain Socket IPC server — accepts connections, reads/writes JSON Lines.

use crate::protocol::{Request, Response, Event, Error as ProtoError};
use async_trait::async_trait;
use std::path::PathBuf;
use tokio::net::{UnixListener, UnixStream};
use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
use tokio::sync::broadcast;
use std::sync::Arc;

#[async_trait]
pub trait RequestHandler: Send + Sync {
    async fn handle(&self, request: Request) -> Response;
}

pub struct IpcServer {
    socket_path: PathBuf,
    listener: Option<UnixListener>,
    event_tx: broadcast::Sender<Event>,
}

impl IpcServer {
    pub async fn bind(socket_path: PathBuf) -> Result<Self, std::io::Error> {
        // Remove existing socket file if present
        if socket_path.exists() {
            std::fs::remove_file(&socket_path)?;
        }
        // Create parent directories
        if let Some(parent) = socket_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let listener = UnixListener::bind(&socket_path)?;
        let (event_tx, _) = broadcast::channel(256);
        Ok(Self {
            socket_path,
            listener: Some(listener),
            event_tx,
        })
    }

    pub fn event_sender(&self) -> broadcast::Sender<Event> {
        self.event_tx.clone()
    }

    pub async fn run(
        mut self,
        handler: Arc<dyn RequestHandler>,
        mut shutdown: tokio::sync::oneshot::Receiver<()>,
    ) -> Result<(), std::io::Error> {
        let listener = self.listener.take().expect("server already running");

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, _)) => {
                            let h = handler.clone();
                            let event_rx = self.event_tx.subscribe();
                            tokio::spawn(handle_client(stream, h, event_rx));
                        }
                        Err(e) => {
                            tracing::error!("accept error: {}", e);
                        }
                    }
                }
                _ = &mut shutdown => {
                    tracing::info!("IPC server shutting down");
                    break;
                }
            }
        }

        // Cleanup
        let _ = std::fs::remove_file(&self.socket_path);
        Ok(())
    }
}

async fn handle_client(
    stream: UnixStream,
    handler: Arc<dyn RequestHandler>,
    mut event_rx: broadcast::Receiver<Event>,
) {
    let (reader, mut writer) = stream.into_split();
    let mut buf_reader = BufReader::new(reader);
    let mut line = String::new();

    loop {
        tokio::select! {
            read_result = buf_reader.read_line(&mut line) => {
                match read_result {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim();
                        let response = match serde_json::from_str::<Request>(trimmed) {
                            Ok(req) => {
                                let id = req.id.clone();
                                let mut resp = handler.handle(req).await;
                                resp.id = id;
                                resp
                            }
                            Err(e) => {
                                Response {
                                    id: String::new(),
                                    result: None,
                                    error: Some(ProtoError {
                                        code: "PARSE_ERROR".into(),
                                        message: format!("Invalid JSON: {}", e),
                                    }),
                                }
                            }
                        };

                        let mut json = serde_json::to_string(&response).unwrap();
                        json.push('\n');
                        if writer.write_all(json.as_bytes()).await.is_err() {
                            break;
                        }
                        line.clear();
                    }
                    Err(_) => break,
                }
            }
            event = event_rx.recv() => {
                if let Ok(event) = event {
                    let mut json = serde_json::to_string(&event).unwrap();
                    json.push('\n');
                    if writer.write_all(json.as_bytes()).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
}
