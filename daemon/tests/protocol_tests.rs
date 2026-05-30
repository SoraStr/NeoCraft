use neocraft_daemon::protocol::{Request, Response, Event, Method, InstanceState, Error};
use serde_json;

#[test]
fn test_deserialize_start_request() {
    let json = r#"{"id":"abc-123","method":"instance.start","params":{"id":"inst1"}}"#;
    let req: Request = serde_json::from_str(json).unwrap();
    assert_eq!(req.id, "abc-123");
    assert!(matches!(req.method, Method::InstanceStart));
    assert_eq!(req.params["id"], "inst1");
}

#[test]
fn test_deserialize_stop_request() {
    let json = r#"{"id":"xyz","method":"instance.stop","params":{"id":"inst1"}}"#;
    let req: Request = serde_json::from_str(json).unwrap();
    assert!(matches!(req.method, Method::InstanceStop));
}

#[test]
fn test_deserialize_config_get_request() {
    let json = r#"{"id":"cfg1","method":"config.get","params":{"instance_id":"i1"}}"#;
    let req: Request = serde_json::from_str(json).unwrap();
    assert!(matches!(req.method, Method::ConfigGet));
}

#[test]
fn test_serialize_success_response() {
    let resp = Response {
        id: "abc".into(),
        result: Some(serde_json::json!({"pid": 42})),
        error: None,
    };
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("\"pid\":42"));
    assert!(json.contains("\"id\":\"abc\""));
    assert!(!json.contains("error"));
}

#[test]
fn test_serialize_error_response() {
    let resp = Response {
        id: "abc".into(),
        result: None,
        error: Some(Error {
            code: "NOT_FOUND".into(),
            message: "Instance not found".into(),
        }),
    };
    let json = serde_json::to_string(&resp).unwrap();
    assert!(json.contains("NOT_FOUND"));
    assert!(!json.contains("result"));
}

#[test]
fn test_serialize_instance_log_event() {
    let ev = Event::InstanceLog {
        instance_id: "i1".into(),
        line: "[Server] Starting...".into(),
        timestamp: 1234567890,
    };
    let json = serde_json::to_string(&ev).unwrap();
    assert!(json.contains("instance.log"));
    assert!(json.contains("[Server] Starting..."));
}

#[test]
fn test_serialize_state_change_event() {
    let ev = Event::InstanceStateChange {
        instance_id: "i1".into(),
        state: InstanceState::Running,
    };
    let json = serde_json::to_string(&ev).unwrap();
    assert!(json.contains("instance.state_change"));
    assert!(json.contains("\"running\""));
}

#[test]
fn test_deserialize_download_progress_event() {
    let json = r#"{"event":"download.progress","data":{"task_id":"t1","downloaded":500,"total":1000,"percent":50.0}}"#;
    let ev: Event = serde_json::from_str(json).unwrap();
    match ev {
        Event::DownloadProgress { task_id, downloaded, total, percent } => {
            assert_eq!(task_id, "t1");
            assert_eq!(downloaded, 500);
            assert_eq!(total, 1000);
            assert_eq!(percent, 50.0);
        }
        _ => panic!("expected DownloadProgress event"),
    }
}

#[test]
fn test_roundtrip_request_response() {
    let req = Request {
        id: "test".into(),
        method: Method::InstanceStart,
        params: serde_json::json!({"id": "i1"}),
    };
    let req_json = serde_json::to_string(&req).unwrap();
    let req2: Request = serde_json::from_str(&req_json).unwrap();
    assert_eq!(req2.id, req.id);
    assert!(matches!(req2.method, Method::InstanceStart));
}

#[test]
fn test_unknown_method_deserialization() {
    let json = r#"{"id":"x","method":"unknown.future","params":{}}"#;
    let result: Result<Request, _> = serde_json::from_str(json);
    // Unknown variant should produce a serde error
    assert!(result.is_err());
}
