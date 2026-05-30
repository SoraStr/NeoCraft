Paper官方专门提供了一个下载服务（Downloads Service），可以返回JSON格式的版本和下载信息。

具体的API端点和下载链接构造方法如下：

📡 PaperMC 官方下载 API 架构
API Base URL: https://api.papermc.io/v2/projects

补充说明: API请求需要包含有效的 User-Agent 头信息，目前的版本是 v2。

🧭 API 端点与使用指南
获取所有可用版本 (Versions)

请求方法: GET

API 端点: https://api.papermc.io/v2/projects/paper

返回结构 (JSON): 返回数据中的 versions 字段是一个字符串数组，包含了所有可用的 Minecraft 主版本号（如 "1.20.4", "1.20.6", "1.21" 等）。

json
{
  "project_id": "paper",
  "version_groups": [...],
  "versions": ["1.21", "1.20.6", "1.20.4", ...]
}
获取指定版本的所有构建号 (Builds)

请求方法: GET

API 端点: https://api.papermc.io/v2/projects/paper/versions/{版本号}

返回结构 (JSON): 返回数据中的 builds 字段是一个数组，其中包含了该 Minecraft 版本下的所有 Paper 构建（Build）编号。通常取最后一个元素即为最新构建。

json
{
  "project_id": "paper",
  "version": "1.20.4",
  "builds": [387, 388, 389, ...]
}
构造下载链接

通用模式: https://api.papermc.io/v2/projects/paper/versions/{版本号}/builds/{构建号}/downloads/paper-{版本号}-{构建号}.jar

获取最新版本: https://papermc.io/api/v2/projects/paper/versions/{版本号}/builds/latest/downloads/paper-{版本号}-latest.jar。（不过更建议使用上面两步先查询后再用明确的Build号来下载，链接更精确）
