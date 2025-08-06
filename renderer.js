/* global api, bootstrap */
const $ = (sel) => document.querySelector(sel);

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

/* ---------- Version state (from version.json via IPC) ---------- */
let APP_META = {
  name: "Swift Formatter PRO",
  version: "v—",
  channel: "stable",
  build: 0,
  releasedAt: null,
  repo: null,
  tagPrefix: "v"
};

async function loadVersion() {
  try {
    const v = await api.getVersion();
    APP_META = {
      name: v.name || "Swift Formatter PRO",
      version: (v.version ? `v${v.version}` : "v—"),
      channel: v.channel || "stable",
      build: v.build || 0,
      releasedAt: v.releasedAt || null,
      repo: v.repo || null,
      tagPrefix: v.tagPrefix || "v"
    };
    // Update About & Update badges/text
    const aboutVerEl = document.getElementById("aboutVersion");
    if (aboutVerEl) aboutVerEl.textContent = APP_META.version;
    const badgeCur = document.getElementById("badgeCurrent");
    if (badgeCur) badgeCur.textContent = `Current: ${APP_META.version}`;
  } catch (e) {
    // leave defaults
  }
}

/* ---------------- Window controls ---------------- */
btnUpdate?.addEventListener("click", openUpdate);
btnSettings?.addEventListener("click", openSettings);
btnAbout?.addEventListener("click", () => {
  try { new bootstrap.Modal(document.getElementById("aboutModal"), { backdrop: true, focus: true }).show(); } catch {}
});
btnMin?.addEventListener("click", () => api.minimize());
btnMax?.addEventListener("click", () => api.maximize());
btnClose?.addEventListener("click", () => api.close());

/* ---------------- Bootstrap popover init ---------------- */
function initPopovers() {
  try {
    document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
      // eslint-disable-next-line no-new
      new bootstrap.Popover(el, { container: 'body', sanitize: true });
    });
  } catch {}
}

/* ---------------- Links ---------------- */
docsLinkBtn?.addEventListener("click", () => api.openExternal("https://en.wikipedia.org/wiki/Disk_formatting"));
const aboutRepoBtn = document.getElementById("aboutRepo");
aboutRepoBtn?.addEventListener("click", () => {
  const repo = APP_META.repo ? `https://github.com/${APP_META.repo}` : "https://github.com/";
  api.openExternal(repo);
});

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

/* ---------------- Progress stream from main ---------------- */
api.onFormatProgress((msg) => {
  appendOutput(msg);
  tryParsePercent(msg);
});

/* ---------------- Utils ---------------- */
function loadSettings() {
  try {
    const raw = localStorage.getItem("ufp.settings");
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

  // Settings modal fields if present
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
  const units = ["B","KB","MB","GB","TB","PB"];
  let i = 0, v = Number(n);
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
function displayDevice(d) {
  const mount = d.mountpoints?.[0];
  return mount ? `${d.device} | ${mount}` : d.device;
}

/* ---------------- Drive list rendering ---------------- */
function renderDriveList(list) {
  const listEl = driveListEl; if (!listEl) return;
  listEl.innerHTML = "";
  const removable = list.filter(d => d.isUSB || d.isRemovable || (d.mountpoints && d.mountpoints.length));
  if (driveCountBadge) driveCountBadge.textContent = String(removable.length);

  for (const d of removable) {
    const item = document.createElement("div");
    item.className = "drive-item";

    const radioWrap = document.createElement("div");
    radioWrap.className = "drive-radio";
    const r = document.createElement("input");
    r.type = "radio"; r.name = "devRadio"; r.className = "form-check-input";
    r.checked = selected && selected.device === d.device;
    radioWrap.appendChild(r);

    const avatar = document.createElement("div");
    avatar.className = "drive-avatar";
    avatar.innerHTML = `<i class="bi bi-usb-drive"></i>`;

    const main = document.createElement("div");
    main.className = "drive-main";
    const title = document.createElement("div");
    title.className = "drive-title";
    title.textContent = d.description || "Drive";
    const sub = document.createElement("div");
    sub.className = "drive-sub";
    sub.textContent = d.device;
    main.append(title, sub);

    const meta = document.createElement("div");
    meta.className = "drive-meta";
    const sizePill = document.createElement("span");
    sizePill.className = "pill size";
    sizePill.textContent = prettyBytes(d.size);
    const mountPill = document.createElement("span");
    mountPill.className = "pill mount";
    mountPill.innerHTML = `<i class="bi bi-hdd-stack"></i> ${mountLabel(d.mountpoints)}`;
    const busPill = document.createElement("span");
    busPill.className = "pill usb";
    busPill.innerHTML = `<span class="dot"></span> ${d.busType || "USB"}`;
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

/* ---------------- Data ---------------- */
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

/* ---------------- Submit (real format) ---------------- */
formatForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
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

  try {
    await updatePreview();
    appendOutput(`Command plan:\n  ${cmdPreviewEl.textContent}\n\n`);
  } catch {}

  appendOutput("⚠️ Executing real format...\n");
  setIndeterminate();
  try {
    const res = await api.formatDrive({
      device: selected.device,
      fsType: fsTypeEl.value,
      label: labelEl.value.trim(),
      quick: !!quickEl.checked,
      simulate: false,
      mountpoints: selected.mountpoints
    });
    if (res && res.ok) { setPercent(100); appendOutput("\n✅ Format completed successfully.\n"); }
    else { appendOutput("\n❌ The formatter did not report success.\n"); }
  } catch (err) {
    appendOutput(`\n❌ Error: ${err.message}\n`);
  }
});

/* ---------------- Settings modal handlers ---------------- */
function openSettings() {
  applySettingsToUI();
  try { new bootstrap.Modal(document.getElementById("settingsModal"), { backdrop: true, focus: true }).show(); } catch {}
}
const settingsForm = document.getElementById("settingsForm");
settingsForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  SETTINGS.defaultFs       = document.getElementById("setDefaultFS").value;
  SETTINGS.quickDefault    = !!document.getElementById("setQuickDefault").checked;
  SETTINGS.requireConfirm  = !!document.getElementById("setRequireConfirm").checked;
  SETTINGS.autofillConfirm = !!document.getElementById("setAutofillConfirm").checked;
  SETTINGS.glowHover       = !!document.getElementById("setGlowHover").checked;

  if (!ALLOWED_FS.includes(SETTINGS.defaultFs)) SETTINGS.defaultFs = "exFAT";
  saveSettings();
  applySettingsToUI();

  fsTypeEl.value = SETTINGS.defaultFs;
  quickEl.checked = SETTINGS.quickDefault;

  const modalEl = document.getElementById("settingsModal");
  const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
  modal.hide();
});

/* ---------------- Update modal (layout stubs, use JSON version) ---------------- */
function openUpdate() {
  setUpdateUI({
    current: APP_META.version,
    latest: "v—",
    status: "Not checked yet.",
    checking: false,
    changelog: "—",
    canGet: false,
    footer: "You’re on the latest version."
  });
  try { new bootstrap.Modal(document.getElementById("updateModal"), { backdrop: true, focus: true }).show(); } catch {}
}

const updateCheckBtn = document.getElementById("updateCheckNow");
const updateOpenReleaseBtn = document.getElementById("updateOpenRelease");
const updateGetBtn = document.getElementById("updateGetBtn");

updateCheckBtn?.addEventListener("click", () => {
  // Visual demo only. Later: compare version.json with GitHub release tag.
  setUpdateUI({ checking: true, status: "Checking releases…" });
  setTimeout(() => {
    setUpdateUI({
      current: APP_META.version,
      latest: "v1.1.0",
      checking: false,
      status: "Update available.",
      changelog:
`# v1.1.0
- New: Settings dialog and glow toggle
- UI: Refined Windows-only format options
- Fix: Stability improvements in drive detection
`,
      canGet: true,
      footer: "New version available: v1.1.0",
    });
  }, 900);
});

updateOpenReleaseBtn?.addEventListener("click", () => {
  const url = APP_META.repo ? `https://github.com/${APP_META.repo}/releases` : "https://github.com/";
  api.openExternal(url);
});
updateGetBtn?.addEventListener("click", () => { if (updateGetBtn) updateGetBtn.disabled = true; });

function setUpdateUI({ current, latest, status, checking, changelog, canGet, footer }) {
  const badgeCur = document.getElementById("badgeCurrent");
  const badgeLat = document.getElementById("badgeLatest");
  const statTxt  = document.getElementById("updateStatusText");
  const spin     = document.getElementById("updateSpinner");
  const notes    = document.getElementById("updateChangelog");
  const getBtn   = document.getElementById("updateGetBtn");
  const footNote = document.getElementById("updateFooterNote");

  if (badgeCur && current) badgeCur.textContent = `Current: ${current}`;
  if (badgeLat && latest)  badgeLat.textContent = `Latest: ${latest}`;
  if (statTxt && status)   statTxt.textContent = status;
  if (spin && typeof checking === "boolean") spin.classList.toggle("d-none", !checking);
  if (notes && changelog)  notes.textContent = changelog;
  if (getBtn && typeof canGet === "boolean") getBtn.disabled = !canGet;
  if (footNote && footer)  footNote.textContent = footer;
}

/* ---------------- Init ---------------- */
initPopovers();
loadVersion();       // <-- get version from version.json
refreshDrives();
