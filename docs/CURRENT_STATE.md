# 当前状态

- **当前基线：** `pre-mobile-v1` / `01a0c13`；当前开发分支为 `mobile-v1`，已进入 V1 收口。
- **当前支持平台：** Windows Desktop，以及 Web/PWA；已有真机使用和反馈，完整 Mobile V1 验收尚未完成。
- **已经可用：** 本地 EPUB 书库与阅读、阅读位置/CFI、笔记与高亮、软删除/恢复；Web/PWA 的离线启动、Microsoft 登录和 OneDrive AppFolder 同步路径已具备。详情见 [数据与同步](DATA_SYNC.md)。
- **当前主要问题：** Mobile V1 的真机验收与完整双设备进度验收仍待确认；不再继续扩展 V2 功能。
- **当前阶段：** V1 收口 / Desktop Compatibility & Parity Pass。
- **当前已完成：** Mobile `scrolled-doc` 正常重开会在 layout ready 后按保存 CFI 恢复真实位置，并保护 progress 不被临时 relocated 覆盖；普通 progress/CFI 更新不重建 Reader。
- **Desktop 对齐：** Tauri 继续使用本地 OneDrive 文件夹模型；MSI 使用单独 WiX 数字版本映射；Desktop bundle 已在编译期隔离 Web/PWA auth 与 Graph sync 依赖。
- **下一步：** 完成真实 iPhone 与 Windows/OneDrive 双端验收，确认 V1 release / main 合并方案。
