# Firebase Kurulum Talimatları

## Adım 1: Firebase Console'da Proje Oluştur

1. [Firebase Console](https://console.firebase.google.com/) adresine gidin
2. "Add project" veya "Proje ekle" butonuna tıklayın
3. Proje adı girin (örn: "todo-app-react")
4. Google Analytics'i istersen etkinleştir (isteğe bağlı)
5. "Create project" / "Projeyi oluştur" tıklayın

## Adım 2: Authentication'ı Etkinleştir

1. Sol menüden **Authentication** seçin
2. "Get started" butonuna tıklayın
3. "Sign-in method" sekmesine gidin
4. "Email/Password" seçeneğini bulun ve etkinleştir
5. "Save" / "Kaydet" tıklayın

## Adım 3: Firestore Database Oluştur

1. Sol menüden **Firestore Database** seçin
2. "Create database" butonuna tıklayın
3. "Start in test mode" seçin (şimdilik - sonra güvenlik kuralları ayarlayacağız)
4. Location seç (Europe (eur3) önerilir)
5. "Enable" / "Etkinleştir" tıklayın

## Adım 4: Web App Kaydet ve Config Al

**NOT:** Storage kurulumuna gerek yok, referans resimleri localStorage'da saklanacak.

1. Proje ayarlarına git (sol üstteki dişli ikonu ⚙️)
2. "Project settings" / "Proje ayarları" seçin
3. Aşağı kaydır, "Your apps" / "Uygulamalarınız" bölümüne gel
4. Web ikonu (<  />) tıkla
5. App nickname gir (örn: "Todo App")
6. "Register app" / "Uygulamayı kaydet" tıklayın
7. Size gösterilen `firebaseConfig` objesini KOPYALA

## Adım 6: Config'i Projeye Ekle

1. `src/firebase/config.js` dosyasını aç
2. `firebaseConfig` objesindeki değerleri kopyaladığın değerlerle değiştir:

```javascript
const firebaseConfig = {
  apiKey: "BURAYA_KENDI_API_KEY",
  authDomain: "BURAYA_KENDI_AUTH_DOMAIN",
  projectId: "BURAYA_KENDI_PROJECT_ID",
  storageBucket: "BURAYA_KENDI_STORAGE_BUCKET",
  messagingSenderId: "BURAYA_KENDI_SENDER_ID",
  appId: "BURAYA_KENDI_APP_ID"
};
```

## Adım 7: Firestore Güvenlik Kurallarını Ayarla (ÖNEMLİ!)

1. Firebase Console'da **Firestore Database** > **Rules** sekmesine git
2. Aşağıdaki kuralları yapıştır:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Kullanıcılar sadece kendi verilerini okuyup yazabilir
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. "Publish" / "Yayınla" tıklayın

## Adım 8: Storage Güvenlik Kurallarını Ayarla (ÖNEMLİ!)

1. Firebase Console'da **Storage** > **Rules** sekmesine git
2. Aşağıdaki kuralları yapıştır:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // Kullanıcılar sadece kendi klasörlerindeki dosyaları okuyup yazabilir
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. "Publish" / "Yayınla" tıklayın

## Test Et!

1. Tauri uygulamasını başlat: `npm run tauri-dev`
2. Email ve şifre ile kayıt ol
3. Todo ekle, referans resmi yükle
4. Çıkış yap ve tekrar giriş yap
5. Verilerinin kayıtlı olduğunu gör! 🎉

## Başka Birisiyle Paylaşmak İçin

1. Uygulamayı build et: `npm run tauri-build`
2. `src-tauri/target/release/` klasöründeki .exe dosyasını paylaş
3. Kişi uygulamayı açtığında kendi email/şifre ile kayıt olacak
4. Her kullanıcının verileri tamamen ayrı ve güvenli!

## Sorun Giderme

- **"Firebase: Error (auth/invalid-api-key)"**: Config bilgilerini yanlış kopyaladın, tekrar kontrol et
- **"Missing or insufficient permissions"**: Güvenlik kurallarını doğru ayarlamadın
- **Resimler yüklenmiyor**: Storage kurallarını kontrol et
- **Veriler kaybolmuyor**: Firestore kurallarını ve config'i kontrol et
