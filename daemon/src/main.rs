use clap::Parser;
use neocraft_daemon::ipc::{IpcServer, RequestHandler};
use neocraft_daemon::instance::{InstanceManager, InstanceError};
use neocraft_daemon::protocol::{Request, Response, Method, Error as ProtoError};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use async_trait::async_trait;

fn resolve_path(path: &str) -> PathBuf {
    if path.starts_with("~/") {
        let home = dirs::home_dir().expect("could not determine home directory");
        home.join(&path[2..])
    } else {
        PathBuf::from(path)
    }
}

#[derive(Parser)]
#[command(name = "neocraft-daemon", about = "NeoCraft Minecraft server management daemon")]
struct Cli {
    #[arg(long, default_value = "~/.neocraft/daemon.sock")]
    socket: String,

    #[arg(long, default_value = "~/.neocraft")]
    data_dir: String,
}

struct DaemonHandler {
    manager: Mutex<InstanceManager>,
}

#[async_trait]
impl RequestHandler for DaemonHandler {
    async fn handle(&self, request: Request) -> Response {
        let mut manager = self.manager.lock().await;
        let id = request.id.clone();

        match request.method {
            Method::InstanceStart => {
                let inst_id = request.params["id"].as_str().unwrap_or("");
                match manager.start(inst_id).await {
                    Ok(()) => Response { id, result: Some(serde_json::json!({"ok": true})), error: None },
                    Err(e) => Response { id, result: None, error: Some(error_response("START_ERROR", &e)) },
                }
            }
            Method::InstanceStop => {
                let inst_id = request.params["id"].as_str().unwrap_or("");
                match manager.stop(inst_id).await {
                    Ok(()) => Response { id, result: Some(serde_json::json!({"ok": true})), error: None },
                    Err(e) => Response { id, result: None, error: Some(error_response("STOP_ERROR", &e)) },
                }
            }
            Method::InstanceRestart => {
                let inst_id = request.params["id"].as_str().unwrap_or("");
                match manager.restart(inst_id).await {
                    Ok(()) => Response { id, result: Some(serde_json::json!({"ok": true})), error: None },
                    Err(e) => Response { id, result: None, error: Some(error_response("RESTART_ERROR", &e)) },
                }
            }
            Method::ConfigGet => {
                handle_config_get(&mut *manager, &request).await
            }
            Method::ConfigSet => {
                handle_config_set(&mut *manager, &request).await
            }
            _ => Response {
                id,
                result: None,
                error: Some(ProtoError {
                    code: "NOT_IMPLEMENTED".into(),
                    message: "Method not yet implemented".into(),
                }),
            },
        }
    }
}

fn error_response(code: &str, e: &InstanceError) -> ProtoError {
    ProtoError { code: code.into(), message: e.to_string() }
}

async fn handle_config_get(manager: &mut InstanceManager, request: &Request) -> Response {
    let instance_id = request.params["instance_id"].as_str().unwrap_or("");
    if let Some(instance) = manager.get(instance_id) {
        let props_path = instance.work_dir.join("server.properties");
        match neocraft_daemon::files::read_properties(&props_path) {
            Ok(props) => Response {
                id: request.id.clone(),
                result: Some(serde_json::to_value(props).unwrap()),
                error: None,
            },
            Err(e) => Response {
                id: request.id.clone(),
                result: None,
                error: Some(ProtoError { code: "CONFIG_ERROR".into(), message: e.to_string() }),
            },
        }
    } else {
        Response {
            id: request.id.clone(),
            result: None,
            error: Some(ProtoError { code: "NOT_FOUND".into(), message: "Instance not found".into() }),
        }
    }
}

async fn handle_config_set(manager: &mut InstanceManager, request: &Request) -> Response {
    let instance_id = request.params["instance_id"].as_str().unwrap_or("");
    if let Some(instance) = manager.get(instance_id) {
        let props_obj = match request.params["properties"].as_object() {
            Some(obj) => obj,
            None => return Response {
                id: request.id.clone(),
                result: None,
                error: Some(ProtoError { code: "INVALID_PARAMS".into(), message: "Missing 'properties' object".into() }),
            },
        };
        let mut props = std::collections::HashMap::new();
        for (k, v) in props_obj {
            props.insert(k.clone(), v.as_str().unwrap_or("").to_string());
        }
        let props_path = instance.work_dir.join("server.properties");
        match neocraft_daemon::files::write_properties(&props_path, &props) {
            Ok(()) => Response { id: request.id.clone(), result: Some(serde_json::json!({"ok": true})), error: None },
            Err(e) => Response { id: request.id.clone(), result: None, error: Some(ProtoError { code: "CONFIG_ERROR".into(), message: e.to_string() }) },
        }
    } else {
        Response {
            id: request.id.clone(),
            result: None,
            error: Some(ProtoError { code: "NOT_FOUND".into(), message: "Instance not found".into() }),
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();
    let socket_path = resolve_path(&cli.socket);
    let data_dir = resolve_path(&cli.data_dir);

    // Create data directory
    std::fs::create_dir_all(&data_dir).expect("failed to create data directory");

    tracing::info!(
        socket = %socket_path.display(),
        data_dir = %data_dir.display(),
        "NeoCraft daemon starting"
    );

    // Create event channel
    let (event_tx, _) = broadcast::channel(256);

    // Create instance manager
    let manager = InstanceManager::new(data_dir, event_tx);

    // Create handler
    let handler = Arc::new(DaemonHandler {
        manager: Mutex::new(manager),
    });

    // Create and run IPC server
    let server = IpcServer::bind(socket_path.clone()).await.expect("failed to bind IPC socket");

    // Handle Ctrl+C
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        tokio::signal::ctrl_c().await.ok();
        tracing::info!("Received shutdown signal");
        let _ = shutdown_tx.send(());
    });

    if let Err(e) = server.run(handler, shutdown_rx).await {
        tracing::error!("IPC server error: {}", e);
    }

    tracing::info!("NeoCraft daemon stopped");
}
