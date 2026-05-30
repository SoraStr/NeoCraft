Minecraft 服务器核心启动指令详解
一、启动指令的基本结构
启动任何 Minecraft 服务器都需要通过 Java 虚拟机（JVM）来运行服务端程序。一条完整的启动指令由以下几部分组成：

Java 可执行文件路径：默认为系统安装的 Java 环境路径

JVM 参数：以 -X、-XX 开头的内存和 GC 优化参数

核心文件路径：要运行的服务器 JAR 文件

附加参数：如 nogui 等

一条最基本的启动指令长这样：

bash
java -Xmx2G -Xms1G -jar server.jar nogui
其中各部分的含义将在下文逐一详解。

二、服务端核心选择
不同场景需要选择不同的服务端核心。在填写启动指令前，首先需要明确自己要用哪种核心。

1. 主要核心类型对比
核心类型	代表核心	插件支持	模组支持	适用场景
官方原版	Vanilla	❌ 不支持	❌ 不支持	纯粹原版体验，功能测试
插件核心	Spigot、Paper、Purpur	✅ 支持	❌ 不支持	生存服、小游戏服
模组核心	Forge、Fabric、NeoForge	❌ 不支持	✅ 支持	模组联机
混合核心	Mohist、Arclight、Sponge	✅ 支持	✅ 支持	插件+模组混合服
各核心的具体特点如下：

Vanilla（官方原版）：Mojang 官方发布的服务器程序，仅包含原版游戏内容，无任何额外优化。适合追求纯粹 Minecraft 玩法的玩家，但不支持插件和模组。

Spigot：基于 Bukkit 开发的主流插件服务端，引入“实体激活范围”等性能优化概念，性能稳定且兼容性好。适合刚开始接触插件服的新手服主。

Paper：Spigot 的进一步优化版本，在性能和多方面都优于 Spigot，是目前插件服的事实标准。

Fabric / Forge：模组服务端，分别代表两种不同的模组加载架构。如果开模组服，两者任选其一即可。

Folia：Paper 的新分支，引入了区域化多线程功能。需要至少 8 个以上物理核心才有效果，目前仍处于开发阶段。

混合核心（Mohist、Arclight 等）：同时支持 Forge 模组和 Bukkit/Spigot 插件，稳定性依赖版本，适合需要模组内容与插件管理兼顾的服主。

2. 如何选择
只需原版体验 → 使用 Vanilla 官方核心

只需插件管理 → 推荐 Paper（当前主流、性能最佳）

只需模组联机 → 根据模组生态选择 Fabric（轻量灵活）或 Forge（生态成熟）

需要插件+模组 → 尝试 Mohist 或 Arclight 等混合核心

三、JVM 参数详解
JVM 参数是 Minecraft 服务器启动指令中最复杂也最关键的部分。启动参数主要分为三类：标准参数（所有 JVM 都必须实现）、非标准参数（-X 开头）和非稳定参数（-XX 开头）。

1. 基础参数
参数	说明	示例
-server	以服务器模式运行，提升 JVM 性能。应作为第一个参数	java -server ...
-d64	强制使用 64 位 JVM（64 位系统和 Java 必需，32 位请去掉）	java -d64 ...
-jar <文件名>	指定要运行的 JAR 文件，必须是命令行的最后一个 JVM 参数	-jar paper.jar
nogui	禁用原版 GUI 控制台，减少 CPU 占用	... nogui
pause（仅 Windows）	让命令行窗口在服务器关闭后暂停，便于查看错误信息	放在 .bat 脚本末尾
-cp / -classpath	指定依赖库和主类的路径（通常不需要手动使用，用 -jar 即可）	-cp ./libraries/*
2. 内存参数
参数	说明	推荐设置
-Xms<size>	设置 JVM 初始堆内存大小	与 -Xmx 设为相同值
-Xmx<size>	设置 JVM 最大堆内存大小	根据服务器配置和玩家数调整
-Xss<size>	设置每个线程的栈大小	一般保持默认，特殊调优时可用 -Xss128k
-Xms 和 -Xmx 建议设置为相同的值，这样可以避免每次垃圾回收后 JVM 反复重新分配内存，从而减少性能波动。常见分配参考：小型纯净服 2-4 GB，中型模组服 6-12 GB。也不要分配过高的内存，否则反而会损害性能。

3. 垃圾回收（GC）参数详解
GC 参数根据 JVM 版本不同而有差异。建议根据使用的 Java 版本采用对应的优化方案。

（1）Java 8 环境
Java 8 常用 CMS（Concurrent Mark Sweep）回收器：

bash
-XX:+UseConcMarkSweepGC -XX:+UseParNewGC -XX:+CMSConcurrentMTEnabled -XX:ParallelGCThreads=8 -XX:MaxGCPauseMillis=50 -XX:+AlwaysPreTouch -XX:+UseStringDeduplication -XX:NewRatio=3
参数说明：

-XX:+UseConcMarkSweepGC：为年老代使用并发回收

-XX:+UseParNewGC：为年轻代使用并发回收，缩短回收时间

-XX:ParallelGCThreads=8：设置 GC 并行线程数（建议设为 CPU 核心数）

-XX:MaxGCPauseMillis=50：GC 最大停顿时间目标（毫秒）

-XX:+AlwaysPreTouch：启动时预先分配所有内存，减少运行时延迟

-XX:+UseStringDeduplication：去重重复字符串，节省内存

注意：如果 Java 版本在 8u271 附近，上述 CMS 参数表现良好。但对于一般开服场景，更建议使用 Java 17+ 配合 G1GC。

（2）Java 17 / 21 / 25 环境（推荐，支持 G1GC）
Minecraft 服务器的工作负载特点是：产生大量短生命周期对象、频繁分配内存。G1GC（Garbage-First Garbage Collector）专门针对这类场景设计。

Aikar's Flags 是目前业界公认最推荐的 Minecraft 服务器 JVM 启动参数集，由 PaperMC 贡献者 Aikar 设计：

12GB 内存以下的服务器使用：

bash
-Xms{RAM}M -Xmx{RAM}M -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -Daikars.new.flags=true
12GB 内存以上需要调整以下参数：

参数	原值	新值	原因
G1NewSizePercent	30	40	更大堆需要更大年轻代初始比例
G1MaxNewSizePercent	40	50	更大年轻代空间，容纳更多对象
G1HeapRegionSize	8M	16M	大堆需要更大的 Region 以降低 GC 开销
G1ReservePercent	20	15	大堆可用预留空间更少
InitiatingHeapOccupancyPercent	15	20	大堆可稍晚触发并发标记
该套参数的核心目标是最小化 GC 停顿时间，提升内存使用效率，避免长时间的“Stop-The-World”事件。

注意：Minecraft 26.1+（对应 1.21+）需要 Java 25 或以上版本。Aikar's Flags 最初是为 Java 21 调校的，部分参数可能需要根据 Java 25 的实际表现重新校准。PaperMC 官方表示 Aikar's Flags 不推荐用于 Java 25。建议在切换 Java 版本时查阅 PaperMC 官方文档获取最新推荐参数。

常用 G1GC 参数速查表：

参数	作用	推荐值
-XX:+UseG1GC	启用 G1GC 回收器	必须
-XX:MaxGCPauseMillis=200	设置最大 GC 停顿时间	200ms
-XX:+ParallelRefProcEnabled	并行处理引用	必须开启
-XX:+DisableExplicitGC	禁用显式 GC 调用	必须开启
-XX:G1NewSizePercent=30	年轻代初始比例	≤12GB:30; >12GB:40
-XX:G1MaxNewSizePercent=40	年轻代最大比例	≤12GB:40; >12GB:50
-XX:G1HeapRegionSize=8M/16M	堆 Region 大小	≤12GB:8M; >12GB:16M
-XX:MaxTenuringThreshold=1	对象提升阈值	1（优化短生命周期）
-XX:SurvivorRatio=32	Eden 与 Survivor 比例	32
（3）低资源服务器优化（2核4G，4核8G）
对于内存和 CPU 资源非常有限的环境，G1GC 可能造成额外开销，可用以下参数集：

bash
-Xms512M -Xmx2500M -XX:SoftMaxHeapSize=1500M -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -XX:G1ReservePercent=20 -XX:G1MixedGCCountTarget=4 -XX:+DisableExplicitGC -XX:+UseStringDeduplication -XX:+UseCompactObjectHeaders -XX:G1PeriodicGCInterval=60000 -XX:MaxHeapFreeRatio=30 -XX:MinHeapFreeRatio=10 -XX:-ShrinkHeapInSteps -XX:SurvivorRatio=32 -XX:MaxTenuringThreshold=1 -XX:InitiatingHeapOccupancyPercent=20 -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M
调优核心思路是：放大 Eden，压缩 Survivor，让对象尽快结束在年轻代的搬运；同时降低 IHOP 阈值，让并发标记更早开始。如果内存小于 1GB，甚至可以考虑使用 -XX:+UseSerialGC 替代 G1GC。

四、server.properties 配置文件详解
服务器启动后会在根目录下生成 server.properties 配置文件。该文件包含了服务器的各项运行设置。

1. 基础设置
属性	类型	默认值	说明
server-port	整数	25565	服务器端口，同一端口不能运行多个服务器
max-players	整数	20	服务器最大同时在线人数
motd	字符串	"A Minecraft Server"	服务器在客户端列表中显示的消息
online-mode	布尔值	true	是否开启正版验证（不开则盗版可进，但可能破坏）
difficulty	字符串	easy	游戏难度：peaceful/easy/normal/hard
gamemode	字符串	survival	默认游戏模式：survival/creative/adventure/spectator
level-name	字符串	world	世界文件夹名称
level-seed	字符串	（空）	世界种子
allow-nether	布尔值	true	是否允许进入下界
enable-command-block	布尔值	false	是否启用命令方块
2. 性能与优化设置
属性	类型	默认值	说明
view-distance	整数	10	玩家可见视距，降低可显著提升性能
simulation-distance	整数	10	模拟距离，控制区块内实体更新范围
network-compression-threshold	整数	256	网络包压缩阈值
max-tick-time	整数	60000	单 tick 最长毫秒数，设为 -1 可禁用强制关服检测
entity-broadcast-range-percentage	整数（10-1000）	100	实体渲染距离百分比，降低可减少负载
性能优化建议：

view-distance 建议设为 6-10，越低性能越好

simulation-distance 建议低于 view-distance

network-compression-threshold=256 通常是最优值

若出现“A single server tick took 60.00 seconds”报错，可将 max-tick-time 设为 -1 禁用强制关服检测

3. 安全与规则设置
属性	类型	默认值	说明
allow-flight	布尔值	false	是否允许飞行（允许可能助长恶意破坏）
enforce-whitelist	布尔值	false	是否强制执行白名单
enable-rcon	布尔值	false	是否允许远程访问控制台（不推荐暴露在互联网）
spawn-protection	整数	16	出生点保护半径
五、各核心专用启动指令
1. Vanilla（官方原版）
bash
java -Xmx2G -Xms2G -jar minecraft_server.1.21.jar nogui
首次启动后需要同意 EULA：编辑根目录下生成的 eula.txt，将 eula=false 改为 eula=true。

2. Paper / Spigot
bash
java -Xms4G -Xmx4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem -XX:MaxTenuringThreshold=1 -Dusing.aikars.flags=https://mcflags.emc.gs -jar paper-1.21.jar nogui
提示：PaperMC 官方提供 Startup Script Generator 自动生成优化的启动命令。

3. Forge（模组服）
Forge 安装后会生成 run.bat（Windows）或 run.sh（Linux/macOS）。编辑 user_jvm_args.txt 配置内存：

bash
# 在 user_jvm_args.txt 中
-Xmx4G
-Xms4G
然后执行 run.bat 或 ./run.sh 即可启动。

如需禁用 GUI，可在启动脚本中添加 nogui 参数。

4. Fabric（模组服）
Fabric 安装器可以自动生成启动脚本：

bash
java -Xms1024M -Xmx2048M -jar fabric-server-launch.jar nogui
完整安装流程：

访问 fabricmc.net/use 选择 Server 选项

选择 Minecraft 版本和 Loader 版本

安装后即可生成启动脚本和 server.properties

5. 混合核心（Mohist / Arclight）
bash
java -Xms6G -Xmx6G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:SurvivorRatio=32 -XX:MaxTenuringThreshold=1 -jar mohist-1.20.1-server.jar nogui
六、启动脚本编写
1. Windows（.bat）
batch
@echo off
cd /d "%~dp0"
java -Xmx4G -Xms4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -jar paper-1.21.jar nogui
pause
将上述内容保存为 start.bat，放在服务端根目录下，双击即可启动。

2. Linux / macOS（.sh）
bash
#!/bin/bash
cd "$(dirname "$0")"
java -Xmx4G -Xms4G -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -jar paper-1.21.jar nogui
保存为 start.sh，运行前执行 chmod +x start.sh 赋予执行权限。

3. 自动重启脚本（Linux）
bash
#!/bin/bash
while true
do
    java -Xmx4G -Xms4G -XX:+UseG1GC -jar server.jar nogui
    echo "Server crashed, restarting in 5 seconds..."
    sleep 5
done
此脚本会在服务器崩溃后自动重启，适合需要高可用性的生产环境。

七、常见启动报错及解决方案
1. Java 环境相关
报错现象	原因	解决方案
'java' 不是内部或外部命令	Java 未安装或环境变量未配置	安装对应版本的 Java 并配置 PATH
UnsupportedClassVersionError	Java 版本过低或不兼容	1.16.x 以下用 Java 8，1.17-1.19 用 Java 17，1.20-1.21 用 Java 21
Could not create the Java Virtual Machine	内存参数设置错误	检查 -Xms 和 -Xmx 参数值
2. 内存相关
报错现象	原因	解决方案
OutOfMemoryError	分配的内存不足	增加 -Xmx 的值
OutOfMemoryError: Metaspace	持久代内存不足	添加 -XX:MaxMetaspaceSize=256M（Java 8+）
Java 崩溃无提示	分配内存超过物理可用内存	减少 -Xmx 的值
3. 核心文件与配置相关
报错现象	原因	解决方案
You need to agree to the EULA	未同意最终用户许可协议	将 eula.txt 中的 eula=false 改为 eula=true
Address already in use	端口被占用	更改 server.properties 中的端口或关闭占用进程
下载的 JAR 文件无法运行	核心文件损坏或下载源不可靠	从官方来源重新下载
4. 插件/模组相关
报错现象	原因	解决方案
NoClassDefFoundError	缺失依赖	安装所需的前置插件或模组
启动时报大量 ERROR	插件不兼容或版本不匹配	检查插件是否适配当前服务端版本
排查故障的第一原则：先查看日志文件。服务器根目录下的 logs/latest.log 包含了详细的启动过程和错误信息，通常在日志中用 ERROR 或 WARN 标注。崩溃报告可在 crash-reports/ 文件夹中找到。

八、速查表
1. Java 版本对照
Minecraft 版本	推荐 Java 版本
1.7.10 - 1.11	Java 8
1.12 - 1.16.4	Java 11
1.17 - 1.19	Java 17
1.20 - 1.21.11	Java 21
26.1+	Java 25
2. 内存分配参考
服务器类型	玩家数	推荐内存
小型纯净服	≤10	2-4 GB
中型纯净服	10-30	4-6 GB
中型模组服	≤10	6-8 GB
大型模组服	10-30	8-12 GB
3. JVM 黄金法则
-Xms 等于 -Xmx：防止 Java 运行时动态调整堆大小造成性能波动

不要分配超过物理内存 80%：为操作系统和 JVM 自身保留开销空间

先看日志再问问题：99% 的问题都能在 latest.log 中找到线索

4. server.properties 示例：
# ========== 网络与通信 ==========
server-port=25565               # 服务器端口（默认25565）
server-ip=                      # 留空表示监听所有网卡，如需绑定特定IP请填写
max-players=20                  # 最大在线人数
online-mode=true                # 是否开启正版验证（true=仅正版玩家，false=离线模式，建议保持true）
enable-query=false              # 是否启用GameSpy4查询协议（外置工具获取服务器状态）
enable-rcon=false               # 是否启用远程控制台（RCON），危险！非必要不开启
rcon.port=25575                 # RCON端口（enable-rcon=true时生效）
rcon.password=                   # RCON密码（必须设置强密码）

# ========== 游戏玩法 ==========
gamemode=survival               # 默认游戏模式：survival/creative/adventure/spectator
difficulty=normal               # 难度：peaceful/easy/normal/hard
allow-nether=true               # 是否允许下界
allow-end=true                  # 是否允许末地
spawn-monsters=true             # 是否生成敌对生物
spawn-animals=true              # 是否生成动物
spawn-npcs=true                 # 是否生成村民等NPC
pvp=true                        # 是否允许玩家互相攻击
force-gamemode=false            # 是否强制所有玩家使用默认游戏模式
allow-flight=false              # 是否允许飞行（设为true可避免反作弊误判，但有作弊风险）

# ========== 世界生成与存储 ==========
level-name=world                # 主世界文件夹名称
level-seed=                     # 世界种子（留空则随机）
generate-structures=true        # 是否生成村庄、遗迹等结构
max-world-size=29999984         # 世界边界半径（单位：方块），默认约3000万
level-type=minecraft:normal     # 世界类型：normal/flat/large_biomes/amplified/single_biome_surface
generator-settings=             # 用于超平坦或单一生物群系的详细设置（JSON或预设字符串）
spawn-protection=16             # 出生点保护半径（非OP玩家无法破坏）

# ========== 性能优化 ==========
view-distance=10                # 玩家可见区块半径（降低可提升性能，推荐6-10）
simulation-distance=10          # 实体模拟区块半径（影响CPU，建议≤视距）
entity-broadcast-range-percentage=100  # 实体广播距离百分比（降低可减少网络流量）
max-tick-time=60000             # 单个tick最长毫秒数（-1=禁用检测，防止误关服）
network-compression-threshold=256      # 数据包压缩阈值（字节）
sync-chunk-writes=true          # 是否同步写入区块（true=数据安全，false=性能略高）
use-native-transport=true       # 是否使用操作系统原生网络传输（提升性能）

# ========== 聊天与信息 ==========
motd=A Minecraft Server         # 服务器在客户端列表中显示的信息（支持§颜色代码）
announce-advancements=true      # 是否广播玩家进度
enable-status=true              # 是否响应服务器状态请求（false会使服务器隐藏）
broadcast-console-to-ops=true   # 是否将控制台输出广播给在线OP
broadcast-rcon-to-ops=true      # 是否将RCON输出广播给在线OP

# ========== 管理 ==========
op-permission-level=4           # OP权限等级：1-4，4为最高（所有命令）
function-permission-level=2     # 执行数据包函数时的权限等级
white-list=false                # 是否启用白名单
enforce-whitelist=false         # 是否强制踢出不在白名单中的在线玩家

# ========== 高级/安全 ==========
enforce-secure-profile=false    # 是否强制要求安全聊天签名（1.19.1+，设为false可兼容低版本）
prevent-proxy-connections=false # 是否阻止已知代理/VPN连接（需online-mode=true）
resource-pack=                  # 强制使用的资源包下载URL
require-resource-pack=false     # 是否强制玩家接受资源包（1.17+）
text-filtering-config=          # 聊天过滤配置文件路径

# ========== 其他（可能被移除或不常用） ==========
snooper-enabled=false           # 是否向Mojang发送匿名数据（建议关闭）
use-native-transport=true       # 已在性能部分提及，此处不再重复
