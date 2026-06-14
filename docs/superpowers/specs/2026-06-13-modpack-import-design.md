# Modpack 一键导入 — 设计文档

**日期**: 2026-06-13
**状态**: 已批准

## 1. 目标

支持从 Modrinth modpack 链接或 .mrpack 文件一键导入，自动下载服务端 JAR、mod loader 和依赖 mod，创建完整可运行的实例。

## 2. 范围

**优先**: Modrinth modpack (.mrpack)。Modrinth 有公开 API，项目已有 mod-market-service 集成，清单包含直链。
**后续**: CurseForge modpack（需 API Key）。

## 3. 流程

```
用户输入 Modrinth modpack URL/slug 或上传 .mrpack 文件
        │
        ▼
  Server 解析清单 (modrinth.index.json)
  提取：MC 版本、mod loader (Fabric/Forge/Quilt)、依赖列表
        │
        ▼
  Daemon 下载 server JAR + mod loader installer
  逐个下载 mod JAR 到 mods/ 目录
        │
        ▼
  Daemon 创建实例 → 写入配置 → 返回结果
```

## 4. 改动清单

| 层 | 文件 | 变更 |
|----|------|------|
| Server | `src/services/modpack-service.ts` (新) | 解析 mrpack、解析清单、协调下载 |
| Server | `src/routes/instances.ts` | 新增 `POST /api/instances/import-modpack` |
| Daemon | `downloader.rs` | 新增 `download.batch` 方法 |
| Frontend | Setup 页面 | Modpack 导入入口（URL + 进度） |

## 5. API

```
POST /api/instances/import-modpack
  Body: { url: "https://modrinth.com/modpack/<slug>" }
  或 FormData: { file: .mrpack }

  Server:
    1. fetch + parse .mrpack
    2. 对每个文件发送 download 请求到 daemon
    3. daemon 逐文件下载，推送 progress 事件
    4. 全部完成后，daemon 创建实例

  Response: { id, name, version, type, ... }
  WebSocket: download.progress (含 batch 进度)
```

## 6. 错误处理

| 场景 | 处理 |
|------|------|
| URL 无效/网络错误 | 返回 400 + 友好提示 |
| 不支持的 mod loader | 返回 400，列出支持的 loader |
| 单个 mod 下载失败 | 记录并跳过，导入完成时报告失败项 |
| server JAR 下载失败 | 终止导入，返回错误 |

## 7. 测试策略

- Server 单元测试: modpack 解析、清单解析
- Server 集成测试: import-modpack 端点
- Daemon 单元测试: download.batch 行为
