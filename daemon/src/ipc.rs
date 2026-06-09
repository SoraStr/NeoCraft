//! Platform-abstracted IPC server — accepts connections, reads/writes JSON Lines.
//!
//! Uses `crate::transport` for the underlying transport (Unix sockets or named pipes).
//! Includes token-based authentication handshake on each new connection.

use crate::protocol::{Request, Response, Event, Error as ProtoError};
use crate::transport::{self, IpcListener, IpcStream};
use crate::auth;
use async_trait::async_trait;
use tokio::io::{AsyncWriteExt, AsyncBufReadExt, BufReader};
use tokio::sync::broadcast;
use std::sync::Arc;

/// Maximum time allowed for a client to send the auth token after connecting.
const AUTH_TIMEOUT_MS: u64 = 5000;

#[async_trait]
pub trait RequestHandler: Send + Sync {
    async fn handle(&self, request: Request) -> Response;
}

pub struct IpcServer {
    addr: String,
    listener: Option<IpcListener>,
    event_tx: broadcast::Sender<Event>,
    auth_token: String,
}

impl IpcServer {
    pub async fn bind(addr: String) -> Result<Self, std::io::Error> {
        let (event_tx, _) = broadcast::channel(1024);
        let token = String::new();
        Self::bind_with_tx(addr, event_tx, token).await
    }

    /// Bind with an externally-provided event channel, so InstanceManager events
    /// (download progress, state changes, etc.) are forwarded to IPC clients.
    pub async fn bind_with_tx(
        addr: String,
        event_tx: broadcast::Sender<Event>,
        auth_token: String,
    ) -> Result<Self, std::io::Error> {
        let listener = transport::bind(&addr).await?;
        Ok(Self {
            addr,
            listener: Some(listener),
            event_tx,
            auth_token,
        })
    }

    pub fn event_sender(&self) -> broadcast::Sender<Event> {
        self.event_tx.clone()
    }

    /// Returns the listening address (useful for logging).
    pub fn addr(&self) -> &str {
        &self.addr
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
                        Ok(stream) => {
                            let h = handler.clone();
                            let event_rx = self.event_tx.subscribe();
                            let token = self.auth_token.clone();
                            tokio::spawn(handle_client(stream, h, event_rx, token));
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

        transport::cleanup(&self.addr);
        Ok(())
    }
}

async fn handle_client(
    stream: IpcStream,
    handler: Arc<dyn RequestHandler>,
    mut event_rx: broadcast::Receiver<Event>,
    auth_token: String,
) {
    // Use tokio::io::split for cross-platform compatibility
    // (UnixStream::into_split is Unix-only; tokio::io::split works everywhere)
    let (reader, mut writer) = tokio::io::split(stream);
    let mut buf_reader = BufReader::new(reader);

    // ── Authentication handshake ──
    // Client must send the auth token as the first line within AUTH_TIMEOUT_MS.
    if !auth_token.is_empty() {
        let auth_result = tokio::time::timeout(
            std::time::Duration::from_millis(AUTH_TIMEOUT_MS),
            async {
                let mut auth_line = String::new();
                match buf_reader.read_line(&mut auth_line).await {
                    Ok(0) => return Err("EOF before auth"),
                    Ok(_) => {
                        let client_token = auth_line.trim();
                        if auth::validate_token(client_token, &auth_token) {
                            // Send auth success response
                            let _ = writer.write_all(b"{\"auth\":\"ok\"}\n").await;
                            Ok(())
                        } else {
                            let _ = writer.write_all(b"{\"auth\":\"error\",\"message\":\"Invalid token\"}\n").await;
                            Err("Invalid auth token")
                        }
                    }
                    Err(_) => Err("Auth read error"),
                }
            }
        ).await;

        match auth_result {
            Ok(Ok(())) => {
                tracing::debug!("Client authenticated successfully");
            }
            _ => {
                tracing::warn!("Client authentication failed or timed out");
                return;
            }
        }
    }

    // Channel for responses from spawned request-handling tasks.
    let (response_tx, mut response_rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    loop {
        let mut line = String::new();

        tokio::select! {
            read_result = buf_reader.read_line(&mut line) => {
                match read_result {
                    Ok(0) => break, // EOF
                    Ok(_) => {
                        let trimmed = line.trim().to_string();
                        let h = handler.clone();
                        let tx = response_tx.clone();

                        // Spawn request handling — don't block the event loop
                        tokio::spawn(async move {
                            let response = match serde_json::from_str::<Request>(&trimmed) {
                                Ok(req) => {
                                    let id = req.id.clone();
                                    let mut resp = h.handle(req).await;
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

                            let json = match serde_json::to_string(&response) {
                                Ok(s) => s,
                                Err(e) => format!(r#"{{"id":"","error":{{"code":"SERIALIZE_ERROR","message":"{}"}}}}"#, e),
                            };
                            let _ = tx.send(json + "\n");
                        });
                    }
                    Err(_) => break,
                }
            }

            Some(response_json) = response_rx.recv() => {
                if writer.write_all(response_json.as_bytes()).await.is_err() {
                    break;
                }
            }

            event = event_rx.recv() => {
                if let Ok(event) = event {
                    if let Ok(json) = serde_json::to_string(&event) {
                        if writer.write_all((json + "\n").as_bytes()).await.is_err() {
                            break;
                        }
                    }
                }
            }
        }
    }
}
