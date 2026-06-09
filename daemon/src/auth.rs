//! IPC authentication — token-based handshake to prevent unauthorized access.

use std::path::Path;
use tokio::fs;
use rand::RngExt;

const TOKEN_FILE: &str = ".daemon-token";
const TOKEN_LENGTH: usize = 32;

/// Generate a random authentication token.
pub fn generate_token() -> String {
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..TOKEN_LENGTH).map(|_| rng.random::<u8>()).collect();
    hex::encode(bytes)
}

/// Write token to file with restricted permissions (600 on Unix).
pub async fn write_token_file(data_dir: &Path, token: &str) -> Result<(), std::io::Error> {
    let token_path = data_dir.join(TOKEN_FILE);
    
    // Write token
    fs::write(&token_path, token).await?;
    
    // Set permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&token_path).await?.permissions();
        perms.set_mode(0o600); // owner read/write only
        fs::set_permissions(&token_path, perms).await?;
    }
    
    Ok(())
}

/// Read token from file.
pub async fn read_token_file(data_dir: &Path) -> Result<String, std::io::Error> {
    let token_path = data_dir.join(TOKEN_FILE);
    fs::read_to_string(&token_path).await
}

/// Validate client token against expected token.
pub fn validate_token(client_token: &str, expected_token: &str) -> bool {
    // Constant-time comparison to prevent timing attacks
    if client_token.len() != expected_token.len() {
        return false;
    }
    client_token.as_bytes()
        .iter()
        .zip(expected_token.as_bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b)) == 0
}
