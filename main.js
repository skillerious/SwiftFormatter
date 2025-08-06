// main.js (Windows-only)
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const { spawn, exec } = require("child_process");
const { promisify } = require("util");
const execAsync = promisify(exec);

let mainWindow;

/* ------------ Paths / helpers ------------- */
function appDataDir() {
  const dir = path.join(app.getPath("appData"), "SwiftFormatter");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return dir;
}
function secretsPath() { return path.join(appDataDir(), "secrets.json"); }

function resolveWindowIcon() {
  try {
    const inApp = path.join(__dirname, "build", "logo.ico");
    const inResources = path.join(process.resourcesPath || "", "build", "logo.ico");
    if (fs.existsSync(inResources)) return inResources;
    if (fs.existsSync(inApp)) return inApp;
  } catch {}
  return undefined;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 980,
    minHeight: 600,
    frame: false,
    backgroundColor: "#0b0f14",
    titleBarStyle: "hidden",
    icon: resolveWindowIcon(),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      sandbox: false
    }
  });

  mainWindow.loadFile("index.html");

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow) return;
    mainWindow.maximize();
    mainWindow.show();
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

/* =========================
   Window controls
   ========================= */
ipcMain.on("window:minimize", () => mainWindow?.minimize());
ipcMain.on("window:maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on("window:close", () => mainWindow?.close());
ipcMain.handle("shell:openExternal", (_, url) => shell.openExternal(url));

/* =========================
   Version from version.json
   ========================= */
function readVersionMeta() {
  const tryPaths = [
    path.join(__dirname, "version.json"),
    path.join(process.resourcesPath || "", "version.json")
  ];
  for (const p of tryPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const j = JSON.parse(raw);
        return {
          name: j.name || "Swift Formatter PRO",
          version: j.version || "0.0.0",
          channel: j.channel || "stable",
          build: Number(j.build) || 0,
          releasedAt: j.releasedAt || null,
          repo: j.repo || "skillerious/SwiftFormatter",
          tagPrefix: j.tagPrefix || "v"
        };
      }
    } catch {}
  }
  return {
    name: "Swift Formatter PRO",
    version: "0.0.0",
    channel: "stable",
    build: 0,
    releasedAt: null,
    repo: "skillerious/SwiftFormatter",
    tagPrefix: "v"
  };
}
ipcMain.handle("app:version/get", async () => readVersionMeta());

/* =========================
   Elevation helpers
   ========================= */
ipcMain.handle("app:isAdmin", async () => {
  try {
    const { stdout } = await execAsync(
      `powershell.exe -NoProfile -Command "[bool]([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"`
    );
    return stdout.toString().trim().toLowerCase() === "true";
  } catch { return false; }
});

// robust for packaged EXE (COM ShellExecute with 'runas')
ipcMain.handle("app:relaunchElevated", async () => {
  try {
    const exePath = process.execPath;
    const exeDir = path.dirname(exePath);
    const argsArr = [];
    const argsStr = argsArr.map(a => a.replace(/"/g, '""')).join(" ");

    const ps = `
$exe  = "${exePath.replace(/"/g,'""')}"
$args = "${argsStr}"
$wd   = "${exeDir.replace(/"/g,'""')}"
$shell = New-Object -ComObject Shell.Application
$shell.ShellExecute($exe, $args, $wd, 'runas', 1) | Out-Null
`.trim();

    const encoded = Buffer.from(ps, "utf16le").toString("base64");
    await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);

    setTimeout(() => { app.quit(); }, 150);
    return true;
  } catch { return false; }
});

/* =========================
   Secrets (GitHub token) — DPAPI via PowerShell
   ========================= */
async function dpapiEncrypt(plain) {
  const script = `
param([string]$s)
$bytes=[System.Text.Encoding]::UTF8.GetBytes($s)
$enc=[System.Security.Cryptography.ProtectedData]::Protect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[Convert]::ToBase64String($enc)
`.trim();
  const encoded = Buffer.from(`&{${script}} -s '${plain.replace(/'/g,"''")}'`, "utf16le").toString("base64");
  const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
  return stdout.toString().trim();
}
async function dpapiDecrypt(b64) {
  const script = `
param([string]$b)
$bytes=[Convert]::FromBase64String($b)
$dec=[System.Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
[System.Text.Encoding]::UTF8.GetString($dec)
`.trim();
  const encoded = Buffer.from(`&{${script}} -b '${b64.replace(/'/g,"''")}'`, "utf16le").toString("base64");
  const { stdout } = await execAsync(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
  return stdout.toString();
}
function readSecrets() {
  try {
    const p = secretsPath();
    if (!fs.existsSync(p)) return {};
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j || {};
  } catch { return {}; }
}
function writeSecrets(obj) {
  try { fs.writeFileSync(secretsPath(), JSON.stringify(obj, null, 2), "utf8"); } catch {}
}
ipcMain.handle("secret:saveToken", async (_e, tokenPlain) => {
  try {
    if (!tokenPlain || !tokenPlain.trim()) return { ok: true };
    const b64 = await dpapiEncrypt(tokenPlain.trim());
    const sec = readSecrets();
    sec.ghToken = b64;
    writeSecrets(sec);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle("secret:hasToken", async () => {
  try { const sec = readSecrets(); return { ok: true, has: !!sec.ghToken }; }
  catch (e) { return { ok: false, has: false, error: e.message }; }
});
async function getDecryptedTokenOrNull() {
  try {
    const sec = readSecrets();
    if (!sec.ghToken) return null;
    const plain = await dpapiDecrypt(sec.ghToken);
    return (plain || "").trim() || null;
  } catch { return null; }
}

/* =========================
   Update: check → download → install
   ========================= */
function parseSemver(v) {
  const s = String(v || "").trim().replace(/^v/i,"");
  const m = s.match(/^(\d+)\.(\d+)\.(\d+)(?:[.-].*)?$/);
  if (!m) return { major:0, minor:0, patch:0, raw:s };
  return { major:+m[1], minor:+m[2], patch:+m[3], raw:s };
}
function cmpSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}
function ghRequestJSON(pathname, token) {
  const options = {
    hostname: "api.github.com",
    path: pathname,
    method: "GET",
    headers: {
      "User-Agent": "SwiftFormatterUpdater",
      "Accept": "application/vnd.github+json"
    }
  };
  if (token) options.headers.Authorization = `Bearer ${token}`;
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (d) => data += d.toString());
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        } else {
          reject(new Error(`GitHub ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}
ipcMain.handle("update:check", async () => {
  try {
    const meta = readVersionMeta();
    const token = await getDecryptedTokenOrNull();

    // latest non-prerelease
    const latest = await ghRequestJSON(`/repos/${meta.repo}/releases/latest`, token);
    const latestTag = latest.tag_name || "v0.0.0";
    const latestSem = parseSemver(latestTag);
    const currentSem = parseSemver(meta.version);

    const upToDate = cmpSemver(currentSem, latestSem) >= 0;

    // pick first .exe asset
    let asset = null;
    if (Array.isArray(latest.assets)) {
      asset = latest.assets.find(a => /\.exe$/i.test(a.name));
    }
    const result = {
      ok: true,
      current: `v${currentSem.raw}`,
      latest: `v${latestSem.raw}`,
      upToDate,
      notes: latest.body || "",
      asset: asset ? {
        name: asset.name,
        size: asset.size || 0,
        url: asset.browser_download_url
      } : null,
      html_url: latest.html_url
    };
    return result;
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("update:download", async (_e, payload) => {
  const { url, name } = payload || {};
  if (!url) return { ok: false, error: "No asset URL." };

  const token = await getDecryptedTokenOrNull();
  const dest = path.join(app.getPath("temp"), name || `SwiftFormatterSetup.exe`);

  return await new Promise((resolve) => {
    const file = fs.createWriteStream(dest);
    const headers = {
      "User-Agent": "SwiftFormatterUpdater",
      "Accept": "application/octet-stream"
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    https.get(url, { headers }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        https.get(res.headers.location, { headers }, (res2) => handleDownloadStream(res2));
      } else {
        handleDownloadStream(res);
      }

      function handleDownloadStream(stream) {
        const total = Number(stream.headers["content-length"] || 0);
        let received = 0;
        stream.on("data", (chunk) => {
          received += chunk.length;
          mainWindow?.webContents.send("update:progress", {
            received, total, percent: total ? Math.round(received * 100 / total) : null
          });
        });
        stream.pipe(file);
        stream.on("end", () => file.close(() => resolve({ ok: true, file: dest })));
        stream.on("error", (err) => resolve({ ok: false, error: err.message }));
      }
    }).on("error", (err) => resolve({ ok: false, error: err.message }));
  });
});

ipcMain.handle("update:install", async (_e, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) throw new Error("Installer not found.");
    const child = spawn(filePath, [], { detached: true, stdio: "ignore" });
    child.unref();
    setTimeout(() => { app.quit(); }, 200);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* =========================
   Drive enumeration (Windows)
   ========================= */
ipcMain.handle("drives:list", async () => {
  try { return await listDrivesWin(); }
  catch (e) { logProgress(`Error listing drives: ${e.message}\n`); return []; }
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

/* =========================
   Format execution (Windows)
   ========================= */
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

function buildFormatCommandWindows({ driveLetter, fsType, label, quick }) {
  if (!driveLetter) throw new Error("Windows requires a mounted drive letter (e.g., E:).");
  const ps = "powershell.exe";
  const full = quick ? "$false" : "$true";
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command",
    `Format-Volume -DriveLetter ${driveLetter} -FileSystem ${fsType} -NewFileSystemLabel '${label || ""}' -Confirm:$false -Force -Full:${full}`
  ];
  return { cmd: ps, args };
}

/* =========================
   Helpers
   ========================= */
function tryJSON(s) { try { return JSON.parse(s); } catch { return null; } }
function logProgress(msg) { mainWindow?.webContents.send("format:progress", msg); }
