# PWA 开发记录

## 2026-08-27：iPhone 首轮阅读体验修正

- 根据 iOS 17.5 真机截图压缩阅读器上下占用：阅读时隐藏底部常驻同步栏，保留错误/离线提示；系统安全区仍保留，网页不能隐藏 iPhone 系统状态栏。
- iOS 分页模式取消左右翻页按钮及点击留白，保留左右滑动并加入轻量纸页过渡；Windows 仍保留按钮和键盘翻页。
- 阅读工具栏新增收起/恢复按钮；底部进度可点击切换百分比与 epub.js 生成的位置页码，两端行为一致。
- 字号设置新增实时正文预览；书库与已读的搜索/导入工具改为右上角紧凑布局，已读页不再出现任何导入入口。
- EPUB 脚注链接改为捕获阶段处理，跨章节目标按当前章节相对路径解析；iOS 无法解析脚注时停留当前页并提示，避免落入空白页。
- 本轮不改进度存储与同步协议，不重置用户已调整到 86% 的阅读进度。自动测试 67 项通过，Web 与桌面构建通过；仍需发布后用原 EPUB 真机复测滑动动画、脚注和安全区高度。

## 2026-08-26 · 开始实施

- 基线：`v0.2.4` / `e29594f`，保留不变。
- 开发分支：`codex/pwa-foundation`。
- 本轮目标：平台隔离、Web 本地书库、两端软删除与恢复、手机界面、PWA，以及无需密钥即可完成的登录/同步集成和测试。
- 不创建第二份 React 项目。不擅自注册微软应用、创建云端资源、推送或发布。
- 测试使用生成的 EPUB 与隔离的临时书库，不读取或改动用户真实书库。
- 外部配置：微软 SPA Client ID、正式回调地址、Cloudflare/GitHub 部署连接需要后续由用户配置；真实 Microsoft Graph 与 iPhone 验收不能用模拟测试替代。

## 同步协议决策

### 书库文件

沿用 `books/<bookId>/book.epub`、`metadata.json`、`progress/<bookId>/<deviceId>.json`、`annotations/` 和 `notes/`，保留现有图书 ID。

新增 `lifecycle/<bookId>/<operationId>.json`，每个操作不可变：

```json
{
  "schemaVersion": 1,
  "id": "操作 UUID",
  "bookId": "图书 UUID",
  "deviceId": "设备 UUID",
  "action": "delete",
  "restores": [],
  "createdAt": "ISO 8601 时间"
}
```

恢复使用 `action: "restore"`，`restores` 明确列出本机已观察到的删除操作 ID。只要存在未被恢复操作覆盖的删除，图书保持隐藏。删除与恢复并发时，未被观察到的删除优先；不用设备时钟决定图书是否复活。任何端都不物理删除原图书和笔记，也不移除生命周期历史。

### 本机事务与云端写入

- IndexedDB 文档变化与待上传记录在同一事务提交。
- 进度队列按路径合并，上传成功仅确认对应 revision，避免误删上传期间产生的新进度。
- EPUB 与封面先上传，`metadata.json` 最后作为图书可见标志。
- 云端读取与下载按文件版本检查，待上传本地文档不能被拉取覆盖。
- 手机不编辑云端元数据和笔记，避免首版引入共享文件覆盖冲突。
- 绑定的微软账号和书库必须与本机缓存匹配；禁止静默把旧账号待上传数据写入新账号。

## 阶段记录

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 协议与开发分支 | 已完成本轮 | 保留原基线，开发版本 `0.3.0-alpha.1` |
| Provider / 本地存储 / 软删除 | 已实现并测试 | Tauri/Web 共用接口；OPFS 能力检测、IndexedDB 降级；两端回收站 |
| 手机 UI / PWA | 已实现，浏览器验证 | 抽屉导航、阅读布局、安装清单、离线启动、更新提示；待 iPhone 真机 |
| 登录 / Graph / 同步 | 已实现，真实账号联调进行中 | AppFolder 下建库、导入、测试 EPUB 云端重新下载成功；双端进度仍待验收 |
| 增量同步 | 部分完成 | cTag 无变化时复用目录快照，最长 5 分钟重新全扫；eTag 控制内容下载，尚无 Graph delta 游标 |
| 测试与构建 | 本地检查通过 | 最新 64 项 Web 测试通过；上一轮 6 项 Rust 测试通过，Rust 本轮无改动；两种前端构建通过 |
| 真机与真实云端 | 云端基础验收通过，真机待验收 | 建库、导入、重新下载、软删除/恢复及一次 504 重试通过；iPhone、双端进度与并发仍待验收 |

## 本轮实现清单

- 同一 React 工程按运行环境选择 Provider，不另建 PWA 项目。Web 输出 `dist/`，桌面输出 `dist-desktop/`，避免构建互相覆盖；桌面不注册 Service Worker。
- 无登录也可导入 EPUB、阅读、保存进度、软删除和恢复。手机可查看整书笔记及批注，编辑入口关闭。
- PWA 预缓存应用资源；EPUB 不放入 Service Worker 缓存，而由文件存储层管理。首版点击云端图书按需下载，未上传 EPUB 禁止移除本机副本。
- MSAL 个人账号登录、账号和书库绑定、防止跨账号误上传、前台自动同步、手动同步及待上传数量提示。
- Graph 分页遍历、eTag 校验、无令牌的签名 URL 下载、路径校验、下载大小限制、限流冷却；不把 bearer token 发给非 Graph 主机。
- dirty queue 与本机文档原子更新；按 revision 确认上传，失败保留；导入先传文件后传元数据；不可变删除/恢复记录优先上传。
- 已存在的非进度文件在重试时比对内容，一致则确认，不一致则停止覆盖并保留待上传内容。尚无冲突合并界面。
- 关闭 EPUB 脚本执行；移动端安全区、滑动翻页、可点击菜单、设置和回收站已接入。
- 修复中文长段落翻页后 CFI 落在上一页的问题；返回书库前等待翻页并保存实际位置。细节见 `BUGFIX_TIMELINE_2026-08.md` 的 `BUG-20260826-04`。
- 修正手机阅读底栏挤压及消息条继承桌面位移、遮挡导航按钮的问题。

## 验证记录（2026-08-26）

### 自动化检查

- `npm test`：4 个测试文件、21 项测试通过。覆盖存储降级、队列 revision、删除/恢复并发、进度选择、只读笔记、账号绑定、模拟 Graph 重试/冲突及 CJK 定位。
- `cargo test --manifest-path src-tauri/Cargo.toml --lib`：6 项通过，含原有回归和软删除保留文件、恢复、损坏生命周期记录拒绝处理。
- `npm run build`、`npm run build:desktop`：通过。PWA 生成 Service Worker，预缓存 26 个资源，约 939 KiB。
- 这些检查不等于 Windows 安装包、真实微软账号或 Safari 真机验收。本轮未执行桌面安装包发布。

### 隔离浏览器检查

使用 Playwright CLI 的隔离 Chromium 会话、390 × 844 视口和生成的中文 EPUB，未使用用户真实图书。

- 导入 EPUB、打开阅读器、分页、返回书库和重新打开可用；页面宽度与视口均为 390px，无横向溢出。
- 中文位置修复后，保存 CFI 为 `epubcfi(/6/2!/4/8/1:53)`；重新打开后分页偏移仍为 338px。
- 正式构建完成安装后关闭预览服务器；随机未缓存请求失败，重新加载书库成功，Service Worker 仍控制页面。离线打开 EPUB 后偏移仍为 338px。
- 在服务器关闭期间，软删除后书库隐藏该书，设置/回收站仍可加载，恢复操作成功；队列从 3 项增至 5 项，保留导入、进度及生命周期变更。
- PWA 更新需要用户确认；更新后本地测试书及待上传队列仍保留。
- 最终布局回归：提示条左边界 65px、侧栏按钮右边界 56px，提示显示时仍能点击展开导航；未上传图书的“移除本机下载”被明确拒绝，文件保留。
- 截图、生成的 EPUB 和浏览器记录在忽略目录 `output/playwright/`、`.playwright-cli/`；不随源码提交。

## 下一步与明确未完成项

1. 微软 SPA 注册及 localhost 回调已完成；仍需确定稳定 HTTPS 测试域名并登记对应回调。操作步骤见 `../DEPLOYMENT.md`。
2. 继续真实 Graph 验收：桌面/手机双向进度、笔记读取、跨设备删除/恢复、并发与限流。登录回跳、应用目录访问、建库、导入同步及测试 EPUB 云端重新下载已通过。
3. 再由用户连接 GitHub 与 Cloudflare Pages；本轮没有推送分支、注册应用或创建正式云端资源。
4. iOS 17.5 主屏幕 PWA 验证登录与离线重启、IndexedDB 降级、横竖屏/手势、复杂 EPUB、存储压力与系统清理行为。
5. 先确认个人账号 AppFolder 权限与限定书库范围下的 Graph delta 能力，再决定是否接入；不自动申请全盘权限。完善冲突处置界面及实际两端并发测试。永久删除、手机编辑笔记、多账号迁移仍不在首版范围。

在真实云端与真机验收前维持 alpha 状态。旧桌面 `v0.2.4` 不识别生命周期协议，不应与新版本同时修改同一个正式云端书库。

## 2026-08-26 · 第二轮：同步效率和故障保护

用户允许继续无需账号配置的工作。本轮保持 `0.3.0-alpha.1`，未注册应用、请求扩大权限、推送或部署。

### 实现

- 首次扫描后，将文件夹 cTag 和完整目录快照与本机 JSON 文档在同一个 IndexedDB 事务提交。下次 cTag 相同且快照未满 5 分钟时，不遍历子目录；内容仍按文件 eTag 判断是否下载。
- 文件夹 eTag 不能代表子孙文件变化，因此不作为替代。cTag 缺失、快照过期、系统时钟回拨时重新扫描，不启用快速路径。
- 下载结束后再次检查 cTag；云端发生并发变化时拒绝发布本轮文档/检查点，保留本机队列供重试。任何上传及父目录创建前先失效检查点，涵盖上传成功但响应丢失的情形。
- 新导入 EPUB、封面、元数据及生命周期记录上传使用 `@microsoft.graph.conflictBehavior=fail`；只有本设备进度文件明确使用 replace。发生 HTTP 409 时保留队列，下次先重新扫描、比对内容。
- 已绑定的书库先按原 ID 验证名称、父目录和文件夹类型；丢失、移动或改名时停止，不先创建空的替代目录。
- 带 Authorization 的 Graph 请求禁止自动重定向；签名下载 URL 继续不携带 Graph token。

### 验证与限制

- `npm test`：33 项通过（新增 12 项，同步测试现为 21 项），覆盖无变化不遍历、cTag 变化、缺失降级、周期全扫、扫描期间云端变化、下载失败、同名竞态、响应丢失和书库目录异常。
- `npm run build` 和 `npm run build:desktop`：通过；Web 预缓存 26 个资源，约 940 KiB。
- 以上为模拟 Graph 回归，尚未验证真实服务返回的 cTag、CORS 和权限行为；缺少 cTag 时自动全扫。未重新进行 iPhone 或浏览器交互验收，本轮不改 UI。
- 这不是 Graph delta 实现，也不声称普通目录分页是云端事务快照。现有最小权限下的 delta 范围与支持情况仍待真实账号确认。

依据：[driveItem 的 cTag 与 conflictBehavior 语义](https://learn.microsoft.com/en-us/graph/api/resources/driveitem?view=graph-rest-1.0)、[delta 接口、权限及枚举限制](https://learn.microsoft.com/en-us/graph/api/driveitem-delta?view=graph-rest-1.0)。

## 2026-08-26 · 微软登录配置开始联调

- 用户已提供应用 Client ID，并确认已登记 SPA 回调 `http://localhost:1420/`。
- 检查 `.env.local`：Client ID 已与用户提供值一致，无需覆盖；该文件被 Git 忽略，不在文档中重复记录账号配置值。
- 启动本地 Vite 服务，严格使用 `http://localhost:1420/`；不混用 `127.0.0.1`、4173 端口或局域网地址。
- 浏览器实测本地书库可打开、登录按钮可用，点击后成功进入微软个人账号登录表单，未出现即时配置错误。
- 用户随后完成登录，应用已回跳到本地地址，设置页显示已登录账号。没有读取或记录浏览器令牌、密码或账号地址。
- 真实浏览器发现 GraphClient 的 fetch 接收者错误，已补回归并修复（BUG-20260826-06）；首次连接增加独立 `syncConsent` 确认，底部同步按钮不能绕过。
- 手机错误通知遮挡设置入口的问题已修正抽屉层级；在错误仍显示时已能进入设置。
- 修复后 35 项 Web 测试通过；Web/桌面前端构建通过。浏览器验证未确认时底栏同步被阻止、自动同步开关不可启用、设置连接按钮弹出明确确认框；没有代用户接受确认。设置发起同步时会清除底栏上一次遗留错误。
- 当前本机书库为空，等待首次连接确认。AppFolder 权限、云端建库、真实同步尚未验证，登录回跳成功不等于这些步骤已通过。

## 2026-08-26 · 首次连接返回 HTTP 403（待排查）

- 用户已接受首次连接确认；真实请求在 `GET /me/drive/special/approot` 返回 403，Graph 代码为 `accessDenied`，说明为 `Access denied`。后续创建 `BookReaderLibrary` 的步骤尚未执行。
- MSAL 返回的授权范围元数据通过 `Files.ReadWrite.AppFolder` 检查；这不等于服务端已允许访问，也不能单凭 403 判定应用权限漏配或账号被冻结。没有解码、输出或保存访问令牌。
- Graph 错误现在包含操作阶段、服务端错误代码和请求编号；错误正文限 16 KiB，说明限 350 字符并省略邮箱、URL 和凭证样式内容，不保存完整响应。
- 401/403 后前台自动重试暂停；手动重试仍可用，不删除队列、不撤销用户连接确认、不改权限。实际浏览器已显示“自动重试已暂停”。
- `npm test`：43 项通过（本轮新增 8 项），覆盖授权范围检查、脱敏错误、非 JSON/过大响应、401/403 暂停状态与数据保留。Web 和桌面前端构建通过。
- 需用户核对：同一账号的 OneDrive 网页可正常使用且无冻结/只读提示；Entra 应用的 Graph `Files.ReadWrite.AppFolder` 为委托权限。必要时完成 OneDrive 初始化或重新登录授权，再手动重试。
- 未尝试全盘权限、替代接口绕过拒绝、清空浏览器数据或重新绑定账号。403 根因与真实同步仍未解决。

参考：[Get special folder 的个人账号权限](https://learn.microsoft.com/en-us/graph/api/drive-get-specialfolder?view=graph-rest-1.0)、[Graph 403 排查](https://learn.microsoft.com/en-us/graph/resolve-auth-errors)。

## 2026-08-26 · 核对账号配置并增加显式重新授权

- 用户截图确认同一账号可打开个人 OneDrive、空间充足，未见冻结/只读提示；应用已配置 Graph `Files.ReadWrite.AppFolder` 委托权限。截图不能证明当前令牌的服务端授权状态，也不足以确定 403 根因。
- 新增“重新授权 OneDrive”按钮，通过 MSAL `loginRedirect` 的 `prompt: consent` 请求重新显示授权确认；普通登录仍使用 `select_account`。业务权限保持 AppFolder，不清理登录缓存、本机文件或待上传队列。
- 实际浏览器已进入微软授权确认页，显示应用文件夹访问、基本资料和保持已有授权访问；没有代用户点击“接受”。等待用户确认并回跳后验证真实同步。
- `npm test`：44 项通过；Web 与桌面前端构建通过，`git diff --check` 通过。新增测试验证普通登录与重新授权使用相同的 AppFolder 范围，仅提示行为不同。
- 403 尚未解决；旧授权状态仅为待验证方向，不把重新授权入口视为已修复。未推送、未部署，版本保持 `0.3.0-alpha.1`。

依据：[MSAL prompt 参数行为](https://learn.microsoft.com/en-us/entra/identity-platform/msal-js-prompt-behavior)。

## 2026-08-26 · 重新授权后仍返回 403

- 用户回报重新授权后的连接仍失败：`GET https://graph.microsoft.com/v1.0/me/drive/special/approot`，HTTP 403，`accessDenied` / `Access denied`，请求编号 `b7fc42f3-94b6-4cc7-961d-28bbb933a4a4`。准确请求时间未采集；不编造服务端时间。
- 重新核对请求构造、个人账号 authority、授权范围和建库顺序：当前路径与官方特殊目录文档一致，AppFolder 是文档列出的个人账号最低权限。重新确认授权未解决问题，不能继续把旧授权缓存当作已知根因。
- 官方 OneDrive 仓库 issue #1667 存在应用目录初始化相关的 403 报告，但主要涉及上传会话，与本项目的 GET 失败不完全相同，不据此认定微软服务故障。
- 本轮不改业务代码、不继续重试、不换接口、不扩大权限，也不清除数据。未重新运行测试；上一代码提交 `da02efb` 的 44 项测试及两种前端构建已通过。
- 后续保留最小权限向微软反馈，或在用户明确同意后做一次较宽 `Files.ReadWrite` 委托权限的对照验证。后者授权范围是用户文件（个人账号也包含共享文件），不是仅 BookReader 目录；即使程序仍只请求应用目录，也不能声称微软限制其只访问此目录。不保证换权限能解决问题，不默认启用，不使用 `Files.ReadWrite.All`。
- 真实云端同步仍阻塞，部署及 iPhone 验收未完成。对照验证前必须取得用户明确同意，并由用户亲自完成微软授权；本轮没有提交外部支持工单。

参考：[特殊目录权限与请求路径](https://learn.microsoft.com/en-us/graph/api/drive-get-specialfolder?view=graph-rest-1.0)、[Files.ReadWrite 权限范围](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwrite)、[OneDrive issue #1667](https://github.com/OneDrive/onedrive-api-docs/issues/1667)。

## 2026-08-26 · 用户指定的最小文件权限诊断

- 用户明确不扩大 OneDrive 文件权限，要求依次查看完整 innerError、增加 User.Read 做同 token 身份对照、在应用目录内尝试探针 PUT。此项替代上一轮尚未执行的宽权限对照建议。
- 所有 Graph 认证请求增加唯一 `client-request-id`；错误诊断保留嵌套 error/innerError，过滤凭证键、令牌回显、邮箱和 URL。保留响应头 request-id/date、客户端编号和本机 UTC observedAt；响应头不可读时为 null，不伪装成服务端时间。超过 16 KiB 或无法解析时明确标注，不声称完整。
- 设置页新增诊断面板，结果显示为可复制 JSON 并输出到控制台；不输出请求头、token 或成功 /me 响应中的个人资料。普通登录/同步继续只请求 AppFolder，User.Read 仅用于显式诊断授权及取 token。
- 身份对照每轮只获取一次不透明 token，依次请求 /me 和 approot。仅 /me 成功、approot 返回 403 且勾选允许探针时，执行 PUT `approot:/__bookreader_probe.txt:/content?@microsoft.graph.conflictBehavior=fail`，正文为 `BookReader probe`。同名不覆盖、不自动删除；PUT 成功后才再 GET approot。不操作同步队列，不扩展文件权限，不自动重复诊断。
- 第一阶段真实结果见下：完整 innerError 没有 serviceReadOnly、Database Is Read Only、itemDisabledDueToPendingProvisioning 或 User is pending provisioning。不能据此确认或排除服务端回归。

```json
{
  "step": "GET approot",
  "status": 403,
  "clientRequestId": "81611f59-7b22-4fc3-b815-4b2c7baddb1b",
  "requestId": "aa060d8f-a4cb-4227-8871-87043a5e41ab",
  "date": null,
  "observedAt": "2026-08-26T07:09:20.377Z",
  "error": {
    "code": "accessDenied",
    "message": "Access denied",
    "innerError": {
      "date": "2026-08-26T07:09:20",
      "request-id": "aa060d8f-a4cb-4227-8871-87043a5e41ab",
      "client-request-id": "81611f59-7b22-4fc3-b815-4b2c7baddb1b"
    }
  }
}
```

- 第二阶段首次调用 MSAL 请求 User.Read + AppFolder 时返回需要交互授权。打开诊断授权入口后，浏览器随后已回跳；再次运行成功取得包含两项范围的 token，实际结果如下。没有代用户接受微软授权，也没有读取或解析 token。
- 用户引用的 #1929/#1930 原始页面在本轮浏览工具中无法获取，搜索也未能核实内容；不把“8 月 23 日新回归”写成已确认事实。
- `npm test`：54 项通过；Web 和桌面前端构建通过；类型检查通过。测试覆盖嵌套错误保留与凭证过滤、同 token 顺序、每请求独立编号、探针同名保护、失败不重试及诊断范围与普通同步隔离。真实 403 仍未解决，版本保持 alpha。

参考：[Graph client-request-id 建议](https://learn.microsoft.com/en-us/graph/best-practices-concept#reliability-and-support)、[应用目录与最小权限](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)。

### 同 token 实验最终结果

2026-08-26 07:12:13–07:12:15 UTC（北京时间 15:12），同一张通过 MSAL 取得的 token：

| 请求 | HTTP | 结果 |
| --- | --- | --- |
| GET /me | 200 | Graph 接受 token 并允许身份读取；不记录个人资料 |
| GET /me/drive/special/approot | 403 | accessDenied / Access denied |
| PUT approot:/__bookreader_probe.txt:/content（同名则失败） | 403 | accessDenied / Access denied |

完整脱敏元数据和 error/innerError 见 [诊断 JSON](diagnostics/onedrive-2026-08-26.json)。两次 403 的 innerError 都只有 date、request-id、client-request-id，没有只读或 provisioning 错误码。响应头 date 在浏览器中为 null，错误正文中有服务端 date。

结论：Graph 已接受同一 token 的身份请求，AppFolder 的 GET 与 PUT 仍被拒绝；探针初始化未解决问题。不能据此证明具体服务端根因，不能证明命中未核实的 #1929/#1930，也不能排除全部授权问题。没有成功写入探针的响应，未继续 GET 重试、未上传书库或修改本机队列。OneDrive 网页新建文件仍未测试。用户要求的本轮三阶段诊断已执行，真实同步仍未恢复。

## 2026-08-26 · 受控 Files.ReadWrite 临时对照工具

- 用户明确同意临时 Files.ReadWrite 诊断，但不允许 BookReader 正式改用。实现仅存在于 Vite 开发模式；生产 Web 和桌面构建均不包含实验组件/宽 scope 字符串，普通授权仍只有 AppFolder（身份诊断另有 User.Read）。
- 实验第一步持久写入 `permissionExperimentPaused`、关闭 `syncEnabled`，再等待 `bookreader-sync` 锁。`syncNow` 在进入和取得锁后各检查一次，前台触发器也检查；登录回跳/刷新不会解除。普通 token 路径若看到 Files.ReadWrite、其他 Files scope 或 Sites scope，会在发送 Graph 请求前拒绝。
- 宽权限授权入口有再次确认，只请求 Files.ReadWrite。实验 token 强制刷新并核对 MSAL scope 元数据；同轮只执行一次固定 GET approot 与 PUT `__bookreader_probe.txt`，后者 `conflictBehavior=fail`。不调用同步引擎，不枚举 OneDrive，不上传/删除书库。
- PUT 成功时仅保存服务返回且名称精确匹配的 probe id/eTag；清理只 DELETE 该 id 并带 If-Match。403/409 明确不清理；网络响应丢失或响应缺安全字段时标记 cleanupUncertain，锁定后续授权和实验，由用户人工核对，绝不猜测删除同名文件。
- 撤权后步骤先清除当前账号 MSAL 缓存（不清除站点数据/书库/队列），再交互请求 AppFolder。复测 token 强制刷新；若 scope 元数据仍有宽文件权限则不发 Graph 请求。AppFolder GET 200 且再次核对范围后才允许结束，保持 syncEnabled=false，不自动同步。
- 微软文档说明，删除 Entra 应用注册中的请求权限不会自动撤销已授予访问。因此界面要求同时移除 Entra 临时配置，并从个人微软账号的应用授权管理撤销 BookReader；若整体撤销，随后重新同意 AppFolder。用户操作是服务端撤权事实的唯一来源，应用只核对新 token 的范围元数据。
- `npm test`：63 项通过；Web/桌面构建和 TypeScript 检查通过，生产 `dist` 中实验标识命中数为 0。覆盖持久锁的两次检查、普通 auth 拒绝宽 token、实验一次性、固定请求、按 id/eTag 清理、409 不删除、响应丢失保持锁、撤权后宽 scope 防误判、复测仍 403 不解锁和本机文档保留。
- 实际本地开发页面已执行步骤 1：阶段 `prepared`，正常同步已锁定、自动同步关闭。尚未在 Entra 添加 Files.ReadWrite、未请求宽 token、未发送宽权限 Graph 请求。等待用户完成 Entra 临时配置后继续步骤 2。

参考：[Files.ReadWrite 权限说明](https://learn.microsoft.com/en-us/graph/permissions-reference#filesreadwrite)、[修改权限不会自动撤销已授予访问](https://learn.microsoft.com/en-us/entra/identity-platform/howto-update-permissions#scenarios-for-updating-permissions)、[删除 DriveItem 与 If-Match](https://learn.microsoft.com/en-us/graph/api/driveitem-delete?view=graph-rest-1.0)。

## 2026-08-26 · Files.ReadWrite 真实对照成功，待撤权复测

- 用户确认已完成 Entra 临时权限配置。应用保持持久同步锁；打开宽权限授权入口后浏览器回跳，随后通过 MSAL 强制刷新成功取得包含 Files.ReadWrite 的 token，没有代用户接受微软授权或记录 token。
- 实验请求的业务 scope 仅 Files.ReadWrite；MSAL 返回的 scope 元数据还包含先前授权的 AppFolder、User.Read 及 openid/profile，已在诊断文件完整记录。此结果属于“含 Files.ReadWrite 的宽权限”对照，不能把它称为只有 Files.ReadWrite 的 token。
- 2026-08-26 07:33:23–07:33:34 UTC（北京时间 15:33）：固定 GET approot 返回 200；固定 PUT 探针且 conflictBehavior=fail 返回 201；随后按本次 probe id/eTag 清理，DELETE 返回 204。实验状态 broad-done，probe 清理记录已解除，cleanupUncertain=false。
- 完整脱敏记录见 [宽权限实验 JSON](diagnostics/onedrive-wide-experiment-2026-08-26.json)。没有运行书库同步、枚举全盘或修改本机队列，正常同步仍锁定。
- 与此前 AppFolder 的 GET/PUT 均为 403 相比，加入 Files.ReadWrite 后相同目录读写成功，支持权限范围相关行为差异；尚不能确定是初始化问题或特定微软回归，也不能宣告完整同步代码已验证。
- 下一步需要用户从 Entra 移除 Files.ReadWrite，并在微软个人账号应用授权管理撤销 BookReader 已获授权。用户确认后再清理 MSAL 缓存、仅授权 AppFolder、强制刷新并核对 scope 元数据后复测。当前未执行撤权、AppFolder-only 复测或解除同步锁。
- 本轮仅新增实测记录，没有改业务代码；沿用 `f56055c` 的 63 项测试及两种构建结果，未重复运行测试。真实同步与 iPhone 验收仍未完成。

## 2026-08-26 · 撤权后的 AppFolder-only 复测成功

- 用户明确确认“已撤权”。通过实验步骤 5 清理当前账号 MSAL 缓存，再仅请求 Files.ReadWrite.AppFolder 交互授权；浏览器回跳后执行步骤 6，强制刷新取得 token，不解码、不输出 token。
- MSAL 新范围元数据为 `Files.ReadWrite.AppFolder`、`openid`、`profile`，不含 Files.ReadWrite、User.Read 或其他文件范围。此项是客户端 MSAL 元数据检查；服务端授权撤销操作由用户确认。
- 2026-08-26 07:37:27 UTC（北京时间 15:37），GET `/me/drive/special/approot` 返回 **200**。客户端请求编号 `a03950fc-9029-4ecc-8f64-af91b3fc4e5d`；服务端请求编号 `f30dbc9f-20e8-428c-a118-e92113066b49`。
- 本次实际观察到：原 AppFolder GET/PUT 均 403 → 含 Files.ReadWrite 的 GET 200 / PUT 201 → 探针 DELETE 204 → 用户撤权、清理登录缓存、重新授权后 AppFolder-only GET 200。该现象支持权限范围/应用目录初始化路径相关的差异，但不能单凭此实验认定具体服务端缺陷或与未核实的公开 issue 同因。
- 随后步骤 7 再次强制刷新核对范围，成功结束实验。浏览器显示 `finished`，正常同步锁已解除，自动同步开关保持未勾选；没有执行同步引擎，没有创建 BookReaderLibrary，没有新导入/上传/删除图书。
- [完整实验 JSON](diagnostics/onedrive-wide-experiment-2026-08-26.json) 已补齐复测记录与最终状态。旧宽权限 scope 列表仅为历史实验元数据，不代表当前 token 仍有该权限。
- 当前账号应用目录 GET 的 403 已不再复现。下一步仍需在 AppFolder 下验证 BookReaderLibrary 建库、目录枚举、上传/下载、双端进度和 iPhone；GET 200 不等于完整同步验收通过。版本维持 `0.3.0-alpha.1`，未部署或推送。本轮仅更新诊断和文档，未重复运行代码测试。

## 2026-08-26 · 最小权限真实建库与首本同步

- 用户同意继续真实同步验收。实验已结束，正常认证仍只请求 AppFolder，保留宽 scope 拒绝检查；未再次扩大权限。
- 点击“连接并同步书库”后，页面显示“已同步到 OneDrive”及“查看 OneDrive 书库目录”，真实 BookReaderLibrary 建库/连接与空书库同步成功。正常连接流程启用了前台自动同步。
- 用户通过原生文件选择器导入一本正式 EPUB；观察到书库显示该书、已下载、阅读进度 3%，底栏为“已同步到 OneDrive”。这是应用实际 Graph 同步流程成功的 UI 结果，不是模拟 Graph 测试；尚未通过独立设备或本机缓存移除后的重新下载验证云端内容。
- 未修改该正式图书的阅读位置，未对其进行移除缓存、软删除或恢复实验。后续有副作用的验收只使用专门的测试书。
- 新增可重复生成的原创样本 `tests/fixtures/bookreader-sync-smoke.epub` 及生成器 `scripts/make-smoke-epub.py`。ZIP、XML 和首项 mimetype 检查通过；样本共 3330 字节，SHA-256 为 `640fdea8875dfacee72bb99748135c16d0be37b277ae69998e62819697791117`。
- 在现有 `tests/library.test.ts` 增加真实 EPUB 导入测试：通过 epub.js 解析中文元数据、保存完整原始字节、将 EPUB 与元数据加入待上传队列。测试中仅适配 Node File/jsdom 的 ArrayBuffer 跨 realm 差异，没有替换 EPUB 解析器或修改业务实现。
- `npm test`：4 个测试文件、64 项全部通过；`git diff --check` 通过。本轮仅增加测试样本、测试和文档，没有改业务代码，未重复构建前端或运行 Rust 测试。
- 当前等待用户通过“导入图书”选择测试 EPUB。浏览器自动化接口无法选择本机原生文件对话框，不通过页面脚本注入文件或读取应用私有存储绕过。测试书下载往返、阅读位置恢复、云端软删除/恢复仍待执行；双设备进度、iPhone 真机与 Cloudflare 部署也未完成。
- 版本仍为 `0.3.0-alpha.1`。没有推送、发布或迁移旧桌面正式书库。

## 2026-08-26 · 真实测试书上传、下载与软删除验收

- 用户已通过文件选择器导入原创测试 EPUB，本轮只操作“BookReader 同步验收 2026-08-26”，正式图书保持 3% 阅读进度，未对其执行阅读、缓存移除或删除。
- 测试书上传后，阅读到第二章并翻页，保存位置为 71%；返回书库同步，底栏显示“已同步到 OneDrive”。
- 通过测试书菜单移除本机下载，书目变为“云端 · 已阅读 71%”，移除下载入口消失。再次打开后真实下载成功、章节内容可渲染，显示第二章和 71%。这验证云端 EPUB 往返与本机保留进度的恢复，不等于跨设备进度拉取或逐字符位置一致性验证。
- 将测试书软删除后，书库隐藏该书、设置回收站出现测试书，随后显示“已同步到 OneDrive”。没有调用永久删除图书接口。
- 点击回收站恢复后，书目重新出现，保持 71%。恢复记录同步遇到一次 HTTP 504 / UnknownError，阶段“读取云端文件信息”，请求编号 `63501196-a202-4f7c-9482-c19e9b368e08`；本机恢复状态及队列保留，随后手动重试。没有扩大权限或清理本机数据。
- 恢复后再次移除测试 EPUB 本机下载并打开：再次真实下载成功，仍为第二章、71%，证明软删除/恢复期间原云端 EPUB 保持可用。恢复记录最终上传结果见下方收尾记录。
- 结构化实测记录见 [同步验收 JSON](diagnostics/onedrive-sync-smoke-2026-08-26.json)。记录来自应用界面和实际交互，不读取令牌、账号缓存或私有存储；没有提取下载字节的哈希，样本 SHA-256 仅代表本地源文件。
- `npm test` 64 项通过；`npm run build` 与 `npm run build:desktop` 均通过。Web Service Worker 预缓存 26 项、947.90 KiB。此次没有业务代码改动、未重新运行 Rust 测试，也未在本轮重新验收离线启动。
- 双设备进度、笔记读取、离线并发、iPhone iOS 17.5 真机仍待完成。下一阶段需要用户明确允许推送到已配置的 GitHub 仓库和测试发布，并完成 Cloudflare Pages 连接及 HTTPS 回调登记；当前未推送或部署。

### 收尾结果

- 504 后手动重试及最后一次退出阅读器的进度同步完成。设置页回收站显示“没有已删除的图书”，底栏显示“已同步到 OneDrive”，没有待同步数量或错误提示。
- 测试书保持恢复且已下载状态，第二章、71%；正式图书仍为 3%。本轮未复现 403；不能据此保证其他账号永不出现同类权限问题。
- 基础真实同步验收通过；当前开发版本保持 `0.3.0-alpha.1`，等待推送/测试发布的明确授权及用户 Cloudflare 配置。

## 2026-08-27 · GitHub 推送与 Cloudflare Pages 首次发布

- 用户明确允许推送及测试发布。`codex/pwa-foundation` 已推送到 `origin`，远端与本地均为 `8b93d23`；GitHub `main` 和 `v0.2.4` 基线未改动。
- Cloudflare CLI 登录会请求 Pages 以外的多项写权限，发现后立即取消，未完成该 OAuth 授权。随后由用户使用 Cloudflare GitHub 集成创建测试 Pages 项目，并限制到 `LH-scanf/BookReader` 仓库。
- 测试站点 <https://bookreader-f2l.pages.dev/> 首次构建成功，来源分支 `codex/pwa-foundation`，构建命令 `npm run build`，输出目录 `dist`，Node 22，设置公开前端 Client ID 环境变量；没有上传 secret 或访问令牌。
- 公开站点只读检查通过：首页标题 BookReader，登录按钮可用，离线资源就绪提示出现；manifest 为中文 standalone PWA，根路径启动/作用域及 256/512 PNG 图标配置正确；viewport 含 `viewport-fit=cover`，模拟手机尺寸进入抽屉布局且未观察到横向溢出。
- 本轮未点击生产微软登录，没有访问 OneDrive。必须先由用户在 Entra SPA 回调中登记 `https://bookreader-f2l.pages.dev/`，随后再验证微软登录回跳、真实同步和独立 origin 的首次下载。浏览器尺寸模拟不等于 iPhone 17.5 真机或离线重启验收。

### 生产登录与跨 origin 同步补充验收

- 用户发现生产回调最初位于 Entra 的 Web 平台。BookReader 使用 `@azure/msal-browser` 且没有后端机密客户端，因此按微软 SPA 授权码 + PKCE/CORS 要求，将 `https://bookreader-f2l.pages.dev/` 从 Web 移到单页应用程序平台；localhost 回调继续保留在 SPA。不创建 client secret，不启用隐式授权。
- 迁移后 Pages 站点成功完成微软登录并显示原个人账号，随即完成首次真实同步，没有出现 redirect URI、CORS、403 或 504 错误。
- Pages origin 原本为空的本机书库从 OneDrive 拉到两本书及进度：测试书显示云端 71%，另一正式书也可见。只对测试书执行下载验收；从云端打开成功，内容为第二章“重新下载与恢复”，位置 71%。退出后同步成功。
- 这次结果验证了独立 origin 的元数据、EPUB 下载和跨设备进度读取，不再只是同一浏览器本机进度恢复。未对正式书执行自动化打开、删除或恢复；页面上该书后续显示的进度变化属于用户当前站点交互，不归因于本轮测试动作。
- 桌面浏览器生产流程已通过。iPhone Safari/主屏幕 PWA 的登录回跳、离线重启、存储降级、手势与横竖屏仍待用户真机验收。

## 2026-08-27 · 第二轮 iPhone 阅读与笔记交互调整

- 根据 iPhone 真机反馈重做分页触摸判断：允许带自然斜向偏移的左右滑动，分页内容区拦截纵向滚动；上一页/下一页仍通过 epub.js 的分页接口执行。翻页视觉增加 3D 弯页、移动阴影和边缘高光，这是 WebKit DOM 能实现的拟真效果，不等同于 Apple Books 的私有原生页面网格动画。
- 隐藏阅读工具栏后只保留屏幕右上角内收的小型圆形“显示”按钮，避开刘海安全区且不再贴边裁切。阅读内容继续向上下扩展，底部章节名称和横向进度条在 Windows 与 iOS 都移除，仅保留可点击切换“百分比 / 页码”的紧凑进度文字。
- Web/PWA 阅读页现在支持选中文字后高亮、添加或编辑感悟、删除笔记。编辑写入原批注 ID；删除生成 tombstone；保存与删除都先写本机文档并进入持久同步队列，之后出现在整书笔记页面。整书总结仍维持桌面端编辑。
- iPhone 笔记编辑使用全屏输入页，包含所选原文、取消和完成按钮；桌面端保持对话框布局。分页内容锁定纵向滚动时，已有原生文字选区仍允许调整选择范围。
- 自动化验证新增斜向滑动方向判定，以及 Web 批注新建、编辑、删除 tombstone 与持久队列测试。移动视口浏览器验证了选中文字、打开全屏笔记编辑页及底部栏精简；实际 iOS 长按选区、手指翻页手感、离线笔记同步仍需要重新部署后真机复测。

## 2026-08-27 · PWA 更新入口调整

- iOS 主屏幕 PWA 继续采用等待用户确认的更新策略，避免阅读中被刷新；更新提示从底部悬浮通知移动到“设置 → 应用更新”。发现新版时提供“更新”和“等等再说”。
- 设置页增加“检查更新”，通过现有 Service Worker registration 主动请求更新检查；新版本下载并进入等待状态后，更新操作会令新 worker 接管并刷新页面。本机 EPUB、书库索引与待同步队列不因刷新而主动删除。

## 2026-08-27 · iPhone 第二次真机反馈修复

- 分页阅读器固定为 iOS 视口内的独立滚动上下文，阻止 Safari 在左右边缘手势时带动整个页面纵向滚动；iframe 文档的触摸监听继续按横向距离判断上一页或下一页。
- 长按选区除 epub.js 的 `selected` 事件外，新增原生 `selectionchange` 回退：从选区 Range 生成 CFI 后展示“高亮标记 / 添加笔记”菜单，覆盖 iOS 仅显示系统选区而未触发 epub.js 回调的情况。
- 隐藏工具栏后的恢复按钮改为右上角固定小方形图标，不再半贴边；书库搜索只搜索书名，输入框改为单行垂直居中，避免移动端占位文字与图标遮挡。
- 设置页卡片由隐式双列改为紧凑单列流式布局，收紧外观按钮、操作区与标题间距，修复回收站与应用更新标题在窄屏逐字换行的问题。

## 2026-08-27 · iPhone 手势事件链修正

- 复核 epub.js `0.3.93` 源码后确认：`rendition` 的 `rendered` 回调第二个参数是 `IframeView`，不是 `Contents`。此前把它当作 `Contents` 使用会使 iframe 内注册的触摸与选区监听器根本没有挂载。
- 渲染回调现仅处理主题和高亮；键盘、链接、滚轮和 iOS `selectionchange` 回退改由 `rendition.hooks.content.register(contents => ...)` 在真实 `Contents` 生命周期中注册。
- 翻页改为直接订阅 epub.js 已转发的 `rendition` `touchstart` / `touchend` 事件，不再在 iframe 中注册触摸事件或调用 `touchmove.preventDefault()`。判定规则为：550ms 内、横向至少 50px、横向距离大于纵向距离的 1.35 倍、最小横向速度 0.12px/ms；左右各 24px 交给 Safari 系统边缘手势。
- 阅读根节点和 EPUB iframe 内容区移除 `touch-action: none`，保留固定视口、`overflow: hidden` 与 `overscroll-behavior`。这让 Safari 原生长按选择、拷贝、查询与翻译继续可用；BookReader 的高亮/笔记按钮仍以 epub.js `selected` 为主、`selectionchange` 防抖为回退，并在 iOS 底部展示，不试图覆盖系统菜单。
- `npm test`（69 项）、`npm run build` 与 `npm run build:desktop` 均通过。变更尚需推送和 Cloudflare Pages 发布后在 iPhone 真机复测；桌面模拟触摸不能替代该验收。

## 2026-08-27 · EPUB iframe 沙箱事件诊断

- 由于 iPhone 仍无法翻页或显示自定义选区栏，增加一次可重复、显式开启的生产诊断。默认 `allowScriptedContent` 仍为 `false`；只有 URL 包含 `epubIframeDiagnostic=true` 时才临时传入 `true`，用于比较 iframe 的 `allow-scripts` 沙箱差异。
- `?epubIframeDiagnostic=false` 与 `?epubIframeDiagnostic=true` 都进入诊断模式：页面固定显示 `touchstart`、`touchend`、`selectionchange`、epub.js `selected` 与选区轮询的累计计数，并用状态提示报告最后收到的事件。诊断模式不会翻页、不会展示笔记栏，也不会写入批注或同步队列。
- 正常模式新增 250ms 的 `rendition.getContents()` 选区轮询后备路径：只要 WebKit 已建立非折叠原生选区且可转换为 CFI，就调用既有底部高亮/笔记栏。诊断模式下同一逻辑只计数，不改变阅读数据。
- 此实验不能证明 `allow-scripts` 是长期方案，也不应在完成比对后保留为默认。若两种参数结果确有差异，后续必须先评估 CSP、移除 EPUB `<script>`、内联事件属性和允许脚本的隔离设计，不能直接放开不受信任书籍脚本。
- `npm test`（69 项）、`npm run build` 与 `npm run build:desktop` 均通过；尚待 iPhone Safari 与主屏幕 PWA 的四组真机结果。

## 2026-08-28 · iOS 阅读重排与桌面 OneDrive 目录兼容

- 根据后续真机反馈，原生蓝色选区后已能显示 BookReader 的底部“高亮标记 / 添加笔记”栏，说明选区识别链已恢复；iframe `allow-scripts` 诊断仍保持为显式 URL 实验，未改动默认的安全设置。
- 隐藏工具栏后的恢复入口由覆盖书页的固定眼睛图标改为阅读器布局中的窄顶栏，按钮占据自身行，书页从其下方开始，不再与 EPUB 内容、安全区或浮层叠加。
- 字号变化改为 140ms 防抖的受控重排：保留当前 CFI，重新 display，等待两帧布局稳定后移除并按原 CFI 重建高亮 SVG，从而避免高亮停留在旧字号坐标。
- 阅读设置增加临时“分页诊断”与上一页/下一页测试按钮。开启后记录 iframe 内容触摸、Rendition 转发、方向识别、翻页请求和 `relocated`；用于区分 iPhone 手势链故障与 epub.js 分页接口/布局故障，不拦截原生触摸。
- 桌面端识别 OneDrive 个人应用目录结构：用户选择 `Apps/BookReader` 时，若已有 `BookReaderLibrary/books` 或 `library-version.json`，自动将实际书库根目录切换到 `Apps/BookReader/BookReaderLibrary` 并保存该路径。启动和后续 OneDrive 文件到达时均会重新识别，避免将外层 App 文件夹误当作空书库。

### 后续真机交互补充

- iPhone 仍报告分页横滑无效且从左边缘滑回到了旧的微软登录网页。阅读器打开期间新增同文档 history guard：首个 iOS 返回手势停留在阅读器，而正常离开阅读器后会移除该保护；显式“返回书库”仍是离开阅读器的入口。
- 阅读设置面板增加自身垂直滚动，避免字号、主题后的“分页诊断”被固定高度面板裁掉。诊断按钮未放回书页左右两侧，以保持 iOS 阅读区没有长期翻页按钮；用户从工具栏的“阅读设置”进入后向下滚动即可看到。
- 本轮 `npm test`（69 项）、`npm run build` 与 `npm run build:desktop` 均通过。下一次真机需要先验证设置中的上一页/下一页测试是否触发 `relocated`，再根据诊断计数决定是 iframe 事件桥、方向识别还是 epub.js 分页容器问题。

### 分页容器修正

- 真机诊断显示“下一页测试”会发出翻页请求，但 `relocated` 保持 0，页面被推进到空白区域；说明手势之前不是唯一问题，epub.js `DefaultViewManager` 的横向 stage 无法在 iOS 的 `overflow: hidden` 下可靠推进。
- 分页 render 的 stage 改为 `overflow: scroll`，并通过 CSS 只允许 `overflow-x`、禁止 `overflow-y`、隐藏滚动条、启用 iOS 横向惯性滚动。DefaultViewManager 的 `next/prev` 与用户横滑现在共用同一个 `scrollLeft` 通道；不重新启用 `touchmove.preventDefault()`。
- 本轮 `npm test`（69 项）、`npm run build` 与 `npm run build:desktop` 均通过，仍需真机验证下一页测试和中心区域横滑实际触发 `relocated`。

## 2026-08-28 · 整书笔记 Windows/iOS 共享布局重设计

- 按参考图的阅读感保留 BookReader 既有主导航，不实现额外的标签、智能筛选或统计列。整书笔记内容区改为顶部图书工具栏、左侧当前书摘录摘要、右侧单条详情的 Master-Detail 结构。
- 完整图书列表从常驻左栏移入顶部弹出式选择器；当前图书、封面、作者、摘录数、打开图书和独立整书总结入口保持在顶部，减少长期占用空间。
- 右侧详情复用现有 `AnnotationRecord`：原文使用较大衬线字体，感悟沿用 `saveAnnotation`，元数据读取既有章节/CFI/时间，回到原文继续调用原 CFI 定位，删除继续使用原 tombstone 与同步队列。
- 整书总结复用 `BookNote` 与 `persistBookNote`；桌面端可编辑，Web/iOS 仍只读。普通摘录感悟维持现有 Web provider 写入和同步能力。
- 小于720px时左右栏纵向排列，图书选择器限制在安全视口内；没有新增或迁移 `books`、`notes`、`annotations`、`progress`、`lifecycle` 文件，也未改变 Graph AppFolder 结构。
- `npm run build`（Safari 17/PWA）、`npm run build:desktop`（Chrome 105/Tauri 前端）与 Windows NSIS 打包通过。未运行浏览器视觉自动化或 iPhone 真机测试；布局、键盘弹出、滚动和安全区仍需真机验收。
