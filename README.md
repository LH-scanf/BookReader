# BookReader

BookReader 是一款面向 Windows 的本地优先 EPUB 阅读器，使用 Tauri 2、React、TypeScript、Rust 和 epub.js 构建。

## 当前功能

- 现代卡片式书库，可折叠侧边栏与固定设置入口
- 导入一本或多本 EPUB，提取标题、作者和封面
- 无封面时生成简约文字封面
- 搜索、最近导入排序、书名 A-Z / Z-A 排序
- 打开、重命名、标记已读/未读和删除图书
- 分页与滚动两种阅读方式
- 目录跳转、阅读进度保存和位置恢复
- 明亮、纸张、夜间主题以及字号设置
- 将普通文件夹或 OneDrive 文件夹作为书库目录
- 自动监听书库变化，并采用跨设备 `updatedAt` 最新的阅读进度
- 选中文字后添加单一样式高亮或“原文 + 感悟”，统一收录到整书笔记
- 当前书籍全文搜索，跳转后可一键返回原阅读位置
- EPUB 脚注就地弹窗，以及键盘、滚轮和左右点击区域操作
- 自定义图书封面，并可恢复 EPUB 自带封面或文字封面
- 侧边栏独立“整书笔记”工作台，可按图书编辑总结与每条原文感悟
- 注释跳转精确定位且不受进度自动刷新干扰；滚动模式支持上下键并禁止横向溢出

## 开发运行

需要 Node.js、Rust 和 Windows WebView2 环境。

```powershell
npm install
npm run tauri dev
```

也可以双击 `Start-BookReader.cmd`，启动脚本会处理项目遗留的开发服务器端口。

## 构建 Windows 安装包

```powershell
npm run tauri build
```

构建产物位于：

```text
src-tauri/target/release/bookreader.exe
src-tauri/target/release/bundle/nsis/
src-tauri/target/release/bundle/msi/
```

更完整的产品决策、数据格式和开发计划见 [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。
