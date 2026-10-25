[English](README.md) | [简体中文](README.zh-CN.md) | [个人网站](https://zhinian-ai.com)

---

# 数字炸弹小游戏

## 项目状态

`BETA` — 仓库保存源码与已打包桌面程序；源码可重新编译，未在本仓库自动发布新版安装包。

## 功能

- 数字炸弹：1~30 / 1~50 / 1~100，固定每行 10 个方格。
- 转盘：12/24/48/全部扇区，轮流归属玩家。
- 1~8 名玩家，名字可编辑并记忆。
- 屏幕框选/涂抹后使用 Windows.Media.Ocr 离线识别玩家名。
- WinRT 语音合成（多种声音、语速可调）。
- Tauri + Rust 桌面端，Windows。

## 目录

- `源码/`：前端与 Tauri Rust 桌面端源码。
- `源码/src-tauri/`：Rust 命令、OCR、语音、窗口框选和打包配置。
- `程序/数字炸弹.exe`：备份的桌面程序。
- `备份说明.md`：备份范围、编译方式和功能说明。

## 编译

需要 Rust + Tauri 环境和 Windows 构建工具：

```powershell
cd 源码/src-tauri
cargo build --release
```

前端资源编译进 exe，修改 `源码/src/` 后必须重新构建。

## 说明

这是 Windows 桌面程序，不提供 Web 在线版本。

---

## 作者与联系方式

**ZHIRAI · 智睿科技 · 独立开发者**

- 个人网站：[zhinian-ai.com](https://zhinian-ai.com)
- 品牌主站：[zhirai.cloud](https://zhirai.cloud)
- GitHub：[github.com/zhirai-tech](https://github.com/zhirai-tech)
- 技术支持：[xtang3125@gmail.com](mailto:xtang3125@gmail.com)
- 商务合作：[txq@zhinian-ai.com](mailto:txq@zhinian-ai.com)
- Discord：[discord.gg/uQRzb53R](https://discord.gg/uQRzb53R)
- QQ 群：`147594586` · [加入](https://qm.qq.com/q/jGGRuz368w)
- 品牌口号：*Build Ideas Into Reality / 把想法变成现实*
- 版权：© 2026 智睿科技 保留所有权利。
