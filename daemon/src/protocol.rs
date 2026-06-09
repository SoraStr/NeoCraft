//! IPC protocol types — Request, Response, Event messages exchanged over Unix socket.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: String,
    pub method: Method,
    pub params: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Method {
    #[serde(rename = "instance.list")]
    InstanceList,
    #[serde(rename = "instance.create")]
    InstanceCreate,
    #[serde(rename = "instance.get")]
    InstanceGet,
    #[serde(rename = "instance.delete")]
    InstanceDelete,
    #[serde(rename = "instance.start")]
    InstanceStart,
    #[serde(rename = "instance.stop")]
    InstanceStop,
    #[serde(rename = "instance.restart")]
    InstanceRestart,
    #[serde(rename = "download.start")]
    DownloadStart,
    #[serde(rename = "download.cancel")]
    DownloadCancel,
    #[serde(rename = "config.get")]
    ConfigGet,
    #[serde(rename = "config.set")]
    ConfigSet,
    #[serde(rename = "monitor.subscribe")]
    MonitorSubscribe,
    #[serde(rename = "monitor.unsubscribe")]
    MonitorUnsubscribe,
    #[serde(rename = "instance.command")]
    InstanceCommand,
    #[serde(rename = "instance.import")]
    InstanceImport,
    #[serde(rename = "files.list")]
    FilesList,
    #[serde(rename = "files.delete")]
    FilesDelete,
    #[serde(rename = "files.write")]
    FilesWrite,
    #[serde(rename = "files.rename")]
    FilesRename,
    #[serde(rename = "files.read")]
    FilesRead,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<Error>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Error {
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", content = "data")]
pub enum Event {
    #[serde(rename = "instance.log")]
    InstanceLog {
        instance_id: String,
        line: String,
        timestamp: u64,
    },
    #[serde(rename = "instance.state_change")]
    InstanceStateChange {
        instance_id: String,
        state: InstanceState,
    },
    #[serde(rename = "instance.stats")]
    InstanceStats {
        instance_id: String,
        cpu_percent: f64,
        memory_mb: u64,
        uptime_secs: u64,
    },
    #[serde(rename = "download.progress")]
    DownloadProgress {
        task_id: String,
        downloaded: u64,
        total: u64,
        percent: f64,
    },
    #[serde(rename = "daemon.status")]
    DaemonStatus {
        version: String,
        uptime_secs: u64,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum InstanceState {
    Starting,
    Running,
    Stopping,
    Stopped,
    Crashed,
}
