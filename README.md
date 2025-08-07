
<p align="center">
  <img src="https://i.imgur.com/H5T3CsP.png" alt="Swift Formatter PRO logo" width="128" height="128">
</p>

<h1 align="center">Swift Formatter <em>PRO</em> v1.3.2</h1>

<p align="center">
  Sleek, Windows‑only USB‑drive formatter powered by <strong>Electron 31</strong>, <strong>Bootswatch Darkly</strong> and native <strong>PowerShell</strong>.
</p>

<p align="center">
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-31.x-2ea44f?logo=electron&logoColor=white" alt="Electron 31"></a>
  <a href="#"><img src="https://img.shields.io/badge/Windows-Only-0078D6?logo=windows&logoColor=white" alt="Windows only"></a>
  <a href="https://bootswatch.com/darkly/"><img src="https://img.shields.io/badge/Bootswatch-Darkly-7952B3?logo=bootstrap&logoColor=white" alt="Bootswatch Darkly"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
</p>

---

## ✨ Overview
**Swift Formatter PRO** is a modern USB‑drive formatter for Windows 10 / 11.  
Custom title‑bar, dark‑mode UI, **Admin / Standard** badge, live PowerShell output and an in‑app updater — all wrapped in a single, portable EXE.

<div align="center" style="background:#fff4ce;border:1px solid #ffe1a5;padding:14px 18px;border-radius:6px;margin:20px 0;line-height:1.4;">
  <strong>🔔 NOTICE — GitHub token is temporary!</strong><br>
  Adding a Personal‑Access‑Token (PAT) lifts GitHub’s anonymous 60 req/hr limit.<br>
  A new delta‑update system that <em>does not</em> require a PAT is coming soon.
</div>

---

> **⚠️ Formatting is destructive** — all data on the selected drive will be erased.  
> Always double‑check the target drive and type its letter to confirm (<code>E:</code> etc.).

---

## 🖼️ UI Preview

<p align="center">
  <img src="https://i.imgur.com/HJkdjO2.png" alt="Drive list panel" width="85%"><br>
  <em>Polished drive list with glow‑hover effects and compact device chips.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/nkpEHt5.png" alt="About dialog" width="85%"><br>
  <em>About dialog with build metadata and license.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/vLwDZON.png" alt="Updater dialog" width="85%"><br>
  <em>In‑app updater showing release notes and download progress.</em>
</p>

---

## 🚀 Feature Highlights
* **Native formatting** — wraps Windows <code>Format‑Volume</code> for speed & reliability  
* **One‑click elevation** — relaunches with UAC; badge flips to <strong>Admin</strong>  
* **Modern dark UI** — Bootswatch Darkly + subtle glow‑hover animation  
* **Safety guard** — requires typing the drive letter before executing  
* **Command preview** — shows the exact PowerShell command beforehand  
* **In‑app updater** — checks GitHub Releases, downloads, installs, restarts  
* **Encrypted PAT storage** — Windows DPAPI (CurrentUser)  
* **100 % Windows code‑path** — no dead Linux/macOS branches

---

## 📂 Project Structure
```
.
├─ build/              # logo.ico (multi‑size icon)
├─ index.html          # UI shell
├─ main.js             # Electron main (PowerShell, elevation, updater)
├─ preload.js          # secure bridge (contextIsolation)
├─ renderer.js         # renderer‑process logic
├─ styles.css          # extra tweaks
├─ package.json        # scripts & builder config
├─ package-lock.json
├─ version.json        # app metadata
└─ dist/               # created by `npm run dist`
```

---

## 🧰 Requirements
| Tool | Notes |
|------|-------|
| **Windows** | 10 (21H2) or 11 |
| **Node.js** | ≥ 18 (tested on Node 22) |
| **PowerShell** | Built‑in (5.x / 7.x) |
| **Git** | optional (for cloning) |

---

## 🛠️ Quick Start
```bash
git clone https://github.com/skillerious/SwiftFormatter.git
cd SwiftFormatter

npm install      # install dependencies
npm start        # dev run (auto‑reload)
```
Dev‑mode starts maximised and displays **Standard** or **Admin** in the title‑bar.

---

## ⚙️ Configuration

### `version.json`
```json
{
  "name": "Swift Formatter PRO",
  "version": "1.3.0",
  "channel": "stable",
  "build": 6,
  "releasedAt": "2025-08-07T00:00:00Z",
  "repo": "skillerious/SwiftFormatter",
  "tagPrefix": "v"
}
```

### In‑app Settings
| Setting | Purpose | Default |
|---------|---------|:------:|
| **Filesystem** | exFAT / FAT32 / NTFS | exFAT |
| **Quick format** | Skip surface scan | ✅ |
| **Require confirmation** | Must type drive letter | ✅ |
| **Autofill confirm** | Pre‑fill drive letter | ⬜ |
| **Glow hover** | Pretty glow on tiles | ✅ |

Settings persist via `localStorage`; clearing site‑data resets them.

---

## 🔄 Update Flow
1. Click **Update** → **Check now**  
2. If a new release exists → **Get update** (downloads `.exe`)  
3. **Install & Restart** launches installer, Swift Formatter closes  

---

## 🧪 How Formatting Works
The app builds & previews:
```powershell
Format-Volume -DriveLetter E `
              -FileSystem exFAT `
              -NewFileSystemLabel 'USB' `
              -Confirm:$false -Force -Full:$false
```
Live PowerShell output streams to the in‑app terminal.

---

## 🧯 Troubleshooting
| Problem | Remedy |
|---------|--------|
| **Needs Admin** | Accept UAC or run app as Administrator |
| **`npm run dist` fails** | Close all SwiftFormatter / Electron processes |
| **GitHub rate‑limit** | Add PAT in **Settings → GitHub token** or wait an hour |

---

## 🤝 Contributing
Bug reports & PRs welcome — open an issue for ideas or improvements.

---

## 📄 License
MIT © 2025 Robin Doak
