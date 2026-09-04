# 数据与同步

本页只记录当前生效的数据边界和同步规则。产品体验目标见 [Mobile V1](MOBILE_V1.md)；过去的试验、故障与当时结论见 [历史记录](history/README.md)。

## 同步书库

同步根目录为 `BookReaderLibrary/`。其中承重的数据目录如下：

```text
BookReaderLibrary/
  books/
  progress/
  annotations/
  notes/
  lifecycle/
```

- `books/` 保存图书文件及其元数据、封面等随书内容。
- `progress/` 按图书和设备保存阅读位置；当前路径为 `progress/<bookId>/<deviceId>.json`。旧的 `books/<bookId>/progress.json` 仍可读取。
- `annotations/` 保存按图书和批注 ID 分开的高亮与摘录记录。
- `notes/` 保存每本书的整书笔记。
- `lifecycle/` 保存图书删除、恢复等不可变操作记录；当前路径为 `lifecycle/<bookId>/<operationId>.json`。

SQLite/IndexedDB 等本地索引和浏览器/应用偏好不属于同步书库；设备 ID 和本机书库路径也不写入其中。

## 当前规则

- **本地优先。** 阅读、导入和本地写入不以网络可用为前提；网络恢复后再同步。Web/PWA 启动先加载本地书库，不等待 Microsoft 登录或 OneDrive；后台同步绝不阻塞打开已下载图书、阅读或本地保存。Web 端的变更先进入持久队列，队列确认完成前不得因刷新或失败而丢弃。
- **每设备进度。** 阅读位置使用 EPUB CFI，并同时保存章节和百分比作为辅助信息。设备 ID 来自进度文件名；本机写入回流只刷新快照，不应把阅读器拉回旧位置。其他设备较新的有效记录可用于续读或定位。
- **软删除。** 删除与恢复通过 `lifecycle/` 中的不可变操作记录传播；删除的书进入回收站，不以日常操作永久清除书籍、笔记或记录。相应 tombstone 必须随同步传播。
- **Web 同步。** Web 使用浏览器本地存储、文件缓存和持久队列承接离线变更；登录/退出或短暂 Graph 失败不得直接清空本机书库或未完成队列。共享的 `annotations/` 与 `notes/` 修改在队列中保留本地编辑所基于的云端 eTag，并以 Graph `If-Match` 条件更新；真正的并发修改保留两端内容并停止自动覆盖。该本机队列元数据不属于云端 schema。`progress/` 仍是设备拥有的 replace 语义；导入、metadata、cover 和 lifecycle 仍是不可变的 fail-closed 路径。
- **OneDrive AppFolder。** Web 通过 Microsoft Graph 的应用专用目录访问 OneDrive，在其下使用 `BookReaderLibrary/`；正式同步只请求委托权限 `Files.ReadWrite.AppFolder`，不依赖全盘文件权限。
- **桌面 OneDrive 文件夹。** Desktop 选择已由 OneDrive 客户端同步到本机的书库目录，由客户端负责上传/下载文件；桌面应用监听目录变化并刷新书库。
- **账号绑定。** 一个浏览器站点的本机书库绑定一个 Microsoft 账号和书库 ID。退出登录保留本机缓存与队列；不得静默把已有书库改绑到另一个账号上传。账号迁移流程待确认。
- **后台恢复。** 已明确同意并启用同步的 Web/PWA，在启动、恢复前台、重新联网和前台心跳时，可用缓存账号静默调用同步。交互式认证、授权缺失、Graph 401/403 或账号绑定不匹配会标记为“需要重新连接”，不会自动跳转 Microsoft 登录页。首次点击连接后若发生 Microsoft redirect，本机 `pendingOneDriveConnect` 标记会在账号恢复后完成同意、启用并发起一次后台同步；该标记不属于同步书库。

## 边界与待确认

同步顺序、冲突处理、文件格式或协议的改动属于高风险改动，必须单独确认。双设备进度和 iPhone 真机的完整验收状态请看 [测试说明](TESTING.md)；历史试验结果不能替代当前验收。
