# 部署与运行

本页是当前可执行的运行、构建与部署流程。当前状态与未完成验收请看 [当前状态](CURRENT_STATE.md)；403 实验和过去的部署过程请到 [历史记录](history/README.md) 查阅。

## 本地开发与构建

需要 Node.js、Rust 和 Windows WebView2（桌面端）。

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

| 命令 | 结果 |
| --- | --- |
| `npm run build` | Web/PWA 产物 `dist/` |
| `npm run build:desktop` | Desktop 前端产物 `dist-desktop/`，不注册 Service Worker |
| `npm run tauri build` | Windows 桌面构建，自动调用 `build:desktop` |

构建通过不等于用户验收通过；验收范围见 [测试](TESTING.md)。

## Microsoft SPA 与 OneDrive

1. 在 Microsoft Entra App registrations 创建应用，选择支持目标 Microsoft 账号类型。
2. 在 **Authentication** 中添加 **Single-page application (SPA)** 平台的回调地址：本地开发使用实际开发 origin；Cloudflare Pages 使用部署站点的 HTTPS 地址。不要将纯前端应用配置成 Web confidential client。
3. 添加 Microsoft Graph **Delegated** 权限 `Files.ReadWrite.AppFolder`。不使用 application permissions，也不把 `Files.ReadWrite.All` 作为正式同步权限。
4. 从 `.env.example` 创建 `.env.local`，设置 `VITE_MS_CLIENT_ID=<Client ID>`，然后重新启动或构建。
5. 首次使用时由用户在应用中确认“连接并同步书库”。Web 会在 OneDrive 应用专用目录下使用 `BookReaderLibrary/`；桌面端选择由 OneDrive 客户端同步到本机的对应书库目录。

参考：[注册 Microsoft 应用](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)、[SPA 授权码与 PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)、[OneDrive AppFolder](https://learn.microsoft.com/en-us/graph/onedrive-sharepoint-appfolder)。

## Cloudflare Pages

在 Cloudflare Pages 创建或更新项目时：

| 项目 | 值 |
| --- | --- |
| 构建命令 | `npm run build` |
| 输出目录 | `dist` |
| 环境变量 | `VITE_MS_CLIENT_ID=<公开的应用 Client ID>` |

部署 URL 必须同时登记为 Microsoft SPA 回调地址。发布后至少检查 HTTPS 首页、登录回跳、manifest、Service Worker 更新提示与离线重启；桌面浏览器模拟的手机尺寸不能替代 iPhone 验收。

## PWA / iPhone 安装与验收

1. 使用 HTTPS 部署地址在 iPhone Safari 打开站点。
2. 通过“分享”菜单添加到主屏幕，再从主屏幕启动。
3. 验证本地书库可打开、阅读位置可恢复、离线重启不会丢失本机数据，并在已授权账号下验证同步。

完整测试编号与待确认项见 [测试](TESTING.md)。

## 安全与数据注意事项

- 不提交 `.env.local`、令牌、账号信息或诊断中的敏感内容；Client ID 可以公开，客户端不使用 client secret。
- 不要通过清空站点数据、扩大为全盘文件权限或重新绑定另一个账号来处理普通同步问题。先保留本机队列、错误阶段和请求编号。
- 退出登录不应删除本机书库或未完成队列。正式书库的删除为软删除；不要用验收实验操作正式图书。
- 生产同步仅使用 `Files.ReadWrite.AppFolder`。临时宽权限或 403 对照属于历史诊断，不是日常部署流程。
