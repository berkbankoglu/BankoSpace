# Firebase Kurulum Talimatları

BankoSpace uygulamanızı Firebase ile senkronize etmek için aşağıdaki adımları izleyin:

## 1. Firebase Projesi Oluşturma

1. **Firebase Console'a gidin**: https://console.firebase.google.com/
2. **"Add project" (Proje Ekle)** butonuna tıklayın
3. Proje adını girin (örn: "bankospace")
4. Google Analytics'i istiyorsanız açın (opsiyonel)
5. **"Create project"** butonuna tıklayın

## 2. Web Uygulaması Ekleme

1. Firebase projenizin ana sayfasında **"Web"** (</>) ikonuna tıklayın
2. Uygulama takma adını girin (örn: "BankoSpace Web")
3. **Firebase Hosting'i ayarlamak ister misiniz?** → Hayır (şimdilik)
4. **"Register app"** butonuna tıklayın

## 3. Firebase Configuration Bilgilerini Kopyalama

Console'da göreceğiniz kodu kopyalayın. Şuna benzer olacak:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "bankospace-xxxxx.firebaseapp.com",
  projectId: "bankospace-xxxxx",
  storageBucket: "bankospace-xxxxx.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:xxxxxxxxxxxxxxxxxxxx"
};
```

## 4. firebase.js Dosyasını Güncelleme

1. `src/firebase.js` dosyasını açın
2. `firebaseConfig` objesindeki `YOUR_API_KEY`, `YOUR_PROJECT_ID` gibi değerleri Firebase Console'dan kopyaladığınız değerlerle değiştirin:

```javascript
const firebaseConfig = {
  apiKey: "BURAYA_KENDI_API_KEY",
  authDomain: "BURAYA_KENDI_AUTH_DOMAIN",
  projectId: "BURAYA_KENDI_PROJECT_ID",
  storageBucket: "BURAYA_KENDI_STORAGE_BUCKET",
  messagingSenderId: "BURAYA_KENDI_MESSAGING_SENDER_ID",
  appId: "BURAYA_KENDI_APP_ID"
};
```

## 5. Authentication'ı Aktif Etme

1. Firebase Console'da sol menüden **"Authentication"** seçeneğine tıklayın
2. **"Get started"** butonuna tıklayın
3. **"Sign-in method"** sekmesine tıklayın
4. **"Google"** seçeneğine tıklayın
5. **Enable** toggle'ını açın
6. Proje destek e-postası seçin (Google hesabınızın e-postası)
7. **"Save"** butonuna tıklayın

## 6. Firestore Database Oluşturma

1. Firebase Console'da sol menüden **"Firestore Database"** seçeneğine tıklayın
2. **"Create database"** butonuna tıklayın
3. **Production mode** veya **Test mode** seçin:
   - **Test mode**: 30 gün boyunca herkes okuyup yazabilir (geliştirme için)
   - **Production mode**: Güvenlik kuralları gerektirir
4. Lokasyon seçin (örn: europe-west3 - Frankfurt)
5. **"Enable"** butonuna tıklayın

## 7. Firestore Güvenlik Kurallarını Ayarlama

1. Firestore Database sayfasında **"Rules"** sekmesine tıklayın
2. Aşağıdaki kuralları yapıştırın:

```javascript
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

3. **"Publish"** butonuna tıklayın

## 8. Uygulamayı Test Etme

1. Uygulamayı build edin: `npm run tauri build`
2. Uygulamayı çalıştırın
3. **"Sign in with Google"** butonuna tıklayın
4. Google hesabınızla giriş yapın
5. Uygulamada bir todo ekleyin
6. Firebase Console'da Firestore Database'e gidin
7. `users` koleksiyonunda kullanıcı ID'nizle bir belge oluşturulduğunu göreceksiniz

## 9. Başka Bilgisayarda Kullanma

1. Başka bir bilgisayarda uygulamayı açın
2. Aynı Google hesabıyla giriş yapın
3. Tüm verileriniz otomatik olarak senkronize olacak!

## Sorun Giderme

### "Firebase: Error (auth/unauthorized-domain)"
- Firebase Console → Authentication → Settings → Authorized domains
- `localhost` ve `tauri://localhost` domain'lerinin ekli olduğundan emin olun

### Veriler senkronize olmuyor
- Browser console'u açın (F12) ve hata mesajlarını kontrol edin
- Firebase Console → Firestore Database → Rules → Kuralların doğru olduğundan emin olun
- İnternet bağlantınızı kontrol edin

### Google ile giriş yapamıyorum
- Firebase Console → Authentication → Sign-in method → Google'ın enabled olduğundan emin olun
- Proje destek e-postasının ayarlandığından emin olun

## Güvenlik Notları

⚠️ **ÖNEMLİ**:
- `firebase.js` dosyanızı başkalarıyla paylaşmayın
- GitHub'a yüklerken `.gitignore` dosyasına `src/firebase.js` ekleyin
- Production kullanımında Firestore güvenlik kurallarını mutlaka ayarlayın

## Ek Bilgiler

- **Ücretsiz Plan Limitleri**:
  - 50,000 okuma/gün
  - 20,000 yazma/gün
  - 1 GB depolama
  - Bu limitler kişisel kullanım için fazlasıyla yeterlidir

- **Real-time Sync**: Verileriniz gerçek zamanlı olarak senkronize olur. Bir cihazda yaptığınız değişiklik saniyeler içinde diğer cihazlarda görünür.

- **Offline Support**: İnternet bağlantısı kesilse bile uygulama çalışmaya devam eder. Bağlantı yeniden kurulduğunda otomatik senkronizasyon başlar.
