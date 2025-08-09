// main.js — Swift Formatter PRO  (Windows-only · Electron main process)
// © 2025 Robin Doak · MIT

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
function sendDbg(msg) {
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
const jtry = (s) => { try { return JSON.parse(s); } catch { return null; } };

// PowerShell safe single-quoted string
function psq(str) {
  const s = (str ?? "").toString().slice(0, 32); // Volume labels: max 32 chars
  return `'${s.replace(/'/g, "''")}'`;
}
// Allow only supported filesystems to reach PowerShell
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
    startWmiWatcher(); // ← start auto-refresh watcher when UI is visible
  });
}

app.whenReady().then(() => { dbg("App ready"); createWindow(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on("window-all-closed", () => { 
  stopWmiWatcher();
  if (process.platform !== "darwin") app.quit(); 
});

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

    sendDbg("Elevated instance launched, exiting non-admin.");
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

// ────────────────────────────── drive enumeration (with volumeLabel)
ipcMain.handle("drives:list", async () => {
  try { return await listDrives(); }
  catch (e) { sendDbg(`Error listing drives: ${e.message}`); return []; }
});

async function listDrives() {
  /*  PowerShell – returns a JSON array:
        { device, description, volumeLabel, size, isUSB, isReadOnly, isSystem,
          isRemovable, busType, mountpoints[] }
  */
  const ps = `
$ErrorActionPreference = 'SilentlyContinue'

function Build($disk, $letters, $label) {
  [pscustomobject]@{
    device      = "\\\\.\\PHYSICALDRIVE$($disk.Number)"
    description = $disk.FriendlyName
    volumeLabel = $label
    size        = [int64]$disk.Size
    isUSB       = ($disk.BusType -eq 'USB')
    isReadOnly  = [bool]$disk.IsReadOnly
    isSystem    = [bool]$disk.IsSystem
    isRemovable = $true
    busType     = $disk.BusType.ToString()
    mountpoints = $letters
  }
}

$map = @{}

Get-Volume |
  Where-Object { $_.DriveType -eq 'Removable' -or $_.DriveType -eq 'Removable Disk' } |
  ForEach-Object {
    if ($_.DriveLetter) {
      $part = Get-Partition -DriveLetter $_.DriveLetter
      $disk = Get-Disk -Number $part.DiskNumber
      $k    = $disk.Number
      if (-not $map[$k]) {
        $map[$k] = @{ disk = $disk; letters = @(); label = $_.FileSystemLabel }
      }
      $map[$k].letters += ("$($_.DriveLetter):")
      if (-not $map[$k].label) { $map[$k].label = $_.FileSystemLabel }
    }
  }

$items = @()

foreach ($kv in $map.GetEnumerator()) {
  $items += Build $kv.Value.disk $kv.Value.letters $kv.Value.label
}

if (-not $items) {
  foreach ($disk in Get-Disk | Where-Object { $_.BusType -eq 'USB' }) {
    $letters = @()
    $label   = ''
    Get-Partition -DiskNumber $disk.Number | ForEach-Object {
      $v = Get-Volume -Partition $_
      if ($v.DriveLetter) {
        $letters += ($v.DriveLetter + ':')
        if (-not $label) { $label = $v.FileSystemLabel }
      }
    }
    $items += Build $disk $letters $label
  }
}

$items | ConvertTo-Json -Depth 6`.trim();

  const enc = Buffer.from(ps, 'utf16le').toString('base64');
  const { stdout } =
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`);
  const data = (() => { try { return JSON.parse(stdout); } catch { return null; } })();
  return Array.isArray(data) ? data : (data ? [data] : []);
}

// Look up a drive by device string or by drive letter
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
  sendDbg(`Running: ${plan.cmd} ${plan.args.join(" ")}`);

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

    // Try Shell "Eject" verb
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$L = '${L}:'
$shell = New-Object -ComObject Shell.Application
$ns = $shell.NameSpace(17)
$item = $ns.ParseName($L)
if ($item) {
  $item.InvokeVerb('Eject')
  Start-Sleep -Milliseconds 200
  0
} else {
  1
}`.trim();

    const enc = Buffer.from(ps, "utf16le").toString("base64");
    const { stdout } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc}`);
    const code = parseInt((stdout || "").trim(), 10);
    if (Number.isFinite(code) && code === 0) return { ok: true };

    // Fallback: dismount volume (force)
    const ps2 = `
$vol = Get-CimInstance -ClassName Win32_Volume -Filter "DriveLetter='${L}:'"
if ($vol) {
  $null = $vol.Dismount($true, $true)
  0
} else {
  1
}`.trim();

    const enc2 = Buffer.from(ps2, "utf16le").toString("base64");
    const { stdout: s2 } = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${enc2}`);
    const code2 = parseInt((s2 || "").trim(), 10);
    if (Number.isFinite(code2) && code2 === 0) return { ok: true };

    throw new Error("Windows refused to eject the volume.");
  } catch (e) {
    dbg(`drive:eject error: ${e.message}`);
    return { ok: false, error: e.message };
  }
});

// ────────────────────────────── WMI auto-refresh watcher
let wmiProc = null;

function startWmiWatcher() {
  if (process.platform !== "win32") return; // Windows-only
  if (wmiProc) return;

  try {
    const ps = `
$ErrorActionPreference = 'SilentlyContinue'
$q = "SELECT * FROM Win32_VolumeChangeEvent WHERE EventType=2 OR EventType=3 OR EventType=4"
$w = New-Object System.Management.ManagementEventWatcher $q
while ($true) {
  try {
    $e = $w.WaitForNextEvent()
    if ($null -ne $e) {
      [pscustomobject]@{ t = [int]$e.EventType; drive = $e.DriveName } | ConvertTo-Json -Compress
    }
  } catch { Start-Sleep -Milliseconds 200 }
}
`.trim();

    const enc = Buffer.from(ps, "utf16le").toString("base64");
    wmiProc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", enc], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });

    wmiProc.stdout.on("data", (buf) => {
      const text = buf.toString().trim();
      text.split(/\r?\n/).forEach((line) => {
        if (!line) return;
        const evt = jtry(line);
        if (evt && (evt.t === 2 || evt.t === 3 || evt.t === 4)) {
          mainWindow?.webContents.send("drives:changed", evt);
        }
      });
    });

    wmiProc.stderr.on("data", (buf) => {
      dbg(`WMI watcher stderr: ${buf.toString().trim()}`);
    });

    wmiProc.on("exit", (code) => {
      dbg(`WMI watcher exited (${code})`);
      wmiProc = null;
    });

    dbg("WMI watcher started");
  } catch (e) {
    dbg("WMI watcher failed to start: " + e.message);
  }
}

function stopWmiWatcher() {
  try {
    if (wmiProc) {
      wmiProc.kill();
      wmiProc = null;
      dbg("WMI watcher stopped");
    }
  } catch {}
}
