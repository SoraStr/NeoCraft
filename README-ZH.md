# NeoCraft

跨平台 Minecraft 服务器控制面板，拥有精美的 Web 界面。通过浏览器集中管理多台 Minecraft 服务器——创建、启动、停止、监控和配置，一站式完成。

## 功能特性

### 服务器管理
- **多实例支持** — 同时运行多台 Minecraft 服务器，各自独立配置、互不干扰
- **一键安装** — 自动下载并部署 Vanilla、Paper、Spigot、Fabric、Forge 或自定义服务器
- **进程生命周期** — 在 Web 面板中启动、停止和重启服务器
- **导入已有服务器** — 一键导入现有的服务器目录
- **下载缓存** — JAR 文件缓存复用，节省带宽和下载时间

### 实时监控
- **实时控制台** — 服务器日志实时流式显示，支持命令输入
- **资源监控** — 实时追踪每个实例的 CPU 和内存使用情况（计划中）
- **状态追踪** — 一目了然查看服务器状态

### 配置管理
- **配置文件编辑器** — 通过表单界面编辑 `server.properties`，附带 MOTD 生成器
- **文件管理器** — 通过 Web 界面浏览、读取、编辑和删除服务器文件
- **Java 参数编辑器** — 为每个实例自定义 JVM 启动参数
- **自定义 Java 路径** — 为每台服务器指定不同的 Java 运行时

### 服务器运维
- **SMP（服务器管理协议）** — Minecraft 1.21.9+ 服务器的完整管理：
  - 概览面板、玩家管理（踢出、封禁、设为管理员）、聊天监控与发送
  - 白名单管理、封禁/IP 封禁管理、管理员管理
  - 游戏规则编辑器、服务器设置
- **RCON** — 旧版 Minecraft 服务器的远程控制台，支持快捷指令操作
- **Mod 管理** — 扫描并查看 Fabric/Forge 服务器的已安装模组

### 用户体验
- **多主题支持** — 浅色、深色、Minecraft 经典和 Minecraft 现代四种主题
- **国际化** — 支持 English、简体中文 和 日本語
- **命令历史** — 控制台命令历史可在会话间持久保留
- **响应式设计** — 适配桌面和平板设备

### 安全性
- **令牌认证** — 守护进程与服务端之间的安全通信
- **API 认证** — REST API 可选 Bearer 令牌认证
- **速率限制** — 内置请求频率限制器
- **TLS 支持** — 加密的 SMP 连接

## 系统架构

```
┌─────────────────┐    HTTP/WS     ┌──────────────────┐   Unix Socket /    ┌───────────────────┐
│   浏览器 (React)  │ ←───────────→ │  Node.js API     │ ←───────────────→ │  Rust 守护进程      │
│                  │               │  (Fastify)       │   Named Pipe       │  (tokio)           │
│  • 仪表盘         │               │                  │                    │                    │
│  • 控制台         │               │ • REST API       │  JSON-Lines 协议   │  • 进程管理         │
│  • 配置编辑器      │               │ • WebSocket 中枢  │                    │  • 日志捕获         │
│  • 运维管理        │               │ • 静态资源服务     │                    │  • 资源监控         │
│  • 创建向导        │               │ • 版本服务        │                    │  • 下载缓存         │
└─────────────────┘               └──────────────────┘                    │  • SMP/RCON 代理   │
                                                                          └───────────────────┘
```

前端通过 REST 和 WebSocket 与 Node.js API 服务通信。API 服务通过 Unix Socket（macOS/Linux）或命名管道（Windows）将请求代理到 Rust 守护进程，使用 JSON-Lines 协议。守护进程直接管理 Minecraft 服务器进程，捕获其输出并监控资源使用情况。

## 环境要求

- **macOS**、**Linux** 或 **Windows**
- **Node.js** ≥ 22
- **Rust**（通过 [rustup](https://rustup.rs) 安装）
- **Java** ≥ 21（用于运行 Minecraft 服务器）

## 快速开始

```bash
# 克隆并进入项目
git clone <仓库地址> && cd NeoCraft

# 安装依赖
npm install
cd server && npm install && cd ..
cd frontend && npm install && cd ..

# 一键启动所有组件（开发模式）
npm run dev
```

然后在浏览器中打开 **http://localhost:1145**。开发模式下，Vite 前端使用 `1145` 端口，并将 API 请求代理到 `3001` 端口上的 `neocraft-server`。

## 生产构建

```bash
# 构建所有组件
npm run build

# 启动生产服务器
node build/start.mjs
```

构建产物包括：
- 编译后的前端静态资源
- 编译后的 Node.js 服务端代码
- 生产环境服务端依赖
- Rust 守护进程二进制文件

生产模式默认在 **http://127.0.0.1:3001** 启动 `neocraft-server`。如需修改监听端口，可设置 `PORT` 或 `NEOCRAFT_PORT`。

## 手动启动（3 个终端）

**终端 1 — 守护进程：**
```bash
cd daemon && cargo run
```

**终端 2 — API 服务：**
```bash
cd server && npm run dev
```

**终端 3 — 前端：**
```bash
cd frontend && npm run dev
```

## 项目结构

```
NeoCraft/
├── daemon/                    # Rust 守护进程 — Minecraft 进程管理
│   ├── src/
│   │   ├── main.rs            # 入口，CLI 参数解析
│   │   ├── lib.rs             # 模块声明
│   │   ├── handler.rs         # IPC 请求分发
│   │   ├── ipc.rs             # JSON-Lines IPC 服务端（含认证）
│   │   ├── transport.rs       # Unix Socket / Windows 命名管道抽象层
│   │   ├── instance.rs        # 服务器实例生命周期管理
│   │   ├── protocol.rs        # 请求/响应/事件消息类型定义
│   │   ├── monitor.rs         # CPU 和内存资源监控
│   │   ├── logpipe.rs         # 标准输出/错误输出捕获与流式传输
│   │   ├── downloader.rs      # JAR 下载器（含进度报告和缓存）
│   │   ├── detect.rs          # 服务器类型自动检测
│   │   ├── files.rs           # 服务器配置文件读写
│   │   ├── instance_files.rs  # 实例目录安全文件操作
│   │   ├── java_args.rs       # JVM 参数构建器
│   │   ├── management.rs      # SMP/RCON 配置与供应
│   │   ├── paths.rs           # 路径解析工具
│   │   ├── auth.rs            # 令牌生成与验证
│   │   └── util.rs            # 通用工具函数
│   └── tests/                 # Rust 单元测试和集成测试
├── server/                    # Node.js API 服务端 (Fastify)
│   ├── src/
│   │   ├── app.ts             # 应用组装 — 插件、钩子、路由
│   │   ├── index.ts           # 入口
│   │   ├── config.ts          # 运行时配置与路径解析
│   │   ├── routes/
│   │   │   ├── config.ts      # 服务器配置 CRUD 端点
│   │   │   ├── instances.ts   # 实例生命周期 + 文件管理端点
│   │   │   └── versions.ts    # Minecraft 版本列表端点
│   │   ├── services/
│   │   │   ├── ipc-client.ts      # Unix Socket / 命名管道客户端
│   │   │   ├── daemon-runtime.ts  # 守护进程生命周期管理（自动启停）
│   │   │   ├── version-service.ts # Minecraft 版本元数据获取
│   │   │   ├── rcon-client.ts     # RCON 协议客户端
│   │   │   └── mod-service.ts     # Mod 扫描与解析服务
│   │   └── websocket/
│   │       └── hub.ts         # WebSocket 客户端中枢（实时事件推送）
│   └── tests/
├── frontend/                  # React 单页应用 (Vite + Tailwind CSS)
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx  # 实例概览 — 列表、启动/停止、资源统计
│   │   │   ├── Setup.tsx      # 新建服务器向导
│   │   │   ├── Console.tsx    # 实时日志查看器 + 命令输入
│   │   │   ├── Config.tsx     # server.properties 编辑器 + MOTD 生成器
│   │   │   └── Management.tsx # SMP/RCON 服务器运维面板
│   │   ├── components/
│   │   │   ├── layout/        # 侧边栏导航
│   │   │   ├── management/    # SMP/RCON 标签页（概览、玩家、聊天等）
│   │   │   ├── config/        # MOTD 生成器对话框
│   │   │   └── ui/            # 通用 UI 组件（空状态、错误横幅等）
│   │   ├── hooks/             # useWebSocket, useSmpConnection
│   │   ├── stores/            # Zustand 状态管理 (instanceStore)
│   │   ├── contexts/          # 主题上下文（浅色/深色/MC经典/MC现代）
│   │   ├── lib/               # API 客户端、SMP 客户端、类型定义、工具函数
│   │   └── i18n/              # 翻译文件（en, zh-CN, ja）
│   └── ...
├── scripts/                   # 开发、构建和工具脚本
├── docs/                      # 设计文档
├── package.json               # 仓库根 — 工作区脚本
└── .gitignore
```

## API 端点

| 方法 | 路径 | 说明 |
|--------|------|-------------|
| GET | `/api/health` | 健康检查（守护进程连接状态） |
| GET | `/api/instances` | 列出所有服务器实例 |
| POST | `/api/instances` | 创建新的服务器实例 |
| GET | `/api/instances/:id` | 获取实例详情 |
| DELETE | `/api/instances/:id` | 删除实例 |
| POST | `/api/instances/:id/start` | 启动服务器 |
| POST | `/api/instances/:id/stop` | 停止服务器 |
| POST | `/api/instances/:id/restart` | 重启服务器 |
| POST | `/api/instances/:id/command` | 发送控制台命令 |
| POST | `/api/instances/:id/import` | 导入已有服务器目录 |
| GET | `/api/instances/:id/config` | 获取 `server.properties` |
| PUT | `/api/instances/:id/config` | 更新 `server.properties` |
| GET | `/api/instances/:id/files` | 列出实例目录文件 |
| GET | `/api/instances/:id/files/read` | 读取文件内容 |
| PUT | `/api/instances/:id/files/write` | 写入文件 |
| DELETE | `/api/instances/:id/files` | 删除文件 |
| PUT | `/api/instances/:id/files/rename` | 重命名文件 |
| POST | `/api/instances/:id/rcon` | 发送 RCON 命令 |
| POST | `/api/instances/:id/mods/scan` | 扫描已安装模组 |
| GET | `/api/instances/:id/mods` | 列出已安装模组 |
| GET | `/api/versions` | 列出可用的 Minecraft 版本 |
| GET | `/api/versions/fabric` | 列出可用的 Fabric Loader 版本 |
| WS | `/ws` | 实时事件（日志、统计、状态变更、下载进度） |

## 守护进程 IPC 协议

守护进程通过 Unix Socket（macOS/Linux）或命名管道（Windows）上的 JSON-Lines 协议进行通信。每条消息是一个以换行符结尾的 JSON 对象。

### 支持的方法

| 方法 | 说明 |
|--------|-------------|
| `instance.list` | 列出所有实例 |
| `instance.create` | 创建新实例 |
| `instance.get` | 获取实例详情 |
| `instance.delete` | 删除实例 |
| `instance.start` | 启动实例 |
| `instance.stop` | 停止实例 |
| `instance.restart` | 重启实例 |
| `instance.command` | 发送控制台命令 |
| `instance.import` | 导入已有服务器 |
| `download.start` | 开始下载服务器 JAR |
| `download.cancel` | 取消下载 |
| `config.get` | 读取 `server.properties` |
| `config.set` | 写入 `server.properties` |
| `monitor.subscribe` | 订阅资源统计 |
| `monitor.unsubscribe` | 取消订阅资源统计 |
| `files.list` | 列出目录内容 |
| `files.read` | 读取文件内容 |
| `files.write` | 写入文件 |
| `files.delete` | 删除文件 |
| `files.rename` | 重命名文件 |

### 事件（推送）

| 事件 | 说明 |
|-------|-------------|
| `instance.log` | 服务器日志行 |
| `instance.state_change` | 服务器状态变更 |
| `download.progress` | JAR 下载进度 |
| `instance.stats` | CPU/内存/运行时长统计 |

## 测试

```bash
# 运行所有测试
npm test

# 按组件单独测试
npm run test:daemon    # Rust 守护进程 (cargo test)
npm run test:server    # Node.js API 服务 (vitest)
npm run test:frontend  # 前端 (vitest)
```

## 配置

### 守护进程 CLI 选项

```
neocraft-daemon [OPTIONS]
  --socket <路径>     IPC Socket 路径 / 管道名称（默认：平台特定路径）
  --data-dir <路径>   实例和配置数据目录（默认：~/.neocraft）
```

守护进程在 macOS/Linux 上使用 Unix Socket，在 Windows 上使用命名管道；它不会绑定 TCP `1145` 端口。

### 服务端环境变量

| 变量 | 说明 | 默认值 |
|----------|-------------|---------|
| `PORT` | API 服务监听端口 | `3001` |
| `HOST` | API 服务监听地址 | `127.0.0.1` |
| `NEOCRAFT_SOCKET` | 守护进程 IPC Socket 路径 / 管道名称 | 平台默认 |
| `NEOCRAFT_FRONTEND_DIST` | 前端静态文件路径 | `frontend-dist` |
| `NEOCRAFT_AUTO_START_DAEMON` | 服务启动时自动启动守护进程 | `true` |
| `NEOCRAFT_CORS_ORIGINS` | 允许的 CORS 来源（逗号分隔） | `http://localhost:1145`, `http://127.0.0.1:1145`, `http://localhost:3001`, `http://127.0.0.1:3001`, `http://localhost:3000` |

## 支持的服务器类型

| 类型 | 说明 | 自动下载 |
|------|-------------|:---:|
| **Vanilla** | Mojang 官方 Minecraft 服务器 | ✓ |
| **Paper** | 高性能优化版，支持插件 | ✓ |
| **Spigot** | 流行的 Bukkit 衍生版 | ✓ |
| **Fabric** | 轻量级模组平台 | ✓ |
| **Forge** | 经典模组平台 | ✓ |
| **Custom** | 任意服务器 JAR（需手动提供下载链接） | ✓ |

## 开源协议

MIT
