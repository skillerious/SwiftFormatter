// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close:    () => ipcRenderer.send("window:close"),

  // external
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),

  // drives & format
  listDrives:   () => ipcRenderer.invoke("drives:list"),
  formatDrive:  (payload) => ipcRenderer.invoke("format:execute", payload),
  onFormatProgress: (cb) => ipcRenderer.on("format:progress", (_e, msg) => cb?.(msg)),

  // version
  getVersion: () => ipcRenderer.invoke("app:version/get"),

  // elevation
  isAdmin: () => ipcRenderer.invoke("app:isAdmin"),
  relaunchElevated: () => ipcRenderer.invoke("app:relaunchElevated"),

  // secrets (GitHub token)
  saveGitHubToken: (token) => ipcRenderer.invoke("secret:saveToken", token),
  hasGitHubToken: () => ipcRenderer.invoke("secret:hasToken"),

  // updates
  checkForUpdate: () => ipcRenderer.invoke("update:check"),
  downloadUpdate: (payload) => ipcRenderer.invoke("update:download", payload),
  installUpdate: (filePath) => ipcRenderer.invoke("update:install", filePath),
  onUpdateProgress: (cb) => ipcRenderer.on("update:progress", (_e, p) => cb?.(p)),

  // drives — open/eject
  ejectDrive: (letter) => ipcRenderer.invoke("drive:eject", letter),
  openDrive:  (letter) => ipcRenderer.invoke("drive:open", letter),

  // device monitor
  startDriveWatch: () => ipcRenderer.invoke("drives:watch/start"),
  stopDriveWatch:  () => ipcRenderer.invoke("drives:watch/stop"),
  onDrivesChanged: (cb) => ipcRenderer.on("drives:changed", (_e, payload) => cb?.(payload)),
});
