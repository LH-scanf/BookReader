# 当前状态

- **当前基线：** `pre-mobile-v1` / `01a0c13`。
- **当前支持平台：** Windows Desktop，以及 Web/PWA；已有真机使用和反馈，完整 Mobile V1 验收尚未完成。
- **已经可用：** 本地 EPUB 书库与阅读、阅读位置/CFI、笔记与高亮、软删除/恢复；Web/PWA 的离线启动、Microsoft 登录和 OneDrive AppFolder 同步路径已具备。详情见 [数据与同步](DATA_SYNC.md)。
- **当前主要问题：** Mobile V1 的真机验收仍在持续进行；完整双设备进度验收也仍待确认。Desktop / Mobile 顶层 shell 已隔离，但部分页面内部仍保留 shared legacy UI / 响应式适配。
- **当前阶段：** Mobile V1。
- **当前正在做：** Mobile V1 Task 5B.3 — iOS PWA 跨会话 Microsoft 登录恢复与 Graph 临时故障处理。
- **下一步：** 等待 Task 5B.3 iPhone/PWA 真机验收；恢复与退避不得阻塞本地阅读。
