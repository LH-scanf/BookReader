# 项目功能用例

当前基线：`pre-mobile-v1` / `01a0c13`

以下为验收用例，不代表已执行通过。**构建通过 ≠ 用户验收通过。** 每次修复应引用用例编号；历史结果可查 [Bug 修复时间线](history/BUGFIX_TIMELINE_2026-08.md)。

## Mobile V1 后续测试原则

每个 Mobile UI Task：

- 验 Mobile；
- 回归 Desktop；
- 不允许一个端修好另一个端坏掉。

具体 Mobile V1 验收用例在各 Task 确定时逐步补充，不在此提前假设。

## Task 0A：端侧 shell 选择与回归

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| UI-MODE-01 | Tauri 窗口缩窄至小于等于 720px | 始终使用 Desktop shell，不切换为 Mobile shell；原侧边栏行为保持。 |
| UI-MODE-02 | 普通桌面浏览器打开应用 | 使用 Desktop shell。 |
| UI-MODE-03 | iPhone、Android 或移动 Web/PWA 打开应用 | 使用 Mobile shell；Task 0A 仍显示现有侧边栏和页面，不引入新视觉。 |
| UI-MODE-04 | 分别在 Desktop 与 Mobile shell 打开书库、笔记、设置 | 现有导航、书库、笔记、设置行为保持；一个端的修复不能破坏另一个端。 |

`resolveUiMode` 的自动化回归覆盖 Tauri 窄窗口、Desktop Web 和 Mobile Web。`EpubReader.tsx` 不属于 Task 0A 的改动范围。

## Task 1：Mobile 底部导航骨架

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-NAV-01 | 在 Mobile shell 打开书库、笔记、设置 | 固定底栏只有“书库 / 笔记 / 设置”三个入口；当前入口有克制的 active 状态。 |
| MOBILE-NAV-02 | 在 Mobile shell 检查导航区域 | 不显示汉堡菜单、侧边栏、sidebar backdrop、展开/收起按钮或“已读”一级入口。 |
| MOBILE-NAV-03 | 在 Mobile shell 三个入口间切换 | 复用既有 `library`、`notes`、`settings` 状态与数据；切换不丢失书库、笔记或设置状态。 |
| MOBILE-NAV-04 | 在 iPhone 安全区及长内容页面滚动 | 底栏固定在 `safe-area-inset-bottom` 上方，书架、笔记和设置内容不会被遮挡。 |
| MOBILE-NAV-05 | 在 Desktop shell 检查导航 | 原侧边栏及“我的书库 / 已读 / 整书笔记 / 设置”全部保留，视觉和行为不受 Mobile 改动影响。 |
| MOBILE-NAV-06 | 打开阅读器 | `view === "reader"` 时不显示 Mobile 底部导航；阅读器保持现有实现。 |

## Task 2A：Mobile 书库首页

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-LIB-01 | 在 Mobile shell 打开书库 | Header 只显示“书库”和轻量 `+`；不显示“个人阅读空间”、搜索框或大号导入按钮。 |
| MOBILE-LIB-02 | 点击 Mobile Header 的 `+` | 调用现有 EPUB 导入能力；不引入新的导入流程。 |
| MOBILE-LIB-03 | 有未读且有进度的图书时打开书库 | 显示紧凑横向“继续阅读”卡片；整张卡可打开图书，不显示作者或巨大操作按钮。 |
| MOBILE-LIB-04 | 检查 Mobile 书架 | 标题为“我的书架”，无排序控件/菜单；书架为三列，封面下始终显示最多两行书名。 |
| MOBILE-LIB-05 | 检查不同进度图书 | 进度仅以封面底部细线表达；0% 不显示进度线，不显示作者、下载状态或长进度文字。 |
| MOBILE-LIB-06 | 打开图书更多菜单与滚动到最后一行 | 既有更多菜单能力仍可使用；三列不横向溢出，内容不被底部导航遮挡。 |
| MOBILE-LIB-07 | 在 Desktop shell 打开书库 | 原“个人阅读空间 / 我的书库”、搜索、导入、排序、书架和元信息保持不变。 |

## Task 2B：Mobile 最近阅读语义

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-RECENT-01 | 依次真正进入 Reader 的图书 A、B，再返回书库 | B 显示为 Continue Reading，且排在 A 前；不按进度或导入时间选择。 |
| MOBILE-RECENT-02 | 打开 progress 为 0 的未读图书后返回书库 | 该书仍显示为 Continue Reading。 |
| MOBILE-RECENT-03 | 最近打开的图书标记为已读后返回书库 | Continue Reading 整个模块消失；不自动补位到第二近的未读图书。 |
| MOBILE-RECENT-04 | 长按、打开/取消 Action Sheet、标记已读、删除、移除本机下载或导入图书 | 不改变最近阅读顺序。 |
| MOBILE-RECENT-05 | 从完整笔记的“打开图书”或“回到原文”进入 Reader | 该书成为最近打开的书。 |
| MOBILE-RECENT-06 | 没有最近打开记录、记录损坏或含已删除图书 ID | 书库仍可用；没有有效最近书时不显示 Continue Reading；未打开图书保持原有相对顺序。 |

最近打开时间仅保存在当前设备的 `bookreader-mobile-recent-open-v1`，不写入 BookReaderLibrary 或同步协议。Desktop 书库排序和 Continue Reading 保持原有行为。

## Task 3A：Mobile Reader 沉浸式外壳

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-READER-01 | 在 Mobile Reader 打开图书 | 默认仅显示正文和轻量右下角进度；无常驻 toolbar、眼睛按钮或左右翻页按钮。 |
| MOBILE-READER-02 | 点击右下角轻量阅读百分比，再点击一次 | 显示/隐藏 `返回 / 更多 / 目录 / Aa / 笔记`；百分比保持弱视觉但有至少约 44×44px 点击区；控制栏是 fixed overlay，正文不重排、不跳位。 |
| MOBILE-READER-03 | 滚动、长按选字、点击链接/脚注或交互元素 | 不影响阅读、选择、链接和脚注；正文中央轻点不作为控制栏入口。 |
| MOBILE-READER-04 | 打开更多 | 仅有书内搜索和只读图书信息；目录、Aa、笔记仍在底部入口。 |
| MOBILE-READER-05 | 点击 Mobile 底部目录、Aa、笔记 | 暂时分别复用现有目录、阅读设置和完整笔记页入口；Mobile 保持固定上下滚动。 |
| MOBILE-READER-06 | 在 Desktop Reader 打开图书 | 原顶部工具栏、面板、分页/滚动、左右翻页区与快捷键保持不变。 |

## Task 3B-1：Mobile Reader 目录 Bottom Sheet

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-TOC-01 | Mobile Reader 显示 controls 后点击“目录” | 显示约 70%–80% viewport 高度的目录 Bottom Sheet；正文留在背景且不重排。 |
| MOBILE-TOC-02 | 检查多层 EPUB 目录 | 保留原始 hierarchy；每层额外缩进约 18px，一级章节视觉较强。 |
| MOBILE-TOC-03 | 点击目录项、× 或 backdrop | 目录项继续调用既有 `goTo` 后收起 Sheet；× 与 backdrop 只收起 Sheet，阅读位置不改变。 |
| MOBILE-TOC-04 | 在 Desktop Reader 打开目录或按 `T` | 保留既有左侧目录 panel、布局与快捷键行为。 |
| MOBILE-TOC-05 | 阅读至较后章节，关闭后重新打开 Mobile 目录 | 当前章节有轻量 active 状态，列表只在打开时定位一次，显示在约 35%–40% 高度；之后可自由手动滚动。 |

## Task 3B-2：Mobile Reader Aa Bottom Sheet

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-AA-01 | Mobile Reader 显示 controls 后点击“Aa” | Reader chrome 隐藏，显示按内容高度的阅读设置 Bottom Sheet；正文不重排、不跳位。 |
| MOBILE-AA-02 | 点击 A−、A+ 和 slider | 复用现有 15–26 字号范围与本机持久化；正文立即更新，Mobile 不展示 px 数值。 |
| MOBILE-AA-03 | 分别选择明亮、纸张、夜间 | 复用既有三种 ReaderTheme，主题立即生效，选中项有克制状态与真实色彩预览。 |
| MOBILE-AA-04 | 检查 Mobile Sheet，关闭 × 或 backdrop | 不显示阅读方式、分页、诊断或桌面快捷键；关闭后回到沉浸阅读，进度 trigger 仍可用。 |
| MOBILE-AA-05 | 在 Desktop Reader 打开阅读设置 | 保留原 settings panel、阅读方式、诊断和快捷键内容。 |

## Task 3D：Mobile Reader 旋转位置稳定性

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-ORIENTATION-01 | 竖屏阅读一段文字后旋转横屏，再转回竖屏 | 每次以当前 CFI 为 anchor，在 viewport settle 后恢复到同一段文字附近；不跳到章节末尾、开头或其他章节。 |
| MOBILE-ORIENTATION-02 | 旋转触发连续 window / visualViewport resize | 多个事件只执行一次 CFI restore；仅高度变化（如键盘）不触发。 |
| MOBILE-ORIENTATION-03 | orientation reflow 期间发生新导航 | 新导航取消旧 anchor restore；恢复期间 relocated 不写入临时错误 progress，完成后恢复正常 progress 更新。 |
| MOBILE-ORIENTATION-04 | Desktop Reader 改变窗口尺寸 | Desktop 不注册 Mobile restore，不改变既有阅读位置行为。 |

iOS 字体自动放大问题已由 EPUB iframe `text-size-adjust: 100%` 修复，必须保持。

## Task 4A：Mobile 完整笔记页面骨架

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-NOTES-PAGE-01 | 在 Mobile 底部导航进入“笔记” | 显示单列 Mobile Notes 页面：顶部仅“笔记”，不出现 Desktop master-detail、下拉选书或大段说明。 |
| MOBILE-NOTES-PAGE-02 | 横向滚动封面条并点击另一封面 | 封面条不换行；复用既有 `selectBook()` 未保存修改保护切换当前书，并确保选中封面可见。 |
| MOBILE-NOTES-PAGE-03 | 检查当前图书、总结和摘录区 | 显示书名、摘录数量、轻量“打开图书”入口，以及一列只读的读后总结/原文与感悟；页面末尾不被底部导航遮挡。 |
| MOBILE-NOTES-PAGE-04 | Reader 点击“查看完整笔记 →” | 保留阅读中的 `notesBookId`，完整笔记页仍选中刚才阅读的图书。 |
| MOBILE-NOTES-PAGE-05 | Desktop 进入整书笔记 | 保留原顶部工具栏、图书下拉选择、左右 master-detail、总结与感悟编辑、删除和排序行为。 |

## Task 3B-3：Mobile Reader 当前书笔记 Bottom Sheet

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-NOTES-01 | Mobile Reader 显示 controls 后点击“笔记” | 留在 Reader，隐藏 chrome 后打开约 75%–80% viewport 高度的当前书笔记 Sheet；正文不重排、不跳位。 |
| MOBILE-NOTES-02 | 当前书有摘录和感悟 | 仅显示当前书 annotations，原文为主体、感悟为次要内容；按 epub.js CFI 正文顺序而非创建时间排列。 |
| MOBILE-NOTES-03 | 点击摘录原文或“回到原文” | 摘录仅作展示，不关闭 Sheet；只有“回到原文”关闭 Sheet，复用 `beginPreview()` 记录原 CFI、`rendition.display()` 定位后再由 `focusCfi` 高亮；同章节和跨章节均可返回。 |
| MOBILE-NOTES-04 | 摘录没有感悟或已有感悟 | 分别显示“+ 补充感悟”或“编辑”，二者复用同一 Mobile 感悟编辑流程；不在 Sheet 常驻 textarea。 |
| MOBILE-NOTES-05 | 当前书没有摘录 | 显示简洁空状态，且仍可点击“查看完整笔记 →”。 |
| MOBILE-NOTES-06 | 点击“查看完整笔记 →” | 复用 `openNotesWorkspace()`，保存进度后离开 Reader 并打开当前书完整笔记页。 |
| MOBILE-NOTES-07 | Desktop Reader 点击笔记 | 保留既有直接进入完整笔记页的行为与视觉。 |
| MOBILE-NOTES-08 | 从第 1、5、20 条摘录点击“+ 补充感悟” | Notes Sheet 保持 mounted，fixed Mobile 编辑层不受 Sheet scrollTop 影响；键盘打开后取消/完成 header 仍可见。 |
| MOBILE-NOTES-09 | 在 Mobile 编辑层取消或完成感悟 | 回到原 Notes Sheet 的原列表位置；成功内容就地更新且不显示成功 toast，失败仍显示错误。 |

## Task 3C：Mobile Reader 文字选区操作

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| MOBILE-SELECTION-01 | 长按选择一段新文字 | 保留 iOS 原生选区，屏幕底部安全区上方显示固定“高亮 / 写感悟”操作条，不随选区坐标移动。 |
| MOBILE-SELECTION-02 | 点击高亮 | 复用 `createHighlight(selectionDraft, "")`，保存、高亮显示并清除原生选区；成功不显示 toast。 |
| MOBILE-SELECTION-03 | 点击写感悟后完成或取消 | 使用 Mobile Reflection Editor；完成保存高亮与感悟并返回 Reader，取消不创建 annotation 且清除选区。 |
| MOBILE-SELECTION-04 | 再次选择已有 annotation | 操作条显示“编辑感悟 / 删除”；编辑复用同一编辑器并带入原内容。 |
| MOBILE-SELECTION-05 | 删除已有 annotation | 使用 Mobile 删除确认，不调用 `window.confirm()`；成功后删除高亮和感悟并关闭操作条。 |
| MOBILE-SELECTION-06 | Desktop Reader 选择文字 | 保留原坐标 toolbar、shared reflection dialog 与删除确认行为，不显示 Mobile Action Bar。 |

## PWA 新增用例

| 编号 | 操作 | 预期与当前验证范围 |
| --- | --- | --- |
| WEB-01 | 浏览器导入生成的 EPUB，重载 | 本机书库仍可打开；Chromium 已验证 |
| WEB-02 | 下载完成后源站不可达，重载并阅读 | 应用资源和 EPUB 均可从本机读取；结果见 PWA 开发记录 |
| WEB-03 | 手机宽度下分页、返回、重开 | 页偏移与 CFI 保留，中文跨页不回段首；Chromium 已验证 |
| WEB-04 | 删除 → 设置回收站 → 恢复 | 原 EPUB/笔记保留，不提供永久删除；自动化覆盖 |
| WEB-05 | 移除未上传的本机 EPUB | 拒绝操作，防止丢失唯一副本；自动化覆盖 |
| WEB-06 | 上传中产生新的进度 | 旧 revision 确认不清除新队列项；自动化覆盖 |
| WEB-07 | 上传成功但确认丢失后重试 | 相同内容确认完成；不同内容停止覆盖；模拟 Graph 覆盖 |
| WEB-08 | 另一个账号尝试同步本机书库 | 拒绝串号，不重新绑定；自动化覆盖 |
| WEB-09 | PWA 新版本就绪 | 用户确认后更新，书籍与进度保留；Chromium 已验证 |
| WEB-10 | iOS 17.5 登录、主屏幕、离线重启 | 待真实设备和微软配置，不能以桌面模拟替代 |
| WEB-11 | 云端无变化连续同步、随后修改一本书 | cTag 不变时不遍历，变化后重新扫描；缺 cTag 或快照到期则全扫；模拟 Graph 覆盖 |
| WEB-12 | 扫描/下载时云端书库变化或下载失败 | 本轮文档与检查点不发布，队列保留，下轮重试；模拟 Graph 覆盖 |
| WEB-13 | 扫描后另一端创建同名导入文件，再上传 | 服务端同名冲突失败，另一端内容不被覆盖，本机队列保留；模拟 Graph 覆盖 |
| WEB-14 | 绑定后移动/改名/删除云端书库 | 停止同步并提示核对，不先创建空书库；模拟 Graph 覆盖 |
| WEB-15 | 登录后未经首次连接确认就点底栏同步 | 提示去设置确认，不发起 Graph 请求；自动化和浏览器验证 |
| WEB-16 | 原生 fetch 通过 GraphClient 发起请求/签名下载 | 接收者仍为全局对象，不出现 Illegal invocation；回归测试修复前失败、修复后通过，真实云端待确认 |
| WEB-17 | Graph 返回 401/403 或非 JSON 错误 | 保留 HTTP 状态并显示安全诊断，暂停前台自动重试；不删除队列或泄露完整响应；自动化覆盖，真实 403 已观察 |
| WEB-18 | 缓存授权缺少 AppFolder scope | 请求前提示重新检查委托权限/登录，不输出令牌；自动化覆盖 |

> `WEB-03` 等旧 Mobile 分页类用例属于历史回归背景。如果它们与 [Mobile V1](MOBILE_V1.md) 冲突，以当前 Mobile V1 的“手机固定滚动”为准；旧用例不应驱动新的 Mobile UI。

## 书库与记录

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| LIB-01 | 首次选择本地/OneDrive 书库目录，导入 EPUB | 原文件复制进书库，显示卡片；有原封面使用原封面，否则文字封面 |
| LIB-02 | 搜索书名，切换 A–Z/最近导入排序 | 结果与排序即时更新，不修改书籍内容 |
| LIB-03 | 卡片菜单重命名、标记已读/未读 | 名称及分类更新；重启后保留 |
| LIB-04 | 换自定义封面，再恢复自动封面 | 有原封面时恢复原图，无原图才回退文字封面 |
| LIB-05 | 外部同步目录中的图书、笔记文件发生变化 | 书库自动刷新；当前阅读位置不受无关变化影响 |
| NOTE-01 | 选中文字高亮，填写感悟；打开侧栏“整书笔记” | 独立页面显示原文、感悟与整书总结，可编辑并持久化 |
| NOTE-02 | 点击摘录原文，再返回刚才阅读位置 | 定位摘录并保留返回入口；预览不覆盖正式阅读进度 |

## 阅读与布局

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| READ-01 | 分页模式依次用左右区域、按钮、←/→、PageUp/PageDown、滚轮翻页 | 每次操作向指定方向移动；停止输入后位置稳定 |
| READ-02 | 在章节中部向后翻一页，等待至少3秒；再向前翻一页并等待 | 不自动回跳，不受进度写入和目录刷新影响 |
| READ-03 | 连续翻动数页，在700ms内再返回上一页 | 较早一次落盘的回流不能覆盖当前页；退出重开续读最终位置 |
| READ-04 | 章节边界上一页/下一页；打开目录切换章节 | 正确进入相邻章节/目标章节，不突然回到刚才的章节 |
| READ-05 | 调整窗口大小、字号及分页/滚动模式 | 正文不被左右裁切，模式切换保留阅读位置 |
| READ-06 | 滚动模式滚轮、↑/↓、PageUp/PageDown、空格滚动 | 无横向滚动条，纵向操作正常，滚动条颜色随主题变化 |
| READ-07 | 夜间→纸张→明亮，打开目录/设置，高亮文字 | 正文、面板、滚动条均跟随主题；高亮文字可读 |
| READ-08 | 点击脚注；搜索关键词并跳转，再返回 | 脚注优先弹窗；搜索/脚注预览不破坏正常阅读位置 |

## 同步进度仲裁（本轮重点）

| 编号 | 前置条件与操作 | 预期结果 |
| --- | --- | --- |
| SYNC-01 | 本机在A页触发保存，随后翻至B页；延迟返回A页的本机书库快照 | 不调用 `display(A)`，保持B页 |
| SYNC-02 | 在B页修改笔记或封面，目录监听刷新图书信息 | B页不动；图书信息与笔记正常刷新 |
| SYNC-03 | 网盘收到另一台设备更新的进度，当前未进行更新的本地操作 | 自动跳到该记录；相同版本重复通知不重复跳转 |
| SYNC-04 | 另一设备的旧记录/迟到快照在本地翻页之后送达 | 不抢占本地新位置；不能仅比较阅读百分比，倒读也算有效阅读 |
| SYNC-05 | 查看搜索或摘录预览时收到同步进度 | 预览不被拉走，返回原阅读位置入口保留 |
| SYNC-06 | 使用缺少设备来源的旧版进度打开书籍 | 可正常续读；后续来源不明快照不强制定位 |
| SYNC-07 | 退出后重新打开已同步的书籍 | 使用书库中时间最新的有效进度，不需要确认弹窗 |

## 本轮验收记录

### v0.2.4 新增用例（均待用户验收）

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| UI-01 | 设置→外观切换浅色/深色，访问书库、已读、笔记、设置，打开搜索/菜单/重命名弹窗 | 页面与控件颜色一致；浅色维持原风格，深色不出现大面积白底 |
| UI-02 | 设置深色后退出重启；夜间阅读进入笔记/返回书库 | 全局偏好保留；首屏、加载状态、笔记页均为深色 |
| UI-03 | 全局深色时将阅读主题改为纸张，或全局浅色时阅读设为夜间 | 两套设置独立，阅读控件使用阅读主题的原生配色 |
| UI-04 | 初次升级且未设置全局外观，之前阅读主题为夜间 | 首次全局采用深色；之后手动设浅色并重启，不再被阅读偏好覆盖 |
| READ-09 | 分别在明亮/纸张/夜间中截取长段文字，打开“记录感悟”，滚动原文及长感悟 | 滚动条随主题配色；小窗口中弹窗可滚动，保存按钮可到达 |
| NOTE-03 | 从书A进入整书笔记，点击书B，再等待3秒、触发书库刷新 | 持续显示书B，不自动跳回书A |
| NOTE-04 | 快速 A→B→C 切换，旧书加载/保存请求延迟返回 | 书名、总结、摘录均属于C；旧回调不修改C的状态 |
| NOTE-05 | 输入未保存的总结或感悟，等待目录刷新；尝试切换图书 | 输入和焦点保留；切换前提示未保存修改，取消保持当前书 |
| NOTE-06 | 保存总结/感悟，切换图书再切回 | 保存结果属于正确书籍；无未修改内容的误回跳 |

- READ-01～04、SYNC-01～07：待验收。
- 构建结果单独记入 Bug 时间线，不将编译成功填写为功能通过。

### v0.3.0-alpha.1 整书笔记 Master-Detail 用例

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| NOTE-07 | 从主导航进入整书笔记 | 原主导航不变；顶部显示当前书小封面、书名、作者、摘录数、整书总结和打开图书；页面左侧不再常驻完整图书列表 |
| NOTE-08 | 点击顶部当前图书并选择另一书 | 弹出紧凑图书选择器；切换后列表和详情属于新书，未保存内容仍先确认，旧请求不能覆盖新书 |
| NOTE-09 | 点击左侧任一摘录 | 该项使用轻边框/背景选中；右侧仅展示该条的完整原文、感悟和元数据，不同时堆叠其他编辑框 |
| NOTE-10 | 切换“最新/最早” | 只改变当前书的笔记显示顺序，不修改时间、内容或同步文件 |
| NOTE-11 | 编辑并保存感悟 | 调用原 `saveAnnotation`，更新同一记录 ID；后台刷新保留未保存草稿，保存后跨设备仍使用原 annotations 路径 |
| NOTE-12 | 点击回到原文 | 调用原 `onOpenQuote(book, cfiRange)`，进入阅读器并精确定位；不生成新位置字段 |
| NOTE-13 | 删除当前笔记 | 调用原删除逻辑并生成既有 tombstone；列表选择相邻笔记，无笔记时进入整书总结 |
| NOTE-14 | 点击整书总结 | 右侧切换为独立总结详情；Windows 可按原结构保存，Web/iOS 只读且不显示保存按钮 |
| NOTE-15 | 在 1180×760、820×600 与小于720px视口使用笔记页 | 桌面为约38/62左右布局；窄屏纵向排列，列表与详情可滚动，图书选择器不超出视口 |
| NOTE-16 | 浅色/深色间切换 | 顶部工具栏、列表选中、详情原文、编辑区、元数据和弹层使用对应主题，原文仍为视觉核心 |

- NOTE-07～16：Web 与桌面前端构建通过，等待 Windows 实际布局与 iPhone 真机验收。

### 跨端阅读与笔记回归用例

| 编号 | 操作 | 预期结果 |
| --- | --- | --- |
| READ-10 | Windows 分页阅读时查看右下角进度 | 显示阅读百分比，不显示由固定字符数生成的伪页码。 |
| NOTE-17 | Windows 选中原文并点击“高亮标记” | 高亮立即保存，不出现“已高亮，可在整书笔记中补充感悟”提示；按 `Ctrl+Z` 撤销刚新增的高亮。 |
| NOTE-18 | 手机端选中原文并点击“高亮标记” | 高亮立即保存，不出现该提示；结果同步至整书笔记。 |
| READ-11 | 手机端进入阅读设置和正文 | 阅读方式固定为上下滚动；横向滑动不触发翻页。 |
