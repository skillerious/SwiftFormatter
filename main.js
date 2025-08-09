// ─────────────────────────────────────────────────────────────────────────────
//  main.js — Swift Formatter PRO  (Windows-only · Electron main process)
//  © 2025 Robin Doak   ·   MIT-licensed
// ─────────────────────────────────────────────────────────────────────────────
//
//  ▸ Robust admin detection & self-elevation   (dev + packaged)
//  ▸ Rolling debug log   (dev: project root  •  packaged: %APPDATA%)
//  ▸ DPAPI helpers for encrypted GitHub token
//  ▸ Updater, drive enumeration (with per-volume fs/size/free), formatter
//  ▸ SAFETY: Escapes label for PowerShell + refuses non-USB/system disks
//  ▸ Device monitor: WMI watcher + polling fallback, emits 'drives:changed'
// ─────────────────────────────────────────────────────────────────────────────

"use strict";

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path   = require("path");
const fs     = require("fs");
const https  = require("https");
const { spawn, exec } = require("child_process");
const { promisify }   = require("util");
const execAsync       = promisify(exec);

// ────────────────────────────── simple rolling debug log
const LOG_PATH = app.isPackaged
  ? path.join(app.getPath("userData"), "swift-formatter.log")
  : path.join(__dirname,               "swift-formatter.log");

function dbg(msg) {
  const ln = `${new Date().toISOString()} ${msg}\n`;
  try { fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true }); } catch {}
  try { fs.appendFileSync(LOG_PATH, ln, "utf8"); } catch {}
  console.log("[DBG]", msg);
}
function sendDbgToRenderer(msg) {
  dbg(msg);
  mainWindow?.webContents.send("format:progress", `[dbg] ${msg}\n`);
}

// ────────────────────────────── misc helpers
let mainWindow;
function iconPath() {
  const dev  = path.join(__dirname,            "build", "logo.ico");
  const prod = path.join(process.resourcesPath || "", "build", "logo.ico");
  return fs.existsSync(prod) ? prod : (fs.existsSync(dev) ? dev : undefined);
}

// PowerShell safe single-quoted string
function psq(str) {
  const s = (str ?? "").toString().slice(0, 32); // Windows label max 32 chars
  return `'${s.replace(/'/g, "''")}'`;
}
function sanitizeFs(fsType) {
  const v = (fsType || "").toUpperCase();
  return ["EXFAT", "FAT32", "NTFS"].includes(v) ? v : "EXFAT";
}

// ────────────────────────────── BrowserWindow
function createWindow() {
  mainWindow = new BrowserWindow({
    width  : 1080,
    height : 720,
    minWidth : 980,
    minHeight: 600,
    frame  : false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b0f14",
    icon   : iconPath(),
    show   : false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true
    }
  });
  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => {
    mainWindow.maximize();
    mainWindow.show();
  });
}

app.whenReady().then(() => { dbg("App ready"); createWindow(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ────────────────────────────── title-bar IPC plumbing
ipcMain.on   ("window:minimize", () => mainWindow.minimize());
ipcMain.on   ("window:maximize", () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize());
ipcMain.on   ("window:close"   , () => mainWindow.close());
ipcMain.handle("shell:openExternal", (_e,u) => shell.openExternal(u));

// ────────────────────────────── version meta for about/update
function getVersionMeta() {
  const tries = [
    path.join(__dirname, "version.json"),
    path.join(process.resourcesPath || "", "version.json")
  ];
  for (const f of tries) {
    try { if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f,"utf8")); }
    catch {}
  }
  return { name:"Swift Formatter PRO", version:"0.0.0", channel:"dev",
           repo:"skillerious/SwiftFormatter", tagPrefix:"v" };
}
ipcMain.handle("app:version/get", () => getVersionMeta());

// ────────────────────────────── admin detection (Win32 / Unix fallback)
async function isElevatedWindows() {
  try { await execAsync("fltmc filters"); dbg("fltmc → elevated"); return true; }
  catch(e){ dbg(`fltmc failed (${e.code ?? e.message})`); }

  try {
    const { stdout } = await execAsync(
      "powershell -NoProfile -Command \"[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)\""
    );
    dbg(`PS role check → ${stdout.trim()}`);
    if (stdout.trim().toLowerCase() === "true") return true;
  } catch(e){ dbg(`PS role check failed (${e.message})`); }

  try { await execAsync("net session"); dbg("net session → elevated"); return true; }
  catch(e){ dbg(`net session failed (${e.code ?? e.message})`); }

  return false;
}
async function isAdminSelf() {
  if (process.platform !== "win32")
    return typeof process.getuid === "function" && process.getuid() === 0;
  return await isElevatedWindows();
}
ipcMain.handle("app:isAdmin", async () => {
  const elev = await isAdminSelf();
  dbg(`isAdmin → ${elev}`);
  return elev;
});

// ────────────────────────────── self-elevation (works dev & packaged)
ipcMain.handle("app:relaunchElevated", async () => {
  try {
    const exe  = process.execPath;
    const wd   = app.isPackaged ? path.dirname(exe) : __dirname;
    const args = app.isPackaged ? process.argv.slice(1) : ["."];

    dbg(`Relaunch requested (packaged=${app.isPackaged})`);
    dbg(`exe = ${exe}`);
    dbg(`wd  = ${wd}`);
    dbg(`args= ${JSON.stringify(args)}`);

    const startPS =
      `Start-Process -FilePath "${exe.replace(/"/g,'""')}" ` +
      `-WorkingDirectory "${wd.replace(/"/g,'""')}" ` +
      (args.length ? `-ArgumentList "${args.map(a=>a.replace(/"/g,'""')).join(" ")}" ` : "") +
      `-Verb RunAs -PassThru | Out-Null`;

    const ps  = `Try { ${startPS}; 0 } Catch { Write-Output $_.Exception.Message; 1 }`;
    const cmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "${ps.replace(/`/g,'``').replace(/"/g,'\\"')}"`;

    const { stdout, stderr } = await execAsync(cmd);
    if (stdout.trim()) dbg(`elevate stdout: ${stdout.trim()}`);
    if (stderr.trim()) dbg(`elevate stderr: ${stderr.trim()}`);

    if (stderr.trim() || /^1$/.test(stdout.trim())) return false;

    sendDbgToRenderer("Elevated instance launched, exiting non-admin.");
    setTimeout(()=>app.quit(),150);
    return true;
  } catch(e){
    dbg(`relaunchElevated error: ${e.message}`);
    return false;
  }
});

// ────────────────────────────── DPAPI token helpers
const SECRET = path.join(app.getPath("userData"), "secrets.json");
function secrets() { try { return JSON.parse(fs.readFileSync(SECRET,"utf8")); } catch { return {}; } }
function saveSecrets(o){ fs.writeFileSync(SECRET, JSON.stringify(o,null,2),"utf8"); }

async function enc(s){
  const b = Buffer.from(
    `[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes('${s.replace(/'/g,"''")}'),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    "utf16le").toString("base64");
  const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${b}`);
  return stdout.trim();
}
async function dec(b){
  const c = Buffer.from(
    `[Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String('${b}'),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`,
    "utf16le").toString("base64");
  const { stdout } = await execAsync(`powershell -NoProfile -EncodedCommand ${c}`);
  return stdout;
}

ipcMain.handle("secret:saveToken", async (_e,t)=>{
  if (!t) return { ok:true };
  const s = secrets();
  s.ghToken = await enc(t.trim());
  saveSecrets(s);
  dbg("GitHub token saved");
  return { ok:true };
});
ipcMain.handle("secret:hasToken", () => ({ ok:true, has:!!secrets().ghToken }));
async function token(){ const e = secrets().ghToken; return e ? await dec(e) : null; }

// ────────────────────────────── GitHub updater
const sv  = v => { const m=(String(v||"").replace(/^v/,"").match(/^(\d+)\.(\d+)\.(\d+)/)||[]);
                   return { maj:+m[1]||0, min:+m[2]||0, pat:+m[3]||0, raw:v }; };
const cmp = (a,b) => a.maj-b.maj || a.min-b.min || a.pat-b.pat;

function ghJson(p,t){
  return new Promise((ok,er)=>{
    https.get({
      hostname:"api.github.com", path:p,
      headers:{ "User-Agent":"SwiftFormatter", ...(t?{Authorization:`Bearer ${t}`}:{}) }
    },r=>{
      let d=""; r.on("data",c=>d+=c);
      r.on("end",()=>r.statusCode>=200&&r.statusCode<300 ? ok(JSON.parse(d))
                                                         : er(new Error(`GitHub ${r.statusCode}`)));
    }).on("error",er);
  });
}

ipcMain.handle("update:check", async ()=>{
  try{
    const meta = getVersionMeta();
    const tok  = await token();
    const rel  = await ghJson(`/repos/${meta.repo}/releases/latest`, tok);

    return {
      ok:true,
      upToDate : cmp(sv(meta.version), sv(rel.tag_name)) >= 0,
      current  : `v${meta.version}`,
      latest   : rel.tag_name,
      notes    : rel.body || "",
      html_url : rel.html_url,
      asset    : rel.assets?.find(a=>/\.exe$/i.test(a.name)) || null
    };
  }catch(e){ dbg(`update:check error: ${e.message}`); return { ok:false, error:e.message }; }
});

ipcMain.handle("update:download", async (_e,{url,name})=>{
  if (!url) return { ok:false, error:"no url" };

  const dest = path.join(app.getPath("temp"), name || "SwiftFormatterSetup.exe");
  const tok  = await token();
  dbg(`update:download → ${dest}`);

  return await new Promise(res=>{
    const hdr = {
      "User-Agent":"SwiftFormatter",
      "Accept":"application/octet-stream",
      ...(tok ? {Authorization:`Bearer ${tok}`} : {})
    };
    https.get(url,{headers:hdr},r=>{
      if (r.statusCode>=300 && r.statusCode<400 && r.headers.location)
        return https.get(r.headers.location,{headers:hdr},s=>pipe(s));
      pipe(r);
    }).on("error",e=>res({ok:false,error:e.message}));

    function pipe(s){
      const total = +s.headers["content-length"] || 0;
      let rec=0;
      const f = fs.createWriteStream(dest);
      s.on("data",c=>{
        rec += c.length;
        mainWindow?.webContents.send("update:progress",
          { percent: total ? Math.round(rec*100/total) : null });
      });
      s.pipe(f);
      s.on("end",()=>f.close(()=>res({ok:true,file:dest})));
      s.on("error",e=>res({ok:false,error:e.message}));
    }
  });
});

ipcMain.handle("update:install", async (_e,f)=>{
  try{
    if (!f || !fs.existsSync(f)) throw new Error("Installer not found");
    spawn(f,[],{detached:true,stdio:"ignore"}).unref();
    setTimeout(()=>app.quit(),200);
    return { ok:true };
  }catch(e){ dbg(`update:install error: ${e.message}`); return { ok:false, error:e.message }; }
});

// ────────────────────────────── drive enumeration (rich volume info)
ipcMain.handle("drives:list", async () => {
  try { return await listDrives(); }
  catch (e) { sendDbgToRenderer(`Error listing drives: ${e.message}`); return []; }
});

async function listDrives() {
  // Returns array of disks. Each disk has .volumes[] with per-letter info.
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'

function VolInfo($v){
  [pscustomobject]@{
    letter = if ($v.DriveLetter) { ($v.DriveLetter + ':') } else { '' }
    label  = $v.FileSystemLabel
    fs     = $v.FileSystem
    size   = [int64]$v.Size
    free   = [int64]$v.SizeRemaining
  }
}

function Build($disk, $vols){
  $letters = @($vols | Where-Object { $_.letter } | ForEach-Object { $_.letter })
  $label   = ($vols | Where-Object { $_.label } | Select-Object -First 1).label
  $tot     = 0
  foreach($vv in $vols){ $tot += [int64]$vv.size }

  [pscustomobject]@{
    device      = "\\\\.\\PHYSICALDRIVE$($disk.Number)"
    description = $disk.FriendlyName
    volumeLabel = $label
    size        = [int64]$tot
    isUSB       = ($disk.BusType -eq 'USB')
    isReadOnly  = [bool]$disk.IsReadOnly
    isSystem    = [bool]$disk.IsSystem
    isRemovable = $true
    busType     = $disk.BusType.ToString()
    mountpoints = $letters
    volumes     = $vols
  }
}

$items = @()

# Strategy 1: Start from volumes with DriveType = Removable to keep only removable media
$vols = Get-Volume | Where-Object { $_.DriveType -eq 'Removable' -or $_.DriveType -eq 'Removable Disk' }
$map  = @{}

foreach($v in $vols){
  if (-not $v.DriveLetter) { continue }
  $part = Get-Partition -DriveLetter $v.DriveLetter
  if (-not $part) { continue }
  $disk = Get-Disk -Number $part.DiskNumber
  if (-not $disk) { continue }
  $k = $disk.Number
  if (-not $map[$k]) { $map[$k] = @{ disk=$disk; vols=@() } }
  $map[$k].vols += (VolInfo $v)
}

foreach($kv in $map.GetEnumerator()){
  $items += Build $kv.Value.disk $kv.Value.vols
}

# Fallback: if none found above, try all USB disks and read any volumes on them
if (-not $items){
  foreach($disk in Get-Disk | Where-Object { $_.BusType -eq 'USB' }){
    $vs = @()
    Get-Partition -DiskNumber $disk.Number | ForEach-Object {
      $v = Get-Volume -Partition $_
      if ($v) { $vs += (VolInfo $v) }
    }
    if ($vs.Count -gt 0) { $items += Build $disk $vs }
  }
}

$items | ConvertTo-Json -Depth 7
`.trim();

  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  const { stdout } =
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`);
  const data = (() => { try { return JSON.parse(stdout); } catch { return null; } })();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// easy helper for renderer selection resolution
async function resolveDrive({ device, mountpoints }) {
  const list = await listDrives();
  const letter = (mountpoints?.[0] || "").toUpperCase();
  let found = device ? list.find(d => d.device === device) : null;
  if (!found && letter) {
    found = list.find(d => (d.mountpoints||[]).map(x=>x.toUpperCase()).includes(letter));
  }
  return found || null;
}

// ────────────────────────────── formatter
function formatCmd(letter, fsType, label, full){
  const fs = sanitizeFs(fsType);
  const quotedLabel = psq(label);
  return {
    cmd :"powershell.exe",
    args:["-NoProfile","-ExecutionPolicy","Bypass","-Command",
      `Format-Volume -DriveLetter ${letter} ` +
      `-FileSystem ${fs} ` +
      `-NewFileSystemLabel ${quotedLabel} ` +
      `-Confirm:$false -Force -Full:${full?"$true":"$false"}`]
  };
}

ipcMain.handle("format:execute", async (_e,p)=>{
  const letter = (p.mountpoints?.[0] || "").replace(":","").toUpperCase();
  if (!letter) throw new Error("No drive letter");

  const target = await resolveDrive({ device: p.device, mountpoints: p.mountpoints });
  if (!target) throw new Error("Target drive not found");
  if (!target.isUSB)     throw new Error("Refusing to format: target disk is not a USB device.");
  if (target.isSystem)   throw new Error("Refusing to format: target disk is a system disk.");
  if (target.isReadOnly) throw new Error("Refusing to format: target disk is read-only.");

  const plan = formatCmd(letter, p.fsType, p.label, !p.quick);
  if (p.simulate) return { simulated:true, plan };

  if (!(await isAdminSelf())) throw new Error("Administrator privileges are required.");

  dbg(`Formatting: ${plan.cmd} ${plan.args.join(" ")}`);
  sendDbgToRenderer(`Running: ${plan.cmd} ${plan.args.join(" ")}`);

  return new Promise((ok,er)=>{
    const ch = spawn(plan.cmd, plan.args, { shell:false });
    ch.stdout.on("data", d => mainWindow?.webContents.send("format:progress", d.toString()));
    ch.stderr.on("data", d => mainWindow?.webContents.send("format:progress", d.toString()));
    ch.on("close", c => c===0 ? ok({ok:true}) : er(new Error("Exited "+c)));
    ch.on("error", er);
  });
});

// ────────────────────────────── drive helpers (open, eject)
ipcMain.handle("drive:open", async (_e, letter) => {
  try {
    const L = String(letter || "").replace(":", "").toUpperCase();
    if (!/^[A-Z]$/.test(L)) throw new Error("Invalid drive letter");
    const drivePath = `${L}:\\`;
    const err = await shell.openPath(drivePath);
    if (err) throw new Error(err);
    return { ok: true };
  } catch (e) {
    dbg(`drive:open error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("drive:eject", async (_e, letter) => {
  try {
    const L = String(letter || "").replace(":", "").toUpperCase();
    if (!/^[A-Z]$/.test(L)) throw new Error("Invalid drive letter");

    // Small helper to run PS with timeout and capture stdout as text.
    const runPS = (ps, timeoutMs = 12000) =>
      new Promise((resolve, reject) => {
        const enc = Buffer.from(ps, "utf16le").toString("base64");
        const ch = spawn(
          "powershell.exe",
          ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
          { stdio: ["ignore", "pipe", "pipe"] }
        );
        let out = "", err = "";
        const to = setTimeout(() => { try { ch.kill(); } catch {} ; reject(new Error("PowerShell timeout")); }, timeoutMs);
        ch.stdout.on("data", d => (out += d.toString()));
        ch.stderr.on("data", d => (err += d.toString()));
        ch.on("error", reject);
        ch.on("close", code => { clearTimeout(to); code === 0 ? resolve(out) : reject(new Error(err || `Exited ${code}`)); });
      });

    // Retry-aware mounted check to avoid WMI lag false-negatives
    async function stillMountedWithRetry(letter, retries = 5, delayMs = 400) {
      const checkCmd = `
$ErrorActionPreference='SilentlyContinue'
$v = Get-CimInstance -ClassName Win32_Volume -Filter "DriveLetter='${letter}:'"
if ($v) { '1' } else { '0' }`.trim();

      for (let i = 0; i < retries; i++) {
        try {
          const result = (await runPS(checkCmd, 4000)).trim();
          if (result === "0") return false; // gone
        } catch { /* ignore transient errors and retry */ }
        await new Promise(r => setTimeout(r, delayMs));
      }
      return true; // still there after retries
    }

    // 0) Close Explorer windows targeting this drive (reduces “in use” errors)
    try {
      const closeExplorers = `
$ErrorActionPreference='SilentlyContinue'
$target = 'file:///${L}:/'.ToLower()
$shell = New-Object -ComObject Shell.Application
$wins = @($shell.Windows())
foreach ($w in $wins) {
  try {
    $u = ($w.LocationURL + '')
    if ($u.ToLower().StartsWith($target)) { $w.Quit() }
  } catch {}
}
Start-Sleep -Milliseconds 250
'OK'`.trim();
      await runPS(closeExplorers, 4000);
    } catch {}

    // 1) Try shell eject (fast path)
    const psShellEject = `
$ErrorActionPreference='SilentlyContinue'
$L='${L}:'
$shell = New-Object -ComObject Shell.Application
$ns = $shell.NameSpace(17)
$item = $ns.ParseName($L)
if ($item) { $item.InvokeVerb('Eject'); Start-Sleep -Milliseconds 400; 'OK' } else { 'MISS' }`.trim();
    try { await runPS(psShellEject, 6000); } catch {}

    // Give the OS a moment, then verify with retry (handles WMI lag)
    await new Promise(r => setTimeout(r, 500));
    if (!(await stillMountedWithRetry(L, 5, 400))) return { ok: true };

    // 2) Try PowerShell 5+ cmdlet (more graceful on newer Windows)
    const psDismountVolume = `
$ErrorActionPreference='SilentlyContinue'
try {
  if (Get-Command Dismount-Volume -ErrorAction SilentlyContinue) {
    Dismount-Volume -DriveLetter ${L} -Force -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Milliseconds 300
    'DONE'
  } else {
    'SKIP'
  }
} catch { 'ERR' }`.trim();
    try { await runPS(psDismountVolume, 8000); } catch {}

    await new Promise(r => setTimeout(r, 400));
    if (!(await stillMountedWithRetry(L, 5, 400))) return { ok: true };

    // 3) Final fallback: WMI dismount (force = true, permanent = false)
    const psWmiDismount = `
$ErrorActionPreference='SilentlyContinue'
$vol = Get-CimInstance -ClassName Win32_Volume -Filter "DriveLetter='${L}:'"
if ($vol) {
  $null = $vol.Dismount($true, $false)
  Start-Sleep -Milliseconds 300
  'DONE'
} else { 'MISS' }`.trim();
    await runPS(psWmiDismount, 8000);

    // Final verification with retry before declaring failure
    if (await stillMountedWithRetry(L, 5, 400)) {
      throw new Error("Windows refused to eject/dismount the volume. Close any apps or Explorer windows using the drive and try again.");
    }
    return { ok: true };

  } catch (e) {
    dbg(`drive:eject error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});


// ────────────────────────────── device monitor (WMI + poll, debounced)
let wmiProc = null;
let pollTimer = null;
let lastLetters = "";

// Debounced emitter to the renderer
let emitTimer = null;
let pendingPayload = null;
let lastEmitKey = "";

function currentLettersKey(list) {
  const letters = list.flatMap(d => d.mountpoints || []);
  return letters.map(s => s.toUpperCase()).sort().join("|");
}

function emitDriveChange(reason, letters) {
  // Coalesce bursts of events into a single UI update
  pendingPayload = { reason, letters };
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    if (!pendingPayload) return;

    const key = (pendingPayload.letters || [])
      .map(s => s.toUpperCase())
      .sort()
      .join("|");

    // Suppress duplicates unless it's an explicit add/remove
    const forceReason = pendingPayload.reason?.startsWith("add") || pendingPayload.reason === "remove";
    if (forceReason || key !== lastEmitKey) {
      lastEmitKey = key;
      try {
        mainWindow?.webContents.send("drives:changed", pendingPayload);
      } catch {}
    }
    pendingPayload = null;
  }, 250);
}

function startPoller() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    try {
      const list = await listDrives();
      const key  = currentLettersKey(list);
      if (key !== lastLetters) {
        const prevSet = new Set(lastLetters ? lastLetters.split("|").filter(Boolean) : []);
        const nowSet  = new Set(key ? key.split("|").filter(Boolean) : []);
        const added   = [...nowSet].filter(x => !prevSet.has(x));
        const removed = [...prevSet].filter(x => !nowSet.has(x));
        lastLetters = key;

        const letters = list.flatMap(d => d.mountpoints || []);
        if (added.length) {
          emitDriveChange(`add:${added.join(",")}`, letters);
        } else if (removed.length) {
          emitDriveChange(`remove:${removed.join(",")}`, letters);
        } else {
          emitDriveChange("change", letters);
        }
      }
    } catch (e) {
      dbg(`poller error: ${e.message}`);
    }
  }, 2000);
}

function stopPoller() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startWmiWatcher() {
  if (process.platform !== "win32") return;
  if (wmiProc) return;

  const script = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# Listen to both classes; some systems only raise one reliably
Register-WmiEvent -Class Win32_VolumeChangeEvent  -SourceIdentifier VolWatch | Out-Null
Register-WmiEvent -Class Win32_DeviceChangeEvent  -SourceIdentifier DevWatch | Out-Null

while ($true) {
  $e = Wait-Event -Timeout 3
  if ($e) {
    $src = $e.SourceIdentifier
    $nev = $e.SourceEventArgs.NewEvent

    $etype = 0
    try { $etype = [int]$nev.EventType } catch {}

    # Only forward arrival (2) / removal (3) — ignore noisy config changes
    if ($etype -ne 2 -and $etype -ne 3) {
      Remove-Event -EventIdentifier $e.EventIdentifier -ErrorAction SilentlyContinue
      continue
    }

    $drv = ''
    try { if ($nev.DriveName) { $drv = $nev.DriveName.Trim() } } catch {}

    $obj = @{ source = $src; type = $etype; drive = $drv }
    Write-Output ($obj | ConvertTo-Json -Compress)

    # Remove exactly this event, don't flush the whole queue
    Remove-Event -EventIdentifier $e.EventIdentifier -ErrorAction SilentlyContinue
  }
}
`.trim();

  const enc = Buffer.from(script, "utf16le").toString("base64");
  wmiProc = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  wmiProc.stdout.setEncoding("utf8");

  // Line-buffered JSON parsing so partial chunks don't break us
  let buf = "";
  wmiProc.stdout.on("data", async (chunk) => {
    buf += String(chunk);
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;

      try {
        const evt = JSON.parse(line);
        dbg(`WMI evt: src=${evt.source} type=${evt.type} drive=${evt.drive || "-"}`);

        const list = await listDrives();
        const key  = currentLettersKey(list);
        const letters = list.flatMap(d => d.mountpoints || []);
        const addedRemoved = evt.type === 3 ? "remove" : "add"; // 2=Arrival, 3=Removal

        lastLetters = key;
        if (addedRemoved === "remove") {
          emitDriveChange("remove", letters);
        } else {
          // If we know the drive letter, include it in the reason
          const tag = (evt.drive || "").toUpperCase();
          const reason = tag ? `add:${tag}` : "add";
          emitDriveChange(reason, letters);
        }
      } catch (e) {
        dbg(`WMI parse error: ${e.message}`);
      }
    }
  });

  wmiProc.on("error", (e) => { dbg(`WMI watcher error: ${e.message}`); });
  wmiProc.on("exit",  () => { dbg("WMI watcher exited"); wmiProc = null; });
}

function stopWmiWatcher() {
  try { wmiProc?.kill(); } catch {}
  wmiProc = null;
}

ipcMain.handle("drives:watch/start", async () => {
  const list = await listDrives();
  lastLetters = currentLettersKey(list);
  startWmiWatcher();
  startPoller();
  return { ok: true, letters: list.flatMap(d => d.mountpoints || []) };
});

ipcMain.handle("drives:watch/stop", () => {
  stopWmiWatcher();
  stopPoller();
  return { ok: true };
});

