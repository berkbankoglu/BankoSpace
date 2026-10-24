# BankoSpace problem incelemesi

## Düzeltme durumu — 24 Ekim 2026

Altı öncelikli bulgu ve iki takvim bulgusu kaynak kodda düzeltildi. Aşağıdaki
inceleme maddeleri ilk bulgunun tarihsel kaydıdır; satır numaraları ilk incelemeye aittir.

- Boş listeler bulutun geçerli verisi kabul ediliyor. Silmeler kalıcı kayıtla
  temsil ediliyor; önceden bilinen bir anahtar buluttan silinmişse eski kopya
  yeniden yüklenmiyor. Yerel silme bekleyen yazmayı iptal ediyor ve aynı
  anahtarın gönderimleri sırayla işleniyor.
- Son not dahil boş not listesi ve yerel yedeği kaydediliyor. Boş liste eski
  yedeğe dönmüyor; ikinci kaydetme zamanlayıcısı kaldırıldı.
- Genel yedek şeması bütün eşitlenen alanları kapsıyor. Takvim, ilaçlar,
  review ve dashboard ayrı seçilebiliyor. Görseller ve çizimler yedeğe dahil;
  eski yedek biçimi de içe aktarılabiliyor. Oturumlar ve API anahtarları hariç.
- Not medyası mevcut kullanıcıya bağlı Supabase satırlarında ayrı eşitleniyor.
  Çevrimdışı kuyruk kalıcı, hesap geçişleriyle önbellek ayrılıyor; geç ulaşan
  başka hesaba ait indirmeler uygulanmıyor. Önceden kaybolmuş ve hiçbir cihazda
  veya yedekte bulunmayan görseller bu düzeltmeyle yeniden üretilemez.
- Aylık görünümde görev, seçilen güne saat 09.00'a yerleştiriliyor; ekranda bu
  saat açıklanıyor. Windows kısayol ipuçları Ctrl, macOS ipuçları ⌘ kullanıyor.

Doğrulama: mevcut 166 kontrole ek olarak iki storage motorunda toplam 80 yeni
kontrol başarılı. İlk altı silme kontrolü eski kodla çalıştırıldığında altısı da
başarısızdı; düzeltmeyle geçiyor. Vite derlemesi ve `cargo build --offline`
başarılı. Yeni Windows binary açıldı; yeni yedek bölümleri çalışan arayüzde
görüldü. Gerçek ikinci Mac cihazıyla eşitleme testi ve uzak yayın yapılmadı.

Tarih: 24 Ekim 2026. Çalışan Windows uygulaması açılarak dashboard, haftalık/aylık takvim, notlar, fitness, review ve Settings → Data ekranları incelendi. Yıkıcı denemeler gerçek kullanıcı verisinde yapılmadı. Uygulama kaynak kodu değiştirilmedi.

## Öncelikli bulgular

### 1. P1 — Başka cihazda boşaltılan liste veya silinen anahtar geri geliyor

- Konum: `src/supabase.js:282`, `src/supabase.js:316`.
- Bulut değeri `[]` veya `{}` olduğunda, eski dolu yerel değer korunup gönderilecek olarak işaretleniyor. Bulutta anahtar tamamen yoksa da yerel eski değer yeni veri sayılarak tekrar yükleniyor.
- Son öğeyi başka cihazda silmek kalıcı olmayabilir; eski cihaz yeniden eşitlendiğinde içerik geri gelir.
- Kanıt: mevcut sahte Supabase ortamında iki senaryo da yeniden üretildi. Buluttaki boş todos listesi tekrar bir öğeye döndü; bulutta bulunmayan goals kaydı tekrar oluştu.
- Düzeltme yönü: başlangıç verisiyle bilinçli silmeyi ayırmak; silmeler için sürümlü kayıt/tombstone veya açık başlangıç aktarımı kullanmak.

### 2. P1 — Yerel silme, bekleyen eski yazmayı iptal etmiyor

- Konum: `src/sync.js:149`, `src/sync.js:198`.
- `setItem` gecikmeli gönderim oluşturuyor. Hemen ardından `removeItem` çağrıldığında aynı anahtarın zamanlayıcısı ve pending kaydı temizlenmiyor.
- Silme önce buluta ulaşıyor; eski zamanlayıcı sonradan çalışıp kaydı tekrar oluşturuyor.
- Kanıt: sahte flashCards değeri yazılıp hemen silindi. 1,1 saniye sonra yerel anahtar yokken bulutta eski kart yeniden bulunuyordu.
- Düzeltme yönü: silmeden önce anahtarın bekleyen yazmasını iptal etmek; aynı anahtarın ağ isteklerinin sırasını da korumak.

### 3. P1 — Son notun silinmesi kaydedilmiyor

- Konum: `src/components/Notes.jsx:1269`, `src/components/Notes.jsx:1567`, başlangıç yedek seçimi `src/components/Notes.jsx:1180` civarı.
- Silme işlemi React listesini boşaltıyor; kaydetme effect'i `notes.length === 0` olduğunda erken dönüyor. Boş liste localStorage'a veya notes_local_backup'a yazılmıyor.
- Daha önce kurulmuş kaydetme zamanlayıcısı da bu erken dönüşten önce iptal edilmiyor. Tekrar açıldığında eski son not geri gelebilir.
- Kanıt: kaynak dosyadan alınan gerçek kaydetme callback'i boş listeyle izole çalıştırıldı; saklanan eski not değişmeden kaldı. Gerçek kullanıcının notu silinmedi.
- Düzeltme yönü: boş listeyi geçerli veri olarak kaydetmek ve yedeği de aynı şekilde güncellemek; ilk yükleme ile bilinçli boşaltmayı ayırmak.

### 4. P1 — Export All tam yedek üretmiyor

- Konum: `src/App.jsx:1620`, `src/App.jsx:1673`.
- DATA_SECTIONS yalnız sınırlı bir anahtar listesi içeriyor. Takvim, ilaçlar, review kayıtları, dashboard düzeni ve çeşitli yeni alanlar dışarıda.
- SYNC_KEYS ile karşılaştırıldığında 29 eşitlenen anahtar dışa aktarılmıyor. Örnekler: planner_blocks, planner_qtasks, planner_calendars, meds_v1, meds_log_v1, reviews_v1, dashLayout_v1, ft_custom_foods, ft_goal_kcal, kana_custom_folders.
- Etki: cihaz değiştirirken veya yedekten dönerken bu veriler yedekten geri getirilemez. Import All da aynı eksik listeyi kullanıyor.
- Kanıt: kaynaklardaki iki liste programatik karşılaştırıldı; Data ekranında takvim/ilaç/review için dışa aktarma seçenekleri de bulunmuyor.
- Düzeltme yönü: merkezi ve sürümlü yedek şeması; bütün kullanıcı verilerini açıkça kapsamak.

### 5. P1 — Not görselleri ve çizimleri cihazlar arasında eşitlenmiyor

- Konum: `src/components/Notes.jsx:347`, `src/components/Notes.jsx:1821`, `src/utils/imageStore.js:55`, `src/utils/imageStore.js:110`, `src/supabase.js:61`.
- Görseller IndexedDB'ye yazılıyor; not içeriğinde yalnız data-img-id veya imgId kalıyor. Çizim katmanları da aynı yerel veritabanında.
- Buluta giden not bu kimlikleri taşıyor, ancak medya verisi için buluta yükleme/diğer cihazdan indirme akışı yok.
- Etki: başka cihaz not metnini alırken yeni eklenen görselin veya çizimin dosyasını alamaz. Hesap temizliği yerel medyayı sildiğinde buluttaki not referansı tek başına yeterli değildir.
- Kanıt: yerel saklama ve eşitleme kod yolları incelendi. İki gerçek cihazla uçtan uca denenmedi.
- Düzeltme yönü: kullanıcıya bağlı medya depolama alanı, yükleme/indirme ve referans yaşam döngüsü.

### 6. P1 — Settings üzerinden not yedeği görselleri içermiyor

- Konum: `src/App.jsx:1682`; karşılaştırma: `src/components/Notes.jsx:823`, `src/components/Notes.jsx:1643`.
- Settings → Data → Export All/Notes doğrudan localStorage verisini JSON'a koyuyor. IndexedDB'deki görseller ve çizimler eklenmiyor.
- Notes ekranının kendi dışa aktarması ise inlineNotesForExport ile bu medyayı dosyaya ekleyen ayrı bir yol kullanıyor. Genel yedek bu yolu çağırmıyor.
- Etki: genel yedek dosyası tek başına başka bilgisayarda görselli notu geri kuramaz. Metin geri gelse bile görsel kimliği boşa düşer.
- Kanıt: iki dışa aktarma yolu kaynakta karşılaştırıldı; gerçek dosya dışa aktarımı yapılmadı.
- Düzeltme yönü: genel yedeklemede de medyayı dahil etmek; genel içe aktarmada Notes'un medya hazırlama adımını kullanmak.

## İkincil bulgular

- **P2 — Dar pencerede aylık takvimde tap-to-place bağlantısı eksik.** Calendar dar görünümde görev tıklamasını yerleştirme moduna geçiriyor; yalnız TimeGrid armed/onSlotTap alıyor. MonthView bu durumu almıyor ve ay hücreleri görevi yerleştiremiyor. Konum: Calendar.jsx:713, Calendar.jsx:1009, Calendar.jsx:1015; CalendarViews.jsx:319. Kodla doğrulandı; dar pencerede uçtan uca yeniden üretilmedi.
- **P3 — Windows takviminde kısayol ipuçları Mac simgesiyle gösteriliyor.** Çalışan Windows ekranının erişilebilirlik metninde New event (⌘N), Month (⌘3), Today (⌘T) görünüyor. Kod Ctrl ve Meta'yı desteklediği halde ipucu platforma göre değişmiyor. Konum: Calendar.jsx:819 ve devamı.

## Doğrulama ve kapsam

- Önceki genel kontrolde mevcut 166 test başarılıydı. Bu rapordaki silme/boş liste senaryoları mevcut testlerin kapsamadığı ek durumlardır.
- Ek eşitleme denemesi: `tests/.build/audit-bugs-entry.js`; mevcut test stub'ı ile esbuild üzerinden paketlenip çalıştırıldı. Üç hata koşulunun üçü de doğrulandı.
- Son notun kaydedilmesi ve yedek kapsamı ayrıca izole kaynak kontrolleriyle doğrulandı.
- Gerçek hesapta silme, veri ekleme, yedekten dönme, hesap değiştirme veya güncelleme kurulumu denenmedi. Kalıcı kullanıcı verisi gerektiren akışlar test verisinde araştırıldı.
- Bu aşamada düzeltme uygulanmadı. Önerilen sıra: 1–3 veri tutarlılığı, 4 ve 6 yedek bütünlüğü, 5 medya eşitleme, ardından ikincil arayüz bulguları.
