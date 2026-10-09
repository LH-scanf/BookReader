<div align="center">

<img src="public/favicon.svg" alt="BookReader 图标" width="76" height="76">

# BookReader

**Read quietly. Keep what matters.**

一款本地优先的 EPUB 阅读器。Windows 桌面端与 iPhone PWA 各有适合自己的界面，让阅读、摘录和笔记保持简单。

[![Release v0.2.1](https://img.shields.io/badge/release-v0.2.1-667C7A?style=flat-square)](https://github.com/LH-scanf/BookReader/releases/tag/v0.2.1)
![Windows Desktop](https://img.shields.io/badge/Windows-Desktop-667C7A?style=flat-square)
![iPhone PWA](https://img.shields.io/badge/iPhone-PWA-667C7A?style=flat-square)

[Download](#download) · [Documentation](docs/README.md) · [Releases](https://github.com/LH-scanf/BookReader/releases)

</div>

## 在哪里阅读

| Windows Desktop | iPhone PWA |
| --- | --- |
| 安装桌面程序，选择本机书库，打开 EPUB 继续阅读。 | 从已部署的 HTTPS 站点添加到主屏幕，随时打开本机书库。 |

> **产品截图待补。** 仓库目前没有可用的实机截图。需要两张脱敏素材：Windows 桌面端的书库与阅读界面、iPhone Safari 添加到主屏幕后启动的 Mobile 阅读界面。补齐前不展示占位图或模拟 UI。

## 为阅读而做

- **本地优先：** 已保存的书籍、阅读进度和笔记可在离线时使用。
- **专注 EPUB：** 目录、书内搜索、阅读主题与位置恢复，方便接着读。
- **留下想法：** 高亮、摘录感悟和整书笔记集中整理。
- **可选同步：** 连接 OneDrive AppFolder，在设备间同步书库；阅读不依赖登录。

## Download

**Windows：** 下载 [v0.2.1 安装包](https://github.com/LH-scanf/BookReader/releases/download/v0.2.1/BookReader_0.2.1_x64-setup.exe)，运行安装后选择本机书库并导入 EPUB。[查看该版本说明](https://github.com/LH-scanf/BookReader/releases/tag/v0.2.1)。

**iPhone PWA：** 当前没有公开体验地址。自行部署 Web 版后，用 iPhone Safari 打开 HTTPS 地址，点「分享」→「添加到主屏幕」，再从主屏幕启动。部署步骤见 [部署文档](docs/DEPLOYMENT.md)。

> 公开下载的 v0.2.1 是较早的 Windows 版本；仓库中的 Mobile/PWA 与同步改进仍处于 V1 发布准备阶段，尚未作为新 Release 发布。[查看当前项目状态](docs/CURRENT_STATE.md)。

## 文档与开发

从 [文档入口](docs/README.md) 了解项目；按需阅读 [当前状态](docs/CURRENT_STATE.md)、[部署与运行](docs/DEPLOYMENT.md) 和 [架构](docs/ARCHITECTURE.md)。

技术栈：Tauri 2 · React · TypeScript · Rust · epub.js。开发环境需要 Node.js、Rust，以及 Windows 桌面端所需的 WebView2。

```powershell
npm install
npm run dev          # Web/PWA
npm run tauri dev    # Windows Desktop
```

构建、Microsoft 配置和验收说明见 [部署文档](docs/DEPLOYMENT.md) 与 [测试文档](docs/TESTING.md)。
