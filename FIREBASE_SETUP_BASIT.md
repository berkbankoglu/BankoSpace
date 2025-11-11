# Firebase Kurulum (Basit - Storage Yok)

## Neler Saklanacak?

✅ **Firebase'de:**
- Todo'lar (Günlük, Haftalık, Aylık, Geniş Zaman)
- Kullanıcı hesapları (email/şifre)

📱 **Tarayıcıda (localStorage):**
- Referans panelindeki resimler
- Referans panelindeki metinler

## Adım 1: Firebase Console'a Git

1. [https://console.firebase.google.com/](https://console.firebase.google.com/) adresine git
2. Google hesabınla giriş yap
3. "Add project" veya "Proje ekle" tıkla
4. Proje adı yaz (örnek: "todo-app")
5. Google Analytics'i kapat (isteğe bağlı)
6. "Create project" tıkla

## Adım 2: Authentication Aç

1. Sol menüden **"Authentication"** seç
2. "Get started" tıkla
3. "Email/Password" etkinleştir
4. "Save" tıkla

## Adım 3: Firestore Database Oluştur

1. Sol menüden **"Firestore Database"** seç
2. "Create database" tıkla
3. **"Start in test mode"** seç
4. Location seç (Europe önerilir)
5. "Enable" tıkla

## Adım 4: Config Bilgilerini Al

1. Sol üstteki **⚙️ (dişli)** tıkla
2. "Project settings" seç
3. Aşağı kaydır, "Your apps" bölümü
4. **</>** (Web ikonu) tıkla
5. App nickname yaz (örn: "Todo App")
6. "Register app" tıkla
7. `firebaseConfig` bilgilerini **KOPYALA**

Şöyle görünecek:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "todo-app-xxx.firebaseapp.com",
  projectId: "todo-app-xxx",
  storageBucket: "todo-app-xxx.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

## Adım 5: Config'i Projeye Yapıştır

1. VSCode'da `src/firebase/config.js` aç
2. `YOUR_API_KEY` gibi değerleri **kendi değerlerinle değiştir**:

```javascript
const firebaseConfig = {
  apiKey: "KENDI_API_KEY_BURAYA",
  authDomain: "KENDI_AUTH_DOMAIN_BURAYA",
  projectId: "KENDI_PROJECT_ID_BURAYA",
  storageBucket: "KENDI_STORAGE_BUCKET_BURAYA",
  messagingSenderId: "KENDI_SENDER_ID_BURAYA",
  appId: "KENDI_APP_ID_BURAYA"
};
```

3. **Ctrl+S** ile kaydet

## Adım 6: Güvenlik Kuralları (ÖNEMLİ!)

### Firestore Kuralları:
1. Firebase Console > **Firestore Database** > **Rules**
2. Tümünü sil, şunu yapıştır:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. **Publish** tıkla

## Bitti! Test Et

Terminal'de çalıştır:
```bash
npm run tauri-dev
```

Şimdi:
1. Email/şifre ile kayıt ol
2. Todo ekle
3. Çıkış yap ve tekrar giriş yap
4. Todo'larını göreceksin! 🎉

## Önemli Notlar

- ✅ Todo'lar Firebase'de saklanır (kalıcı, her cihazda)
- ⚠️ Referans resimleri localStorage'da (sadece bu tarayıcıda)
- 💳 Kredi kartı gerektirmez
- 💰 Tamamen ücretsiz (Spark Plan limitleri içinde)
- 🔒 Her kullanıcının verileri ayrı ve güvenli

## Sorun Giderme

**"Firebase: Error (auth/invalid-api-key)"**
→ Config bilgilerini yanlış kopyaladın, tekrar kontrol et

**"Missing or insufficient permissions"**
→ Firestore güvenlik kurallarını doğru ayarlamadın

**Veriler kaybolmuyor**
→ Config'i doğru yapıştırdın mı? Firestore kuralları doğru mu?
