//! IPC request dispatch for the daemon.

use std::path::PathBuf;

use async_trait::async_trait;
use serde::Serialize;
use serde_json::{json, Value};

use crate::instance::{InstanceError, InstanceManager, ServerType};
use crate::ipc::RequestHandler;
use crate::protocol::{Error as ProtoError, Method, Request, Response};

pub struct DaemonHandler {
    manager: InstanceManager,
}

impl DaemonHandler {
    pub fn new(manager: InstanceManager) -> Self {
        Self { manager }
    }
}

#[async_trait]
impl RequestHandler for DaemonHandler {
    async fn handle(&self, request: Request) -> Response {
        let id = request.id.clone();
        let result = self.dispatch(request).await;

        match result {
            Ok(value) => Response {
                id,
                result: Some(value),
                error: None,
            },
            Err(error) => Response {
                id,
                result: None,
                error: Some(error),
            },
        }
    }
}

impl DaemonHandler {
    async fn dispatch(&self, request: Request) -> Result<Value, ProtoError> {
        match request.method {
            Method::InstanceList => to_value(self.manager.list().await),
            Method::InstanceCreate => self.create_instance(&request.params).await,
            Method::InstanceGet => {
                let id = required_str(&request.params, "id")?;
                let instance = self
                    .manager
                    .get(id)
                    .await
                    .ok_or_else(|| proto_error("NOT_FOUND", "Instance not found"))?;
                to_value(instance)
            }
            Method::InstanceDelete => {
                let id = required_str(&request.params, "id")?;
                self.manager
                    .delete(id)
                    .await
                    .map_err(|error| instance_error("DELETE_ERROR", error))?;
                Ok(json!({ "ok": true }))
            }
            Method::InstanceStart => {
                let id = required_str(&request.params, "id")?;
                self.manager
                    .start(id)
                    .await
                    .map_err(|error| instance_error("START_ERROR", error))?;
                Ok(json!({ "ok": true }))
            }
            Method::InstanceStop => {
                let id = required_str(&request.params, "id")?;
                self.manager
                    .stop(id)
                    .await
                    .map_err(|error| instance_error("STOP_ERROR", error))?;
                Ok(json!({ "ok": true }))
            }
            Method::InstanceRestart => {
                let id = required_str(&request.params, "id")?;
                self.manager
                    .restart(id)
                    .await
                    .map_err(|error| instance_error("RESTART_ERROR", error))?;
                Ok(json!({ "ok": true }))
            }
            Method::InstanceCommand => {
                let id = required_str(&request.params, "id")?;
                let command = required_str(&request.params, "command")?;
                self.manager
                    .send_command(id, command)
                    .await
                    .map_err(|error| instance_error("COMMAND_ERROR", error))?;
                Ok(json!({ "ok": true }))
            }
            Method::InstanceImport => self.import_instance(&request.params).await,
            Method::ConfigGet => self.get_config(&request.params).await,
            Method::ConfigSet => self.set_config(&request.params).await,
            Method::FilesList => {
                let path = optional_string(&request.params, "path").unwrap_or_else(|| "mods".to_string());
                let work_dir = self.instance_work_dir(&request.params).await?;
                to_value(crate::instance_files::list(&work_dir, &path).await?)
            }
            Method::FilesDelete => {
                let path = required_str(&request.params, "path")?.to_string();
                let work_dir = self.instance_work_dir(&request.params).await?;
                crate::instance_files::delete(&work_dir, &path).await
            }
            Method::FilesWrite => {
                let path = required_str(&request.params, "path")?.to_string();
                let data = required_str(&request.params, "data")?.to_string();
                let work_dir = self.instance_work_dir(&request.params).await?;
                crate::instance_files::write_base64(&work_dir, &path, &data).await
            }
            Method::FilesRename => {
                let old_path = required_str(&request.params, "old_path")?.to_string();
                let new_path = required_str(&request.params, "new_path")?.to_string();
                let work_dir = self.instance_work_dir(&request.params).await?;
                crate::instance_files::rename(&work_dir, &old_path, &new_path).await
            }
            Method::FilesRead => {
                let path = required_str(&request.params, "path")?.to_string();
                let work_dir = self.instance_work_dir(&request.params).await?;
                crate::instance_files::read_base64(&work_dir, &path).await
            }
            Method::JavaDetect => {
                let versions = crate::java_detect::detect_java_versions();
                Ok(serde_json::to_value(versions).unwrap_or_default())
            }
            _ => Err(proto_error("NOT_IMPLEMENTED", "Method not yet implemented")),
        }
    }

    async fn create_instance(&self, params: &Value) -> Result<Value, ProtoError> {
        let name = optional_string(params, "name").unwrap_or_else(|| "My Server".to_string());
        let version = optional_string(params, "version").unwrap_or_else(|| "1.21.5".to_string());
        let port = optional_port(params, "port")?.unwrap_or(25565);
        let download_url = optional_string(params, "download_url").unwrap_or_default();
        let java_path = optional_string(params, "java_path");
        let runtime_mode = optional_string(params, "runtime_mode");
        let docker_image = optional_string(params, "docker_image");
        let server_type = parse_server_type(params.get("type"))?.unwrap_or(ServerType::Paper);

        let instance = self
            .manager
            .create(name, server_type, version, port, download_url, java_path, runtime_mode, docker_image)
            .await
            .map_err(|error| instance_error("CREATE_ERROR", error))?;

        to_value(instance)
    }

    async fn import_instance(&self, params: &Value) -> Result<Value, ProtoError> {
        let name = optional_string(params, "name").unwrap_or_else(|| "My Server".to_string());
        let source_dir = required_str(params, "source_dir")?;
        let port = optional_port(params, "port")?.unwrap_or(25565);
        let java_args = optional_string(params, "java_args");
        let java_path = optional_string(params, "java_path");

        let instance = self
            .manager
            .import(name, PathBuf::from(source_dir), port, java_args, java_path)
            .await
            .map_err(|error| instance_error("IMPORT_ERROR", error))?;

        to_value(instance)
    }

    async fn get_config(&self, params: &Value) -> Result<Value, ProtoError> {
        let instance_id = required_str(params, "instance_id")?;
        let instance = self
            .manager
            .get(instance_id)
            .await
            .ok_or_else(|| proto_error("NOT_FOUND", "Instance not found"))?;
        let props_path = instance.work_dir.join("server.properties");

        let mut props = crate::files::read_properties(&props_path)
            .await
            .map_err(|error| proto_error("CONFIG_ERROR", error.to_string()))?;
        props.insert("java_args".to_string(), instance.java_args);
        props.insert("java_path".to_string(), instance.java_path);

        to_value(props)
    }

    async fn set_config(&self, params: &Value) -> Result<Value, ProtoError> {
        let instance_id = required_str(params, "instance_id")?.to_string();
        let instance = self
            .manager
            .get(&instance_id)
            .await
            .ok_or_else(|| proto_error("NOT_FOUND", "Instance not found"))?;
        let props_obj = params
            .get("properties")
            .and_then(Value::as_object)
            .ok_or_else(|| proto_error("INVALID_PARAMS", "Missing 'properties' object"))?;

        let mut props = std::collections::HashMap::new();
        let mut java_args = None;
        let mut java_path = None;
        let mut server_port = None;
        let mut runtime_mode = None;
        let mut docker_image = None;

        for (key, value) in props_obj {
            let value = value.as_str().unwrap_or("").to_string();
            match key.as_str() {
                "java_args" => java_args = Some(value),
                "java_path" => java_path = Some(value),
                "runtime_mode" => runtime_mode = Some(value),
                "docker_image" => docker_image = Some(value),
                "server-port" => {
                    server_port = Some(value.clone());
                    props.insert(key.clone(), value);
                }
                _ => {
                    props.insert(key.clone(), value);
                }
            }
        }

        // Parse server port if provided
        let parsed_port: Option<u16> = server_port
            .and_then(|p| p.parse::<u16>().ok())
            .filter(|p| *p > 0);

        if java_args.is_some() || java_path.is_some() || parsed_port.is_some() {
            self.manager
                .update_config(&instance_id, java_args, java_path, parsed_port)
                .await
                .map_err(|error| instance_error("CONFIG_ERROR", error))?;
        }

        // Update runtime_mode and docker_image
        if runtime_mode.is_some() || docker_image.is_some() {
            self.manager
                .update_docker_config(&instance_id, runtime_mode, docker_image)
                .await
                .map_err(|error| instance_error("CONFIG_ERROR", error))?;
        }

        if !props.is_empty() {
            crate::files::write_properties(&instance.work_dir.join("server.properties"), &props)
                .await
                .map_err(|error| proto_error("CONFIG_ERROR", error.to_string()))?;
        }

        Ok(json!({ "ok": true }))
    }

    async fn instance_work_dir(&self, params: &Value) -> Result<PathBuf, ProtoError> {
        let instance_id = required_str(params, "instance_id")?;
        let instance = self
            .manager
            .get(instance_id)
            .await
            .ok_or_else(|| proto_error("NOT_FOUND", "Instance not found"))?;
        Ok(instance.work_dir)
    }
}

fn required_str<'a>(params: &'a Value, key: &str) -> Result<&'a str, ProtoError> {
    optional_str(params, key)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| proto_error("INVALID_PARAMS", format!("Missing '{key}'")))
}

fn optional_str<'a>(params: &'a Value, key: &str) -> Option<&'a str> {
    params.get(key).and_then(Value::as_str)
}

fn optional_string(params: &Value, key: &str) -> Option<String> {
    optional_str(params, key)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn optional_port(params: &Value, key: &str) -> Result<Option<u16>, ProtoError> {
    let Some(value) = params.get(key) else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }

    let raw = value
        .as_u64()
        .ok_or_else(|| proto_error("INVALID_PORT", "Port must be an integer"))?;
    if raw > u16::MAX as u64 {
        return Err(proto_error("INVALID_PORT", "Port must be 0-65535"));
    }

    Ok(Some(raw as u16))
}

fn parse_server_type(value: Option<&Value>) -> Result<Option<ServerType>, ProtoError> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.is_null() {
        return Ok(None);
    }

    serde_json::from_value(value.clone())
        .map(Some)
        .map_err(|_| proto_error("INVALID_PARAMS", "Invalid server type"))
}

fn to_value(value: impl Serialize) -> Result<Value, ProtoError> {
    serde_json::to_value(value).map_err(|error| proto_error("SERIALIZE_ERROR", error.to_string()))
}

fn instance_error(code: &str, error: InstanceError) -> ProtoError {
    let mapped_code = match &error {
        InstanceError::NotFound(_) => "NOT_FOUND",
        InstanceError::PortInUse(_) => "PORT_IN_USE",
        InstanceError::PortUnavailable(_) => "PORT_UNAVAILABLE",
        _ => code,
    };
    proto_error(mapped_code, error.to_string())
}

fn proto_error(code: impl Into<String>, message: impl Into<String>) -> ProtoError {
    ProtoError {
        code: code.into(),
        message: message.into(),
    }
}
