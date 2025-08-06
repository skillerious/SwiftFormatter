/* global api, bootstrap */
const $ = (sel) => document.querySelector(sel);

/* --------- Elements --------- */
const driveListEl     = $("#driveList");
const driveLoaderEl   = $("#driveLoader");
const driveCountBadge = $("#driveCount");
const refreshBtn      = $("#refresh");

const fsTypeEl = $("#fsType");
const labelEl  = $("#label");
const quickEl  = $("#quick");
const confirmTextEl = $("#confirmText");
const selectedDeviceDisplay = $("#selectedDeviceDisplay");
const clearSelectionBtn = $("#clearSelection");
const cmdPreviewEl = $("#cmdPreview");

const outputEl     = $("#output");
const progressBar  = $("#progressBar");
const percentLabel = $("#percentLabel");

/* Titlebar controls */
const btnUpdate  = $("#btn-update");
const btnSettings= $("#btn-settings");
const btnAbout   = $("#btn-about");
const btnMin     = $("#btn-min");
const btnMax     = $("#btn-max");
const btnClose   = $("#btn-close");

/* Update modal */
const updateCheckBtn = $("#updateCheckNow");
const updateGetBtn = $("#updateGetBtn");
const updateGetLabel = $("#updateGetLabel");
const updateOpenReleaseBtn = $("#updateOpenRelease");
const badgeCurrent = $("#badgeCurrent");
const badgeLatest  = $("#badgeLatest");
const updateStatus = $("#updateStatusText");
const updateSpinner= $("#updateSpinner");
const updateNotes  = $("#updateChangelog");
const updateFooter = $("#updateFooterNote");

/* Settings */
const settingsForm = $("#settingsForm");
const setGhToken   = $("#setGhToken");

const docsLinkBtn = $("#docsLink");
const formatForm  = $("#formatForm");

/* ---------- Settings state ---------- */
const ALLOWED_FS = ["exFAT", "FAT32", "NTFS"];
const DEFAULT_SETTINGS = {
  defaultFs: "exFAT",
  quickDefault: true,
  requireConfirm: true,
  autofillConfirm: false,
  glowHover: true,
};
let SETTINGS = loadSettings();
applySettingsToUI();

/* ---------- Version state ---------- */
let APP_META = {
  name: "Swift Formatter PRO",
  version: "v—",
  rawVersion: "",
  channel: "stable",
  build: 0,
  releasedAt: null,
  repo: "skillerious/SwiftFormatter",
  tagPrefix: "v"
};

async function loadVersion() {
  try {
    const v = await api.getVersion();
    APP_META = {
      name: v.name || "Swift Formatter PRO",
      version: v.version ? `v${v.version}` : "v—",
      rawVersion: v.version || "",
      channel: v.channel || "stable",
      build: v.build || 0,
      releasedAt: v.releasedAt || null,
      repo: v.repo || "skillerious/SwiftFormatter",
      tagPrefix: v.tagPrefix || "v"
    };

    const aboutVerEl = $("#aboutVersion");
    const aboutChEl  = $("#aboutChannel");
    const aboutRelEl = $("#aboutReleased");
    if (aboutVerEl) aboutVerEl.textContent = APP_META.version;
    if (aboutChEl)  aboutChEl.textContent  = APP_META.channel;
    if (aboutRelEl) aboutRelEl.textContent = APP_META.releasedAt ? formatDate(APP_META.releasedAt) : "—";

    if (badgeCurrent) badgeCurrent.textContent = `Current: ${APP_META.version}`;
  } catch {}
}
function formatDate(iso) {
  try { const d = new Date(iso); if (isNaN(d)) return "—";
    return d.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"2-digit" }); }
  catch { return "—"; }
}

/* ---------------- Titlebar Admin badge ---------------- */
async function addAdminBadge() {
  try {
    const isAdmin = await api.isAdmin();
    const titleEl = document.querySelector(".app-title");
    if (!titleEl) return;
    const badge = document.createElement("span");
    badge.className = "badge ms-2 " + (isAdmin ? "bg-success" : "bg-secondary");
    badge.textContent = isAdmin ? "Admin" : "Standard";
    titleEl.appendChild(badge);
  } catch {}
}

/* ---------------- Window controls ---------------- */
btnUpdate?.addEventListener("click", openUpdate);
btnSettings?.addEventListener("click", openSettings);
btnAbout?.addEventListener("click", () => {
  try { new bootstrap.Modal($("#aboutModal"), { backdrop: true, focus: true }).show(); } catch {}
});
btnMin?.addEventListener("click", () => api.minimize());
btnMax?.addEventListener("click", () => api.maximize());
btnClose?.addEventListener("click", () => api.close());

/* ---------------- Popovers ---------------- */
function initPopovers() {
  try {
    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
      new bootstrap.Popover(el, { container: 'body', sanitize: true });
    });
  } catch {}
}

/* ---------------- Links ---------------- */
docsLinkBtn?.addEventListener("click", () => api.openExternal("https://en.wikipedia.org/wiki/Disk_formatting"));
const aboutRepoBtn = document.getElementById("aboutRepo");
aboutRepoBtn?.addEventListener("click", () => api.openExternal(`https://github.com/${APP_META.repo}`));

/* ---------------- Refresh & selection ---------------- */
let drives = [];
let selected = null;

refreshBtn?.addEventListener("click", refreshDrives);
clearSelectionBtn?.addEventListener("click", () => {
  selected = null;
  selectedDeviceDisplay.textContent = "None";
  confirmTextEl.value = "";
  renderDriveList(drives);
  updatePreview();
});

/* ---------------- Live preview ---------------- */
[fsTypeEl, labelEl, quickEl].forEach(el => el?.addEventListener("change", updatePreview));

/* ---------------- Progress stream ---------------- */
api.onFormatProgress((msg) => { appendOutput(msg); tryParsePercent(msg); });

/* ---------------- Utils ---------------- */
function loadSettings() {
  try { const raw = localStorage.getItem("ufp.settings");
    const parsed = raw ? JSON.parse(raw) : {};
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    if (!ALLOWED_FS.includes(merged.defaultFs)) merged.defaultFs = "exFAT";
    return merged;
  } catch { return { ...DEFAULT_SETTINGS }; }
}
function saveSettings() { try { localStorage.setItem("ufp.settings", JSON.stringify(SETTINGS)); } catch {} }
function applySettingsToUI() {
  if (!ALLOWED_FS.includes(SETTINGS.defaultFs)) SETTINGS.defaultFs = "exFAT";
  if (fsTypeEl) fsTypeEl.value = SETTINGS.defaultFs;
  if (quickEl)  quickEl.checked = !!SETTINGS.quickDefault;
  document.body.classList.toggle("no-glow", !SETTINGS.glowHover);

  const setFS = document.getElementById("setDefaultFS");
  const setQ  = document.getElementById("setQuickDefault");
  const setRC = document.getElementById("setRequireConfirm");
  const setAF = document.getElementById("setAutofillConfirm");
  const setGH = document.getElementById("setGlowHover");
  if (setFS) setFS.value = SETTINGS.defaultFs;
  if (setQ)  setQ.checked = !!SETTINGS.quickDefault;
  if (setRC) setRC.checked = !!SETTINGS.requireConfirm;
  if (setAF) setAF.checked = !!SETTINGS.autofillConfirm;
  if (setGH) setGH.checked = !!SETTINGS.glowHover;
}
function prettyBytes(n) {
  if (!n && n !== 0) return "—";
  const units = ["B","KB","MB","GB","TB","PB"]; let i = 0, v = Number(n);
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}
function mountLabel(m) { return (m && m.length) ? m.join(", ") : "—"; }
function appendOutput(msg) {
  outputEl.textContent = (outputEl.textContent + msg).slice(-4000);
  outputEl.scrollTop = outputEl.scrollHeight;
}
function setIndeterminate() {
  progressBar.classList.add("progress-bar-animated","progress-bar-striped");
  progressBar.style.width = "100%"; progressBar.style.opacity = "0.45";
  percentLabel.textContent = "Working…";
}
function setPercent(p) {
  const pct = Math.max(0, Math.min(100, Math.round(p)));
  progressBar.classList.remove("progress-bar-animated");
  progressBar.classList.add("progress-bar-striped");
  progressBar.style.opacity = "1";
  progressBar.style.width = `${pct}%`;
  percentLabel.textContent = `${pct}%`;
}
function resetProgress() {
  progressBar.style.width = "0%"; progressBar.style.opacity = "1";
  progressBar.classList.add("progress-bar-animated","progress-bar-striped");
  percentLabel.textContent = "—";
}
function tryParsePercent(text) {
  const m = text.match(/(\d{1,3})\s*%/);
  if (m) setPercent(Number(m[1]));
}
function displayDevice(d) { const mount = d.mountpoints?.[0]; return mount ? `${d.device} | ${mount}` : d.device; }

/* ---------------- Drives UI ---------------- */
function renderDriveList(list) {
  const listEl = driveListEl; if (!listEl) return;
  listEl.innerHTML = "";
  const removable = list.filter(d => d.isUSB || d.isRemovable || (d.mountpoints && d.mountpoints.length));
  if (driveCountBadge) driveCountBadge.textContent = String(removable.length);

  for (const d of removable) {
    const item = document.createElement("div"); item.className = "drive-item";
    const radioWrap = document.createElement("div"); radioWrap.className = "drive-radio";
    const r = document.createElement("input"); r.type = "radio"; r.name = "devRadio"; r.className = "form-check-input";
    r.checked = selected && selected.device === d.device; radioWrap.appendChild(r);

    const avatar = document.createElement("div"); avatar.className = "drive-avatar"; avatar.innerHTML = `<i class="bi bi-usb-drive"></i>`;
    const main = document.createElement("div"); main.className = "drive-main";
    const title = document.createElement("div"); title.className = "drive-title"; title.textContent = d.description || "Drive";
    const sub = document.createElement("div"); sub.className = "drive-sub"; sub.textContent = d.device; main.append(title, sub);

    const meta = document.createElement("div"); meta.className = "drive-meta";
    const sizePill = document.createElement("span"); sizePill.className = "pill size"; sizePill.textContent = prettyBytes(d.size);
    const mountPill = document.createElement("span"); mountPill.className = "pill mount"; mountPill.innerHTML = `<i class="bi bi-hdd-stack"></i> ${mountLabel(d.mountpoints)}`;
    const busPill = document.createElement("span"); busPill.className = "pill usb"; busPill.innerHTML = `<span class="dot"></span> ${d.busType || "USB"}`;
    meta.append(sizePill, mountPill, busPill);

    item.append(radioWrap, avatar, main, meta);
    if (selected && selected.device === d.device) item.classList.add("selected");

    const selectThis = () => {
      selected = d;
      document.querySelectorAll(".drive-item").forEach(el => el.classList.remove("selected"));
      item.classList.add("selected");
      r.checked = true;
      if (selectedDeviceDisplay) selectedDeviceDisplay.textContent = displayDevice(d);
      confirmTextEl.value = SETTINGS.autofillConfirm ? (d.mountpoints?.[0] || "") : "";
      updatePreview();
    };
    item.addEventListener("click", (e) => { if (e.target.tagName !== "INPUT") selectThis(); });
    r.addEventListener("change", selectThis);

    listEl.appendChild(item);
  }
}

async function refreshDrives() {
  try {
    driveLoaderEl?.classList.remove("hidden");
    if (driveListEl) driveListEl.innerHTML = "";
    if (outputEl) outputEl.textContent = "Scanning for removable drives...\n";

    drives = await api.listDrives() || [];
    renderDriveList(drives);

    const count = drives.filter(d=>d.isUSB || d.isRemovable || (d.mountpoints&&d.mountpoints.length)).length;
    if (outputEl) outputEl.textContent += `Found ${count} device(s).\n`;
  } catch (err) {
    if (outputEl) outputEl.textContent = `Error listing drives: ${err.message}\n`;
  } finally {
    driveLoaderEl?.classList.add("hidden");
    updatePreview();
  }
}

/* ---------------- Command preview ---------------- */
async function updatePreview() {
  if (!selected) { if (cmdPreviewEl) cmdPreviewEl.textContent = "Select a device to preview the command."; return; }
  const payload = {
    device: selected.device,
    fsType: fsTypeEl.value,
    label: labelEl.value.trim(),
    quick: !!quickEl.checked,
    simulate: true,
    mountpoints: selected.mountpoints
  };
  try {
    const preview = await api.formatDrive(payload);
    const { plan } = preview;
    const cmd = `${plan.cmd} ${plan.args.map(a => (/\s/.test(a) ? `"${a}"` : a)).join(" ")}`;
    if (cmdPreviewEl) cmdPreviewEl.textContent = cmd;
  } catch {
    if (cmdPreviewEl) cmdPreviewEl.textContent = "Unable to build command preview.";
  }
}

/* ---------------- Elevation modal ---------------- */
function showElevationDialog() {
  return new Promise((resolve) => {
    const modalEl = document.getElementById("elevateModal");
    const confirmBtn = document.getElementById("elevateConfirmBtn");
    const cancelBtn  = document.getElementById("elevateCancelBtn");
    const spinner    = document.getElementById("elevateSpinner");
    const statusEl   = document.getElementById("elevateStatus");
    if (!modalEl) return resolve(false);

    spinner.classList.add("d-none");
    confirmBtn.disabled = false; cancelBtn.disabled = false;
    statusEl.textContent = "Formatting requires admin rights.";

    const modal = new bootstrap.Modal(modalEl, { backdrop: "static", keyboard: false });

    const onHidden = () => {
      modalEl.removeEventListener("hidden.bs.modal", onHidden);
      confirmBtn.removeEventListener("click", onConfirm);
      cancelBtn.removeEventListener("click", onCancel);
      resolve(false);
    };
    const onCancel = () => { modal.hide(); };
    const onConfirm = async () => {
      confirmBtn.disabled = true; cancelBtn.disabled = true; spinner.classList.remove("d-none");
      statusEl.textContent = "Requesting elevation via UAC…";
      const ok = await api.relaunchElevated();
      if (!ok) {
        spinner.classList.add("d-none");
        statusEl.textContent = "Could not relaunch. Please run Swift Formatter as Administrator manually.";
        confirmBtn.disabled = false; cancelBtn.disabled = false;
        return;
      }
      statusEl.textContent = "Launching elevated instance… this window will close.";
      setTimeout(() => modal.hide(), 600);
    };

    modalEl.addEventListener("hidden.bs.modal", onHidden);
    confirmBtn.addEventListener("click", onConfirm);
    cancelBtn.addEventListener("click", onCancel);
    modal.show();
  });
}
async function ensureAdminOrPrompt() {
  const isAdmin = await api.isAdmin();
  if (isAdmin) return true;
  await showElevationDialog();
  return false;
}

/* ---------------- Submit format ---------------- */
formatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const elevated = await ensureAdminOrPrompt();
  if (!elevated) return;

  if (outputEl) outputEl.textContent = "";
  resetProgress();

  if (!selected) { appendOutput("Please select a device first.\n"); return; }

  const confirmText = confirmTextEl.value.trim().toUpperCase();
  const letter = (selected.mountpoints && selected.mountpoints[0]) ? selected.mountpoints[0].toUpperCase() : "";
  if (SETTINGS.requireConfirm) {
    if (!confirmText || confirmText !== letter) {
      appendOutput(`Confirmation must match the drive letter (e.g. ${letter}).\n`);
      return;
    }
  }

  try { await updatePreview(); appendOutput(`Command plan:\n  ${cmdPreviewEl.textContent}\n\n`); } catch {}
  appendOutput("⚠️ Executing real format...\n");
  setIndeterminate();
  try {
    const res = await api.formatDrive({
      device: selected.device, fsType: fsTypeEl.value, label: labelEl.value.trim(),
      quick: !!quickEl.checked, simulate: false, mountpoints: selected.mountpoints
    });
    if (res && res.ok) { setPercent(100); appendOutput("\n✅ Format completed successfully.\n"); }
    else { appendOutput("\n❌ The formatter did not report success.\n"); }
  } catch (err) { appendOutput(`\n❌ Error: ${err.message}\n`); }
});

/* ---------------- Settings modal ---------------- */
function openSettings() {
  applySettingsToUI();
  try { new bootstrap.Modal($("#settingsModal"), { backdrop: true, focus: true }).show(); } catch {}
}
settingsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  SETTINGS.defaultFs       = $("#setDefaultFS").value;
  SETTINGS.quickDefault    = !!$("#setQuickDefault").checked;
  SETTINGS.requireConfirm  = !!$("#setRequireConfirm").checked;
  SETTINGS.autofillConfirm = !!$("#setAutofillConfirm").checked;
  SETTINGS.glowHover       = !!$("#setGlowHover").checked;

  if (!ALLOWED_FS.includes(SETTINGS.defaultFs)) SETTINGS.defaultFs = "exFAT";
  saveSettings(); applySettingsToUI();
  fsTypeEl.value = SETTINGS.defaultFs; quickEl.checked = SETTINGS.quickDefault;

  const token = (setGhToken?.value || "").trim();
  if (token) {
    const save = await api.saveGitHubToken(token);
    if (!save?.ok) alert("Failed to store GitHub token: " + (save?.error || "Unknown error"));
    setGhToken.value = "";
  }

  const modalEl = $("#settingsModal");
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.hide();
});

/* ---------------- Update modal ---------------- */
let UPDATE_INFO = null;   // { asset:{url,name}, latest, current, ... }
let DOWNLOADED_PATH = null;

function openUpdate() {
  setUpdateUI({
    current: APP_META.version, latest: "v—", status: "Not checked yet.", checking: false,
    changelog: "—", canGet: false, footer: "You’re on the latest version."
  });
  new bootstrap.Modal($("#updateModal"), { backdrop: true, focus: true }).show();
}
updateOpenReleaseBtn?.addEventListener("click", () => {
  api.openExternal(`https://github.com/${APP_META.repo}/releases`);
});
updateCheckBtn?.addEventListener("click", async () => {
  setUpdateUI({ checking: true, status: "Checking releases…" });
  const r = await api.checkForUpdate();
  if (!r?.ok) {
    setUpdateUI({ checking:false, status: "Failed to check: " + (r?.error || "Unknown") });
    return;
  }
  UPDATE_INFO = r;
  if (badgeLatest)  badgeLatest.textContent = `Latest: ${r.latest}`;
  if (badgeCurrent) badgeCurrent.textContent = `Current: ${r.current}`;
  updateNotes.textContent = r.notes || "—";
  updateFooter.textContent = r.upToDate ? "You’re on the latest version." : `New version available: ${r.latest}`;
  setUpdateUI({ checking:false, status: r.upToDate ? "Already up to date." : "Update available.", canGet: !r.upToDate && !!r.asset });
});
api.onUpdateProgress((p) => {
  if (!p) return;
  if (typeof p.percent === "number") {
    setUpdateUI({ status: `Downloading… ${p.percent}%` });
  } else if (p.total) {
    const pct = Math.round((p.received / p.total) * 100);
    setUpdateUI({ status: `Downloading… ${pct}%` });
  } else {
    setUpdateUI({ status: `Downloading…` });
  }
});
updateGetBtn?.addEventListener("click", async () => {
  if (!UPDATE_INFO?.asset) return;
  if (!DOWNLOADED_PATH && updateGetBtn.disabled) return;

  // If not yet downloaded → download
  if (!DOWNLOADED_PATH) {
    setUpdateUI({ checking: true, status: "Starting download…" });
    updateGetLabel.textContent = "Downloading…";
    const res = await api.downloadUpdate({ url: UPDATE_INFO.asset.url, name: UPDATE_INFO.asset.name });
    setUpdateUI({ checking: false });
    if (!res?.ok) { setUpdateUI({ status: "Download failed: " + (res?.error || "Unknown") }); updateGetLabel.textContent = "Get update"; return; }
    DOWNLOADED_PATH = res.file;
    setUpdateUI({ status: "Download complete. Ready to install." });
    updateGetLabel.textContent = "Install & Restart";
    return;
  }

  // Already downloaded → install
  setUpdateUI({ checking: true, status: "Launching installer…" });
  const res2 = await api.installUpdate(DOWNLOADED_PATH);
  if (!res2?.ok) { setUpdateUI({ checking:false, status: "Install failed: " + (res2?.error || "Unknown") }); }
});

function setUpdateUI({ current, latest, status, checking, changelog, canGet, footer }) {
  if (badgeCurrent && current) badgeCurrent.textContent = `Current: ${current}`;
  if (badgeLatest && latest)   badgeLatest.textContent  = `Latest: ${latest}`;
  if (updateStatus && status)  updateStatus.textContent = status;
  if (updateSpinner && typeof checking === "boolean") updateSpinner.classList.toggle("d-none", !checking);
  if (updateNotes && changelog) updateNotes.textContent = changelog;
  if (typeof canGet === "boolean") updateGetBtn.disabled = !canGet;
  if (updateFooter && footer) updateFooter.textContent = footer;
}

/* ---------------- Init ---------------- */
initPopovers();
loadVersion();
addAdminBadge();
refreshDrives();
