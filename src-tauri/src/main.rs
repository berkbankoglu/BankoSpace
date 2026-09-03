// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::VecDeque;
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

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

fn write_diag_blocking(line: &str) {
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

// write_diag used to open/append/close the log file inline, on whatever thread
// called it — including the main thread, from the window event handlers. That
// turned out to be the actual freeze: dragging the custom title bar makes the
// window flip focus ~50x/second (measured: 499 focus events inside a single 10s
// heartbeat window), and each one did a synchronous open+write+close on the main
// thread. The event loop ended up spending its time on disk I/O instead of
// painting, which is the white flashing, and then the pile-up reads as a hang.
// Logging must never be able to block the UI: callers now just hand the line to
// a dedicated writer thread, which batches whatever has queued up into one write.
static DIAG_TX: OnceLock<std::sync::mpsc::Sender<String>> = OnceLock::new();
fn diag_tx() -> &'static std::sync::mpsc::Sender<String> {
    DIAG_TX.get_or_init(|| {
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        std::thread::spawn(move || {
            while let Ok(first) = rx.recv() {
                let mut batch = first;
                // Drain anything already queued so a burst costs one file write.
                while let Ok(next) = rx.try_recv() {
                    batch.push('\n');
                    batch.push_str(&next);
                }
                write_diag_blocking(&batch);
            }
        });
        tx
    })
}

fn write_diag(line: &str) {
    let _ = diag_tx().send(line.to_string());
}

// For the handful of lines that are the whole point of the log — a wedge being
// detected, a recovery being attempted. The async writer is the right default,
// but a queued line is lost if the process is killed (or restarts itself) in
// the moments after, which is exactly when these get written.
fn write_diag_now(line: &str) {
    write_diag_blocking(line);
}

#[tauri::command]
fn diag_log(line: String) {
    write_diag(&line);
}

// --- Freeze incident recorder --------------------------------------------
// bankospace-diag.log tells us THAT a freeze happened (js_ping went stale),
// but not WHY — answering "why" previously required manually sampling CPU/GPU
// live while a freeze was happening (that's how the 3ds Max CPU-starvation
// root cause was found last time). This makes that automatic: the instant a
// freeze is detected (well before the 40s/100s auto-Reload/restart
// thresholds below, so even freezes that self-resolve in 15-35s and never
// trigger recovery still get captured), it dumps a full system snapshot —
// system-wide top CPU/RAM consumers, our own + webview2's disk I/O, GPU 3D
// engine utilization per process, and any recent display-driver-timeout
// (TDR) or unexpected-shutdown events from the Windows Event Log — plus the
// last 2 minutes of heartbeat history leading up to it, to a dedicated log
// file separate from the noisier general diag log.
fn incident_path() -> std::path::PathBuf {
    let base = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".into());
    std::path::Path::new(&base).join("bankospace-freeze-incidents.log")
}

fn write_incident(line: &str) {
    use std::io::Write;
    let path = incident_path();
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 8_000_000 {
            let _ = std::fs::remove_file(&path);
        }
    }
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&path) {
        let _ = writeln!(f, "{}", line);
    }
}

fn local_time_string() -> String {
    #[cfg(windows)]
    {
        #[repr(C)]
        #[allow(non_snake_case)]
        struct SYSTEMTIME {
            wYear: u16, wMonth: u16, wDayOfWeek: u16, wDay: u16,
            wHour: u16, wMinute: u16, wSecond: u16, wMilliseconds: u16,
        }
        #[link(name = "kernel32")]
        extern "system" {
            fn GetLocalTime(t: *mut SYSTEMTIME);
        }
        unsafe {
            let mut st: SYSTEMTIME = std::mem::zeroed();
            GetLocalTime(&mut st);
            format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond)
        }
    }
    #[cfg(not(windows))]
    { format!("t={}", now_secs()) }
}

fn top_by_cpu(sys: &sysinfo::System, n: usize) -> String {
    let mut v: Vec<_> = sys.processes().iter().collect();
    v.sort_by(|a, b| b.1.cpu_usage().partial_cmp(&a.1.cpu_usage()).unwrap_or(std::cmp::Ordering::Equal));
    v.into_iter()
        .take(n)
        .map(|(pid, p)| format!("{}({}) cpu={:.1}% mem={}MB", p.name().to_string_lossy(), pid, p.cpu_usage(), p.memory() / 1_048_576))
        .collect::<Vec<_>>()
        .join(", ")
}

fn top_by_mem(sys: &sysinfo::System, n: usize) -> String {
    let mut v: Vec<_> = sys.processes().iter().collect();
    v.sort_by(|a, b| b.1.memory().cmp(&a.1.memory()));
    v.into_iter()
        .take(n)
        .map(|(pid, p)| format!("{}({}) mem={}MB cpu={:.1}%", p.name().to_string_lossy(), pid, p.memory() / 1_048_576, p.cpu_usage()))
        .collect::<Vec<_>>()
        .join(", ")
}

fn mem_summary(sys: &sysinfo::System) -> String {
    let total = sys.total_memory() / 1_048_576;
    let avail = sys.available_memory() / 1_048_576;
    let used_pct = if total > 0 { 100.0 * (total.saturating_sub(avail)) as f64 / total as f64 } else { 0.0 };
    format!("system RAM: {}MB/{}MB used ({:.0}%)", total.saturating_sub(avail), total, used_pct)
}

fn own_disk_io(sys: &sysinfo::System, my_pid: sysinfo::Pid) -> String {
    sys.process(my_pid).map(|p| {
        let d = p.disk_usage();
        format!("host disk I/O since start: read={}MB written={}MB", d.total_read_bytes / 1_048_576, d.total_written_bytes / 1_048_576)
    }).unwrap_or_default()
}

// Last ~2 minutes of heartbeat samples, so an incident dump shows what led up
// to the freeze, not just the instant it was noticed.
static HB_HISTORY: OnceLock<Mutex<VecDeque<String>>> = OnceLock::new();
fn hb_history() -> &'static Mutex<VecDeque<String>> {
    HB_HISTORY.get_or_init(|| Mutex::new(VecDeque::with_capacity(13)))
}
fn push_history(line: String) {
    if let Ok(mut h) = hb_history().lock() {
        h.push_back(line);
        if h.len() > 12 { h.pop_front(); }
    }
}
fn dump_history() -> String {
    hb_history().lock().map(|h| h.iter().cloned().collect::<Vec<_>>().join("\n")).unwrap_or_default()
}

// GPU utilization isn't available via sysinfo — shelling out to Get-Counter
// is the only cheap way to get it on Windows. Run on its own detached thread
// (never awaited/joined) so a slow or hung powershell.exe can never stall the
// watchdog loop that's busy trying to recover from the freeze itself.
fn spawn_gpu_snapshot(incident_id: u64) {
    std::thread::spawn(move || {
        let out = std::process::Command::new("powershell")
            .args([
                "-NoProfile", "-NonInteractive", "-Command",
                "Get-Counter '\\GPU Engine(*engtype_3D)\\Utilization Percentage' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty CounterSamples | Where-Object { $_.CookedValue -gt 1 } | Sort-Object CookedValue -Descending | Select-Object -First 8 -Property Path,CookedValue | Format-Table -AutoSize | Out-String -Width 300",
            ])
            .output();
        match out {
            Ok(o) if !o.stdout.is_empty() => {
                write_incident(&format!("[{}] GPU 3D engine usage (top consumers):\n{}", incident_id, String::from_utf8_lossy(&o.stdout).trim()));
            }
            Ok(_) => write_incident(&format!("[{}] GPU snapshot: no engines above 1% (not GPU-bound)", incident_id)),
            Err(e) => write_incident(&format!("[{}] GPU snapshot unavailable: {}", incident_id, e)),
        }
    });
}

// TDR (display driver timeout/reset) and unexpected-shutdown events are the
// clearest OS-level signal of a GPU-driver-caused freeze; check the last few
// minutes of the System event log whenever an incident starts.
fn spawn_eventlog_snapshot(incident_id: u64) {
    std::thread::spawn(move || {
        let out = std::process::Command::new("wevtutil")
            .args([
                "qe", "System",
                "/q:*[System[(EventID=4101 or EventID=41 or EventID=6008)]]",
                "/rd:true", "/c:5", "/f:text",
            ])
            .output();
        match out {
            Ok(o) => {
                let text = String::from_utf8_lossy(&o.stdout);
                if text.trim().is_empty() {
                    write_incident(&format!("[{}] Event log: no recent TDR/unexpected-shutdown events", incident_id));
                } else {
                    write_incident(&format!("[{}] Event log (TDR/power/shutdown):\n{}", incident_id, text.trim()));
                }
            }
            Err(e) => write_incident(&format!("[{}] Event log query unavailable: {}", incident_id, e)),
        }
    });
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

// Host part of the URL only (no query string/tokens, no userinfo/port) — safe
// to log and safe to use for the allowlist check below.
fn url_host(url: &str) -> String {
    let authority = url.split('/').nth(2).unwrap_or(url);
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    authority.split(':').next().unwrap_or(authority).to_lowercase()
}

// fetch_get/fetch_post proxy arbitrary requests through Rust (bypassing the
// WebView2 CSP's connect-src entirely), so the set of hosts they'll reach is
// fixed here rather than left open — only the hosts the app actually calls
// (Anthropic AI, the GitHub contributions widget, our own Supabase project).
fn is_allowed_host(host: &str) -> bool {
    host == "api.anthropic.com" || host == "github.com" || host.ends_with(".supabase.co")
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

// Alt+Tab / arka plana geçiş donmayla aynı anda mı oluyor sorusuna cevap
// vermek için: ana pencerenin şu anki odak durumu + en son ne zaman
// değiştiği. Freeze incident anında bu bilgi snapshot'a eklenir — eğer her
// donma "window_focused=false, Xs önce odak kaybedildi" ile eşleşiyorsa,
// bu WebView2'nin kendi occlusion/visibility davranışının donmayı
// tetiklediğini kesin olarak doğrular (ana JS thread'i çökmeden durur).
static MAIN_FOCUSED: OnceLock<std::sync::atomic::AtomicBool> = OnceLock::new();
fn main_focused() -> &'static std::sync::atomic::AtomicBool {
    MAIN_FOCUSED.get_or_init(|| std::sync::atomic::AtomicBool::new(true))
}
static LAST_FOCUS_CHANGE: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn last_focus_change() -> &'static std::sync::atomic::AtomicU64 {
    LAST_FOCUS_CHANGE.get_or_init(|| std::sync::atomic::AtomicU64::new(now_secs()))
}

// js_ping only proves the RENDERER's JS loop is alive; it says nothing about the
// native side. Windows reporting the window as not-Responding during a freeze
// pointed at the host's own message pump instead, but Process.Responding is not
// usable as evidence from inside, and it reads as true for any process without a
// window, so it can't tell the two layers apart either. This does: the heartbeat
// thread posts a closure to the main thread each tick, and the closure stamps
// this. If it stops advancing while the heartbeat thread keeps logging, the
// event loop itself is wedged — not the renderer, not scheduling.
static LAST_MAIN_TICK: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn last_main_tick() -> &'static std::sync::atomic::AtomicU64 {
    LAST_MAIN_TICK.get_or_init(|| std::sync::atomic::AtomicU64::new(now_secs()))
}

// Second-granularity throttles for the focus handlers — see the comment there.
static LAST_FOCUS_WORK: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn last_focus_work() -> &'static std::sync::atomic::AtomicU64 {
    LAST_FOCUS_WORK.get_or_init(|| std::sync::atomic::AtomicU64::new(0))
}
static LAST_BLUR_LOG: OnceLock<std::sync::atomic::AtomicU64> = OnceLock::new();
fn last_blur_log() -> &'static std::sync::atomic::AtomicU64 {
    LAST_BLUR_LOG.get_or_init(|| std::sync::atomic::AtomicU64::new(0))
}

#[tauri::command]
fn js_ping() {
    last_js_ping().store(now_secs(), std::sync::atomic::Ordering::SeqCst);
}

#[tauri::command]
async fn fetch_post(url: String, headers: std::collections::HashMap<String, String>, body: String) -> Result<String, String> {
    use std::sync::atomic::Ordering;
    let host = url_host(&url);
    if !is_allowed_host(&host) {
        write_diag(&format!("RUST: fetch_post REJECTED -> {} (not allowlisted)", host));
        return Err(format!("Host not allowed: {}", host));
    }
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
    if !is_allowed_host(&host) {
        write_diag(&format!("RUST: fetch_get REJECTED -> {} (not allowlisted)", host));
        return Err(format!("Host not allowed: {}", host));
    }
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

// Canlı testte donma anında yakalandı: 3ds Max arka planda tek başına
// makinedeki ~20 çekirdeğin neredeyse tamamını tüketiyordu (CPU örneklemesiyle
// doğrulandı — GPU 3D engine kullanımı da aynı anda sıçradı) ve BankoSpace'in
// WebView2 renderer'ı bu sırada CPU zaman dilimi bulamayıp js_ping'in (2sn'lik
// JS timer) 60-100sn boyunca hiç tetiklenememesine yol açtı. Bu bir WebView2/
// occlusion hatası değil, gerçek OS seviyesinde CPU açlığı — ne WebView2 flag'i
// ne de IsVisible zorlaması bunu çözebilir. Süreç önceliğini ABOVE_NORMAL'a
// çekmek, zamanlayıcının BankoSpace'in kısa/seyrek JS tick'lerini NORMAL
// öncelikli ağır arka plan işlerinin (render/simülasyon) önüne almasını sağlar.
#[cfg(windows)]
fn boost_process_priority() {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> isize;
        fn SetPriorityClass(process: isize, priority_class: u32) -> i32;
        fn GetCurrentThread() -> isize;
        fn SetThreadPriority(thread: isize, priority: i32) -> i32;
    }
    unsafe {
        let h = GetCurrentProcess();
        // ABOVE_NORMAL wasn't enough headroom under the real starvation case this
        // was built for (a background app pegging every core) — HIGH_PRIORITY_CLASS
        // is the same class Explorer/Task Manager run at, still well short of
        // REALTIME (which can starve input handling system-wide and needs admin),
        // safe for a foreground interactive app that just wants to not get starved.
        let ok = SetPriorityClass(h, HIGH_PRIORITY_CLASS);
        write_diag(&format!("RUST: SetPriorityClass(HIGH) ok={}", ok != 0));
        let pt_ok = disable_power_throttling(h);
        write_diag(&format!("RUST: disable_power_throttling ok={}", pt_ok));

        // This function runs at the very top of main(), on the thread that
        // tauri's .run() below turns into the window/message-pump thread — the
        // one thing that must never miss a scheduling slot, since Windows'
        // "not responding" detector (and every WindowEvent, including the
        // Focused handler recovery relies on) depends on THIS thread getting
        // CPU time to pump messages. Live testing on this machine caught it
        // reported not-Responding while under heavy sustained load from other
        // processes (confirmed via Process.Responding) even with the process
        // already at HIGH_PRIORITY_CLASS — so beyond the process-wide class,
        // this specific thread gets bumped to the highest base priority
        // Windows allows without REALTIME_PRIORITY_CLASS (which would elevate
        // every thread in the process, including background workers, and can
        // destabilize the wider system). THREAD_PRIORITY_TIME_CRITICAL is the
        // same mechanism real-time audio engines use to guarantee one
        // specific thread isn't starved.
        const THREAD_PRIORITY_TIME_CRITICAL: i32 = 15;
        let t = GetCurrentThread();
        let tok = SetThreadPriority(t, THREAD_PRIORITY_TIME_CRITICAL);
        write_diag(&format!("RUST: SetThreadPriority(TIME_CRITICAL) ok={}", tok != 0));
    }
}

const HIGH_PRIORITY_CLASS: u32 = 0x0000_0080;

// Priority class governs scheduling priority among ready threads; EcoQoS/Power
// Throttling is a separate, additive mechanism that tells the OS a process is
// "background" and can be run on efficiency cores / lower clocks regardless of
// priority class. Windows can classify an unfocused window as eligible for this
// on its own — opting out makes sure our timers aren't silently deprioritized
// by that layer even after the priority-class boost above.
#[cfg(windows)]
unsafe fn disable_power_throttling(process_handle: isize) -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        fn SetProcessInformation(process: isize, information_class: i32, information: *const core::ffi::c_void, information_size: u32) -> i32;
    }
    #[repr(C)]
    struct ProcessPowerThrottlingState {
        version: u32,
        control_mask: u32,
        state_mask: u32,
    }
    const PROCESS_POWER_THROTTLING: i32 = 4; // PROCESS_INFORMATION_CLASS::ProcessPowerThrottling
    const PROCESS_POWER_THROTTLING_CURRENT_VERSION: u32 = 1;
    const PROCESS_POWER_THROTTLING_EXECUTION_SPEED: u32 = 0x1;
    let state = ProcessPowerThrottlingState {
        version: PROCESS_POWER_THROTTLING_CURRENT_VERSION,
        control_mask: PROCESS_POWER_THROTTLING_EXECUTION_SPEED,
        state_mask: 0, // 0 = opt OUT of throttling for this control
    };
    // No diag write here — boost_pid_priority calls this every ~10s heartbeat
    // tick for every webview2 child process found, which would flood the log.
    let ok = SetProcessInformation(
        process_handle,
        PROCESS_POWER_THROTTLING,
        &state as *const _ as *const core::ffi::c_void,
        std::mem::size_of::<ProcessPowerThrottlingState>() as u32,
    );
    ok != 0
}

// boost_process_priority() sadece todo-app.exe'nin kendi önceliğini yükseltiyor —
// ama gerçek JS çalıştırma işi msedgewebview2.exe'nin AYRI bir alt sürecinde
// (--type=renderer) oluyor ve Windows child process'lere parent'ın öncelik
// sınıfını OTOMATİK miras bırakmıyor. Canlı ölçümde doğrulandı: donma sırasında
// renderer PID'leri hâlâ "Normal" öncelikteydi. Bu, her heartbeat tick'inde
// ilgili webview2 alt süreçlerini (renderer dahil) de ABOVE_NORMAL'a çekiyor.
#[cfg(windows)]
fn boost_pid_priority(pid: u32) {
    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(desired_access: u32, inherit_handle: i32, process_id: u32) -> isize;
        fn SetPriorityClass(process: isize, priority_class: u32) -> i32;
        fn CloseHandle(object: isize) -> i32;
    }
    const PROCESS_SET_INFORMATION: u32 = 0x0200;
    unsafe {
        let h = OpenProcess(PROCESS_SET_INFORMATION, 0, pid);
        if h != 0 {
            SetPriorityClass(h, HIGH_PRIORITY_CLASS);
            disable_power_throttling(h);
            CloseHandle(h);
        }
    }
}

fn main() {
    #[cfg(windows)]
    boost_process_priority();

    // WebView2 Alt+Tab freeze fix: CalculateNativeWinOcclusion, pencere arkada
    // kalınca render'ın yanlışlıkla durdurulmasını engeller (bilinen WebView2 bug'ı).
    // NOT: --disable-gpu-vsync ve --disable-frame-rate-limit burada DURMAMALI —
    // compositor'ı sınırsız FPS'e zorlayıp GPU'yu tüketiyor ve sürücü resetiyle
    // beyaz ekran/donmaya yol açıyorlardı. --disable-hang-monitor da Chromium'un
    // kilitlenen renderer'ı kurtarmasını engelliyordu.
    // IntensiveWakeUpThrottling: Chromium'un arka planda kalan sayfalarda
    // setTimeout/setInterval'ı ~1/dk'ya kısan ayrı bir mekanizması —
    // js_ping (2sn'lik setInterval) tam olarak bunun kurbanı olabilir,
    // yukarıdaki background-timer-throttling flag'inden bağımsız bir özellik.
    std::env::set_var(
        "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS",
        "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling",
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
                let mut last_restart_attempt: u64 = 0;
                let mut incident_active = false;
                let mut incident_start: u64 = 0;
                let mut incident_id: u64 = 0;
                let mut incident_peak_ping: u64 = 0;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(10));

                    // WebView2 host API'si, pencere odağı/görünürlüğü değiştiğinde
                    // (occlusion, Alt+Tab, arka planda kalma) kendi kararıyla
                    // renderer'ı IsVisible=false yapıp JS'i tamamen durdurabiliyor —
                    // bu, ProcessFailed hiç tetiklenmeden (renderer "çökmüş" değil,
                    // sadece dondurulmuş sayılıyor) ve --disable-backgrounding-*
                    // Chromium flag'lerinden bağımsız, WebView2'nin kendi occlusion
                    // takibi.
                    //
                    // A periodic IsVisible nudge (even toggled false→true for a real
                    // edge) used to run here every tick. Live testing showed it does
                    // NOT stop js_ping from going stale while unfocused — ping_age
                    // climbed past 800s regardless. Worse, this same test also caught
                    // the main window reported as not-Responding by Windows (confirmed
                    // via Process.Responding) while the renderer sub-processes were
                    // still Responding=true — i.e. the HOST's own message pump was
                    // wedged, not (only) the renderer. A background thread calling into
                    // the webview controller every 10s is a synchronous COM call that
                    // has to be serviced by that same main thread; doing it on a timer
                    // indefinitely, with no evidence it helps, is pure downside. It's
                    // now only called once, from the Focused(true) handler, at the one
                    // moment it might actually matter — see below.

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
                            if cur_pid == my_pid {
                                wv_cpu += proc_.cpu_usage();
                                wv_count += 1;
                                #[cfg(windows)]
                                boost_pid_priority(pid.as_u32());
                                break;
                            }
                            cur = sys.process(cur_pid).and_then(|p| p.parent());
                        }
                    }

                    let now = now_secs();
                    let ping_age = now.saturating_sub(last_js_ping().load(std::sync::atomic::Ordering::SeqCst));

                    // Probe the event loop itself — see last_main_tick(). Posting is
                    // non-blocking; if the loop is alive the closure runs almost
                    // immediately and the age below reads ~0, if it's wedged the
                    // closure never runs and the age climbs in lockstep with the
                    // freeze, which separates "renderer stopped" from "host stopped".
                    let _ = app_handle.run_on_main_thread(|| {
                        last_main_tick().store(now_secs(), std::sync::atomic::Ordering::SeqCst);
                    });
                    let main_age = now.saturating_sub(last_main_tick().load(std::sync::atomic::Ordering::SeqCst));

                    write_diag(&format!(
                        "RUST-HB alive (inflight_http={}, host_cpu={:.1}%, webview_cpu={:.1}% across {} proc, js_ping_age={}s, main_thread_age={}s, focused={})",
                        n, my_cpu, wv_cpu, wv_count, ping_age, main_age, main_focused().load(std::sync::atomic::Ordering::SeqCst)
                    ));

                    // Dragging the custom (decorations:false) title bar goes through
                    // data-tauri-drag-region, which on Windows hands off to the native
                    // move loop via WM_NCLBUTTONDOWN/HTCAPTION. That loop runs its own
                    // GetMessage pump inside DefWindowProc and only exits on the
                    // matching button-up — so while it runs, our event loop is blocked
                    // (hence the white flash: WebView2 can't present) and if the
                    // button-up never arrives the window stays blocked forever. This
                    // machine remaps mouse buttons globally (X-Mouse Button Control,
                    // Razer Synapse), which is exactly the kind of thing that can
                    // swallow or rewrite that button-up — and matches the report that
                    // it only happens here and never recovers.
                    //
                    // WM_CANCELMODE is the documented way to tell a window to leave
                    // whatever modal loop it's in; posting it from this thread doesn't
                    // need the blocked loop's cooperation. A real drag is over in
                    // seconds, so a dead event loop this long is never a legitimate
                    // drag. The threshold used to be 25s, which was longer than anyone
                    // waits before killing the app — so this never actually got to run
                    // during the freezes it was written for.
                    #[cfg(windows)]
                    let is_focused_now = main_focused().load(std::sync::atomic::Ordering::SeqCst);
                    #[cfg(windows)]
                    if main_age > 12 {
                        #[link(name = "user32")]
                        extern "system" {
                            fn PostMessageW(hwnd: isize, msg: u32, wparam: usize, lparam: isize) -> i32;
                        }
                        const WM_CANCELMODE: u32 = 0x001F;
                        const WM_LBUTTONUP: u32 = 0x0202;
                        write_diag_now(&format!(
                            "RUST: !!! main thread wedged {}s (focused={}) -> attempting WM_CANCELMODE break",
                            main_age, is_focused_now
                        ));
                        match app_handle.get_webview_window("main") {
                            Some(window) => match window.hwnd() {
                                Ok(hwnd) => {
                                    let raw = hwnd.0 as isize;
                                    unsafe {
                                        PostMessageW(raw, WM_CANCELMODE, 0, 0);
                                        PostMessageW(raw, WM_LBUTTONUP, 0, 0);
                                    }
                                    write_diag_now("RUST: posted WM_CANCELMODE + WM_LBUTTONUP");
                                }
                                Err(e) => write_diag_now(&format!("RUST: breaker could not get hwnd: {}", e)),
                            },
                            None => write_diag_now("RUST: breaker could not find the main window"),
                        }
                    }

                    push_history(format!(
                        "[{}] host_cpu={:.1}% webview_cpu={:.1}% js_ping_age={}s focused={} top_cpu=[{}] {}",
                        local_time_string(), my_cpu, wv_cpu, ping_age,
                        main_focused().load(std::sync::atomic::Ordering::SeqCst), top_by_cpu(&sys, 3), mem_summary(&sys)
                    ));

                    // Freeze incident recorder — fires at 12s stale (well before the
                    // 40s/100s escalation below) so short freezes that resolve on their
                    // own still get a full diagnostic dump, not just self-recovering
                    // silently and leaving no trace of what caused them.
                    const FREEZE_INCIDENT_THRESHOLD: u64 = 12;
                    if ping_age > FREEZE_INCIDENT_THRESHOLD {
                        if !incident_active {
                            incident_active = true;
                            incident_start = now;
                            incident_id = now;
                            incident_peak_ping = ping_age;
                            write_diag(&format!(
                                "RUST: !!! FREEZE INCIDENT #{} started (ping_age={}s) -> see bankospace-freeze-incidents.log",
                                incident_id, ping_age
                            ));
                            let is_focused = main_focused().load(std::sync::atomic::Ordering::SeqCst);
                            let since_focus_change = now.saturating_sub(last_focus_change().load(std::sync::atomic::Ordering::SeqCst));
                            write_incident(&format!(
                                "\n========== FREEZE INCIDENT #{} START {} ==========\nping_age={}s main_thread_age={}s host_cpu={:.1}% webview_cpu={:.1}% across {} webview proc\nwindow_focused={} (changed {}s ago) - if false, this freeze coincides with alt-tab/background occlusion\n{}\n-- last ~2 min before freeze --\n{}\n-- top CPU system-wide --\n{}\n-- top RAM system-wide --\n{}\n-- {}",
                                incident_id, local_time_string(), ping_age, main_age, my_cpu, wv_cpu, wv_count,
                                is_focused, since_focus_change,
                                mem_summary(&sys), dump_history(), top_by_cpu(&sys, 10), top_by_mem(&sys, 5), own_disk_io(&sys, my_pid)
                            ));
                            spawn_gpu_snapshot(incident_id);
                            spawn_eventlog_snapshot(incident_id);
                        } else {
                            incident_peak_ping = incident_peak_ping.max(ping_age);
                            write_incident(&format!(
                                "[{}] +{}s ping_age={}s host_cpu={:.1}% webview_cpu={:.1}% top=[{}]",
                                incident_id, now.saturating_sub(incident_start), ping_age, my_cpu, wv_cpu, top_by_cpu(&sys, 3)
                            ));
                        }
                    } else if incident_active {
                        incident_active = false;
                        let dur = now.saturating_sub(incident_start);
                        write_diag(&format!(
                            "RUST: FREEZE INCIDENT #{} ended after {}s (peak ping_age={}s)",
                            incident_id, dur, incident_peak_ping
                        ));
                        write_incident(&format!(
                            "========== FREEZE INCIDENT #{} END duration={}s peak_ping_age={}s ==========\n",
                            incident_id, dur, incident_peak_ping
                        ));
                    }

                    // Escalation ladder. Confirmed by observing a real freeze: a stale
                    // ping past 100s (i.e. Reload() already had ~2 chances and the ping
                    // never resumed) means the renderer's own message/IPC queue is stuck
                    // deeply enough that even a native COM Reload() request never gets
                    // processed — Reload() returning ok=true only means WebView2 ACCEPTED
                    // the request, not that the renderer acted on it. The only recovery
                    // that reliably works at that point (matches what manual
                    // kill+relaunch has done every single time this session) is killing
                    // the whole process and starting a fresh one — that sidesteps
                    // whatever internal deadlock caused this, rather than asking the
                    // stuck process to fix itself.
                    //
                    // Gated on window focus for the FAST path: an unfocused/backgrounded
                    // window goes stale by design (WebView2 suspends JS on occlusion —
                    // see the comment above main_focused()), not because it's actually
                    // stuck. Without this gate, a relaunched process that doesn't regain
                    // foreground focus (common — Windows routinely denies
                    // SetForegroundWindow to background processes) goes stale again
                    // within the same ~100s window and gets restarted again, forever:
                    // this was observed live as the app repeatedly launching and
                    // immediately losing focus in a loop.
                    //
                    // BUT: live testing also found a genuine main-thread hang (Windows
                    // reports the window as not Responding — confirmed independently of
                    // js_ping, which only reflects the renderer) that happened while
                    // unfocused and the focus-gate then means NOTHING ever recovers it,
                    // because the fast path needs a Focused(true) event to fire, and that
                    // event can't be delivered if the message pump producing it is the
                    // very thing that's wedged — a deadlock in the gate itself. So there's
                    // a second, much slower unfocused safety net: 900s (15 min) of
                    // staleness is far beyond anything normal background throttling has
                    // ever produced, so at that point something is genuinely wrong
                    // regardless of focus, and it's worth restarting even though nobody's
                    // watching, rather than leaving the process wedged forever.
                    let is_focused = main_focused().load(std::sync::atomic::Ordering::SeqCst);
                    let fast_path = is_focused && ping_age > 100;
                    let unfocused_safety_net = !is_focused && ping_age > 900;
                    // js_ping going stale on an unfocused window is normal —
                    // WebView2 suspends a backgrounded renderer by design, which is
                    // why that path waits 15 minutes. main_thread_age is different:
                    // it comes from run_on_main_thread, so it only climbs when the
                    // host's own event loop has stopped servicing work. That is a
                    // real hang no matter which window has focus, and on this machine
                    // it is what actually happens — the window never comes back on
                    // its own, so waiting 15 minutes to recover is the same as never.
                    let event_loop_dead = main_age > 40;
                    if (fast_path || unfocused_safety_net || event_loop_dead)
                        && now.saturating_sub(last_restart_attempt) > 60 {
                        last_restart_attempt = now;
                        write_diag_now(&format!(
                            "RUST: !!! restarting the whole process (js_ping {}s, main_thread {}s, focused={})",
                            ping_age, main_age, is_focused
                        ));
                        if incident_active {
                            write_incident(&format!("[{}] recovery: full process restart triggered (ping_age={}s)", incident_id, ping_age));
                        }
                        if let Ok(exe) = std::env::current_exe() {
                            let exe_str = exe.to_string_lossy().to_string();
                            // Relaunch via a short-delayed detached helper so our
                            // single-instance mutex is fully released (by this process
                            // exiting below) before the new instance tries to claim it.
                            //
                            // IMPORTANT: cmd.exe has its own quirky quoting rules that do
                            // NOT match how Rust's Command::args() escapes arguments for
                            // CreateProcess — passing this as a normal .arg() mangles the
                            // embedded quotes into literal backslash-quote sequences that
                            // cmd.exe can't parse, leaving the helper hung forever (a real
                            // hang we hit: the app exited but nothing ever relaunched).
                            // raw_arg() bypasses Rust's escaping so cmd.exe gets exactly
                            // the text it expects.
                            #[cfg(windows)]
                            {
                                use std::os::windows::process::CommandExt;
                                // -n 6 ≈ 5s bekleme — eskiden -n 3 (≈2s) kullanılıyordu ama
                                // canlı testte bu bazen çok kısa çıktı: yeni süreç, eskisi
                                // (ve onun single-instance kilidi/OS handle'ları) tam
                                // temizlenmeden başlayınca kısa süre sonra kapanabiliyordu.
                                let cmd_str = format!("ping 127.0.0.1 -n 6 >nul & start \"\" \"{}\"", exe_str);
                                let spawned = std::process::Command::new("cmd")
                                    .arg("/C")
                                    .raw_arg(&cmd_str)
                                    .spawn();
                                write_diag(&format!("RUST: relaunch scheduled ok={}", spawned.is_ok()));
                            }
                        }
                        std::thread::sleep(std::time::Duration::from_millis(200));
                        std::process::exit(1);
                    } else if is_focused && ping_age > 40 && now.saturating_sub(last_recovery_attempt) > 90 {
                        // JS ping should land every ~2s. Past 40s with no ping and no
                        // recovery attempt in the last 90s, first try the cheaper fix:
                        // a native reload (works for lighter freezes; see escalation
                        // above for when it doesn't).
                        last_recovery_attempt = now;
                        write_diag(&format!("RUST: !!! js_ping stale for {}s -> forcing native Reload()", ping_age));
                        if incident_active {
                            write_incident(&format!("[{}] recovery: native Reload() forced (ping_age={}s)", incident_id, ping_age));
                        }
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
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
toggle_kana_window,
            fetch_post,
            fetch_get,
            fetch_tts,
            diag_log,
            js_ping,
        ])
        .on_window_event(|window, event| {
            match event {
                // main penceresi kapanmadan önce JS tarafı bekleyen Supabase
                // push'larını flush edip kendi onCloseRequested akışında
                // destroy() çağırıyor (preventDefault + async await + destroy).
                // Burada CloseRequested anında diğer webview'leri kapatırsak,
                // JS'in preventDefault'u henüz IPC üzerinden ulaşmadan pencere
                // ekosistemi dağılmış olur — bu yüzden gerçek kapanışı
                // (Destroyed) bekliyoruz, ki main zaten kesin gitmiş olsun.
                tauri::WindowEvent::Destroyed => {
                    if window.label() == "main" {
                        let app = window.app_handle();
                        for (_, w) in app.webview_windows() {
                            if w.label() != "main" {
                                let _ = w.close();
                            }
                        }
                    }
                }
                // WebView2 freeze fix: odak gelince agresif repaint + child webview restore
                // Everything in here runs on the main thread, and focus is NOT a
                // once-in-a-while event: dragging the custom title bar makes the
                // window flip focus ~50x/second (measured: 499 focus events within a
                // single 10s heartbeat). So this handler must stay close to free.
                //
                // It previously did, per event: SetIsVisible(false) then (true), two
                // synchronous COM calls into WebView2, plus an eval() round-trip. At
                // 50 events/second that hides and re-shows the webview 50 times a
                // second — which IS the white flashing, with the window's blank
                // background showing through each time — while flooding the main
                // thread. The visibility toggle is gone (it was added to try to wake a
                // suspended renderer and never demonstrably worked), and the remaining
                // wake nudge is throttled so a focus storm can't multiply it.
                tauri::WindowEvent::Focused(true) => {
                    if window.label() == "main" {
                        let now = now_secs();
                        let blurred_for = now.saturating_sub(last_focus_change().load(std::sync::atomic::Ordering::SeqCst));
                        main_focused().store(true, std::sync::atomic::Ordering::SeqCst);
                        last_focus_change().store(now, std::sync::atomic::Ordering::SeqCst);

                        // Coalesce: only the first focus-gain in a given second does
                        // any work or writes a line. A drag's worth of flapping
                        // collapses to one entry instead of hundreds.
                        let prev = last_focus_work().swap(now, std::sync::atomic::Ordering::SeqCst);
                        if now != prev {
                            write_diag(&format!("RUST: window FOCUSED (was unfocused for {}s)", blurred_for));
                            let app = window.app_handle();
                            if let Some(wv) = app.get_webview_window("main") {
                                let _ = wv.eval("window.dispatchEvent(new Event('resize')); window.dispatchEvent(new Event('focus'));");
                            }
                        }
                    }
                }
                tauri::WindowEvent::Focused(false) => {
                    if window.label() == "main" {
                        let now = now_secs();
                        main_focused().store(false, std::sync::atomic::Ordering::SeqCst);
                        last_focus_change().store(now, std::sync::atomic::Ordering::SeqCst);
                        let prev = last_blur_log().swap(now, std::sync::atomic::Ordering::SeqCst);
                        if now != prev {
                            write_diag("RUST: window UNFOCUSED (blurred - alt-tab or click-away)");
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
