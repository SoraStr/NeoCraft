⚙️ 官方途径：使用Mojang API
此方法通过两步可以精确地获取任一版本的服务器jar文件。

1. 获取版本清单
首先，你需要获取官方维护的版本清单文件。这个JSON文件列出了所有可用的Java版游戏版本。

API 端点: https://launchermeta.mojang.com/mc/game/version_manifest_v2.json

以下是返回的JSON数据示例及解析：

json
{
  "latest": { // 最新的稳定版和快照版的版本ID
    "release": "1.21.1",
    "snapshot": "1.21.1"
  },
  "versions": [ // 所有版本信息的列表
    {
      "id": "1.21.1",        // 版本ID，后续请求会用到
      "type": "release",     // 版本类型，例如 "release" 或 "snapshot"
      "url": "https://piston-meta.mojang.com/v1/packages/.../1.21.1.json", // 详细信息的JSON文件链接
      "time": "2024-08-06T09:34:39+00:00",
      "releaseTime": "2024-08-06T09:24:35+00:00"
    },
    // ... 更多版本
  ]
}
（示例数据基于当前常见结构，具体字段请以实际返回的JSON为准）

2. 解析版本信息获取下载URL
拿到清单后，找到你想下载版本的url字段，访问该链接就能得到一份更详细的JSON文件，里面就包含了服务器的下载地址。

API 端点 (示例): https://piston-meta.mojang.com/v1/packages/.../1.21.1.json

以下是返回的详细JSON数据示例及解析：

json
{
  "downloads": { // 包含客户端和服务器端的下载信息
    "client": { // 客户端jar文件信息
      "sha1": "0f4eaba2ffb...",
      "size": 10142645,
      "url": "https://piston-data.mojang.com/v1/objects/.../client.jar"
    },
    "server": { // 服务器jar文件信息 ⬅️ 目标就在这里
      "sha1": "329dc957a4e...",
      "size": 4996327,
      "url": "https://piston-data.mojang.com/v1/objects/.../server.jar" // 🔗 服务器下载地址
    }
  },
  // ... 其他信息
}
（示例数据基于当前常见结构，具体字段请以实际返回的JSON为准）
