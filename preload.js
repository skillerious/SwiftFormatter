// preload.js
// Exposes a safe API surface to the renderer (contextIsolation: true)

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
  checkForUpdate:   () => ipcRenderer.invoke("update:check"),
  downloadUpdate:   (payload) => ipcRenderer.invoke("update:download", payload),
  installUpdate:    (filePath) => ipcRenderer.invoke("update:install", filePath),
  onUpdateProgress: (cb) => ipcRenderer.on("update:progress", (_e, p) => cb?.(p)),

  // drives — helpers
  ejectDrive: (letter) => ipcRenderer.invoke("drive:eject", letter), // "E" or "E:"
  openDrive:  (letter) => ipcRenderer.invoke("drive:open", letter),  // opens root in Explorer

  // auto-refresh (WMI -> main -> renderer)
  onDrivesChanged: (cb) => ipcRenderer.on("drives:changed", (_e, evt) => cb?.(evt)),
});
