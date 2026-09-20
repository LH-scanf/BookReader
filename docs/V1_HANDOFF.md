# BookReader V1 交接与下一阶段路线

> 状态：Mobile V1 功能开发基本完成，进入 V1 收口 / Desktop 对齐 / V2 规划阶段。  
> 当前开发分支：`mobile-v1`  
> 当前分支头：`7b70fdb fix: keep mobile reader instance stable`  
> 基线：`pre-mobile-v1` / `01a0c13`

---

## 1. 当前产品定位

BookReader 目前是一个：

**本地优先、支持 Windows Desktop 与 Web/PWA、以 EPUB 阅读、笔记和 OneDrive 同步为核心的私人阅读器。**

Mobile V1 的核心目标已经从“把桌面版压缩到手机屏幕”转为：

**一个项目，共享底层，两套明确独立的 UI。**

Mobile 侧产品方向保持：

**打开就能读、阅读时界面消失、想法随手记录、笔记容易回看、同步尽量感觉不到存在。**

---

## 2. Mobile V1 已完成的主要能力

### 2.1 端侧隔离

- Desktop / Mobile 顶层 App Shell 已明确分离。
- Mobile UI 修改默认不再同步改 Desktop UI。
- 图书、阅读进度、笔记、同步等底层能力继续共享。

### 2.2 Mobile 书库

- 底部一级导航：`书库 / 笔记 / 设置`。
- 手机侧取消桌面侧边栏。
- 书库顶部简化为标题和导入入口。
- 继续阅读模块保持第一屏可见，但不再使用巨大 Hero 卡片。
- 三列书架。
- 封面下始终显示书名。
- 书架按最近真正进入阅读页的时间排序。
- 图书管理改为长按入口，低频操作不常驻。

### 2.3 Mobile Reader

- Mobile V1 以连续上下滚动为稳定默认阅读方式。
- Windows 滚动模式使用 epub.js 的连续 spine 管理器；目录命中仅含章节封面/插图的分割文件时，紧随其后的正文文件仍会自动接续并可继续下滑。Mobile 保持已验证的 `scrolled-doc` 初始化路径；目录跳转识别“章节标题+插图”的短封面 spine 后会直接进入紧随的正文 spine，避免黑屏和封面卡死。
- 默认沉浸阅读，工具栏隐藏。
- 轻点中央区域显示 / 隐藏 Reader controls。
- 顶部：返回、书名/章节、更多。
- 底部：目录、Aa、笔记。
- `更多` 中保留低频能力：书内搜索、图书信息。
- Reader instance 生命周期已修复，正常阅读进度变化不再导致 epub.js 重建。
- 已修复 Mobile `scrolled-doc` 重开后按保存 CFI 恢复实际纵向阅读位置的路径。
- Reader 恢复期间有保护逻辑，避免临时章节起点覆盖真实进度。

### 2.4 阅读设置与目录

- `Aa` 保留字号和阅读主题。
- 阅读主题：明亮 / 纸张 / 夜间。
- Mobile 目录采用 Bottom Sheet。
- EPUB 目录层级、缩进、当前章节高亮保留。
- 当前未增加行距、页面边距等额外设置；现有正文宽度和行距真机体验可接受，暂不为了“设置丰富”增加复杂度。

### 2.5 高亮与感悟

- iOS 原生文字选择继续负责拷贝、查询、翻译等系统功能。
- BookReader 只提供自己的高亮 / 写感悟入口。
- 写感悟使用 Mobile 交互，不离开阅读场景。
- Annotation 可重复编辑感悟。
- Annotation 删除使用 tombstone 语义，不直接破坏同步一致性。

### 2.6 Reader 内快速笔记

- Reader 底部“笔记”是本书快速回顾入口。
- Bottom Sheet 展示当前书的摘录、章节和感悟。
- 支持补充 / 编辑感悟。
- 支持“回到原文”。
- 支持进入完整笔记页。
- 摘录按正文顺序而非创建时间排列。

### 2.7 完整笔记页

- Mobile 已脱离 Desktop master-detail 工作台。
- 顶部横向封面切换图书。
- 当前图书信息、摘录数量、打开图书入口。
- 读后总结以阅读态为主，编辑时才进入编辑态。
- “原文与感悟”采用轻卡片阅读结构。
- 有感悟时默认展示；无感悟时显示添加入口。
- 单条进入编辑态，不让所有 textarea 永久展开。
- 低频删除放入更多操作。
- Desktop 原完整笔记工作台保持原布局和交互。

### 2.8 Mobile 设置

- 设置首页重构为：同步 / 数据与存储 / 外观 / 关于。
- OneDrive 技术实现细节不再暴露在普通首页。
- 同步管理、高级同步进入二级 / 三级页面。
- 返回层级按页面父子关系工作。
- 外观页提供浅色 / 深色选择和预览。
- 数据与存储包含离线图书、本地数据保护、回收站等入口。
- PWA 更新能力保留；当前为“自动检查、用户确认应用更新”，不是阅读中强制自动刷新。

---

## 3. 同步系统当前状态

### 3.1 Local-first

正常原则：

1. 本地书库先加载；
2. 用户可以立即阅读；
3. OneDrive 在后台恢复会话并同步；
4. 网络 / OneDrive / 登录异常不得阻塞本地阅读和记录。

### 3.2 Microsoft 会话恢复

- 使用 MSAL Browser v4。
- 正常优先恢复已有 account / silent token。
- 为 iOS PWA 增加了历史 login hint 和自动 session recovery 路径。
- 能静默恢复时自动恢复。
- 真正需要用户交互时才显示“需要重新连接”。
- 不自行持久化 access token / refresh token。

### 3.3 后台同步

- 启动后后台尝试同步。
- 回到前台、恢复联网等场景会触发同步尝试。
- 同步失败不阻塞 Reader。
- HTTP 502 / 503 / 504 等临时 Graph 错误按 transient error 处理并退避重试。
- Mobile Reader 不因临时 504 等错误显示巨大阻塞式浮层。

### 3.4 Mutable document optimistic concurrency

已修复旧模型中“所有非 progress 同名不同内容都视为冲突”的问题。

共享可变文档：

- `annotations/{bookId}/{annotationId}.json`
- `notes/{bookId}.json`

使用：

- PendingWrite `baseEtag`
- Graph `If-Match`
- optimistic concurrency

因此：

- 正常编辑已同步过的感悟可以再次同步；
- 正常编辑读后总结可以再次同步；
- annotation tombstone 删除可以安全同步；
- 真正多设备并发修改仍会进入冲突。

相关关键提交：

- `9705eef fix: support safe mutable document sync`

### 3.5 冲突处理

- 旧 queue 没有 baseEtag 时不静默覆盖。
- Mobile 已有共享可变文档冲突 resolver。
- 用户可以明确选择保留本机版本或 OneDrive 版本。
- “保留本机”仍通过最新 eTag + If-Match 安全提交。
- “保留云端”只解决当前 path，不清空其他 queue。
- 解决一条后继续后续同步。

相关关键提交：

- `6d0d2e4 feat: add mutable sync conflict resolution`

---

## 4. 最近 Reader 稳定性修复

### 阅读位置恢复

真机曾复现：

- 读到 62%；
- 正常退出；
- 首页继续阅读正确显示 62%；
- 断网重开 Reader 却落到约 58%。

由此确认问题不是 OneDrive，而是 `scrolled-doc` 恢复时仅 `rendition.display(cfi)` 不足以把 viewport 恢复到 CFI 对应正文位置。

已增加 Mobile CFI restore 逻辑，在 layout ready 后恢复真实纵向位置。

### 分割章节目录跳转

2026-09-20 修复：部分 EPUB 会把同一章拆为“章节封面”与“正文”两个连续 spine 文件，而目录仅指向前者。此前 Windows 滚动模式使用 `default` manager 且关闭连续加载，跳转后只能看到封面页，滚动容器没有后续内容。Windows 现在使用 `continuous` manager、`scrolled-continuous` flow 和纵向滚动容器，正文 spine 会自动接续；分页模式保持原有单章节展示行为。Mobile 的全屏 iframe 与 continuous manager 不兼容，会造成首屏黑屏，因此保持已验证的 `default` + `scrolled-doc` 初始化路径，并在目录跳转后仅对“章节标题+插图”的短封面 spine 自动跳至紧随的正文 spine；普通封面、扉页等目录项不会被跳过。

相关提交：

- `95b53f7 fix: restore mobile reading position precisely`

### Reader instance 稳定

上一个修复一度引入：

`book.progress` 更新 → restore callback identity 改变 → bootstrap effect 重跑 → epub.js destroy / recreate → Reader 反复 Loading。

现已解除实时 progress 与 Reader bootstrap 生命周期的错误依赖链。

相关提交：

- `7b70fdb fix: keep mobile reader instance stable`

当前原则：

**普通 progress / CFI / chapter 更新绝不能重建整个 Reader。**

---

## 5. Mobile V1 当前不继续扩展的功能

以下内容不作为 V1 收口前的新增功能：

- 左右分页 / 左右滑动翻页；
- 行距调节；
- 页面边距调节；
- 字体选择；
- 朗读；
- 全局搜索；
- 年度阅读档案；
- 阅读时长统计；
- 复杂阅读筛选。

原因不是这些功能没有价值，而是当前 V1 优先保持稳定和产品简洁。

---

## 6. V1 收口建议

在进入 V2 之前，先做一次短周期收口：

### 6.1 Mobile 真机稳定使用

连续正常使用几天，只记录和修复阻塞级问题：

- Reader 无法打开；
- 阅读位置明显丢失；
- 高亮 / 笔记数据丢失；
- 同步静默覆盖数据；
- 无法恢复的登录 / 同步故障；
- PWA 无法正常更新 / 启动。

纯视觉小问题先进入 V2 backlog，不继续打断 V1 收口。

### 6.2 完整回归

至少验证：

- Mobile Library；
- Mobile Reader；
- Reader Notes；
- Full Notes；
- Settings；
- 登录恢复；
- 离线阅读；
- 单设备正常同步；
- annotation / BookNote 重复编辑同步；
- 真冲突处理；
- 回收站；
- PWA 更新。

### 6.3 Git / Release

V1 稳定后：

1. 更新 docs；
2. 运行完整测试和 Web/Desktop build；
3. 将 `mobile-v1` 合并回 `main`；
4. 建议打一个明确 tag，例如 `v1.0.0`；
5. 再从 `main` 创建后续开发分支。

不要继续让 `main` 长期停留在 `pre-mobile-v1`。

---

## 7. 下一阶段：Desktop compatibility / parity pass

V1 收口后，先不要立即大规模开发 V2。

先对 Windows/Desktop 做一次兼容性检查。

目标不是把 Mobile UI 搬到 Windows，而是确保共享能力没有让 Desktop 落后。

重点检查：

### 7.1 同步

- Desktop 是否使用新的 mutable document optimistic concurrency；
- Desktop 是否能识别 / 安全处理 conflict；
- 新 auth / sync 状态是否造成 Desktop 回归；
- 502 / 503 / 504 transient error 分类是否合理；
- progress 设备专属 replace 语义是否保持。

### 7.2 数据与笔记

- Annotation / BookNote 编辑、删除、恢复是否兼容；
- Desktop Notes Workspace 是否继续正常保存和重新加载；
- 回收站、恢复图书行为是否和共享数据模型一致。

### 7.3 Reader

- Mobile 的生命周期 / CFI 修复是否无意影响 Desktop pagination；
- Desktop 快捷键 / 分页 /目录 /选区是否正常；
- Desktop Reader 不需要采用 Mobile UI。

### 7.4 UI 原则

**Desktop 保留 Desktop 交互。**

只对齐“能力与数据语义”，不做 Mobile 化重设计。

这个阶段建议命名：

**Desktop V1 Compatibility / Parity Pass**

---

## 8. V2 推荐方向

Desktop 对齐完成后进入 V2。

优先级建议：

### V2-1 阅读 Session / 阅读时长

先建立可靠的阅读 session 数据：

- 本次阅读时长；
- 今日阅读时长；
- 单本累计时长。

需要先解决：

- 前后台切换；
- Reader 打开 / 关闭；
- 用户长时间不操作；
- iOS PWA 被系统挂起；
- 多设备是否合并。

### V2-2 阅读统计

在 session 数据稳定后再做：

- 今日 / 本周阅读；
- 本周阅读天数；
- 单本阅读时长；
- 完成图书数量。

### V2-3 年度阅读档案

建立可分享 / 截图的年度总结：

- 今年读了多少本；
- 阅读总时长；
- 月度阅读分布；
- 最常阅读的书；
- 高亮 / 感悟数量。

### 后续候选

- 全局搜索：书名 + 正文 + 摘录 + 感悟；
- 朗读；
- 稳定分页；
- 更高级的阅读排版；
- 阅读时间线。

---

## 9. 下一次新对话建议从哪里开始

推荐新对话第一阶段不要直接做 V2。

顺序：

1. **确认 Mobile V1 收口清单；**
2. **完成 V1 release / main 合并方案；**
3. **执行 Desktop Compatibility / Parity Pass；**
4. **再设计 V2-1 阅读 Session。**

新对话可以直接使用下面这句话作为入口：

> 我们继续 BookReader 项目。Mobile V1 功能开发已经基本完成，请先读取 `docs/V1_HANDOFF.md`、`docs/CURRENT_STATE.md`、`docs/MOBILE_V1.md`、`docs/DATA_SYNC.md` 和 `docs/TESTING.md`。不要重新讨论已经冻结的 Mobile V1 UI。当前目标是先做 V1 收口与 Desktop Compatibility / Parity Pass，完成后再进入 V2 阅读时长 / 阅读统计。

---

## 10. 项目纪律继续保持

后续仍采用：

**一个任务 → 明确范围 → Codex 实现 → 真机 / Desktop 验收 → 提交 → 下一任务。**

继续禁止：

- 一次给 Codex 一个巨大 V2 task list；
- Mobile UI 修改顺手改 Desktop UI；
- 普通 UI 任务顺手改同步 / schema；
- 为了“功能丰富”加入没有真实使用场景的设置；
- 为修一个 Reader 问题重构整套 epub.js 生命周期；
- 遇到冲突时默认 Last Write Wins。

稳定性、数据安全和真实使用体验继续优先于功能数量。
