// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};
use tauri::webview::WebviewBuilder;

#[tauri::command]
async fn create_child_webview(
    app: tauri::AppHandle,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_window("main")
        .ok_or_else(|| "Main window not found".to_string())?;

    // If already exists, just navigate and show
    if let Some(existing) = app.get_webview("tradingview-child") {
        let parsed = url.parse().map_err(|e: url::ParseError| e.to_string())?;
        existing.navigate(parsed).map_err(|e| e.to_string())?;
        existing.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    window
        .add_child(
            WebviewBuilder::new("tradingview-child", WebviewUrl::External(parsed)),
            LogicalPosition::new(x, y),
            LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
async fn navigate_child_webview(app: tauri::AppHandle, url: String) -> Result<(), String> {
    let webview = app
        .get_webview("tradingview-child")
        .ok_or_else(|| "tradingview-child not found".to_string())?;
    let parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    webview.navigate(parsed).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn show_child_webview(app: tauri::AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview("tradingview-child")
        .ok_or_else(|| "tradingview-child not found".to_string())?;
    webview.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn hide_child_webview(app: tauri::AppHandle) -> Result<(), String> {
    let webview = app
        .get_webview("tradingview-child")
        .ok_or_else(|| "tradingview-child not found".to_string())?;
    webview.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn close_child_webview(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(webview) = app.get_webview("tradingview-child") {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn set_child_webview_bounds(
    app: tauri::AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let webview = app
        .get_webview("tradingview-child")
        .ok_or_else(|| "tradingview-child not found".to_string())?;
    webview
        .set_position(tauri::Position::Logical(LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())?;
    webview
        .set_size(tauri::Size::Logical(LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn toggle_timer_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("timer-popup") {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

#[tauri::command]
async fn fetch_rss(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

#[tauri::command]
async fn fetch_tts(text: String, slow: bool) -> Result<Vec<u8>, String> {
    let url = format!(
        "https://translate.googleapis.com/translate_tts?ie=UTF-8&tl=ja&client=tw-ob&slow={}&q={}",
        slow,
        urlencoding::encode(&text)
    );
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(&url)
        .header("Referer", "https://translate.google.com/")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    Ok(bytes.to_vec())
}

#[tauri::command]
async fn fetch_post(url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .build()
        .map_err(|e| e.to_string())?;

    let mut req = client.post(&url).body(body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }

    let response = req.send().await.map_err(|e| e.to_string())?;
    let text = response.text().await.map_err(|e| e.to_string())?;
    Ok(text)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
            toggle_timer_window,
            fetch_rss,
            fetch_post,
            fetch_tts,
            create_child_webview,
            navigate_child_webview,
            show_child_webview,
            hide_child_webview,
            close_child_webview,
            set_child_webview_bounds,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    for (_, w) in app.webview_windows() {
                        let _ = w.close();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
