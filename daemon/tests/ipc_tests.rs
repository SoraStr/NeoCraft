use neocraft_daemon::ipc::IpcServer;
use neocraft_daemon::protocol::{Request, Response, Method};
use tokio::net::UnixStream;
use tokio::io::{AsyncWriteExt, BufReader, AsyncBufReadExt};
use std::sync::Arc;
use async_trait::async_trait;
use std::path::PathBuf;
use std::time::Duration;

// Simple mock handler for testing
struct MockHandler;

#[async_trait]
impl neocraft_daemon::ipc::RequestHandler for MockHandler {
    async fn handle(&self, request: Request) -> Response {
        Response {
            id: request.id,
            result: Some(serde_json::json!({"echo": request.method})),
            error: None,
        }
    }
}

fn temp_socket_path() -> PathBuf {
    let dir = std::env::temp_dir();
    let name = format!("neocraft-test-{}.sock", uuid::Uuid::new_v4());
    dir.join(name)
}

#[tokio::test]
async fn test_ipc_server_accepts_connection() {
    let socket_path = temp_socket_path();
    let server = IpcServer::bind(socket_path.clone()).await.unwrap();
    let handler = Arc::new(MockHandler);

    // Spawn server in background
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let server_handle = tokio::spawn(async move {
        server.run(handler, shutdown_rx).await.unwrap();
    });

    // Give it a moment to start listening
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Connect as client
    let mut stream = UnixStream::connect(&socket_path).await.unwrap();

    // Send a request
    let req = Request {
        id: "test-1".into(),
        method: Method::InstanceStart,
        params: serde_json::json!({"id": "i1"}),
    };
    let mut json = serde_json::to_string(&req).unwrap();
    json.push('\n');
    stream.write_all(json.as_bytes()).await.unwrap();

    // Read response
    let mut reader = BufReader::new(&mut stream);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();
    let resp: Response = serde_json::from_str(&line).unwrap();

    assert_eq!(resp.id, "test-1");
    assert!(resp.result.is_some());

    // Shutdown
    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();
}

#[tokio::test]
async fn test_ipc_invalid_json_returns_error() {
    let socket_path = temp_socket_path();
    let server = IpcServer::bind(socket_path.clone()).await.unwrap();
    let handler = Arc::new(MockHandler);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let server_handle = tokio::spawn(async move {
        server.run(handler, shutdown_rx).await.unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    let mut stream = UnixStream::connect(&socket_path).await.unwrap();

    // Send invalid JSON
    stream.write_all(b"not json at all\n").await.unwrap();

    // Read response — should be an error
    let mut reader = BufReader::new(&mut stream);
    let mut line = String::new();
    reader.read_line(&mut line).await.unwrap();

    let resp: Response = serde_json::from_str(&line).unwrap();
    assert!(resp.error.is_some());
    // The id should be empty/unknown since we couldn't parse the request
    assert_eq!(resp.id, "");

    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();
}

#[tokio::test]
async fn test_ipc_multiple_clients() {
    let socket_path = temp_socket_path();
    let server = IpcServer::bind(socket_path.clone()).await.unwrap();
    let handler = Arc::new(MockHandler);

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    let server_handle = tokio::spawn(async move {
        server.run(handler, shutdown_rx).await.unwrap();
    });

    tokio::time::sleep(Duration::from_millis(50)).await;

    // Connect two clients
    let mut s1 = UnixStream::connect(&socket_path).await.unwrap();
    let mut s2 = UnixStream::connect(&socket_path).await.unwrap();

    // Client 1 sends request
    let req1 = Request { id: "c1".into(), method: Method::ConfigGet, params: serde_json::json!({}) };
    let mut j1 = serde_json::to_string(&req1).unwrap();
    j1.push('\n');
    s1.write_all(j1.as_bytes()).await.unwrap();

    // Client 2 sends request
    let req2 = Request { id: "c2".into(), method: Method::ConfigSet, params: serde_json::json!({}) };
    let mut j2 = serde_json::to_string(&req2).unwrap();
    j2.push('\n');
    s2.write_all(j2.as_bytes()).await.unwrap();

    // Read responses
    let mut r1 = String::new();
    BufReader::new(&mut s1).read_line(&mut r1).await.unwrap();
    let resp1: Response = serde_json::from_str(&r1).unwrap();
    assert_eq!(resp1.id, "c1");

    let mut r2 = String::new();
    BufReader::new(&mut s2).read_line(&mut r2).await.unwrap();
    let resp2: Response = serde_json::from_str(&r2).unwrap();
    assert_eq!(resp2.id, "c2");

    shutdown_tx.send(()).unwrap();
    server_handle.await.unwrap();
}
