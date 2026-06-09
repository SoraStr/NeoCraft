//! Platform-abstracted IPC transport layer.
//!
//! On Unix (macOS/Linux): uses Unix Domain Sockets.
//! On Windows: uses Named Pipes (`\\.\pipe\<name>`).
//!
//! The public types `IpcListener` and `IpcStream` are platform-specific
//! but expose the same async read/write interface via Tokio.

#[cfg(unix)]
mod unix_impl {
    use tokio::net::{UnixListener, UnixStream};
    use std::path::Path;

    /// Wrapper around UnixListener that normalizes accept() to return just the stream.
    pub struct IpcListener(UnixListener);

    impl IpcListener {
        pub async fn accept(&self) -> std::io::Result<IpcStream> {
            let (stream, _addr) = self.0.accept().await?;
            Ok(IpcStream(stream))
        }
    }

    /// Newtype wrapper ensuring consistent interface across platforms.
    pub struct IpcStream(UnixStream);

    // Delegate AsyncRead/AsyncWrite to inner UnixStream
    impl tokio::io::AsyncRead for IpcStream {
        fn poll_read(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
            buf: &mut tokio::io::ReadBuf<'_>,
        ) -> std::task::Poll<std::io::Result<()>> {
            std::pin::Pin::new(&mut self.get_mut().0).poll_read(cx, buf)
        }
    }

    impl tokio::io::AsyncWrite for IpcStream {
        fn poll_write(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
            buf: &[u8],
        ) -> std::task::Poll<std::io::Result<usize>> {
            std::pin::Pin::new(&mut self.get_mut().0).poll_write(cx, buf)
        }
        fn poll_flush(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<std::io::Result<()>> {
            std::pin::Pin::new(&mut self.get_mut().0).poll_flush(cx)
        }
        fn poll_shutdown(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<std::io::Result<()>> {
            std::pin::Pin::new(&mut self.get_mut().0).poll_shutdown(cx)
        }
    }

    pub async fn bind(addr: &str) -> std::io::Result<IpcListener> {
        let path = Path::new(addr);
        if path.exists() {
            let _ = tokio::fs::remove_file(path).await;
        }
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        UnixListener::bind(addr).map(IpcListener)
    }

    pub async fn connect(addr: &str) -> std::io::Result<IpcStream> {
        UnixStream::connect(addr).await.map(IpcStream)
    }

    pub fn cleanup(addr: &str) {
        let _ = std::fs::remove_file(addr);
    }

    pub fn default_addr(data_dir: &str) -> String {
        format!("{}/daemon.sock", data_dir)
    }
}

#[cfg(windows)]
mod win_impl {
    use tokio::net::windows::named_pipe;
    use std::io;

    /// On Windows, we use a named pipe server with a well-known name.
    /// Tokio's named pipe API is available via `tokio = { features = ["full"] }`.
    pub struct IpcListener {
        pipe_name: String,
    }

    impl IpcListener {
        pub async fn bind(addr: &str) -> io::Result<Self> {
            Ok(Self { pipe_name: addr.to_string() })
        }

        /// Accept a new client connection on the named pipe.
        /// Windows named pipes allow multiple concurrent connections;
        /// each call to `accept` creates a new server instance.
        pub async fn accept(&self) -> io::Result<IpcStream> {
            let server = named_pipe::ServerOptions::new()
                .first_pipe_instance(false) // Allow multiple clients
                .create(&self.pipe_name)?;
            server.connect().await?;
            Ok(IpcStream::Server(server))
        }
    }

    /// On Windows, `IpcStream` is a `named_pipe::NamedPipeServer` (for server side)
    /// or `named_pipe::NamedPipeClient` (for client side, in tests).
    /// Since both implement `AsyncRead` + `AsyncWrite`, we use an enum.
    pub enum IpcStream {
        Server(named_pipe::NamedPipeServer),
        Client(named_pipe::NamedPipeClient),
    }

    // Delegate AsyncRead/AsyncWrite to the inner type
    impl tokio::io::AsyncRead for IpcStream {
        fn poll_read(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
            buf: &mut tokio::io::ReadBuf<'_>,
        ) -> std::task::Poll<io::Result<()>> {
            match self.get_mut() {
                IpcStream::Server(s) => std::pin::Pin::new(s).poll_read(cx, buf),
                IpcStream::Client(c) => std::pin::Pin::new(c).poll_read(cx, buf),
            }
        }
    }

    impl tokio::io::AsyncWrite for IpcStream {
        fn poll_write(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
            buf: &[u8],
        ) -> std::task::Poll<io::Result<usize>> {
            match self.get_mut() {
                IpcStream::Server(s) => std::pin::Pin::new(s).poll_write(cx, buf),
                IpcStream::Client(c) => std::pin::Pin::new(c).poll_write(cx, buf),
            }
        }

        fn poll_flush(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<io::Result<()>> {
            match self.get_mut() {
                IpcStream::Server(s) => std::pin::Pin::new(s).poll_flush(cx),
                IpcStream::Client(c) => std::pin::Pin::new(c).poll_flush(cx),
            }
        }

        fn poll_shutdown(
            self: std::pin::Pin<&mut Self>,
            cx: &mut std::task::Context<'_>,
        ) -> std::task::Poll<io::Result<()>> {
            match self.get_mut() {
                IpcStream::Server(s) => std::pin::Pin::new(s).poll_shutdown(cx),
                IpcStream::Client(c) => std::pin::Pin::new(c).poll_shutdown(cx),
            }
        }
    }

    pub async fn bind(addr: &str) -> std::io::Result<IpcListener> {
        IpcListener::bind(addr).await
    }

    pub async fn connect(addr: &str) -> std::io::Result<IpcStream> {
        let client = named_pipe::ClientOptions::new().open(addr)?;
        Ok(IpcStream::Client(client))
    }

    pub fn cleanup(_addr: &str) {
        // Named pipes are cleaned up when all handles are closed — no file to remove
    }

    /// Default IPC address for Windows: a named pipe path.
    pub fn default_addr(_data_dir: &str) -> String {
        r"\\.\pipe\neocraft-daemon".to_string()
    }
}

// Re-export the platform-specific types
#[cfg(unix)]
pub use unix_impl::*;
#[cfg(windows)]
pub use win_impl::*;
