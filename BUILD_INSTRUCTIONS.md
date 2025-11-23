# BankoSpace v1.1.0 Build Talimatları

## Mac'te Build Yapma:

### 1. Gerekli Araçları Yükleyin:
```bash
# Homebrew yükleyin (yoksa)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Rust yükleyin
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node.js yükleyin
brew install node
```

### 2. Repo'yu Klonlayın:
```bash
git clone https://github.com/berkbankoglu/BankoSpace.git
cd BankoSpace
git checkout claude/project-changes-014vDDRS9sXtAe4GP8Yiz4wL
git pull
```

### 3. Dependencies Yükleyin:
```bash
npm install
```

### 4. Build Yapın:
```bash
npm run tauri build
```

### 5. Build Dosyaları:
Build tamamlandıktan sonra dosyalar burada olacak:
```
src-tauri/target/release/bundle/dmg/BankoSpace_1.1.0_aarch64.dmg (Apple Silicon)
src-tauri/target/release/bundle/dmg/BankoSpace_1.1.0_x64.dmg (Intel)
```

### 6. GitHub'a Yükleyin:
1. https://github.com/berkbankoglu/BankoSpace/releases/new adresine gidin
2. Tag: `v1.1.0` yazın
3. Title: `BankoSpace v1.1.0`
4. Build dosyalarını sürükleyip bırakın
5. **Publish release** tıklayın

### 7. Eski Sürümleri Silin:
- v1.0.0'ı silin
- v7.0.1'i silin
- Sadece v1.1.0 kalsın

---

## Windows için Cross-Build (Opsiyonel):

Mac'te Windows build de yapabilirsiniz ama karmaşık. En iyisi:
- GitHub Actions workflow ekleyin (otomatik build)
- VEYA Windows bilgisayarda manuel build yapın

