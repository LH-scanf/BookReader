# BookReader 项目地图

当前基线：[`pre-mobile-v1` / `01a0c13`](CURRENT_STATE.md) · 当前阶段：Mobile V1

## 文档入口

- [当前状态](CURRENT_STATE.md)：当前基线、平台、阶段与下一步。
- [数据与同步](DATA_SYNC.md)：当前数据承重墙与同步规则。
- [Mobile V1](MOBILE_V1.md)：产品目标和端侧隔离路线图。
- [测试](TESTING.md)：当前验收用例与回归原则。
- [部署](DEPLOYMENT.md)：当前 Microsoft、Cloudflare Pages 与 PWA 部署流程。
- [历史记录](history/README.md)：旧计划、开发日志、时间线和诊断证据。

## UI 当前状态与 Mobile V1 目标

**现在实际状态：** 顶层 App shell 已按端侧分离；Library、Notes、Settings 等页面内部仍有大量共享 legacy UI / 响应式适配。

**目标状态：** 共享数据、阅读、同步能力；Desktop UI 与 Mobile UI 明确独立。

Task 0A 只建立顶层边界，不是整个 UI 已完全隔离。后续 [Mobile V1](MOBILE_V1.md) Task 会逐页把 Mobile UI 改为独立实现，同时保留共享数据、阅读和同步能力。

### Task 0A 顶层边界

- `src/App.tsx` 是共享应用控制层：书库状态、`activeBook`、视图、`notesBookId`、业务动作、书库变化订阅和共享外观状态仍在这里。
- `src/ui/ui-mode.ts` 是唯一的 App-shell UI mode 判断入口。Tauri 优先返回 Desktop；移动 Web 设备返回 Mobile；普通桌面浏览器返回 Desktop，并仅为浏览器调试保留窄视口 fallback。
- `src/desktop/DesktopAppShell.tsx` 与 `src/mobile/MobileAppShell.tsx` 只负责端侧根节点、侧边栏/backdrop、导航容器和 main-view 外壳。Task 0A 中两者刻意保留相同的现有结构和行为。
- `src/desktop/desktop.css` 和 `src/mobile/mobile.css` 是后续专属端侧样式的唯一落点；`src/styles.css` 暂时仍是 shared/legacy 样式，不在本任务大规模迁移。
- Library、Notes、Settings 页面内部仍是共享/既有实现。`EpubReader.tsx` 的渲染内核仍共享；Task 3A 已将 Mobile Reader 控制外壳分到 `MobileReaderChrome`，Desktop 工具栏保持既有实现。

## 模块职责

| 文件 | 职责 |
| --- | --- |
| `src/App.tsx` | 书库、设置、独立整书笔记页面；图书操作；监听 `library-changed` 刷新书库快照 |
| `src/ui/ui-mode.ts` | 集中判断 Desktop / Mobile App shell 模式，并提供 React 包装 |
| `src/desktop/`、`src/mobile/` | DesktopAppShell / MobileAppShell 与后续各端专属 CSS 边界 |
| `src/mobile/mobile-recent-books.ts` | Mobile 最近打开顺序的本机 UI 状态；不写入同步书库。 |
| `src/mobile/MobileSettingsView.tsx` | Mobile 设置首页与同步/存储/外观/关于二级页面；只映射既有认证和同步状态并调用既有动作。 |
| `src/reader/ui/MobileReaderChrome.tsx` | Mobile Reader 的 overlay 控制外壳；继续复用 `EpubReader` 的渲染、CFI 和状态能力。 |
| `src/EpubReader.tsx` | EPUB 渲染、翻页/滚动、目录、主题、脚注、搜索、高亮、进度保存及同步定位仲裁 |
| `src/library-api.ts` | 平台无关入口，按环境加载 LibraryProvider |
| `src/library/` | Provider 契约、桌面桥接、Web 书库与共享协议 |
| `src/storage/` | IndexedDB 事务、待上传队列、OPFS/Blob 文件缓存 |
| `src/platform.ts` | 平台检测、库变化通知、窗口/页面生命周期 |
| `src/auth/`、`src/sync/` | MSAL 登录、账号绑定、Graph 请求与同步引擎 |
| `src/reader/precise-mapping.ts` | 中文跨页字符级 CFI 修正，局部适配 epub.js mapping |
| `src/WebStatus.tsx`、`src/CloudSettings.tsx` | PWA 更新/离线状态、登录与同步设置 |
| `src/TrashSettings.tsx` | 两端共用回收站恢复入口 |
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
- 桌面网盘上传由 OneDrive 客户端负责；Web 通过 Graph 访问应用专用书库。进度时间排序仍依赖设备时钟，软删除/恢复使用不可变操作记录，详见 PWA 开发记录。

## 书库目录

```text
<用户选择的书库>/
  books/<bookId>/book.epub
  books/<bookId>/metadata.json
  books/<bookId>/cover.* / 自定义封面
  progress/<bookId>/<deviceId>.json
  annotations/<bookId>/<annotationId>.json
  notes/<bookId>.json
  lifecycle/<bookId>/<operationId>.json
```

阅读主题、字号、模式等界面偏好存于 WebView localStorage；全局外观以 `app-appearance` 保存（浅色/深色），与阅读主题独立。首次没有全局偏好时，已有 `reader-theme=dark` 用户默认采用深色，否则浅色。本机书库路径及设备 ID 存于应用配置，不放进同步书库。

## 整书笔记状态边界

- `App.notesBookId` 是当前笔记图书的唯一选择状态；从阅读器进入时选中该书，之后尊重用户切换，不反复套用初始书籍。
- `NotesWorkspace` 只在当前书籍不存在时回退；书库数组刷新不能重置有效选择。
- 加载请求序号与选书版本分别处理读取乱序、旧书保存回调；旧请求不能覆盖新书的正文/总结/感悟。
- 后台刷新不卸载编辑区；未保存草稿优先于同步快照。切换图书时存在草稿会先询问是否放弃，保存期间暂时禁用编辑区以避免提交中继续输入被覆盖。
- Desktop 页面展示采用 `顶部图书工具栏 → 左侧摘录摘要列表 → 右侧单条详情/整书总结`。Mobile 由 `MobileNotesWorkspace` 单独渲染为纵向阅读页与横向封面选书条；两端共用 `NotesWorkspace` 的状态、加载、保存和未保存修改保护。当前书仍由 `App.notesBookId` 控制，当前摘录只是一层 UI 选择状态，不写入同步数据。
- 摘录排序只改变数组视图，不修改 `createdAt` 或 JSON；详情元数据直接读取既有 `createdAt`、`updatedAt`、`chapterTitle`、`chapterHref` 和 `cfiRange`。
- Desktop 保持既有整书总结编辑器；Mobile 使用独立的阅读态/局部编辑态，并通过同一个 `persistBookNote`、`saveAnnotation`、`removeAnnotation` 路径持久化。普通摘录感悟仍沿用平台现有的 provider 能力，保存/删除继续进入原同步流程。

## 开发与构建

- 开发：`npm run tauri dev`。
- Web 构建：`npm run build` → `dist/`（PWA）。
- 桌面前端构建：`npm run build:desktop` → `dist-desktop/`（无 Service Worker）。
- Windows 安装包：`.\node_modules\.bin\tauri.cmd build --bundles nsis`。
- 构建前正常退出使用 `target/release/bookreader.exe` 的旧程序，避免文件占用；不强制终止用户进程。
- 构建通过不等于功能验收通过；在 Bug 时间线中分别记录。
