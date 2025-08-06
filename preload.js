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
  relaunchElevated: () => ipcRenderer.invoke("app:relaunchElevated")
});
