# PWA 本地运行、微软配置与 Cloudflare Pages 部署

适用开发版本：`0.3.0-alpha.1`。当前未发布，真实微软账号与 iPhone 测试仍待完成。

## 1. 本地开发与构建

使用 Node.js 22 LTS 和当前 `package-lock.json`：

```powershell
npm ci
npm run dev
```

普通浏览器可直接使用本机书库，无需微软账号。开发服务器默认不注册 Service Worker；验证离线功能请使用生产构建：

```powershell
npm run build
node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4173 --strictPort
```

打开 `http://127.0.0.1:4173`。localhost 例外只适用于本机，iPhone 通过局域网 HTTP 地址不能等同于 HTTPS PWA 测试；真机应使用 HTTPS 测试部署。

| 命令 | 输出/用途 |
| --- | --- |
| `npm run build` | `dist/`：网页、manifest、Service Worker |
| `npm run build:desktop` | `dist-desktop/`：桌面前端，不注册 Service Worker |
| `npm run tauri dev` | 桌面开发 |
| `npm run tauri build` | 桌面构建，自动调用 `build:desktop` |
| `npm test` | Web 存储、队列、协议及模拟 Graph 测试 |
| `cargo test --manifest-path src-tauri/Cargo.toml --lib` | Rust 回归和软删除测试 |

不要将 `dist-desktop/` 部署到 Pages；不要将浏览器缓存、真实书库和 `.env` 提交到 Git。

## 2. 注册微软应用（需要用户账号）

1. 在 Microsoft Entra 的 App registrations 中注册应用。应用注册需要可访问的 Entra 租户和相应注册权限；个人 OneDrive 账号可作为应用的登录用户，但不代表自动拥有注册应用的管理权限。
2. Supported account types 选择 **Personal Microsoft accounts only**，对应本项目 `consumers` authority。
3. Authentication 中添加 **Single-page application (SPA)** 平台，而不是 Web confidential client。
4. 添加准确回调 URL，例如 `http://localhost:1420/`、`http://localhost:4173/` 和 `https://<项目>.pages.dev/`。浏览器实际使用的 origin 必须与登记地址一致；若本地用 `127.0.0.1`，单独登记对应允许的回调，或改用已登记的 localhost 地址。
5. 添加 Microsoft Graph 的 **Delegated** 权限 `Files.ReadWrite.AppFolder`。不使用 application permissions，不要求全盘 `Files.ReadWrite.All`。
6. 复制 Application (client) ID。不要创建或提供 client secret。
7. 将 `.env.example` 复制为 `.env.local`，填写 `VITE_MS_CLIENT_ID`，重新启动或重新构建。

本项目使用 MSAL Browser 4 的 redirect 流程：初始化后处理 `handleRedirectPromise`；弹窗和隐藏 iframe 的 iOS 行为不作为首版登录前提。令牌刷新需要交互时提示重新登录，不后台自动跳转。尚未进行真实账号联调。

参考：[微软应用注册](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)、[SPA 授权码与 PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)、[OneDrive 应用目录权限](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)。

## 3. 连接书库与迁移桌面数据

1. 打开 Web 设置，登录个人微软账号。
2. 点击“连接并同步书库”，确认将本机图书与进度同步到该账号。
3. Graph 获取 `approot`，在其下创建 `BookReaderLibrary`；设置中显示可打开的 OneDrive 目录链接。
4. Windows OneDrive 客户端同步该目录到电脑，在新版桌面 BookReader 中选择它。
5. 已有本地书库应先备份，再整体复制 `books/`、`progress/`、`annotations/`、`notes/`、版本文件及其他书库数据，保留 UUID；不要仅重新导入 EPUB。等待 OneDrive 完成同步后再在手机同步。

首版一个浏览器站点只绑定一个微软账号和书库 ID。退出登录保留本机缓存与队列，不能静默切换到另一个账号上传。暂未提供账号间迁移工具；不要为了切换账号直接清除尚未同步的数据。

必须使用支持生命周期协议的新版桌面端。`v0.2.4` 及以前版本不识别软删除，并仍可能永久删除文件，不应与本版同时操作同一个正式书库。

## 4. Cloudflare Pages（尚未执行）

连接用户自己的 GitHub 仓库，配置：

| 设置 | 值 |
| --- | --- |
| 根目录 | 仓库根目录 |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| Node 版本 | 22 LTS（`NODE_VERSION=22`） |
| 环境变量 | `VITE_MS_CLIENT_ID=<公开的应用 Client ID>` |

本版代码在 `codex/pwa-foundation`，`main` 保持原基线。先审阅、推送开发分支并做测试部署，验收后再确定生产分支；不要误把原 `main` 当作新版发布。

使用稳定的 HTTPS 地址并在微软应用中登记准确回调。预览域名也必须登记，不能假设任意动态预览域名均可登录。Client ID 是公开配置；密码、client secret、访问令牌均不应出现在 Pages 构建变量或 Git 中。

`public/_headers` 为入口、manifest、Service Worker 设置重新验证缓存策略。程序更新由用户确认，禁止在阅读中强制刷新。站点数据按 origin 隔离：换域名不会自动迁移离线书库和待上传数据，应先完成同步。

参考：[Cloudflare Pages 的 Vite 部署](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vite3-project/)。

## 5. iPhone 17.5 验收

1. Safari 打开 HTTPS 地址 → 分享 → 添加到主屏幕；再从主屏幕打开。
2. 首次联网加载后，导入或下载测试书。断网、关闭并重新打开，确认能阅读且位置保留。
3. 在主屏幕应用中验证微软登录回跳和重新登录，不能只在桌面 Chrome 中验证。
4. 手机与电脑互相续读；测试返回前台、断网恢复及离线导入后上传。
5. 软删除后各端隐藏，原文件和笔记保留；回收站恢复有效。测试另一设备离线时新建删除记录。
6. “移除本机下载”不能删除云端图书，未上传成功的本机 EPUB 不能移除。
7. 测试分页左右滑动、目录、滚动、横竖屏、长按选字、主题、较大 EPUB 和存储空间不足。

## 6. 当前限制与安全边界

- 本轮是 alpha：没有真实 Graph 联调、iPhone 真机验收或正式部署，不能称为最终交付版。
- 单本导入/下载上限 100 MB；还需用实际复杂 EPUB 检查 iPhone 内存峰值。不支持 DRM。
- OPFS 有可用的异步写入接口时保存二进制文件，否则降级 IndexedDB Blob。Safari 17 暴露 OPFS 不代表具备 `createWritable`。不保证系统永不清理缓存；持久存储申请可能不获准。
- 目前完整枚举书库目录，按 eTag 仅下载变更 JSON/封面；尚未实现 Graph delta 游标。适用于初期小书库，仍需测试请求数量和限流；后续应接入 delta。
- EPUB 按需下载。首版不支持对同一 book ID 替换 EPUB 内容；修改原书文件可能使旧 CFI 失效，应作为新书导入。
- 进度文件由各设备独占写入，最新时间选择仍依赖设备时钟；笔记/共享元数据在手机只读。
- 导入重试遇到云端已有相同内容时确认完成；内容不同时停止覆盖并提示冲突，保留队列。首版尚无图形化冲突合并工具。
- 云端批注/笔记读取、软删除协议已接入；手机编辑笔记、多账号迁移、永久清空回收站均不提供。
- 只保证运行中的前台同步，不保证锁屏/关闭后的持续上传。离线队列不是备份；不要在上传完成前清除网站数据。
- 本机没有用户自定义字体文件或外部 CDN 依赖；EPUB 内容的脚本执行关闭。只导入可信、无 DRM 的 EPUB。
