<p align="center">
  <img src="https://i.imgur.com/H5T3CsP.png" alt="Swift Formatter PRO logo" width="128" height="128">
</p>

<h1 align="center">Swift Formatter <em>PRO</em></h1>

<p align="center">
  Sleek, Windows‑only USB formatting utility built with <strong>Electron</strong>, <strong>Bootswatch Darkly</strong>, and <strong>PowerShell</strong>.
</p>

<p align="center">
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-31.x-2ea44f?logo=electron&logoColor=white" alt="Electron"></a>
  <a href="#"><img src="https://img.shields.io/badge/Windows-Only-0078D6?logo=windows&logoColor=white" alt="Windows only"></a>
  <a href="https://bootswatch.com/darkly/"><img src="https://img.shields.io/badge/Bootswatch-Darkly-7952B3?logo=bootstrap&logoColor=white" alt="Bootswatch Darkly"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT"></a>
</p>

---

## ✨ Overview

**Swift Formatter PRO** is a fast, elegant USB drive formatter for Windows. It features a custom titlebar, a modern dark UI, **Admin/Standard badge**, rich status output, and a streamlined, safe workflow to format removable drives using native Windows tooling.

> ⚠️ **Formatting is destructive** — all data on the selected drive will be **erased**. Double‑check the target before confirming.

---

## 🖼️ UI Preview

<p align="center">
  <img src="https://i.imgur.com/4pTwVux.png" alt="Drive list panel" width="95%"><br>
  <em>Polished drive list with glow hover and compact device chips.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/haFdkv4.png" alt="Format options and progress" width="95%"><br>
  <em>Format options, command preview, and live output.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/Xq2iP5r.png" alt="Update dialog" width="95%"><br>
  <em>In‑app update dialog with release notes and download/install flow.</em>
</p>

---

## 🚀 Features

- **Windows‑native formatting** via `Format-Volume` (PowerShell).
- **Automatic elevation** prompt (UAC) using COM ShellExecute, with an Admin/Standard badge in the titlebar.
- **Beautiful dark theme** (Bootswatch Darkly) + custom titlebar.
- **No scrolling** layout: all key controls visible at a glance.
- **Drive safety**: requires typing the correct drive letter (e.g., `E:`) to confirm.
- **Command preview** shows the exact PowerShell command before execution.
- **Update dialog**: checks GitHub Releases, downloads the latest installer, and launches it.
- **Optional GitHub token** stored **encrypted** (Windows DPAPI; CurrentUser).
- **Windows‑only** code path — no Linux/macOS branches.

---

## 📦 Project Structure

```
SwiftFormatter/
├─ index.html
├─ main.js
├─ preload.js
├─ renderer.js
├─ package.json
├─ version.json
├─ build/
│  └─ logo.ico        (multi‑size icon used for EXE/installer/window)
└─ dist/              (created after `npm run dist`)
```

---

## 🧰 Requirements

- **Windows 10/11**
- **Node.js 18+** (tested with Node 22)
- **PowerShell** (built‑in)
- **Git** (optional, for cloning)

---

## 🛠️ Getting Started (Dev)

```bash
git clone https://github.com/skillerious/SwiftFormatter.git
cd SwiftFormatter

# install deps
npm install

# run in dev
npm start
```

> The app starts **maximized**, and the titlebar shows an **Admin** or **Standard** badge. Formatting requires elevation; the app can relaunch itself with UAC.

---

## ⚙️ Configuration

### `version.json`
The app reads its version and metadata from a JSON file included in the build:

```json
{
  "name": "Swift Formatter PRO",
  "version": "1.0.0",
  "channel": "stable",
  "build": 1,
  "releasedAt": "2025-08-06T00:00:00Z",
  "repo": "skillerious/SwiftFormatter",
  "tagPrefix": "v"
}
```

### App Settings
Open **Settings** from the titlebar to tweak:

- Default filesystem: `exFAT`, `FAT32`, or `NTFS`
- Quick format (on/off)
- Require & autofill typing confirmation
- Drive hover glow
- **GitHub token** (optional; see below)

Settings persist locally via `localStorage` and the GitHub token is stored encrypted.

---

## 🔐 Security & Privacy

- **Elevation**: When needed, the app relaunches itself elevated via `ShellExecute(..., 'runas')`. Non‑elevated instances never attempt to format.
- **Update token**: If you provide a GitHub token (useful for higher API rate limits or private releases), it is encrypted with Windows **DPAPI (CurrentUser)** and saved at:

```
%APPDATA%\SwiftFormatter\secrets.json
```

The token is only used for GitHub API calls and asset downloads. Public releases **do not require** a token.

---

## 🔄 Updates

1. Click the **Update** button in the titlebar.
2. **Check now** queries `https://api.github.com/repos/<owner>/<repo>/releases/latest`.
3. If a newer version exists, click **Get update** to download the `.exe` asset.
4. When finished, click **Install & Restart** — the installer launches and Swift Formatter closes.

> The updater doesn’t auto‑publish; you can upload releases manually to GitHub. Tags like `v1.2.3` are recommended.

---

## 🧪 How Formatting Works (Windows)

- The UI constructs and previews a command like:

```powershell
Format-Volume -DriveLetter E -FileSystem exFAT -NewFileSystemLabel 'USB' -Confirm:$false -Force -Full:$false
```

- **Quick format** sets `-Full:$false` (full format if unchecked).
- **Confirmation** requires typing the selected drive letter (e.g., `E:`).
- Live output and progress are streamed to the app terminal.

---

## 🧯 Troubleshooting

**“Administrator privileges are required…”**  
Run the app elevated (the app can relaunch itself; accept the UAC prompt).

**Build error: icon missing**  
Add `build/logo.ico` (multi‑size ICO).

**Build error: repository/channel**  
Ensure `package.json` includes a `repository` block and no publish providers if you distribute manually.

**Rate limit when checking updates**  
Public releases don’t need a token, but adding your GitHub token increases reliability (5,000 req/hour).

---

## 🤝 Contributing

PRs and issues are welcome! Please open an issue for feature requests or bug reports.

---

## 📄 License

MIT © Robin Doak
