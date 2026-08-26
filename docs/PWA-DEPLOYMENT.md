# PWA 本地运行、微软配置与 Cloudflare Pages 部署

适用开发版本：`0.3.0-alpha.1`。当前未发布，真实微软账号与 iPhone 测试仍待完成。

## 需要用户介入的事项

本地开发不需要提供账号。进入真实云端联调时，按顺序完成：

| 顺序 | 用户操作 | 可交给开发者的信息 |
| --- | --- | --- |
| 1 | 用自己的账号进入 Entra，注册个人账号 SPA 应用并设置权限和本地回调（见第 2 节） | 公开的 Application / Client ID；也可自行填写 `.env.local` 后告知已完成 |
| 2 | 在应用中亲自登录个人微软账号并同意授权 | 成功/错误提示；不要提供密码、验证码、访问令牌或 client secret |
| 3 | 登录 GitHub、Cloudflare，授权 Pages 访问指定仓库，确定测试部署地址（见第 4 节） | 目标仓库、稳定 HTTPS 测试地址，并明确同意推送和测试发布 |
| 4 | 将测试站点添加到 iPhone 主屏幕并按第 5 节验收 | iOS 版本、失败步骤和截图；敏感信息先遮挡 |

第一步不需要购买域名或预先创建 OneDrive 书库。成功登录并确认“连接并同步书库”后由应用创建专用目录。若当前账号不能注册应用，提供页面错误即可，不要因此随意扩大 OneDrive 权限。

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

### 首次连接出现 HTTP 403

错误提示现包含失败阶段和 Graph 错误代码。若失败在“访问应用专用目录”，先用相同账号打开 OneDrive 网页，检查是否已初始化、有无冻结/只读/账户提示；再核对 Entra 中 Graph 的 `Files.ReadWrite.AppFolder` 为 **Delegated（委托）** 权限。应用会检查 MSAL 返回的授权范围；该检查通过仍不能保证服务端放行。

完成必要的账户处理后，回到应用点击“重新授权 OneDrive”，使用原账号亲自确认微软授权页面，回跳后再手动连接。该入口使用 `prompt: consent`，仍仅请求 `Files.ReadWrite.AppFolder`；普通“重新登录”使用账号选择提示，不保证重新显示授权确认。重新授权是排查步骤，并不保证解决所有 403。401/403 会暂停当前页面的前台自动重试，避免反复请求；原勾选偏好及本机队列保留。不要以扩大到 `Files.ReadWrite.All`、清空站点数据或新建另一应用作为默认解决办法。若仍失败，提供失败阶段、错误代码、请求编号和权限配置截图即可，不要提供令牌。

参考：[MSAL prompt 参数行为](https://learn.microsoft.com/en-us/entra/identity-platform/msal-js-prompt-behavior)。

### 最小文件权限的手动诊断

在设置中展开“OneDrive 诊断”，先点击“读取 AppFolder 错误详情”，保存 JSON 中的 error/innerError、两端请求编号和时间。浏览器未能读取响应头时 date/requestId 可以是 null，innerError 中仍可能有服务端信息。敏感字段会过滤；过大或非 JSON 错误会标明限制。

若需验证同一 token 是否被 Graph 接受，点击“授权身份对照诊断”，亲自确认 User.Read + Files.ReadWrite.AppFolder，再回到面板点击“运行同 token 对照”。这是身份读取权限，不是全盘文件权限；普通同步 scope 不变。成功的 /me 响应不记录个人资料。

只有显式勾选探针选项，才会在 /me 成功且 approot 返回 403 后写入应用目录内的 `__bookreader_probe.txt`。同名则失败，不覆盖、不删除；成功后再次读取 approot。默认不勾选，不自动执行，也不上传本机书库。遇到授权交互错误时，需完成微软授权再运行，而不是把它当成 Graph /me 失败。结果仅保存在页面内存及控制台，跳转前请复制需要保留的诊断；不要分享浏览器令牌或完整网络请求头。

### 开发期临时 Files.ReadWrite 对照

仅本地 `npm run dev` 提供，生产构建没有此入口。开始前关闭其他 BookReader 网页，展开设置中的临时实验并按编号执行：

1. 点击“锁定同步并准备实验”。状态必须为 prepared，页面明确显示同步已锁定。
2. Entra → BookReader → API 权限 → 添加权限 → Microsoft Graph → 委托的权限 → 搜索并勾选 `Files.ReadWrite` → 添加权限。不要选择 `Files.ReadWrite.All`，不要创建 secret。
3. 回到 BookReader，点击“临时授权 Files.ReadWrite”，阅读微软权限说明后亲自接受；回跳后点击一次“仅执行一次 GET + PUT”。不要点击其他同步入口。
4. 若创建了本次 probe，点击“清理本次探针”。出现 cleanupUncertain 时停止，人工核对 `Apps/BookReader/__bookreader_probe.txt` 的内容/时间；不要删除已有同名旧文件。
5. 在 Entra 移除临时 Files.ReadWrite。还必须打开 [微软个人账号应用授权管理](https://account.live.com/consent/Manage) 撤销 BookReader 已获授权；微软文档明确，移除应用注册配置不会自动撤销已授予访问。若页面只能整体撤销，这是预期，下一步会重新授予 AppFolder。
6. 勾选已完成撤权，点击“清理登录缓存并仅授权 AppFolder”，亲自同意；再运行 AppFolder-only GET。工具强制刷新 token 并拒绝含 Files.ReadWrite 等宽 scope 的 token。
7. 只有 AppFolder-only GET 为 200 才可点击结束。结束仅解除保护锁，自动同步仍关闭；先审阅结果再决定是否手动同步。

如果宽权限 GET/PUT 仍为 403，或撤权后的 scope 无法确认，实验保持锁定并停止。不要为了“完成流程”勾选未实际发生的撤权，也不要清除整个站点数据。

### 其他限制

- 本轮是 alpha：没有真实 Graph 联调、iPhone 真机验收或正式部署，不能称为最终交付版。
- 单本导入/下载上限 100 MB；还需用实际复杂 EPUB 检查 iPhone 内存峰值。不支持 DRM。
- OPFS 有可用的异步写入接口时保存二进制文件，否则降级 IndexedDB Blob。Safari 17 暴露 OPFS 不代表具备 `createWritable`。不保证系统永不清理缓存；持久存储申请可能不获准。
- 首次及文件夹 cTag 变化时枚举目录，cTag 不变时复用快照；最长 5 分钟重新全扫，cTag 缺失则每轮全扫。按 eTag 仅下载变更 JSON/封面，未实现 Graph delta 游标；需先确认 AppFolder 权限及限定书库范围的实际支持，不自动申请全盘权限。
- EPUB 按需下载。首版不支持对同一 book ID 替换 EPUB 内容；修改原书文件可能使旧 CFI 失效，应作为新书导入。
- 进度文件由各设备独占写入，最新时间选择仍依赖设备时钟；笔记/共享元数据在手机只读。
- 导入重试遇到云端已有相同内容时确认完成；内容不同时停止覆盖并提示冲突，保留队列。新文件上传同时要求服务端同名冲突失败，避免检查后出现的并发文件被覆盖。首版尚无图形化冲突合并工具。
- 绑定书库被移动、改名或删除时停止同步，不创建替代目录；应恢复原目录或备份后另行处理迁移。
- 云端批注/笔记读取、软删除协议已接入；手机编辑笔记、多账号迁移、永久清空回收站均不提供。
- 只保证运行中的前台同步，不保证锁屏/关闭后的持续上传。离线队列不是备份；不要在上传完成前清除网站数据。
- 本机没有用户自定义字体文件或外部 CDN 依赖；EPUB 内容的脚本执行关闭。只导入可信、无 DRM 的 EPUB。
