# BankoSpace geliştirme ön incelemesi

Tarih: 24 Ekim 2026. Bu not yerel kaynak kod ve çalıştırılan kontroller üzerinden hazırlanmıştır.

## Proje ve mevcut durum

- Konum: `C:\Users\brkbn\Desktop\Banko Files\BankoSpace`
- Git dalı: `main`; uzak depo: `https://github.com/berkbankoglu/BankoSpace.git`.
- Uygulama sürümü: package.json, tauri.conf.json ve App.jsx içinde 4.9.6.
- Rust paket sürümü Cargo.toml içinde 4.6.4; README sürüm rozeti 4.1.3. Belgeler ve paket metadatası tamamen güncel değil.
- Önceden mevcut, commit edilmemiş değişiklikler var: dashboard düzenleme, yeni widget'lar, ilk kullanım sayfa seçimi, senkronizasyon göstergesi, testler ve bunların entegrasyonları. Bunlar korunmalıdır.
- Yerel geliştirme kuralları `CLAUDE.md` içinde. İncelenen proje ve üst klasörlerde AGENTS.md bulunmadı.

## Teknoloji ve dosya haritası

| Alan | İlgili dosyalar | Görev |
| --- | --- | --- |
| Başlangıç | src/main.jsx | React başlangıcı; masaüstünde eski service worker temizliği |
| Ana uygulama | src/App.jsx, src/App.css | Oturum, navigasyon, görevler, ayarlar ve modül entegrasyonu |
| Dashboard | src/components/DashColumns.jsx, src/utils/dashLayout.js | Düzenleme, taşıma, en fazla dört sütun ve widget kaydı |
| Widget'lar | src/components/widgets/ | Not, alışkanlık, çalışma, fitness ve checklist panelleri |
| Takvim | Calendar.jsx, CalendarViews.jsx, EventEditor.jsx, utils/plannerStore.js | Takvim verisi, görünümler ve etkinlikler |
| Notlar | src/components/Notes.jsx, src/utils/imageStore.js | Zengin metin ve IndexedDB görselleri |
| Diğer modüller | src/components/ | Alışkanlıklar, fitness, Japonca, flashcard, ödeme ve review bileşenleri |
| Platform köprüsü | src/platform.js | Masaüstü/web ayrımı; dosya, bildirim, pencere ve ağ işlemleri |
| Kimlik ve bulut | src/supabase.js, src/components/Login.jsx | Supabase istemcisi, oturum ve anahtar bazlı veri aktarımı |
| Eşitleme | src/sync.js, src/utils/nativeStorage.js | Değişiklik takibi, bekleyen yazmalar, polling ve canlı güncellemeler |
| Hesap izolasyonu | src/utils/accounts.js, src/utils/apiKey.js | Hesap geçişi ve hesaba özel API anahtarları |
| Masaüstü | src-tauri/src/main.rs, src-tauri/tauri.conf.json | Rust komutları, pencere yönetimi, HTTP, tanılama ve güncelleyici |
| Web API | api/proxy.js | İzinli hedefler için sunucu tarafı HTTP aracısı |
| Hızlı kayıt | supabase/functions/quick-signup/index.ts | Supabase Edge Function; ayrı dağıtım gerektirir |
| Testler | tests/run.mjs, tests/*.test.js | esbuild + Node; sahte Supabase, Chromium/WebKit storage davranışları |
| Yayın | .github/workflows/release.yml | v* etiketiyle Windows ve Apple Silicon macOS sürümleri |

## Veri akışı ve korunacak kurallar

1. Ana uygulama oturum kontrolü ve başlangıç eşitlemesinden sonra açılır. Yerel veriyi okumadan önce bulut verisinin alınması korunmalıdır.
2. Verinin önemli kısmı localStorage içindedir. Not görselleri ve çizimleri IndexedDB'dedir; bunlar ayrı veri alanlarıdır.
3. Bulut modeli kullanıcı ve anahtar başına `user_data` satırıdır. Yeni eşitlenen alan `SYNC_KEYS` listesine eklenmelidir.
4. Yerel yazmalar `Storage.prototype` üzerinden izlenir. `localStorage.setItem = ...` biçiminde değiştirmek macOS/WebKit'te çalışmaz.
5. Buluttan uygulanan veriler ve hesap temizliği nativeStorage yardımcılarıyla yazılmalı/silinmelidir; kullanıcı düzenlemesi gibi tekrar gönderilmemelidir.
6. `__sync_dirty` gönderilmemiş değişiklikleri tutar. Buluttan okuma bu anahtarların yerel değerini ezmemelidir.
7. Açık ekrana yeni veri `rehydrate`, `LIVE_EVENTS` veya storage olayıyla uygulanır. Eşitleme nedeniyle tüm pencere yeniden yüklenmemelidir.
8. Hesap değişiminde önceki hesabın verisi temizlenir. Kayıtlı oturumlar ve API anahtarları buluta veya dışa aktarıma karışmamalıdır.
9. Çakışma çözümü anahtar düzeyindedir. Aynı listeyi iki cihazda eşzamanlı düzenlemek bir tarafın değişikliğini kaybettirebilir; öğe düzeyinde birleştirme yoktur.
10. Yeni arayüz mevcut CSS tema değişkenlerini kullanmalı; uygulama içi metinler mevcut proje kuralına göre İngilizce olmalıdır.

## Çalıştırma ve doğrulama

- Ortamda Node 22.23.1, npm 10.9.8, Rust/Cargo 1.96.1 mevcut; node_modules kurulu.
- `npm run dev`: 3000 portunda web geliştirme sunucusu.
- `npm run tauri-dev`: masaüstü geliştirme uygulaması.
- `npm run build`: arayüzü dist klasörüne derler; bu incelemede başarılı.
- `cargo check --offline` (src-tauri içinde): Rust kontrolü; bu incelemede başarılı.
- `npm test`: bu incelemede 13 test çalıştırması, toplam 166 kontrol başarılı; hata yok. Gerçek bulut yerine test Supabase uygulaması kullanılır. Cihaz etkinliği testi iki adet 30,5 saniyelik bekleme içerir.
- `npm run tauri-build`: dağıtım paketi üretir ve beforeBuildCommand ile arayüzü derler. İmzalı yayın için ayrıca yayın ortamı gerekir.
- Sadece arayüzü derlemek mevcut masaüstü exe dosyasını güncellemez; masaüstü binary de yeniden derlenmelidir.
- `.env` içindeki VITE_SUPABASE_URL ve VITE_SUPABASE_KEY gereklidir. Bu incelemede .env içeriği okunmadı.

## Gözlemler ve sınırlar

- Vite derlemesinde büyük parça ve statik/dinamik import uyarıları var; derlemeyi engellemiyor.
- Rust kontrolünde artımlı önbellekte hard-link yerine kopyalama ve kullanılmayan `last_restart_attempt` ataması uyarısı var.
- App.jsx ve App.css büyük merkez dosyalar; değişiklikler ilgili bileşene mümkün olduğunca dar tutulmalı.
- README'nin anlattığı özellikler güncel menüyle birebir örtüşmüyor. Örneğin AppWrapper oturumsuzken Login gösteriyor; README'deki hesapsız kullanım açıklaması ayrıca doğrulanmalı.
- Web Supabase istekleri `/api/proxy` kullanıyor. Vite ayarında bu sunucu endpoint'ini çalıştıracak bir proxy tanımı yok; yalnız `npm run dev` ile tam web oturum akışı varsayılmamalı.
- CLAUDE.md, ay görünümünde takvime dokunarak yerleştirmeyi ve dar ekran Login/Settings doğrulamasını açık işler olarak kaydediyor; bu incelemede görsel olarak yeniden test edilmedi.
- Gerçek hesapla giriş, canlı Supabase/RLS durumu, cihazlar arası gerçek eşitleme, güncelleme kurulumu ve tam masaüstü paket derlemesi denenmedi.
- Uygulama kaynakları değiştirilmedi. Araştırma notu eklendi; test ve derleme çıktıları üretildi. Commit, push veya yayın yapılmadı.
