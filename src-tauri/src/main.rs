// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::OnceLock;
use tauri::Manager;
use tauri::{LogicalPosition, LogicalSize, WebviewUrl};
use tauri::webview::WebviewBuilder;

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

fn get_client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // 15s was too tight for Anthropic completions that use tools/images (e.g. the
            // Fitness AI assistant's agentic loop) — those can legitimately take 20-40s+.
            // The freeze this timeout originally guarded against was actually caused by
            // creating a NEW reqwest::Client per request (fixed below via the shared
            // OnceLock client), not by timeout length, so raising it back is safe.
            .timeout(std::time::Duration::from_secs(45))
            .build()
            .expect("Failed to build HTTP client")
    })
}

// --- Freeze/crash diagnostics --------------------------------------------
// Appends a timeline to %USERPROFILE%\bankospace-diag.log so freezes can be
// diagnosed after the fact. JS reports via the diag_log command; Rust logs
// renderer-crash events directly.
fn diag_path() -> std::path::PathBuf {
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    std::path::Path::new(&base).join("bankospace-diag.log")
}

fn write_diag(line: &str) {
    use std::io::Write;
    let path = diag_path();
    // simple rotation so the file can't grow without bound
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 5_000_000 {
            let _ = std::fs::remove_file(&path);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{}", line);
    }
}

#[tauri::command]
fn diag_log(line: String) {
    write_diag(&line);
}

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
fn toggle_kana_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("kana-popup") {
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
    let response = get_client()
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
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
    let response = get_client()
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
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

// Host part of the URL only (no query string/tokens) — safe to log.
fn url_host(url: &str) -> String {
    url.split('/').nth(2).unwrap_or(url).to_string()
}

static INFLIGHT: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn inflight_counter() -> &'static std::sync::atomic::AtomicU64 {
    INFLIGHT.get_or_init(|| std::sync::atomic::AtomicU64::new(0))
}

fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// Updated every ~2s by the JS side (see diag.js). This is the most reliable
// liveness signal we have: a background-frozen WebView2 page (Chromium page
// freezing, not a crash) stops running ALL JS timers — including this ping —
// while staying at ~0% CPU and never firing WebView2's own ProcessFailed event,
// so install_crash_recovery() never triggers for this case. Tracking the ping
// natively lets us force-recover even when JS itself can never run again.
static LAST_JS_PING: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn last_js_ping() -> &'static std::sync::atomic::AtomicU64 {
    LAST_JS_PING.get_or_init(|| std::sync::atomic::AtomicU64::new(now_secs()))
}

#[tauri::command]
fn js_ping() {
    last_js_ping().store(now_secs(), std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
async fn fetch_post(url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    let host = url_host(&url);
    let n = inflight_counter().fetch_add(1, Ordering::SeqCst) + 1;
    write_diag(&format!("RUST: fetch_post START -> {} (inflight={})", host, n));
    let t0 = std::time::Instant::now();
    let mut req = get_client().post(&url).body(body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let result = async {
        let response = req.send().await.map_err(|e| e.to_string())?;
        response.text().await.map_err(|e| e.to_string())
    }.await;
    let n2 = inflight_counter().fetch_sub(1, Ordering::SeqCst) - 1;
    write_diag(&format!("RUST: fetch_post END -> {} {}ms ok={} (inflight={})", host, t0.elapsed().as_millis(), result.is_ok(), n2));
    result
}

#[tauri::command]
async fn fetch_get(url: String, headers: std::collections::HashMap<String, String>) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    let host = url_host(&url);
    let n = inflight_counter().fetch_add(1, Ordering::SeqCst) + 1;
    write_diag(&format!("RUST: fetch_get START -> {} (inflight={})", host, n));
    let t0 = std::time::Instant::now();
    let mut req = get_client().get(&url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let result = async {
        let response = req.send().await.map_err(|e| e.to_string())?;
        response.text().await.map_err(|e| e.to_string())
    }.await;
    let n2 = inflight_counter().fetch_sub(1, Ordering::SeqCst) - 1;
    write_diag(&format!("RUST: fetch_get END -> {} {}ms ok={} (inflight={})", host, t0.elapsed().as_millis(), result.is_ok(), n2));
    result
}

// Renderer/GPU process çöktüğünde veya yanıt vermez hale geldiğinde WebView2
// sonsuza dek beyaz ekranda kalır — ProcessFailed olayını dinleyip otomatik
// Reload ile kurtarıyoruz.
#[cfg(windows)]
fn install_crash_recovery(app: &tauri::App) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
        COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
    };
    use webview2_com::ProcessFailedEventHandler;

    for (_, window) in app.webview_windows() {
        let _ = window.with_webview(|webview| unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else { return };
            let handler = ProcessFailedEventHandler::create(Box::new(|sender, args| {
                if let (Some(sender), Some(args)) = (sender, args) {
                    let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
                    let _ = args.ProcessFailedKind(&mut kind);
                    // Renderer öldü veya kilitlendi → sayfayı yeniden yükle.
                    // (Browser process ölümü Reload ile kurtarılamaz; GPU process
                    // ölümünü WebView2 zaten kendisi toparlar.)
                    if kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED
                        || kind == COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE
                    {
                        write_diag(&format!(
                            "RUST: !!! RENDERER FAILED kind={} → Reload() (EXITED=crash/OOM, UNRESPONSIVE=hang)",
                            kind.0
                        ));
                        let _ = sender.Reload();
                    }
                }
                Ok(())
            }));
            let mut token: i64 = 0;
            let _ = core.add_ProcessFailed(&handler, &mut token);
        });
    }
}

fn main() {
    // WebView2 Alt+Tab freeze fix: CalculateNativeWinOcclusion, pencere arkada
    // kalınca render'ın yanlışlıkla durdurulmasını engeller (bilinen WebView2 bug'ı).
    // NOT: --disable-gpu-vsync ve --disable-frame-rate-limit burada DURMAMALI —
    // compositor'ı sınırsız FPS'e zorlayıp GPU'yu tüketiyor ve sürücü resetiyle
    // beyaz ekran/donmaya yol açıyorlardı. --disable-hang-monitor da Chromium'un
    // kilitlenen renderer'ı kurtarmasını engelliyordu.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=CalculateNativeWinOcclusion --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling",
    );

    write_diag("RUST: ===== PROCESS START =====");

    tauri::Builder::default()
        .setup(|app| {
            #[cfg(windows)]
            install_crash_recovery(app);

            // Independent heartbeat on its own OS thread — completely decoupled from
            // the main window event loop and from any Tauri IPC/webview activity. If
            // this keeps ticking while the JS-side ping (js_ping, called every ~2s)
            // goes silent, the freeze is in the JS/webview layer, not Rust's main
            // thread. Also samples CPU% of our own process AND of the
            // msedgewebview2.exe process(es) that actually run the JS/renderer (a
            // separate OS process — WebView2 uses a Chromium-style multi-process
            // model), which tells us whether JS was stuck spinning (high CPU) or
            // genuinely blocked/waiting (near-zero CPU).
            //
            // Confirmed pattern from real freezes: host_cpu and webview_cpu BOTH stay
            // near 0% the entire time (not a spin), no HTTP call is ever in flight,
            // and WebView2's own ProcessFailed event never fires (so
            // install_crash_recovery never triggers) — this matches Chromium's page
            // freezing for backgrounded/occluded content, which can suspend ALL JS
            // timers indefinitely. Since JS can't be relied on to escape this itself
            // (an eval()'d reload would sit in the same stuck queue), once js_ping
            // goes stale past a threshold we force a NATIVE reload via
            // ICoreWebView2::Reload() — the same COM-level call the crash-recovery
            // path uses — which doesn't require the frozen JS thread's cooperation.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                use sysinfo::{Pid, System};
                let my_pid = Pid::from_u32(std::process::id());
                let mut sys = System::new_all();
                let mut last_recovery_attempt: u64 = 0;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));
                    let n = inflight_counter().load(std::sync::atomic::Ordering::SeqCst);
                    sys.refresh_all();

                    let my_cpu = sys.process(my_pid).map(|p| p.cpu_usage()).unwrap_or(-1.0);

                    // Sum CPU of every msedgewebview2.exe whose ancestor chain leads back
                    // to us (walk up to 6 hops: renderer -> ... -> WebView2 browser -> us).
                    let mut wv_cpu = 0.0f32;
                    let mut wv_count = 0;
                    for (pid, proc_) in sys.processes() {
                        if !proc_.name().to_string_lossy().eq_ignore_ascii_case("msedgewebview2.exe") { continue; }
                        let mut cur = Some(*pid);
                        for _ in 0..6 {
                            let Some(cur_pid) = cur else { break };
                            if cur_pid == my_pid { wv_cpu += proc_.cpu_usage(); wv_count += 1; break; }
                            cur = sys.process(cur_pid).and_then(|p| p.parent());
                        }
                    }

                    let now = now_secs();
                    let ping_age = now.saturating_sub(last_js_ping().load(std::sync::atomic::Ordering::SeqCst));
                    write_diag(&format!(
                        "RUST-HB alive (inflight_http={}, host_cpu={:.1}%, webview_cpu={:.1}% across {} proc, js_ping_age={}s)",
                        n, my_cpu, wv_cpu, wv_count, ping_age
                    ));

                    // JS ping should land every ~2s. Past 40s with no ping and no
                    // recovery attempt in the last 90s, force a native reload.
                    if ping_age > 40 && now.saturating_sub(last_recovery_attempt) > 90 {
                        last_recovery_attempt = now;
                        write_diag(&format!("RUST: !!! js_ping stale for {}s -> forcing native Reload()", ping_age));
                        if let Some(window) = app_handle.get_webview_window("main") {
                            #[cfg(windows)]
                            {
                                let ok = window.with_webview(|webview| unsafe {
                                    if let Ok(core) = webview.controller().CoreWebView2() {
                                        let _ = core.Reload();
                                    }
                                });
                                write_diag(&format!("RUST: forced Reload() dispatched ok={}", ok.is_ok()));
                            }
                        } else {
                            write_diag("RUST: forced Reload() failed — main window not found");
                        }
                    }
                }
            });

            Ok(())
        })
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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .invoke_handler(tauri::generate_handler![
toggle_kana_window,
            fetch_rss,
            fetch_post,
            fetch_get,
            fetch_tts,
            create_child_webview,
            navigate_child_webview,
            show_child_webview,
            hide_child_webview,
            close_child_webview,
            set_child_webview_bounds,
            diag_log,
            js_ping,
        ])
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::CloseRequested { .. } => {
                    if window.label() == "main" {
                        let app = window.app_handle();
                        for (_, w) in app.webview_windows() {
                            let _ = w.close();
                        }
                    }
                }
                // WebView2 freeze fix: odak gelince agresif repaint + child webview restore
                tauri::WindowEvent::Focused(true) => {
                    if window.label() == "main" {
                        let app = window.app_handle();
                        // Child webview'i tekrar göster (arka planda hide edilmişse)
                        if let Some(child) = app.get_webview("tradingview-child") {
                            let _ = child.show();
                        }
                        if let Some(wv) = app.get_webview_window("main") {
                            let _ = wv.eval("window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('focus'));");
                        }
                    }
                }
                // Arka plana geçince child webview'i hide et — GPU kaynak çakışmasını önle
                tauri::WindowEvent::Focused(false) => {
                    if window.label() == "main" {
                        let app = window.app_handle();
                        if let Some(child) = app.get_webview("tradingview-child") {
                            let _ = child.hide();
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
