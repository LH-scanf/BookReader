# BookReader 项目地图

更新：2026-08-26 · 当前开发版本：0.2.4

## 文档入口

- [开发计划与历史](DEVELOPMENT.md)：需求、版本阶段与交付说明。
- [项目功能用例](feature-use-cases.md)：使用路径、预期结果与验收清单。
- [Bug 修复时间线](bugfix-timeline.md)：现象、根因、改动位置、验证状态。
- [PWA 首版需求与基线](PWA-PLAN.md)：已确认范围、软删除约定、架构方案与后续开发顺序。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 书库、设置、独立整书笔记页面；图书操作；监听 `library-changed` 刷新书库快照 |
| `src/EpubReader.tsx` | EPUB 渲染、翻页/滚动、目录、主题、脚注、搜索、高亮、进度保存及同步定位仲裁 |
| `src/library-api.ts` | 前端与 Tauri 命令桥接；文件/目录选择 |
| `src/types.ts` | 前后端传输的数据模型 |
| `src/styles.css` | 页面、主题与阅读布局；滚动条样式 |
| `index.html` | 首屏渲染前恢复全局外观，避免深色启动时短暂显示浅色 |
| `src-tauri/src/lib.rs` | 书库文件读写、EPUB 解析、封面、进度/批注/笔记持久化、目录轮询监听 |
| `src-tauri/tauri.conf.json` | 桌面窗口、前端构建和 Windows 打包配置 |
| `scripts/start-dev.ps1` | 开发启动辅助脚本 |

## 数据流与边界

```text
用户翻页 → epub.js relocated → 阅读器内存 CFI → 700ms 防抖保存
                                              ↓
                                 progress/<bookId>/<deviceId>.json
                                              ↓
目录指纹轮询（900ms）→ library-changed → App 延迟350ms读取书库快照
                                              ↓
                         本机进度：仅刷新快照，不反向导航
                         其他设备：仅更新且不早于本地操作的记录可自动定位
```

- 打开图书时，从书库快照的最新 CFI 开始；阅读器重排/切换模式使用当前显示位置。
- 本机落盘和网盘同步都会改变目录；`library-changed` **不等同于远程导航指令**。
- 进度来源由每设备 JSON 文件名推导。`BookRecord.progressDeviceId`、`progressUpdatedAt` 和 `LibraryState.deviceId` 用于区分本机回流与其他设备更新，不更改原有 JSON 格式。
- 旧版 `books/<bookId>/progress.json` 继续可读；来源未知时可用于打开续读，不在阅读中强制定位。
- 搜索/摘录/脚注预览不覆盖正常阅读位置；预览期间不接受同步跳转。
- 网盘上传由 OneDrive 等客户端负责，程序只负责本地文件；同步时效取决于网盘，跨设备时间排序依赖设备时钟。

## 书库目录

```text
<用户选择的书库>/
  books/<bookId>/book.epub
  books/<bookId>/metadata.json
  books/<bookId>/cover.* / 自定义封面
  progress/<bookId>/<deviceId>.json
  annotations/<bookId>/<annotationId>.json
  notes/<bookId>.json
```

阅读主题、字号、模式等界面偏好存于 WebView localStorage；全局外观以 `app-appearance` 保存（浅色/深色），与阅读主题独立。首次没有全局偏好时，已有 `reader-theme=dark` 用户默认采用深色，否则浅色。本机书库路径及设备 ID 存于应用配置，不放进同步书库。

## 整书笔记状态边界

- `App.notesBookId` 是当前笔记图书的唯一选择状态；从阅读器进入时选中该书，之后尊重用户切换，不反复套用初始书籍。
- `NotesWorkspace` 只在当前书籍不存在时回退；书库数组刷新不能重置有效选择。
- 加载请求序号与选书版本分别处理读取乱序、旧书保存回调；旧请求不能覆盖新书的正文/总结/感悟。
- 后台刷新不卸载编辑区；未保存草稿优先于同步快照。切换图书时存在草稿会先询问是否放弃，保存期间暂时禁用编辑区以避免提交中继续输入被覆盖。

## 开发与构建

- 开发：`npm run tauri dev`。
- 前端构建：`npm run build`。
- Windows 安装包：`.\node_modules\.bin\tauri.cmd build --bundles nsis`。
- 构建前正常退出使用 `target/release/bookreader.exe` 的旧程序，避免文件占用；不强制终止用户进程。
- 构建通过不等于功能验收通过；在 Bug 时间线中分别记录。
