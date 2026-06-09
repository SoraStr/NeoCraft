use neocraft_daemon::files;
use neocraft_daemon::management::SMP_ALLOWED_ORIGINS;
use std::path::Path;

fn write_fixture(dir: &Path, name: &str, content: &str) -> std::path::PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, content).unwrap();
    path
}

#[tokio::test]
async fn test_read_simple_properties() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = write_fixture(dir.path(), "server.properties",
        "#Minecraft server properties\n\
         server-port=25565\n\
         motd=A Minecraft Server\n\
         enable-rcon=false\n"
    );

    let props = files::read_properties(&path).await.unwrap();
    assert_eq!(props.get("server-port"), Some(&"25565".to_string()));
    assert_eq!(props.get("motd"), Some(&"A Minecraft Server".to_string()));
    assert_eq!(props.get("enable-rcon"), Some(&"false".to_string()));
}

#[tokio::test]
async fn test_read_properties_with_comments_and_blanks() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = write_fixture(dir.path(), "server.properties",
        "# Top comment\n\
         \n\
         server-port=25565\n\
         # Middle comment\n\
         ! Another comment style\n\
         motd=Hello World\n\
         \n\
         # Bottom comment\n"
    );

    let props = files::read_properties(&path).await.unwrap();
    assert_eq!(props.len(), 2);
    assert_eq!(props.get("server-port"), Some(&"25565".to_string()));
    assert_eq!(props.get("motd"), Some(&"Hello World".to_string()));
}

#[tokio::test]
async fn test_read_properties_with_colon_separator() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = write_fixture(dir.path(), "server.properties",
        "server-port:25565\nmotd:Test\n"
    );

    let props = files::read_properties(&path).await.unwrap();
    assert_eq!(props.get("server-port"), Some(&"25565".to_string()));
}

#[tokio::test]
async fn test_read_properties_trims_whitespace() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = write_fixture(dir.path(), "server.properties",
        "  server-port = 25565  \n  motd =  Padded MOTD  \n"
    );

    let props = files::read_properties(&path).await.unwrap();
    assert_eq!(props.get("server-port"), Some(&"25565".to_string()));
    assert_eq!(props.get("motd"), Some(&"Padded MOTD".to_string()));
}

#[tokio::test]
async fn test_write_properties_preserves_comments() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("out.properties");
    let original = "# Header\nserver-port=25565\n# Middle\nmotd=Old\n# Footer\n";

    // First write original, then modify
    std::fs::write(&path, original).unwrap();

    let mut props = files::read_properties(&path).await.unwrap();
    props.insert("motd".into(), "New MOTD".into());
    files::write_properties(&path, &props).await.unwrap();

    let result = std::fs::read_to_string(&path).unwrap();
    assert!(result.contains("# Header"), "should preserve header comment");
    assert!(result.contains("# Middle"), "should preserve middle comment");
    assert!(result.contains("# Footer"), "should preserve footer comment");
    assert!(result.contains("motd=New MOTD"), "should update motd value");
}

#[tokio::test]
async fn test_write_properties_handles_new_keys() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("out.properties");
    let original = "server-port=25565\n";

    std::fs::write(&path, original).unwrap();

    let mut props = files::read_properties(&path).await.unwrap();
    props.insert("new-key".into(), "new-value".into());
    files::write_properties(&path, &props).await.unwrap();

    let result = std::fs::read_to_string(&path).unwrap();
    assert!(result.contains("new-key=new-value"), "should add new key");
    assert!(result.contains("server-port=25565"), "should keep existing key");
}

#[tokio::test]
async fn test_write_properties_deletes_keys() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = dir.path().join("out.properties");
    let original = "# Header\nserver-port=25565\nmotd=Old\nenable-rcon=false\n# Footer\n";

    std::fs::write(&path, original).unwrap();

    // Write without "enable-rcon" — it should be deleted
    let mut props = files::read_properties(&path).await.unwrap();
    props.remove("enable-rcon");
    props.insert("motd".into(), "Updated".into());
    files::write_properties(&path, &props).await.unwrap();

    let result = std::fs::read_to_string(&path).unwrap();
    assert!(!result.contains("enable-rcon"), "removed key should not appear");
    assert!(result.contains("motd=Updated"), "updated key should appear");
    assert!(result.contains("# Header"), "comments should be preserved");
    assert!(result.contains("# Footer"), "comments should be preserved");
}

#[tokio::test]
async fn test_read_empty_properties() {
    let dir = tempfile::TempDir::new().unwrap();
    let path = write_fixture(dir.path(), "empty.properties", "");

    let props = files::read_properties(&path).await.unwrap();
    assert!(props.is_empty());
}

#[tokio::test]
async fn test_read_nonexistent_file_errors() {
    let result = files::read_properties(Path::new("/nonexistent/path/server.properties")).await;
    assert!(result.is_err());
}

#[test]
fn test_default_server_properties_includes_management_protocol_section() {
    let props = files::default_server_properties(25565, "A Minecraft Server");
    assert!(props.contains("# ========== 管理协议 =========="));
    assert!(props.contains("# management-server-enabled=true"));
    assert!(props.contains("# management-server-port=<port+100>"));
    assert!(props.contains("# management-server-secret=<auto-generated>"));
    assert!(props.contains(&format!("# management-server-allowed-origins={SMP_ALLOWED_ORIGINS}")));
    assert!(props.contains("# management-server-tls-keystore=<auto-generated>"));
    assert!(props.contains("# management-server-tls-keystore-password=<auto-generated>"));
    assert!(props.contains("# enable-rcon=true"));
    assert!(props.contains("# rcon.port=<port+10>"));
    assert!(props.contains("# rcon.password=<auto-generated>"));
}
