import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

// ── Watchdog: UI thread 4 saniye bloklanırsa uygulamayı kapat ──
;(function startWatchdog() {
  const THRESHOLD = 6000; // ms — 6 saniye bloklanırsa dondur sayılır
  let last = Date.now();

  // Her 500ms'de "hâlâ canlı" işareti güncelle
  setInterval(() => { last = Date.now(); }, 500);

  // Web Worker ile ana thread'den bağımsız kontrol
  const blob = new Blob([`
    let last = Date.now();
    onmessage = () => { last = Date.now(); };
    setInterval(() => {
      if (Date.now() - last > ${THRESHOLD}) postMessage('frozen');
    }, 1000);
  `], { type: 'application/javascript' });

  const worker = new Worker(URL.createObjectURL(blob));

  // Ana thread'den worker'a heartbeat gönder
  setInterval(() => { worker.postMessage('ping'); }, 500);

  worker.onmessage = async () => {
    try {
      const { exit } = await import('@tauri-apps/plugin-process');
      await exit(0);
    } catch {
      window.location.reload();
    }
  };
})();


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
