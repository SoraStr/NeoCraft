use std::sync::Arc;

use clap::Parser;
use neocraft_daemon::auth;
use neocraft_daemon::handler::DaemonHandler;
use neocraft_daemon::instance::InstanceManager;
use neocraft_daemon::ipc::IpcServer;
use neocraft_daemon::{paths, transport};
use tokio::sync::broadcast;

#[derive(Parser)]
#[command(name = "neocraft-daemon", about = "NeoCraft Minecraft server management daemon")]
struct Cli {
    /// IPC address: socket path on Unix, pipe name on Windows.
    /// Defaults to the platform-appropriate address in the data directory.
    #[arg(long)]
    socket: Option<String>,

    #[arg(long, default_value = "~/.neocraft")]
    data_dir: String,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let cli = Cli::parse();
    let data_dir = paths::resolve_user_path(&cli.data_dir);
    let socket_addr = cli
        .socket
        .unwrap_or_else(|| transport::default_addr(&data_dir.to_string_lossy()));

    tokio::fs::create_dir_all(&data_dir)
        .await
        .expect("failed to create data directory");

    // Generate auth token and write to file with restricted permissions (0o600)
    let token = auth::generate_token();
    auth::write_token_file(&data_dir, &token)
        .await
        .expect("failed to write auth token");

    tracing::info!(
        addr = %socket_addr,
        data_dir = %data_dir.display(),
        "NeoCraft daemon starting"
    );

    let (event_tx, _) = broadcast::channel(1024); // MAJOR-2: increased from 256
    let manager = InstanceManager::new(data_dir.clone(), event_tx.clone());
    let handler = Arc::new(DaemonHandler::new(manager));
    let server = IpcServer::bind_with_tx(socket_addr.clone(), event_tx, token)
        .await
        .expect("failed to bind IPC");

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
    tokio::spawn(async move {
        let _ = tokio::signal::ctrl_c().await;
        tracing::info!("Received shutdown signal");
        let _ = shutdown_tx.send(());
    });

    if let Err(error) = server.run(handler, shutdown_rx).await {
        tracing::error!("IPC server error: {}", error);
    }

    // Clean up token file on shutdown
    let _ = tokio::fs::remove_file(data_dir.join(".daemon-token")).await;

    tracing::info!("NeoCraft daemon stopped");
}
