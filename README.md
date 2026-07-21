# 🚀 BankoSpace

**A powerful personal productivity desktop app — todos, planner, notes, flashcards, fitness, finance tracking and more, with cloud sync.**

![Version](https://img.shields.io/badge/version-4.1.3-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## ✨ Features

- 📝 **Smart Todo Lists** — daily/weekly columns, subtasks, drag & drop reordering
- 🗓️ **Calendar & Planner** — time blocks with system notification reminders
- ✅ **Checklists** — daily and long-term checklists with auto-reset
- 🎴 **Flashcards** — grouped decks for learning and memorization
- 🗒️ **Notes** — rich text editor with images, tabs and focus restore
- 📌 **Ref Board** — visual reference board for images and links
- 🇯🇵 **Japanese Kana** — kana practice with vocab, stats and an always-on-top popup window
- 💪 **Fitness Tracker** — meals, workouts, weight log and measurements
- 💰 **Income Tracker** — invoices, payments and subscription tracking
- 📊 **Market Research & Stocks** — watchlists, news feed, TradingView charts
- ⏱️ **Pomodoro Timer** — built-in work/break cycles
- ☁️ **Cloud Sync** — sync data across devices with Supabase
- 🌙 **Dark/Light Theme** — with UI sounds and custom animations
- 💾 **Offline Mode** — works without an account; data stays local

## 📥 Download

Grab the latest installer from the [Releases page](https://github.com/berkbankoglu/BankoSpace/releases/latest):

- **Windows:** `BankoSpace_x.x.x_x64-setup.exe` (NSIS installer)
- **macOS (Apple Silicon):** `BankoSpace_x.x.x_aarch64.dmg`

> If Windows Defender shows a warning, click **More info → Run anyway** (the app is not code-signed).

## 🎯 Getting Started

1. **Sign in** to sync your data across devices, or continue without an account for offline-only use.
2. Add your first todo on the **Dashboard** — organize with daily/weekly columns and subtasks.
3. Explore the sidebar: every module can be hidden, reordered or resized to fit your workflow.

## ⚙️ Settings

Click the ⚙️ icon to:
- Toggle Dark/Light theme and UI sound volume
- Show/hide and reorder sidebar modules
- Export/import your data as backup
- Reset all data

## 🛠️ Tech Stack

- **Frontend:** React 19 + Vite
- **Desktop:** Tauri 2 (Rust)
- **Backend:** Supabase (Auth + Postgres, key-value sync)
- **Charts:** lightweight-charts + TradingView

## 🧑‍💻 Development

```bash
npm install --legacy-peer-deps   # React 19 peer-deps
npm run tauri-dev                # run desktop app in dev mode
npm run tauri-build              # production build
```

Releases are built automatically by GitHub Actions when a `v*` tag is pushed (Windows + macOS).

## 📝 License

MIT License — feel free to use for personal or commercial projects.

## 👨‍💻 Developer

Created by **Berk Bankoglu**

---

**Enjoy using BankoSpace! 🎉**
