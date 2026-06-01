# 服务器管理页 — 实施计划

**日期**: 2026-06-01
**设计文档**: `docs/plans/2026-06-01-server-management-design.md`

## 任务拆分（TDD 驱动）

### Task 1: Daemon — 版本比较工具函数

- **文件**: `daemon/src/instance.rs`（新增函数）
- **测试**: `daemon/tests/instance_tests.rs`（新增测试用例）
- **内容**: 
  - 新增 `pub fn version_at_least(version: &str, major: u32, minor: u32, patch: u32) -> bool`
  - 支持格式：`"1.21.9"`, `"1.21.10"`, `"1.22"`
  - 测试用例：`>= 1.21.9` 真/假、边界情况、异常格式处理

### Task 2: Daemon — Instance 结构体扩展 + create() 自动配置

- **文件**: `daemon/src/instance.rs`
- **测试**: `daemon/tests/instance_tests.rs`
- **内容**:
  - `Instance` 新增 `management_port: u16`, `management_token: String`
  - `create()` 中根据版本生成对应配置：
    - ≥1.21.9: SMP 配置写入 server.properties
    - <1.21.9: RCON 配置写入 server.properties
  - 令牌/密码使用随机字符串生成
  - 测试：验证版本边界下的配置写入、字段序列化/反序列化

### Task 3: Daemon — server.properties 模板更新

- **文件**: `daemon/src/files.rs`, `daemon/tests/config_tests.rs`
- **内容**: 模板加入 SMP 和 RCON 配置注释行
- **测试**: 验证模板包含新字段

### Task 4: Server — RCON TCP 客户端

- **文件**: `server/src/services/rcon-client.ts`（新建）
- **测试**: `server/tests/rcon-client.test.ts`（新建）
- **内容**:
  - 实现 Source RCON 协议：connect → auth → exec → disconnect
  - 包格式：`[length:i32 LE][request_id:i32 LE][type:i32 LE][payload][0x00]`
  - 认证：type=3，执行：type=2
  - 超时处理（5 秒）、错误处理
  - 测试：认证成功/失败、单/多包响应、超时

### Task 5: Server — RCON 路由

- **文件**: `server/src/routes/instances.ts`（追加）
- **测试**: `server/tests/routes/instances.test.ts`（追加）
- **内容**:
  - `POST /api/instances/:id/rcon` → `{ command }` → `{ result }`
  - 从实例获取 RCON 连接参数（host, port, password）
  - 调用 RCON 客户端，返回结果

### Task 6: Server — 实例 API 扩展字段

- **文件**: `server/src/routes/instances.ts`（修改）
- **内容**: 实例列表/详情 API 返回 `management_port` 和 `management_token`

### Task 7: Frontend — SMP WebSocket 客户端

- **文件**: `frontend/src/lib/smp-client.ts`（新建）
- **内容**:
  - `SmpClient` 类：connect / call / onNotification / close
  - WebSocket 连接：`ws://host:port`，子协议 `minecraft-v1, <token>`
  - JSON-RPC 2.0 请求/响应匹配（自增 id，Promise resolve）
  - 通知分发（Map<method, Set<handler>>）
  - 自动重连
  - 错误处理

### Task 8: Frontend — 类型定义 + i18n

- **文件**: `frontend/src/lib/types.ts`, `frontend/src/i18n/zh-CN.json`, `frontend/src/i18n/ja.json`
- **内容**:
  - 类型: `PlayerDto`, `BanDto`, `OperatorDto`, `ServerState`, `GameruleEntry` 等
  - 翻译键: 10 个 Tab 名称、快捷命令标签、连接状态提示

### Task 9: Frontend — version_at_least 工具函数

- **文件**: `frontend/src/lib/version.ts`（新建）
- **内容**: 前端版本的 `version_at_least()`，与 daemon 端逻辑一致

### Task 10: Frontend — Management 页面骨架 + 路由

- **文件**: `frontend/src/pages/Management.tsx`（新建）, `frontend/src/App.tsx`（修改）
- **内容**:
  - 新增路由 `/manage/:id`
  - Management 页面骨架：版本检测 → SMP 面板 / RCON 面板
  - 连接状态栏（协议类型 + 连接状态）

### Task 11: Frontend — SMP 管理面板（10 个 Tab）

- **文件**: `frontend/src/pages/Management.tsx`, `frontend/src/components/management/*.tsx`（新建）
- **内容**:
  - TabBar 组件
  - 10 个 Tab 组件：概览、玩家、聊天、白名单、封禁、IP 封禁、管理员、设置、游戏规则、其他
  - 通知订阅 → 实时事件推送渲染
  - 加载/空/错误状态

### Task 12: Frontend — RCON 管理面板（2 个 Tab）

- **文件**: `frontend/src/pages/Management.tsx`
- **内容**:
  - 控制台：命令输入 + 历史 + 输出区
  - 快捷操作：11 个常用命令按钮 + 弹出参数输入框

### Task 13: Frontend — Dashboard 入口按钮

- **文件**: `frontend/src/pages/Dashboard.tsx`
- **内容**: 服务器卡片操作栏增加"管理"按钮，导航到 `/manage/:id`

### Task 14: Frontend — Sidebar 入口链接

- **文件**: `frontend/src/components/layout/Sidebar.tsx`
- **内容**: 服务器子项增加"管理"导航链接

### 依赖关系

```
Task 1 ──→ Task 2 ──→ Task 3
                │
                └──→ Task 6
Task 4 ──→ Task 5
                │
Task 7 ──→ Task 10 ──→ Task 11
Task 8 ──→ Task 10   Task 12
Task 9 ──→ Task 10
                │
Task 13, Task 14 (独立，可随时做)
```

## 执行模式选择

所有任务编写完毕。请选择执行方式：

- **A. 子代理驱动（当前会话）** — 每个任务派发子代理执行 TDD，两阶段审查
- **B. 手动执行** — 你自行按任务列表执行
