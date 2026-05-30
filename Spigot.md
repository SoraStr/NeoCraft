🔍 社区检查更新接口
尽管官方不提供版本列表，但 Spigot 服务端内部会通过一个 HTTP 接口检查更新，主要用于自身的新版本提示。

获取最新版本: https://hub.spigotmc.org/versions/latest.json

获取所有版本列表: https://hub.spigotmc.org/versions/

注意：versions/ 页面返回的是HTML，但你可以通过解析 HTML 获取版本列表。

局限：latest.json 只有最新版本号，而解析HTML的方式则相当不便。
