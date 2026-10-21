// Prevents an additional console window on Windows in release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use tauri::{Manager, State, WebviewWindow};

/// 截屏 / OCR 两个脚本编译进 exe，运行时写到临时目录再调用，
/// 这样打包出来的程序是自包含的，也不联网。
const CAPTURE_PS: &str = include_str!("../scripts/capture.ps1");
const OCR_PS: &str = include_str!("../scripts/ocr.ps1");
const VOICES_PS: &str = include_str!("../scripts/voices.ps1");
const SPEAK_PS: &str = include_str!("../scripts/speak.ps1");

#[derive(Default)]
struct SelectState {
    /* 进入框选模式前的窗口状态：全屏 / 有无边框 / 是否置顶 */
    prev: Mutex<Option<(bool, bool, bool)>>,
}

fn work_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("shuzi-zhadan");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

/// 把内置脚本写到临时目录（内容变了就覆盖）
fn ensure_script(name: &str, body: &str) -> Result<PathBuf, String> {
    let path = work_dir().join(name);
    let need_write = match std::fs::read_to_string(&path) {
        Ok(old) => old != body,
        Err(_) => true,
    };
    if need_write {
        std::fs::write(&path, body).map_err(|e| format!("写入脚本失败: {e}"))?;
    }
    Ok(path)
}

/// 隐藏 PowerShell 窗口
#[cfg(windows)]
fn run_powershell(args: &[&std::ffi::OsStr]) -> std::io::Result<std::process::Output> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    Command::new("powershell")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"])
        .args(args)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
}

#[cfg(not(windows))]
fn run_powershell(_args: &[&std::ffi::OsStr]) -> std::io::Result<std::process::Output> {
    Err(std::io::Error::new(std::io::ErrorKind::Other, "unsupported platform"))
}

/// 截取主屏，返回 {"dataUrl": "...", "width": w, "height": h}
#[tauri::command]
fn capture_screen(window: WebviewWindow) -> Result<serde_json::Value, String> {
    let script = ensure_script("capture.ps1", CAPTURE_PS)?;
    let png = work_dir().join("screen.png");

    /* 先把自己藏起来，免得截到自己挡着目标窗口 */
    let _ = window.hide();
    std::thread::sleep(std::time::Duration::from_millis(260));

    let out = run_powershell(&[
        script.as_os_str(),
        std::ffi::OsStr::new("-Out"),
        png.as_os_str(),
    ])
    .map_err(|e| format!("调用截屏失败: {e}"))?;

    let _ = window.show();

    if !out.status.success() {
        return Err(format!(
            "截屏脚本出错: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let size = String::from_utf8_lossy(&out.stdout).trim().to_string();
    let (w, h) = size
        .split_once('x')
        .and_then(|(a, b)| Some((a.trim().parse::<u32>().ok()?, b.trim().parse::<u32>().ok()?)))
        .ok_or_else(|| format!("截屏尺寸无法解析: {size}"))?;

    let bytes = std::fs::read(&png).map_err(|e| format!("读取截图失败: {e}"))?;
    Ok(serde_json::json!({
        "dataUrl": format!("data:image/png;base64,{}", B64.encode(&bytes)),
        "width": w,
        "height": h
    }))
}

/// 对一张 PNG（data URL）跑系统 OCR，返回识别到的每一行
#[tauri::command]
fn ocr_png(data_url: String) -> Result<Vec<String>, String> {
    let script = ensure_script("ocr.ps1", OCR_PS)?;

    let b64 = data_url
        .split_once(',')
        .map(|(_, b)| b)
        .unwrap_or(data_url.as_str());
    let bytes = B64.decode(b64.trim()).map_err(|e| format!("图片数据解码失败: {e}"))?;
    if bytes.is_empty() {
        return Err("图片数据为空".into());
    }

    let dir = work_dir();
    let png = dir.join("region.png");
    let txt = dir.join("region.txt");
    std::fs::write(&png, &bytes).map_err(|e| format!("写入临时图片失败: {e}"))?;
    let _ = std::fs::remove_file(&txt);

    let out = run_powershell(&[
        script.as_os_str(),
        std::ffi::OsStr::new("-Path"),
        png.as_os_str(),
        std::ffi::OsStr::new("-Out"),
        txt.as_os_str(),
    ])
    .map_err(|e| format!("调用 OCR 失败: {e}"))?;

    if !out.status.success() {
        return Err(format!(
            "OCR 失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let text = std::fs::read_to_string(&txt).unwrap_or_default();
    let lines: Vec<String> = text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    Ok(lines)
}

/// 可选的中文语音（WinRT/OneCore）：「名字|语言」逐行返回，中文排前面
#[tauri::command]
fn list_voices() -> Result<Vec<String>, String> {
    let script = ensure_script("voices.ps1", VOICES_PS)?;
    let out = run_powershell(&[script.as_os_str()]).map_err(|e| format!("查询语音失败: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    Ok(text
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty() && l.contains('|'))
        .collect())
}

/// 用 WinRT 语音合成一句话，返回 WAV 的 data URL
/// （WebView 自带的 speechSynthesis 走 SAPI，中文只有慧慧一个，
///   康康/瑶瑶会静默回落成同一个声音；走 WinRT 才是真的三种声音）
#[tauri::command]
fn speak_text(text: String, voice: String, rate: f64) -> Result<String, String> {
    let script = ensure_script("speak.ps1", SPEAK_PS)?;
    let dir = work_dir();
    let txt = dir.join("speak.txt");
    let wav = dir.join("speak.wav");
    let _ = std::fs::remove_file(&wav);

    std::fs::write(&txt, text.as_bytes()).map_err(|e| format!("写入文本失败: {e}"))?;

    /* 语速：1.0 = 0%，0.85 = -15%，1.3 = +30% */
    let pct = ((rate - 1.0) * 100.0).round() as i64;
    let pct = pct.clamp(-60, 80).to_string();

    let out = run_powershell(&[
        script.as_os_str(),
        std::ffi::OsStr::new("-TextFile"),
        txt.as_os_str(),
        std::ffi::OsStr::new("-Voice"),
        std::ffi::OsStr::new(voice.as_str()),
        std::ffi::OsStr::new("-RatePct"),
        std::ffi::OsStr::new(pct.as_str()),
        std::ffi::OsStr::new("-Out"),
        wav.as_os_str(),
    ])
    .map_err(|e| format!("调用语音合成失败: {e}"))?;

    if !out.status.success() {
        return Err(format!(
            "语音合成失败: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }
    let bytes = std::fs::read(&wav).map_err(|e| format!("读取语音失败: {e}"))?;
    if bytes.is_empty() {
        return Err("语音合成结果为空".into());
    }
    Ok(format!("data:audio/wav;base64,{}", B64.encode(&bytes)))
}

/// 进入 / 退出「全屏框选」模式
#[tauri::command]
fn set_select_mode(window: WebviewWindow, state: State<'_, SelectState>, on: bool) -> Result<(), String> {
    let mut prev = state.prev.lock().map_err(|e| e.to_string())?;
    if on {
        if prev.is_none() {
            let full = window.is_fullscreen().unwrap_or(false);
            let deco = window.is_decorated().unwrap_or(true);
            let top = window.is_always_on_top().unwrap_or(false);
            *prev = Some((full, deco, top));
        }
        let _ = window.set_decorations(false);
        let _ = window.set_always_on_top(true);
        window.set_fullscreen(true).map_err(|e| e.to_string())?;
    } else {
        if let Some((full, deco, top)) = prev.take() {
            window.set_fullscreen(full).map_err(|e| e.to_string())?;
            let _ = window.set_decorations(deco);
            let _ = window.set_always_on_top(top);
        } else {
            let _ = window.set_fullscreen(false);
        }
    }
    Ok(())
}

/// 屏幕是否装了中文 OCR（没有的话界面上给个提示）
#[tauri::command]
fn ocr_available() -> bool {
    let script = match ensure_script("ocr-langs.ps1", OCR_LANGS_PS) {
        Ok(p) => p,
        Err(_) => return false,
    };
    match run_powershell(&[script.as_os_str()]) {
        Ok(out) => {
            let s = String::from_utf8_lossy(&out.stdout);
            s.contains("zh")
        }
        Err(_) => false,
    }
}

const OCR_LANGS_PS: &str = r#"# List available Windows OCR languages. ASCII-only.
try {
  [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  foreach ($l in [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages) { Write-Output $l.LanguageTag }
} catch { Write-Output 'ERR' }
"#;

fn main() {
    tauri::Builder::default()
        .manage(SelectState::default())
        .setup(|app| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            capture_screen,
            ocr_png,
            set_select_mode,
            ocr_available,
            list_voices,
            speak_text
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
