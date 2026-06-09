use neocraft_daemon::instance_files;

#[test]
fn rejects_absolute_parent_and_windows_style_paths() {
    assert!(!instance_files::validate_subpath(""));
    assert!(!instance_files::validate_subpath("../server.properties"));
    assert!(!instance_files::validate_subpath("mods/../server.properties"));
    assert!(!instance_files::validate_subpath("/tmp/server.jar"));
    assert!(!instance_files::validate_subpath(r"mods\bad.jar"));
    assert!(!instance_files::validate_subpath("C:/Users/test/server.jar"));
    assert!(instance_files::validate_subpath("mods/example.jar"));
}

#[tokio::test]
async fn safe_path_rejects_symlinks_that_escape_instance_dir() {
    let dir = tempfile::TempDir::new().unwrap();
    let instance_dir = dir.path().join("instance");
    let outside = dir.path().join("outside.txt");
    std::fs::create_dir_all(&instance_dir).unwrap();
    std::fs::write(&outside, "secret").unwrap();

    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(&outside, instance_dir.join("escape.txt")).unwrap();
        let err = instance_files::safe_instance_path(&instance_dir, "escape.txt")
            .expect_err("escaping symlink should be rejected");
        assert_eq!(err.code, "INVALID_PATH");
    }
}
