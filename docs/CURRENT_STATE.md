# 当前状态

- **当前版本：** V1 Release Preparation / `1.0.0`；当前开发分支为 `mobile-v1`。
- **支持平台：** Windows Desktop，以及 Web/PWA。
- **开发完成：** Mobile V1、Reader 稳定性与 CFI 恢复、Local-first / OneDrive sync、mutable annotation / BookNote optimistic concurrency、conflict resolver，以及 Desktop Compatibility / Parity Pass 均已完成。
- **已验证：** 自动化测试、Web build、Desktop bundle isolation guard、Rust check/test 与 Windows EXE / NSIS / MSI 打包均已通过。
- **Desktop 对齐：** Tauri 保持本地 OneDrive 文件夹模型与 Desktop shell；Web/PWA auth、Graph sync 和后台同步依赖在编译期不进入 Desktop bundle。
- **当前阶段：** V1 Release Closure；没有剩余代码或构建阻塞。
- **待真人验收：** iPhone/PWA、Windows Desktop 与真实 OneDrive 跨设备同步 smoke。验收完成后再决定合并 `main` 和创建 `v1.0.0` tag。

> 历史基线 `pre-mobile-v1` / `01a0c13` 仅用于回溯，不代表当前开发状态。
