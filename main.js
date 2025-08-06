// main.js (Windows-only)
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 980,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0b0f14",
    titleBarStyle: "hidden",
    show: false, // show after maximize
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    if (mainWindow) {
      mainWindow.maximize();
      mainWindow.show();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---------- Window controls ----------
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());

// ---------- External link ----------
ipcMain.handle("shell:openExternal", (_, url) => shell.openExternal(url));

// ---------- Version (read version.json in project root) ----------
ipcMain.handle("app:version/get", async () => {
  try {
    const p = path.join(__dirname, "version.json");
    const raw = fs.readFileSync(p, "utf8");
    const j = JSON.parse(raw);
    // minimal validation / defaults
    return {
      name: j.name || "Swift Formatter PRO",
      version: j.version || "0.0.0",
      channel: j.channel || "stable",
      build: Number(j.build) || 0,
      releasedAt: j.releasedAt || null,
      repo: j.repo || null,
      tagPrefix: j.tagPrefix || "v"
    };
  } catch (e) {
    return {
      name: "Swift Formatter PRO",
      version: "0.0.0",
      channel: "stable",
      build: 0,
      releasedAt: null,
      repo: null,
      tagPrefix: "v",
      error: e.message
    };
  }
});

/* =============================================================================
   DRIVE ENUMERATION — WINDOWS (PowerShell)
   ========================================================================== */

ipcMain.handle("drives:list", async () => {
  try {
    return await listDrivesWin();
  } catch (e) {
    logProgress(`Error listing drives: ${e.message}\n`);
    return [];
  }
});

async function listDrivesWin() {
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue';

function Build-ItemFromDisk([Microsoft.Management.Infrastructure.CimInstance]$disk, [string[]]$letters) {
  [pscustomobject]@{
    device       = "\\\\.\\PHYSICALDRIVE$($disk.Number)"
    description  = $disk.FriendlyName
    size         = [int64]$disk.Size
    isUSB        = ($disk.BusType -eq 'USB')
    isReadOnly   = [bool]$disk.IsReadOnly
    isSystem     = [bool]$disk.IsSystem
    isRemovable  = $true
    busType      = $disk.BusType.ToString()
    mountpoints  = $letters
  }
}

$byDisk = @{}
$remVols = Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -or $_.DriveType -eq 'Removable Disk' }
foreach ($v in $remVols) {
  if (-not $v.DriveLetter) { continue }
  $p = Get-Partition -DriveLetter $v.DriveLetter
  if (-not $p) { continue }
  $d = Get-Disk -Number $p.DiskNumber
  if (-not $d) { continue }
  $key = $d.Number
  if (-not $byDisk.ContainsKey($key)) {
    $byDisk[$key] = [ordered]@{
      disk = $d
      letters = New-Object System.Collections.Generic.List[string]
    }
  }
  $byDisk[$key].letters.Add("$($v.DriveLetter):")
}

$items = New-Object System.Collections.Generic.List[object]
foreach ($kv in $byDisk.GetEnumerator()) {
  $items.Add( (Build-ItemFromDisk -disk $kv.Value.disk -letters $kv.Value.letters.ToArray()) )
}

if ($items.Count -eq 0) {
  foreach ($d in (Get-Disk | Where-Object { $_.BusType -eq 'USB' })) {
    $letters = @()
    $parts = Get-Partition -DiskNumber $d.Number
    foreach ($p in $parts) {
      $vol = Get-Volume -Partition $p
      if ($vol -and $vol.DriveLetter) { $letters += ($vol.DriveLetter + ':') }
    }
    $items.Add( (Build-ItemFromDisk -disk $d -letters $letters) )
  }
}

$items | ConvertTo-Json -Depth 6
  `.trim();

  const encoded = Buffer.from(psScript, "utf16le").toString("base64");
  const { stdout } = await execAsync(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`
  );
  const data = tryJSON(stdout);
  return Array.isArray(data) ? data : (data ? [data] : []);
}

/* =============================================================================
   BUILD FORMAT COMMAND — WINDOWS (Format-Volume)
   ========================================================================== */
function buildFormatCommandWindows({ driveLetter, fsType, label, quick }) {
  if (!driveLetter) throw new Error("Windows requires a mounted drive letter (e.g., E:).");
  const ps = "powershell.exe";
  const full = quick ? "$false" : "$true"; // Full format if quick=false
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    `Format-Volume -DriveLetter ${driveLetter} -FileSystem ${fsType} -NewFileSystemLabel '${label || ""}' -Confirm:$false -Force -Full:${full}`
  ];
  return { cmd: ps, args };
}

/* =============================================================================
   EXECUTION (Windows only)
   ========================================================================== */
ipcMain.handle("format:execute", async (_event, payload) => {
  const { fsType, label, quick, simulate, mountpoints } = payload;

  const driveLetter = (mountpoints && mountpoints[0] && /^[A-Z]:$/i.test(mountpoints[0]))
    ? mountpoints[0].replace(":", "").toUpperCase()
    : null;

  const plan = buildFormatCommandWindows({ driveLetter, fsType, label, quick });
  if (simulate) return { simulated: true, plan };

  const { stdout } = await execAsync(
    `powershell.exe -NoProfile -Command "[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"`
  );
  if (stdout.toString().trim().toLowerCase() !== "true") {
    throw new Error("Administrator privileges are required to format drives on Windows. Restart the app from an elevated terminal.");
  }

  logProgress(`Running: ${plan.cmd} ${plan.args.map(a => (/\s/.test(a) ? '"' + a + '"' : a)).join(" ")}\n`);

  return await new Promise((resolve, reject) => {
    try {
      const child = spawn(plan.cmd, plan.args, { shell: false });
      child.stdout.on("data", (d) => logProgress(d.toString()));
      child.stderr.on("data", (d) => logProgress(d.toString()));
      child.on("close", (code) => code === 0 ? resolve({ ok: true, code }) : reject(new Error(`Formatter exited with code ${code}`)));
      child.on("error", (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
});

function tryJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function logProgress(msg) { mainWindow?.webContents.send("format:progress", msg); }
