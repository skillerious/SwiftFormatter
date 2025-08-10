<p align="center">
  <img src="https://i.imgur.com/5TUVJ3n.png" alt="Swift Formatter PRO logo" width="128" height="128">
</p>

<h1 align="center">Swift Formatter <em>PRO</em> v1.4.1</h1>

<p align="center">
  Sleek, Windows-only USB drive formatter built with <strong>Electron 31</strong>, <strong>Bootswatch Darkly</strong>, and native <strong>PowerShell</strong>.
</p>

<p align="center">
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-31.x-2ea44f?logo=electron&logoColor=white" alt="Electron 31"></a>
  <a href="#"><img src="https://img.shields.io/badge/Windows-Only-0078D6?logo=windows&logoColor=white" alt="Windows only"></a>
  <a href="https://bootswatch.com/darkly/"><img src="https://img.shields.io/badge/Bootswatch-Darkly-7952B3?logo=bootstrap&logoColor=white" alt="Bootswatch Darkly"></a>
  <a href="#"><img src="https://img.shields.io/badge/Version-v1.3.7-blue?logo=semver&logoColor=white" alt="Version v1.4.1"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
</p>

---

## ✨ What's New in v1.4.1
- **Reworked Role Badge**  
  - Now positioned to the left of the Update button.  
  - Dynamically switches between *Standard* (clickable to elevate) and *Admin* (informational).  
  - Added subtle glow hover effect for Standard mode without shifting position.  
  - Badge height now matches `.btn-sm` buttons perfectly.

- **Drive Health Improvements**  
  - Health pill now shows a **small loading spinner** until data is fetched.  
  - Fixed `Unknown` state staying on screen.  
  - Improved WMI health fetch reliability.

- **Drive Details Enhancements**  
  - Fixed missing `Used`, `Free`, and `Filesystem` values.  
  - Usage bar grid now accurately displays Used vs Free colors.

- **Format Options Panel Overlay**  
  - Added centered spinner overlay while fetching drive data.  
  - FAT32 size warning now shown inline under filesystem selection.

---

## 🚀 Key Features

### 🖥️ Modern UI
- **Dark-mode design** powered by Bootswatch Darkly.
- Glow-hover animations on drive tiles (with border clipping fixed for rounded corners).
- Compact drive list with device chips, volume labels, and detailed info cards.
- Custom glass-style right-click menu with smooth hover effects.
- Styled in-app release notes with headings, icons, and clean spacing.

### 📊 Drive Details Card
- Used space and free space (with colored usage bar)  
- File system type  
- Total capacity  
- Device path & letter  

### 🛡️ Safety Guards
- Prevents formatting of non-USB drives, system disks, read-only drives.  
- FAT32 > 32 GiB guard with inline warning.  
- Confirmation step requiring typed drive letter.

### ⚡ Performance
- Uses native PowerShell `Format-Volume` for reliability.  
- Real-time device updates via WMI + polling.  
- No auto-selection on startup for safety.

### 🔄 Updates
- In-app GitHub release checker and installer.  
- Optional GitHub PAT token support for higher API limits.

---

## 📷 UI Preview

<p align="center">
  <img src="https://i.imgur.com/Acmx3CL.png" alt="Drive list panel" width="85%"><br>
  <em>Polished drive list with glow-hover effects, volume labels, and usage bars.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/KHrQb9o.png" alt="About dialog" width="85%"><br>
  <em>About dialog with build metadata and license info.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/UVtq9qf.png" alt="Updater dialog" width="85%"><br>
  <em>In-app updater with styled release notes and download progress.</em>
</p>

---

## 🧰 Requirements
| Tool | Notes |
|------|-------|
| **Windows** | 10 (21H2) or 11 |
| **Node.js** | ≥ 18 (tested on Node 22) |
| **PowerShell** | Built-in (5.x or 7.x) |
| **Git** | Optional, for cloning the repo |

---

## 🛠️ Quick Start
```bash
git clone https://github.com/skillerious/SwiftFormatter.git
cd SwiftFormatter

npm install
npm start
```

---

## 📄 License
MIT © 2025 Robin Doak
