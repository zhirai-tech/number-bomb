> **简体中文 | English**
>
> 数字炸弹：Windows 桌面聚会小游戏，包含数字炸弹、转盘、1–8 名玩家、屏幕 OCR 识别名字和离线语音朗读。源码使用 Tauri + Rust + Web 前端；Release 提供桌面程序。
>
> **Number Bomb** is a Windows desktop party game with number bombs, a wheel, 1–8 players, screen OCR for player names and offline speech. Source: Tauri + Rust + web frontend; the Release contains the desktop build.

---

# Number Bomb / 数字炸弹

> **English** | [简体中文](#简体中文)
>
> Number Bomb is a Windows desktop party game with number bombs, a wheel, 1–8 players, screen OCR for player names and offline speech.


> **English | 简体中文**
>
> Number Bomb is a Windows desktop party game with number bombs, a wheel, 1–8 players, screen OCR for player names and offline WinRT speech. The repository contains the Tauri/Rust desktop source and a packaged Windows program; it does not currently include a UI screenshot.
>
> 数字炸弹是 Windows 桌面聚会小游戏，支持数字炸弹、转盘、1–8 名玩家、屏幕 OCR 识别名字和 WinRT 离线朗读。仓库包含 Tauri/Rust 桌面源码和已打包程序；当前没有 UI 截图。


Windows 桌面聚会小游戏：数字炸弹 + 转盘、玩家管理、屏幕 OCR 识别玩家名、WinRT 离线语音朗读。

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