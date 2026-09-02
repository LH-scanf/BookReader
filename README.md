# BookReader

BookReader 是本地优先的 EPUB 阅读器，使用 Tauri 2、React、TypeScript、Rust 与 epub.js 构建，面向 Windows Desktop 和 Web/PWA。

## 核心能力

- 本地 EPUB 书库、阅读位置恢复、目录、搜索与阅读主题。
- 高亮、摘录感悟与整书笔记。
- 可选 OneDrive AppFolder 同步、软删除/恢复与离线使用。

## 开发与构建

```powershell
npm install
npm run dev
npm run build
npm run build:desktop
npm run tauri dev
npm run tauri build
npm test
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

详细文档请从 [docs/README.md](docs/README.md) 开始。
