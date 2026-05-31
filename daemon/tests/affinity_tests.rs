use std::path::PathBuf;
use neocraft_daemon::affinity::parse_cpu_list;
use neocraft_daemon::instance::{Instance, ServerType};
use neocraft_daemon::files::default_server_properties;
use neocraft_daemon::protocol::InstanceState;

// ---------------------------------------------------------------------------
// parse_cpu_list integration tests (re-exported via lib)
// ---------------------------------------------------------------------------

#[test]
fn test_parse_single_cpu() {
    assert_eq!(parse_cpu_list("0").unwrap(), 1);
}

#[test]
fn test_parse_multiple_cpus() {
    assert_eq!(parse_cpu_list("0,2,4").unwrap(), 0b10101);
}

#[test]
fn test_parse_cpu_range() {
    assert_eq!(parse_cpu_list("0-3").unwrap(), 0b1111);
}

#[test]
fn test_parse_mixed() {
    let mask = parse_cpu_list("0-1,4,6-7").unwrap();
    assert_eq!(mask, (1 << 0) | (1 << 1) | (1 << 4) | (1 << 6) | (1 << 7));
}

#[test]
fn test_parse_empty() {
    assert_eq!(parse_cpu_list("").unwrap(), 0);
}

#[test]
fn test_parse_invalid_non_numeric() {
    assert!(parse_cpu_list("abc").is_err());
}

#[test]
fn test_parse_invalid_out_of_range() {
    assert!(parse_cpu_list("64").is_err());
    assert!(parse_cpu_list("0-64").is_err());
}

#[test]
fn test_parse_invalid_reversed_range() {
    assert!(parse_cpu_list("3-1").is_err());
}

#[test]
fn test_parse_all_cores() {
    assert_eq!(parse_cpu_list("0-63").unwrap(), u64::MAX);
}

// ---------------------------------------------------------------------------
// Instance serialization tests for cpu_affinity field
// ---------------------------------------------------------------------------

fn make_test_work_dir() -> PathBuf {
    PathBuf::from("/tmp/test")
}

fn make_test_jar_path() -> PathBuf {
    PathBuf::from("/tmp/test/server.jar")
}

#[test]
fn test_instance_serializes_with_cpu_affinity() {
    let inst = Instance {
        id: "test-id".into(),
        name: "Test".into(),
        server_type: ServerType::Paper,
        version: "1.21.5".into(),
        port: 25565,
        work_dir: make_test_work_dir(),
        jar_path: make_test_jar_path(),
        state: InstanceState::Stopped,
        java_args: "-Xmx2G -Xms1G".into(),
        cpu_affinity: "0-3".into(),
        created_at: "2025-01-01T00:00:00Z".into(),
        download_url: "".into(),
    };

    let json = serde_json::to_string(&inst).unwrap();
    assert!(json.contains("cpu_affinity"), "JSON should contain cpu_affinity");
    assert!(json.contains("0-3"), "JSON should contain the affinity value");
}

#[test]
fn test_instance_deserializes_with_missing_cpu_affinity() {
    // Old JSON format without cpu_affinity field
    let old_json = r#"{
        "id": "test-id",
        "name": "Test",
        "server_type": "paper",
        "version": "1.21.5",
        "port": 25565,
        "work_dir": "/tmp/test",
        "jar_path": "/tmp/test/server.jar",
        "state": "stopped",
        "java_args": "-Xmx2G -Xms1G",
        "created_at": "2025-01-01T00:00:00Z",
        "download_url": ""
    }"#;

    let inst: Instance = serde_json::from_str(old_json).unwrap();
    assert_eq!(inst.cpu_affinity, "", "missing cpu_affinity should default to empty string");
}

#[test]
fn test_instance_default_cpu_affinity_is_empty() {
    let inst = Instance {
        id: "test-id".into(),
        name: "Test".into(),
        server_type: ServerType::Paper,
        version: "1.21.5".into(),
        port: 25565,
        work_dir: make_test_work_dir(),
        jar_path: make_test_jar_path(),
        state: InstanceState::Stopped,
        java_args: "-Xmx2G -Xms1G".into(),
        cpu_affinity: String::new(),
        created_at: "2025-01-01T00:00:00Z".into(),
        download_url: "".into(),
    };
    assert!(inst.cpu_affinity.is_empty());
}

// ---------------------------------------------------------------------------
// Server properties template test
// ---------------------------------------------------------------------------

#[test]
fn test_server_properties_template_contains_cpu_affinity_line() {
    let props = default_server_properties(25565, "Test Server");
    assert!(
        props.contains("cpu-affinity="),
        "server.properties template should contain cpu-affinity= line"
    );
}
