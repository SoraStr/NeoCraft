# Minecraft 主题设计文档

## 概述
为 NeoCraft 控制面板新增两个 Minecraft 主题：
- `mc-classic` — 经典像素风，忠实还原 MC 原版 UI
- `mc-modern` — 现代像素融合，专业 UI + MC 元素点缀

## 架构方案
扩展 Theme 类型：`'light' | 'dark' | 'system' | 'mc-classic' | 'mc-modern'`
- `mc-classic` → `<html>` 添加 `.mc-classic` 类
- `mc-modern` → `<html>` 添加 `.mc-modern` 类
- 两个主题覆盖同一套 CSS Token，可添加主题专属 CSS 类

## mc-classic 色彩体系
- 主色(草绿): #5B8731 | 辅色(泥土棕): #866043
- 钻石蓝: #2CBCB5 | 红石红: #B02E26 | 金锭黄: #FED83D
- 背景: #2D2D2D (深石灰) | 表面: #373737 | 侧边栏: #C6C6C6 (物品栏灰)
- 边框: 3D凸起效果(亮边#555555/暗边#1E1E1E)
- 圆角: 0px (完全方正)
- 字体: Press Start 2P (标题), VT323 (正文)

## mc-modern 色彩体系
- 主色(草绿): #5B8731 | 保持 Plus Jakarta Sans 字体
- 暗色基底 + 极淡方块网格 pattern
- 卡片保持圆角 8px + 现代阴影 + 左侧像素化色条
- 圆角: 6-8px

## 涉及文件
- contexts/ThemeContext.tsx — 扩展类型
- index.css — 新增 Token 覆写 + 像素纹理
- components/layout/Sidebar.tsx — 主题切换器
