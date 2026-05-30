use clap::Parser;
use std::path::PathBuf;

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

fn main() {
    tracing_subscriber::fmt::init();
    let cli = Cli::parse();
    let socket = resolve_path(&cli.socket);
    let data_dir = resolve_path(&cli.data_dir);
    tracing::info!(socket = %socket.display(), data_dir = %data_dir.display(), "NeoCraft daemon starting");
}
