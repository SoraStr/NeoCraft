# 服务器管理页 — 设计文档

**日期**: 2026-06-01
**状态**: 设计中

## 1. 目标

为 NeoCraft 添加独立的服务器管理页面。根据 Minecraft 版本自动选择协议：

- **≥1.21.9**：服务端管理协议（SMP），WebSocket + JSON-RPC 2.0，浏览器直连
- **<1.21.9**：RCON 协议，TCP 二进制，通过 Node.js 后端代理

## 2. 架构

```
浏览器 (React)
  │
  ├─ SMP 直连 ──────────────→ Minecraft 1.21.9+ (ws://host:mgmt_port)
  │                             端口 = server.port + 100
  │
  ├─ RCON 代理 ─→ Node.js API ──TCP──→ Minecraft <1.21.9 (rcon.port)
  │
  └─ REST ────────→ Node.js API ──→ daemon ──→ 写入协议配置
```

- Daemon 在创建实例时自动写入协议配置到 server.properties
- SMP: `management-server-enabled=true`, `management-server-port=<port+100>`, `management-server-secret=<40位随机令牌>`
- RCON: `enable-rcon=true`, `rcon.port=<port+10>`, `rcon.password=<随机密码>`

## 3. 前端页面：`/manage/:id`

### 3.1 版本判断

根据 `instance.version` 解析主版本号，比较 `>= 1.21.9`。

### 3.2 SMP 面板（≥1.21.9）— 10 个 Tab + 1 个通知流

| # | Tab | API 方法 | 功能 |
|---|---|---|---|
| 1 | 概览 | `server/status` + 通知订阅 | 在线玩家数、版本、运行状态、实时事件推送 |
| 2 | 玩家 | `players`, `players/kick` | 在线列表（头像、ID、名称），踢出确认 |
| 3 | 聊天 | `server/system_message` | 发送系统消息（支持 overlay 类型） |
| 4 | 白名单 | `allowlist`, `allowlist/add`, `allowlist/remove`, `allowlist/clear`, `allowlist/set` | 增删查清 |
| 5 | 封禁 | `bans`, `bans/add`, `bans/remove`, `bans/clear` | 玩家封禁管理，含原因 + 过期时间 |
| 6 | IP 封禁 | `ip_bans`, `ip_bans/add`, `ip_bans/remove`, `ip_bans/clear` | IP 封禁管理 |
| 7 | 管理员 | `operators`, `operators/add`, `operators/remove`, `operators/clear` | OP 增删，含权限等级 |
| 8 | 设置 | `serversettings/get` × 20, `serversettings/set` × 20 | 20 项服务端设置 |
| 9 | 游戏规则 | `gamerules`, `gamerules/update` | 布尔型 + 整数型规则 |
| 10 | 其他 | `server/save`, `server/stop` | 存档与关机 |

**通知流（WebSocket 推送）**: `players/joined`, `players/left`, `operators/*`, `allowlist/*`, `bans/*`, `ip_bans/*`, `gamerules/updated`, `server/saving`, `server/saved`, `server/stopping`, `server/status`

### 3.3 RCON 面板（<1.21.9）— 控制台 + 快捷命令

| # | Tab | 实现 | 功能 |
|---|---|---|---|
| 1 | 控制台 | RCON 代理执行 + 输出解析 | 命令输入 + 历史 + 实时输出显示 |
| 2 | 快捷操作 | 预设命令按钮 + 弹窗 | 玩家列表/踢出/封禁/白名单/OP 等常用操作 |

快捷操作按钮列表（每个弹出输入框，拼装命令 → RCON 发送）：
- 玩家列表 → `list`
- 踢出玩家 → `kick <玩家名> [原因]`
- 白名单添加 → `whitelist add <玩家名>`
- 白名单移除 → `whitelist remove <玩家名>`
- 封禁玩家 → `ban <玩家名> [原因]`
- 解封玩家 → `pardon <玩家名>`
- 添加 OP → `op <玩家名>`
- 移除 OP → `deop <玩家名>`
- 切换游戏模式 → `gamemode <模式> <玩家名>`
- 发送消息 → `say <消息>`
- 保存存档 → `save-all`

### 3.4 Dashboard 入口

服务器卡片操作栏增加"管理"按钮（齿轮图标），点击导航到 `/manage/:id`。

### 3.5 版本不匹配提示

管理页顶部检查版本 → 显示当前使用的协议和连接状态：
- SMP 连接成功 → 绿色 "服务端管理协议 (SMP) — 已连接"
- SMP 连接失败 → 黄色 "SMP 连接失败 — 请检查 management-server-enabled 是否已在 server.properties 中开启"
- RCON 连接成功 → 绿色 "RCON — 已连接"
- RCON 连接失败 → 黄色 "RCON 连接失败 — 请检查 enable-rcon 和 rcon.password 配置"

## 4. Daemon 改动

### 4.1 版本比较辅助函数

```rust
/// 比较 Minecraft 版本号，返回是否 >= 指定版本
fn version_at_least(version: &str, major: u32, minor: u32, patch: u32) -> bool
```

### 4.2 Instance 结构体新增字段

```rust
pub management_port: u16,     // SMP 管理端口 (= port + 100)
pub management_token: String, // SMP 40位随机令牌
```

### 4.3 create() 改动

创建实例时自动写入协议配置：

```rust
// SMP (>= 1.21.9):
//   management-server-enabled=true
//   management-server-port=<port + 100>
//   management-server-secret=<40-char random>
// RCON (< 1.21.9):
//   enable-rcon=true
//   rcon.port=<port + 10>
//   rcon.password=<32-char random>
```

### 4.4 files.rs: default_server_properties() 改动

模板中加入管理协议注释行。

## 5. Node.js 后端改动

### 5.1 新建 RCON 客户端 (`server/src/services/rcon-client.ts`)

- 实现 Source RCON 协议：认证 → 执行命令 → 返回响应
- 单次连接生命周期：connect → auth → exec → disconnect
- 错误处理：超时、认证失败、连接重置

### 5.2 新增路由 (`server/src/routes/instances.ts`)

```typescript
POST /api/instances/:id/rcon
  Body: { command: "list" }
  Response: { result: "There are 3 players..." }
```

### 5.3 实例列表 API 扩展

返回 `management_port` 和 `management_token` 字段。

## 6. 前端改动

### 6.1 新建文件

| 文件 | 职责 |
|---|---|
| `src/lib/smp-client.ts` | SMP WebSocket 客户端：连接、认证、JSON-RPC 请求/响应/通知 |
| `src/hooks/useManagement.ts` | 版本判断 → SMP/RCON 选择，提供 `execute()` / `api.banAdd()` 等 |
| `src/pages/Management.tsx` | 管理页主组件，SMP/RCON 两套 UI |
| `src/components/management/*.tsx` | 各 Tab 子组件 |

### 6.2 修改文件

| 文件 | 改动 |
|---|---|
| `src/lib/types.ts` | 增加 `ManagementConfig`, `SmpPlayer`, `SmpBan` 等类型 |
| `src/pages/Dashboard.tsx` | 卡片操作栏增加"管理"按钮 |
| `src/components/layout/Sidebar.tsx` | 服务器子项增加"管理"链接 |
| `src/i18n/zh-CN.json` | 增加管理页翻译键 |
| `src/i18n/ja.json` | 增加管理页翻译键 |

## 7. SMP 客户端设计（`smp-client.ts`）

```typescript
class SmpClient {
  constructor(url: string, token: string)
  connect(): Promise<void>
  call(method: string, params?: any[]): Promise<any>
  onNotification(method: string, handler: (params) => void): () => void
  close(): void
}
```

- WebSocket 连接：`ws://host:port`
- 子协议头部：`Sec-WebSocket-Protocol: minecraft-v1, <token>`
- JSON-RPC 2.0 请求/响应匹配（基于 `id`）
- 通知分发（基于 `method`）

## 8. SMP 面板 UI 组件树

```
Management.tsx
  ├─ ManagementHeader          // 协议状态 + 连接指示器
  ├─ SmpManagement              // ≥1.21.9
  │   ├─ TabBar                 // 10 个 Tab 切换
  │   ├─ OverviewTab            // 概览
  │   ├─ PlayersTab             // 玩家列表 + 踢出
  │   ├─ ChatTab                // 系统消息发送
  │   ├─ AllowlistTab           // 白名单 CRUD
  │   ├─ BanTab                 // 玩家封禁管理
  │   ├─ IpBanTab               // IP 封禁管理
  │   ├─ OperatorsTab           // OP 管理
  │   ├─ SettingsTab            // 20 项设置
  │   ├─ GamerulesTab           // 游戏规则
  │   └─ MoreTab                // 存档/关机
  └─ RconManagement             // <1.21.9
      ├─ ConsoleTab             // 命令输入 + 输出
      └─ QuickActionsTab        // 快捷命令按钮
```
