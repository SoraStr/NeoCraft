//! Utility functions — random string generation.

/// Generate a random alphanumeric string of the given length (a-z, A-Z, 0-9).
pub fn random_alphanumeric(length: usize) -> String {
    let mut bytes = vec![0u8; length];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    bytes
        .iter()
        .map(|&b| CHARSET[(b as usize) % CHARSET.len()] as char)
        .collect()
}

/// Generate a random lowercase hex string of the given length.
pub fn random_hex(length: usize) -> String {
    let byte_len = (length + 1) / 2;
    let mut bytes = vec![0u8; byte_len];
    getrandom::getrandom(&mut bytes).expect("getrandom failed");
    let hex: String = bytes.iter().map(|b| format!("{:02x}", b)).collect();
    hex[..length].to_string()
}
