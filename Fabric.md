⚙️ 方案一：官方 Fabric Meta API (推荐)
Fabric官方提供的这套JSON API非常成熟，拥有v1、v2和v3多个版本。目前v2版本功能最全且稳定，是开发者的首选，下面是它的主要端点。

📋 1. 获取所有支持的Minecraft版本列表
API 端点: GET https://meta.fabricmc.net/v2/versions/game

主要用途: 查询Fabric支持的所有Minecraft版本（包括正式版和快照）。

返回JSON示例:

json
[
  {
    "version": "1.20.4",
    "stable": true
  },
  {
    "version": "23w51a",
    "stable": false
  },
  // ...更多版本
]
version: Minecraft版本号。

stable: 是否为稳定版，true代表正式版，false则为快照版。

🧩 2. 获取所有Fabric Loader版本列表
API 端点: GET https://meta.fabricmc.net/v2/versions/loader

主要用途: 获取所有Fabric Loader加载器的版本号。

返回JSON示例:

json
[
  {
    "version": "0.15.11",
    "stable": true
  },
  {
    "version": "0.15.10",
    "stable": true
  }
  // ...更多版本
]
version: Fabric Loader的版本号。

stable: 是否为稳定版。

🎯 3. 获取特定版本的服务器下载信息
这是最关键的端点，通过组合游戏版本和Loader版本来直接获取服务器启动器（JAR文件）的详细信息。

API 端点: GET https://meta.fabricmc.net/v2/versions/loader/{游戏版本}/{加载器版本}/server/json

例如：https://meta.fabricmc.net/v2/versions/loader/1.20.4/0.15.11/server/json

主要用途: 根据给定的Minecraft版本和Fabric Loader版本，获取对应的服务端启动器JSON信息。

返回JSON示例:

json
{
  "id": "fabric-loader-0.15.11-1.20.4",
  "mainClass": "net.fabricmc.loader.impl.launch.knot.KnotServer",
  "libraries": [ ... ],
  "downloads": {
    "server": {
      "url": "https://meta.fabricmc.net/v2/versions/loader/1.20.4/0.15.11/0.10.1/server/jar",
      "sha1": "...",
      "size": ...
    }
  }
}
downloads.server.url: 这就是Fabric服务端核心JAR文件的直接下载链接。

mainClass: Fabric服务端的主类入口。

libraries: 启动服务端所依赖的所有库文件列表。

💎 4. 直接下载服务端JAR文件
如果你已经知道确切的版本号，可以直接下载。

API 端点: GET https://meta.fabricmc.net/v2/versions/loader/{游戏版本}/{加载器版本}/{安装器版本}/server/jar

例如：https://meta.fabricmc.net/v2/versions/loader/1.20.4/0.15.11/0.11.2/server/jar
