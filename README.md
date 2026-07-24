# Neon Flappy 🐦⚡

A Flappy Bird-style arcade game wrapped as a native app for every major platform.  
Built with HTML5 Canvas, packaged with Electron (desktop) and Capacitor (mobile).

---

## Play

Open `index.html` directly in any browser — no build step needed.  
Or install one of the pre-built packages below.

---

## Installers

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `Neon Flappy-1.0.0-arm64.dmg` | Double-click to mount & drag to Applications |
| macOS (Apple Silicon) | `Neon Flappy-1.0.0-arm64.pkg` | Run installer wizard |
| macOS (Intel x64) | `Neon Flappy-1.0.0.dmg` | Double-click to mount & drag to Applications |
| macOS (Intel x64) | `Neon Flappy-1.0.0.pkg` | Run installer wizard |
| Android | `NeonFlappy.apk` | Enable "Unknown sources", sideload via ADB or file manager |
| Windows | — | Build on Windows — see **Building** below |
| Linux | — | Build on Linux — see **Building** below |
| iOS | — | Open `ios/App/App.xcworkspace` in Xcode → Archive → Distribute |

> Pre-built binaries live in the [Releases](../../releases) page.

---

## Building

### Prerequisites

- Node.js 18+, npm 9+
- For macOS installers: macOS host
- For Android APK: Android SDK (set `ANDROID_HOME`), Java 17+
- For iOS IPA: macOS + full Xcode (not just CLT)
- For Windows: Windows host or Wine on Linux CI
- For Linux AppImage: Linux host or Docker

### Install dependencies

```bash
npm install
```

### macOS (DMG + PKG)

> ⚠️ Must run on an **APFS** filesystem (not ExFAT) — electron-builder's lockfile relies on nanosecond mtime precision.

```bash
npm run build:mac
# → dist/Neon Flappy-1.0.0-arm64.dmg
# → dist/Neon Flappy-1.0.0-arm64.pkg
# → dist/Neon Flappy-1.0.0.dmg
# → dist/Neon Flappy-1.0.0.pkg
```

### Android APK

```bash
npm run android:sync
npm run android:build:debug
# → android/app/build/outputs/apk/debug/app-debug.apk
```

Or install to a connected device:

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### Windows (EXE + MSI)

```bash
npm run build:win
# → dist/Neon Flappy Setup 1.0.0.exe
# → dist/Neon Flappy-1.0.0.msi
```

### Linux (AppImage)

```bash
npm run build:linux
# → dist/Neon Flappy-1.0.0.AppImage
```

---

## Development

```bash
# Run in Electron (hot-reload not wired — just re-launch)
npm start
```

---

## Tech stack

- **Game engine**: Pure HTML5 Canvas API (`js/game.js`)
- **Desktop wrapper**: [Electron](https://electronjs.org/) 43 + [electron-builder](https://www.electron.build/) 26
- **Mobile wrapper**: [Capacitor](https://capacitorjs.com/) 8
- **Graphics**: Neon / dark synthwave aesthetic; particle effects; screen-shake on death
- **Persistence**: `localStorage` high score

---

## License

MIT © 2026 Solo Apps Studio
