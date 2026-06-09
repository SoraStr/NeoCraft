# NeoCraft Minecraft 主题设计方案

## 概述
在 NeoCraft（Minecraft 服务器控制面板）中构建沉浸式 Minecraft 风格主题。
采用方案 C（全面组件重构），深度融入 Minecraft 视觉语言。

## 色彩体系

### 浅色（主世界 Overworld）
- 背景：#8BC34A（草地绿）
- 表面/卡片：#F5E6C8（羊皮纸/工作台色）
- 主色调：#4CAF50（草方块绿）/ 悬停：#388E3C
- 侧边栏：#4E342E（深色橡木）
- 文字：#3E2723（深棕色）
- 边框：#6D4C41（木材质感）
- 功能色：金锭 #FFD600 / 钻石 #4DD0E1 / 红石 #F44336 / 绿宝石 #00E676 / 青金石 #1565C0

### 深色（下界 Nether）
- 背景：#1A0505（深层下界）
- 表面：#2D1515（下界岩）
- 主色调：#FF6B35（下界橙）
- 侧边栏：#0D0303（黑曜石）
- 文字：#FFCCBC（暖白）

## 视觉特征
1. 像素化 3D 边框（box-shadow 模拟 MC 物品栏凸起/凹陷）
2. 顶部泥土横幅（CSS 渐变模拟草方块+泥土层）
3. 火把暖光悬停效果
4. 像素字体：标题 VT323，控制台 Press Start 2P
5. 状态指示器：绿宝石=运行，金锭=启动，红石=崩溃，石头=停止
6. Sidebar 像素图标，Dashboard 物品栏格子，Console 聊天框风格

## 主题切换
循环：浅色 → 深色 → Minecraft → Minecraft(下界) → 跟随系统
图标：太阳/月亮/镐子/下界传送门/显示器

## 实施文件
新增：minecraft-theme.css, MinecraftButton.tsx, PixelIcon.tsx
修改：ThemeContext.tsx, index.css, index.html, Sidebar.tsx, Dashboard.tsx,
       Console.tsx, Config.tsx, Management.tsx, EmptyState.tsx, ErrorBanner.tsx,
       LoadingSkeleton.tsx, OverviewTab.tsx
