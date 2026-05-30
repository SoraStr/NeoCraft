use neocraft_daemon::ipc::{IpcServer, RequestHandler};
use neocraft_daemon::instance::{InstanceManager, ServerType};
use neocraft_daemon::protocol::{Request, Response, Event, Method, Error as ProtoError};
use async_trait::async_trait;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::net::UnixStream;
use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
use std::path::PathBuf;
use std::time::Duration;

fn temp_socket_path() -> PathBuf {
    let dir = std::env::temp_dir();
    dir.join(format!("neocraft-int-{}.sock", uuid::Uuid::new_v4()))
}

struct DaemonHandler {
    instance_manager: tokio::sync::Mutex<InstanceManager>,
    event_tx: broadcast::Sender<Event>,
}

#[async_trait]
impl RequestHandler for DaemonHandler {
    async fn handle(&self, request: Request) -> Response {
        let mut manager = self.instance_manager.lock().await;
        match request.method {
            Method::InstanceStart => {
                let id = request.params["id"].as_str().unwrap_or("");
                match manager.start(id).await {
                    Ok(()) => Response {
                        id: request.id,
                        result: Some(serde_json::json!({"ok": true})),
                        error: None,
                    },
                    Err(e) => Response {
                        id: request.id,
                        result: None,
                        error: Some(ProtoError {
                            code: "START_ERROR".into(),
                            message: e.to_string(),
                        }),
                    },
                }
            }
            Method::InstanceStop => {
                let id = request.params["id"].as_str().unwrap_or("");
                match manager.stop(id).await {
                    Ok(()) => Response {
                        id: request.id,
                        result: Some(serde_json::json!({"ok": true})),
                        error: None,
                    },
                    Err(e) => Response {
                        id: request.id,
                        result: None,
                        error: Some(ProtoError {
                            code: "STOP_ERROR".into(),
                            message: e.to_string(),
                        }),
                    },
                }
            }
            Method::InstanceRestart => {
                let id = request.params["id"].as_str().unwrap_or("");
                match manager.restart(id).await {
                    Ok(()) => Response {
                        id: request.id,
                        result: Some(serde_json::json!({"ok": true})),
                        error: None,
                    },
                    Err(e) => Response {
                        id: request.id,
                        result: None,
                        error: Some(ProtoError {
                            code: "RESTART_ERROR".into(),
                            message: e.to_string(),
                        }),
                    },
                }
            }
            Method::ConfigGet => {
                let instance_id = request.params["instance_id"].as_str().unwrap_or("");
                if let Some(instance) = manager.get(instance_id) {
                    let props_path = instance.work_dir.join("server.properties");
                    match neocraft_daemon::files::read_properties(&props_path) {
                        Ok(props) => Response {
                            id: request.id,
                            result: Some(serde_json::to_value(props).unwrap()),
                            error: None,
                        },
                        Err(e) => Response {
                            id: request.id,
                            result: None,
                            error: Some(ProtoError {
                                code: "CONFIG_ERROR".into(),
                                message: e.to_string(),
                            }),
                        },
                    }
                } else {
                    Response {
                        id: request.id,
                        result: None,
                        error: Some(ProtoError {
                            code: "NOT_FOUND".into(),
                            message: "Instance not found".into(),
                        }),
                    }
                }
            }
            Method::ConfigSet => {
                let instance_id = request.params["instance_id"].as_str().unwrap_or("");
                let properties = request.params["properties"].as_object();
                if let (Some(instance), Some(props_obj)) = (manager.get(instance_id), properties) {
                    let mut props = std::collections::HashMap::new();
                    for (k, v) in props_obj {
                        props.insert(k.clone(), v.as_str().unwrap_or("").to_string());
                    }
                    let props_path = instance.work_dir.join("server.properties");
                    match neocraft_daemon::files::write_properties(&props_path, &props) {
                        Ok(()) => Response {
                            id: request.id,
                            result: Some(serde_json::json!({"ok": true})),
                            error: None,
                        },
                        Err(e) => Response {
                            id: request.id,
                            result: None,
                            error: Some(ProtoError {
                                code: "CONFIG_ERROR".into(),
                                message: e.to_string(),
                            }),
                        },
                    }
                } else {
                    Response {
                        id: request.id,
                        result: None,
                        error: Some(ProtoError {
                            code: "NOT_FOUND".into(),
                            message: "Instance not found".into(),
                        }),
                    }
                }
            }
            _ => Response {
                id: request.id,
                result: None,
                error: Some(ProtoError {
                    code: "NOT_IMPLEMENTED".into(),
                    message: format!("Method {:?} not yet implemented", request.method),
                }),
            },
        }
    }
}

#[tokio::test]
async fn test_full_ipc_lifecycle() {
    let dir = tempfile::TempDir::new().unwrap();
    let socket_path = temp_socket_path();
    let (event_tx, _) = broadcast::channel(256);

    // Create InstanceManager
    let mut manager = InstanceManager::new(dir.path().to_path_buf(), event_tx.clone());

    // Create an instance
    let instance = manager
        .create("IPC Test".into(), ServerType::Paper, "1.21.5".into(), 25570)
        .await
        .unwrap();
    let instance_id = instance.id.clone();

    // Set up handler
    let handler = Arc::new(DaemonHandler {
        instance_manager: tokio::sync::Mutex::new(manager),
        event_tx: event_tx.clone(),
    });

    // Start IPC server
    let server = IpcServer::bind(socket_path.clone()).await.unwrap();
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let server_handle = tokio::spawn(async move {
        server.run(handler, shutdown_rx).await.unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Connect client
    let mut stream = UnixStream::connect(&socket_path).await.unwrap();

    // Test: Get config
    let req = Request {
        id: "1".into(),
        method: Method::ConfigGet,
        params: serde_json::json!({"instance_id": instance_id}),
    };
    let mut json = serde_json::to_string(&req).unwrap();
    json.push('\n');
    stream.write_all(json.as_bytes()).await.unwrap();

    let mut line = String::new();
    BufReader::new(&mut stream).read_line(&mut line).await.unwrap();
    let resp: Response = serde_json::from_str(&line).unwrap();
    assert_eq!(resp.id, "1");
    assert!(resp.result.is_some(), "ConfigGet should return properties");

    // Test: Set config
    let req = Request {
        id: "2".into(),
        method: Method::ConfigSet,
        params: serde_json::json!({"instance_id": instance_id, "properties": {"motd": "IPC Test MOTD"}}),
    };
    let mut json = serde_json::to_string(&req).unwrap();
    json.push('\n');
    stream.write_all(json.as_bytes()).await.unwrap();

    line.clear();
    BufReader::new(&mut stream).read_line(&mut line).await.unwrap();
    let resp: Response = serde_json::from_str(&line).unwrap();
    assert_eq!(resp.id, "2");
    assert!(resp.result.is_some());

    // Test: Unknown method
    let req = Request {
        id: "3".into(),
        method: Method::DownloadStart, // not implemented in the handler
        params: serde_json::json!({}),
    };
    let mut json = serde_json::to_string(&req).unwrap();
    json.push('\n');
    stream.write_all(json.as_bytes()).await.unwrap();

    line.clear();
    BufReader::new(&mut stream).read_line(&mut line).await.unwrap();
    let resp: Response = serde_json::from_str(&line).unwrap();
    assert!(resp.error.is_some());
    assert_eq!(resp.error.as_ref().unwrap().code, "NOT_IMPLEMENTED");

    // Test: Non-existent instance
    let req = Request {
        id: "4".into(),
        method: Method::ConfigGet,
        params: serde_json::json!({"instance_id": "nonexistent"}),
    };
    let mut json = serde_json::to_string(&req).unwrap();
    json.push('\n');
    stream.write_all(json.as_bytes()).await.unwrap();

    line.clear();
    BufReader::new(&mut stream).read_line(&mut line).await.unwrap();
    let resp: Response = serde_json::from_str(&line).unwrap();
    assert!(resp.error.is_some());

    // Shutdown
    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();
}
