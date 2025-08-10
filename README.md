# Swift Formatter PRO v1.4.1

<p align="center">
  <img src="https://i.imgur.com/5TUVJ3n.png" alt="Swift Formatter PRO logo" width="128" height="128">
</p>

<h1 align="center">Swift Formatter <em>PRO</em> v1.4.1</h1>

<p align="center">
  Sleek, Windows-only USB drive formatter built with <strong>Electron 31</strong>, <strong>Bootswatch Darkly</strong>, and native <strong>PowerShell</strong> integration.
</p>

<p align="center">
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-31.x-2ea44f?logo=electron&logoColor=white" alt="Electron 31"></a>
  <a href="#"><img src="https://img.shields.io/badge/Windows-Only-0078D6?logo=windows&logoColor=white" alt="Windows only"></a>
  <a href="https://bootswatch.com/darkly/"><img src="https://img.shields.io/badge/Bootswatch-Darkly-7952B3?logo=bootstrap&logoColor=white" alt="Bootswatch Darkly"></a>
  <a href="#"><img src="https://img.shields.io/badge/Version-v1.4.1-blue?logo=semver&logoColor=white" alt="Version v1.4.1"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="MIT License"></a>
</p>

---

## ✨ What's New in v1.4.1
- **Improved Role Badge**
  - Moved to the left of the Update button for better visibility.
  - Switches dynamically between *Standard* (clickable to elevate) and *Admin*.
  - Smooth hover glow in Standard mode without layout shifting.
  - Height aligned with `.btn-sm` controls.

- **Drive Health**
  - Now shows a **loading spinner** until status is fetched.
  - Fixed persistent `Unknown` state bug.
  - More reliable WMI queries for health data.

- **Drive Details**
  - Fixed missing Used, Free, and Filesystem values.
  - Usage bar now precisely represents Used vs Free space.

- **Format Options**
  - Added centered overlay spinner during drive data fetch.
  - FAT32 warning now shown inline under filesystem selection.

---

## 🚀 Features

### 🖥️ Modern & Responsive UI
- Dark, professional theme using Bootswatch Darkly.
- Drive list with compact layout, clear labeling, and detailed info cards.
- Right-click menu with smooth hover transitions.
- Consistent button and control styling.

### 📊 Drive Insights
- Displays:
  - Used space
  - Free space
  - Filesystem type
  - Total capacity
  - Bus type
  - Health status
- Accurate usage bar with clear Used/Free color mapping.

### 🛡️ Safety First
- Blocks formatting of system drives, non-USB devices, or read-only media.
- FAT32 > 32 GiB warning with inline display.
- Confirmation step requiring correct drive letter entry.

### ⚡ Performance
- Uses native PowerShell `Format-Volume` for fast, reliable operations.
- Real-time device monitoring with WMI + polling.
- No automatic drive selection on launch for safety.

### 🔄 Seamless Updates
- In-app GitHub release checker and update installer.
- Optional PAT token support for higher API rate limits.
- Clear version/channel indicators in the update dialog.

---

## 📷 Screenshots

<p align="center">
  <img src="https://i.imgur.com/Acmx3CL.png" alt="Drive list panel" width="85%"><br>
  <em>Drive list with health pills, volume labels, and usage bars.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/KHrQb9o.png" alt="About dialog" width="85%"><br>
  <em>About dialog with version, license, and safety info.</em>
</p>

<p align="center">
  <img src="https://i.imgur.com/UVtq9qf.png" alt="Updater dialog" width="85%"><br>
  <em>In-app updater with release notes and progress tracking.</em>
</p>

---

## 🧰 Requirements
| Tool        | Notes                                    |
|-------------|------------------------------------------|
| **Windows** | 10 (21H2) or 11                          |
| **Node.js** | ≥ 18 (tested on Node 22)                  |
| **PowerShell** | Built-in (5.x or 7.x)                 |
| **Git**     | Optional, for cloning the repo           |

---

## 🛠️ Installation & Usage

```bash
git clone https://github.com/skillerious/SwiftFormatter.git
cd SwiftFormatter

npm install
npm start
```

---

## 📄 License
MIT © 2025 Robin Doak
