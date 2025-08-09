/*  renderer.js — Swift Formatter PRO
    =====================================================================
    Front-end controller (resilient build)
    • Lists removable drives + volumes (fs/size/free)
    • Live PowerShell command preview
    • Streams formatter output & progress
    • Auto-refreshes on device changes (WMI + polling fallback)
    • Client-side guards + FAT32 notice
    • Modern contextual menu
    • Drive "Details" sheet with mosaic usage map (now wired to correct IDs)
    © 2025 Robin Doak
===================================================================== */

/* ------------------------------------------------------------------
   DOM helper
------------------------------------------------------------------- */
const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------
   ELEMENT REFERENCES
------------------------------------------------------------------- */
const driveListEl = $("#driveList");
const driveLoaderEl = $("#driveLoader");
const driveCountBadge = $("#driveCount");
const refreshBtn = $("#refresh");

const fsTypeEl = $("#fsType");
const fsHelpTextEl = $("#fsHelpText");
const fat32NoticeEl = $("#fat32Notice");
const labelEl = $("#label");
const quickEl = $("#quick");
const confirmTextEl = $("#confirmText");
const selectedDeviceDisplay = $("#selectedDeviceDisplay");
const clearSelectionBtn = $("#clearSelection");
const cmdPreviewEl = $("#cmdPreview");

const guardMsgEl = $("#guardMsg");

const outputEl = $("#output");
const progressBar = $("#progressBar");
const percentLabel = $("#percentLabel");
const formatForm = $("#formatForm");
const formatBtn = $("#formatBtn");

const btnUpdate = $("#btn-update");
const btnSettings = $("#btn-settings");
const btnAbout = $("#btn-about");
const btnMin = $("#btn-min");
const btnMax = $("#btn-max");
const btnClose = $("#btn-close");

const updateCheckBtn = $("#updateCheckNow");
const updateGetBtn = $("#updateGetBtn");
const updateGetLabel = $("#updateGetLabel");
const updateOpenRelBtn = $("#updateOpenRelease");
const badgeCurrent = $("#badgeCurrent");
const badgeLatest = $("#badgeLatest");
const updateStatus = $("#updateStatusText");
const updateSpinner = $("#updateSpinner");
const updateNotes = $("#updateChangelog");
const updateFooter = $("#updateFooterNote");

const settingsForm = $("#settingsForm");
const setGhToken = $("#setGhToken");

const docsLinkBtn = $("#docsLink");

/* Details sheet refs — match IDs in index.html */
const detailsSheetEl   = $("#detailsSheet");
const detailsLetterEl  = $("#detailsLetter");
const usageMapEl       = $("#usageMap");
const detailsLabelEl   = $("#detailsLabel");
const detailsFSEl      = $("#detailsFS");
const detailsCapEl     = $("#detailsCap");
const detailsUsedEl    = $("#detailsUsed");
const detailsFreeEl    = $("#detailsFree");
const detailsBusEl     = $("#detailsBus");

/* Utility: are details elements present? */
function detailsAvailable() {
  return !!(
    detailsSheetEl &&
    detailsLetterEl &&
    usageMapEl &&
    detailsLabelEl &&
    detailsFSEl &&
    detailsCapEl &&
    detailsUsedEl &&
    detailsFreeEl &&
    detailsBusEl
  );
}

/* ------------------------------------------------------------------
   SETTINGS (localStorage)
------------------------------------------------------------------- */
const ALLOWED_FS = ["exFAT", "FAT32", "NTFS"];
const DEFAULT_SETTINGS = {
  defaultFs: "exFAT",
  quickDefault: true,
  requireConfirm: true,
  autofillConfirm: false,
  glowHover: true
};
let SETTINGS = loadSettings();
applySettingsToUI();

/* ------------------------------------------------------------------
   VERSION META
------------------------------------------------------------------- */
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

    $("#aboutVersion")?.textContent && ($("#aboutVersion").textContent = APP_META.version);
    $("#aboutChannel")?.textContent && ($("#aboutChannel").textContent = APP_META.channel);
    $("#aboutReleased")?.textContent && ($("#aboutReleased").textContent = APP_META.releasedAt ?
      new Date(APP_META.releasedAt).toLocaleDateString() : "—");
    if (badgeCurrent) badgeCurrent.textContent = `Current: ${APP_META.version}`;
  } catch {}
}

/* ------------------------------------------------------------------
   ADMIN BADGE
------------------------------------------------------------------- */
async function addAdminBadge() {
  try {
    const isAdmin = await api.isAdmin();
    const badge = document.createElement("span");
    badge.className = `badge ms-2 ${isAdmin ? "bg-success" : "bg-secondary"}`;
    badge.textContent = isAdmin ? "Admin" : "Standard";
    document.querySelector(".app-title").appendChild(badge);
  } catch {}
}

/* ------------------------------------------------------------------
   TITLE-BAR BUTTONS
------------------------------------------------------------------- */
btnUpdate?.addEventListener("click", openUpdate);
btnSettings?.addEventListener("click", openSettings);
btnAbout?.addEventListener("click", () => new bootstrap.Modal($("#aboutModal")).show());
btnMin?.addEventListener("click", () => api.minimize());
btnMax?.addEventListener("click", () => api.maximize());
btnClose?.addEventListener("click", () => api.close());

/* ------------------------------------------------------------------
   POPOVERS
------------------------------------------------------------------- */
document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
  new bootstrap.Popover(el, {
    container: "body",
    sanitize: true
  });
});

/* ------------------------------------------------------------------
   EXTERNAL LINK
------------------------------------------------------------------- */
docsLinkBtn?.addEventListener("click", () =>
  api.openExternal("https://en.wikipedia.org/wiki/Disk_formatting"));
$("#aboutRepo")?.addEventListener("click", () =>
  api.openExternal(`https://github.com/${APP_META.repo}`));

/* ------------------------------------------------------------------
   STATE
------------------------------------------------------------------- */
let drives = [];
let selected = null;
let ctxEl = null; // contextual menu root
let formatInFlight = false;

/* Remember last selection by device id */
function selectedKey(d) {
  return d ? `${d.device}|${(d.mountpoints||[])[0]||""}` : "";
}
let lastSelectedKey = "";

/* ------------------------------------------------------------------
   HELPERS
------------------------------------------------------------------- */
function loadSettings() {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...(JSON.parse(localStorage.getItem("sf.settings")) || {})
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  localStorage.setItem("sf.settings", JSON.stringify(SETTINGS));
}

function applySettingsToUI() {
  if (!ALLOWED_FS.includes(SETTINGS.defaultFs)) SETTINGS.defaultFs = "exFAT";
  fsTypeEl && (fsTypeEl.value = SETTINGS.defaultFs);
  quickEl && (quickEl.checked = SETTINGS.quickDefault);
  document.body.classList.toggle("no-glow", !SETTINGS.glowHover);

  $("#setDefaultFS") && ($("#setDefaultFS").value = SETTINGS.defaultFs);
  $("#setQuickDefault") && ($("#setQuickDefault").checked = SETTINGS.quickDefault);
  $("#setRequireConfirm") && ($("#setRequireConfirm").checked = SETTINGS.requireConfirm);
  $("#setAutofillConfirm") && ($("#setAutofillConfirm").checked = SETTINGS.autofillConfirm);
  $("#setGlowHover") && ($("#setGlowHover").checked = SETTINGS.glowHover);

  updateFsHelp();
}

/* pretty bytes */
function prettyBytes(n) {
  if (!n && n !== 0) return "—";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  let i = 0, v = Number(n);
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i?1:0)} ${u[i]}`;
}

/* terminal helpers */
function appendOutput(msg) {
  if (!outputEl) return;
  outputEl.textContent = (outputEl.textContent + msg).slice(-4000);
  outputEl.scrollTop = outputEl.scrollHeight;
}

function parsePercent(t) {
  const m = t.match(/(\d{1,3})%/);
  if (m) setPercent(+m[1]);
}

function setIndeterminate() {
  if (!progressBar || !percentLabel) return;
  progressBar.classList.add("progress-bar-striped", "progress-bar-animated");
  progressBar.style.width = "100%";
  percentLabel.textContent = "Working…";
}

function setPercent(p) {
  if (!progressBar || !percentLabel) return;
  progressBar.classList.remove("progress-bar-animated");
  progressBar.style.width = `${p}%`;
  percentLabel.textContent = `${p}%`;
}

/* guards */
function showGuard(message, level = "danger") {
  if (!guardMsgEl) return;
  guardMsgEl.classList.remove("d-none", "alert-danger", "alert-warning", "alert-info", "alert-success");
  guardMsgEl.classList.add(`alert-${level}`);
  guardMsgEl.textContent = message;
}

function clearGuard() {
  if (!guardMsgEl) return;
  guardMsgEl.classList.add("d-none");
  guardMsgEl.textContent = "";
  guardMsgEl.classList.remove("alert-danger", "alert-warning", "alert-info", "alert-success");
}

/* FS microcopy + FAT32 notice */
function updateFsHelp() {
  if (!fsHelpTextEl || !fsTypeEl) return;
  const fs = fsTypeEl.value;
  let text = "";
  if (fs === "exFAT") text = "exFAT — modern and cross-platform (Windows/macOS/Linux). Supports files > 4 GB.";
  else if (fs === "FAT32") text = "FAT32 — highly compatible, but 4 GB per-file limit. Windows cannot format > 32 GB.";
  else text = "NTFS — Windows features (permissions/compression), great for large files; limited macOS write support.";
  fsHelpTextEl.textContent = text;
}
const THIRTY_TWO_GIB = 32 * 1024 * 1024 * 1024;

function updateFat32Notice() {
  if (!fat32NoticeEl) return;
  if (!selected) return fat32NoticeEl.classList.add("d-none");
  const vol = (selected.volumes || [])[0];
  const show = fsTypeEl && fsTypeEl.value === "FAT32" && (vol?.size || selected.size || 0) > THIRTY_TWO_GIB;
  fat32NoticeEl.classList.toggle("d-none", !show);
}

function hideFat32Notice() {
  fat32NoticeEl?.classList.add("d-none");
}

/* ------------------------------------------------------------------
   DRIVE REFRESH + RENDER
------------------------------------------------------------------- */

/* Keep loader centered by letting drive-container own the space */
function setListLoading(isLoading) {
  if (!driveLoaderEl || !driveListEl) return;
  driveLoaderEl.classList.toggle("hidden", !isLoading);
}

refreshBtn?.addEventListener("click", () => refreshDrives({ keepSelection: true, manual: true }));

clearSelectionBtn?.addEventListener("click", () => {
  selected = null;
  lastSelectedKey = "";
  selectedDeviceDisplay && (selectedDeviceDisplay.textContent = "None");
  confirmTextEl && (confirmTextEl.value = "");
  hideFat32Notice();
  clearGuard();
  renderDriveList(drives);
  updatePreview();
  renderDetails(null);
});

/* ── UPDATED: no auto-selection. Only restore a previous selection if still present. */
async function refreshDrives({ keepSelection = true, manual = false } = {}) {
  try {
    setListLoading(true);
    if (manual) appendOutput("🔍 Scanning for removable drives…\n");

    const list = await api.listDrives() || [];
    drives = list;
    driveCountBadge && (driveCountBadge.textContent = list.length);

    // Restore prior selection if requested and available
    if (keepSelection && lastSelectedKey) {
      const found = list.find(d => selectedKey(d) === lastSelectedKey);
      selected = found || null;
    } else {
      selected = null;
      lastSelectedKey = "";
    }

    // If previously selected device disappeared, clear selection
    if (selected && !list.some(d => selectedKey(d) === lastSelectedKey)) {
      selected = null;
      lastSelectedKey = "";
    }

    renderDriveList(list);

    if (selected) {
      selectedDeviceDisplay && (selectedDeviceDisplay.textContent = selected.device);
      if (SETTINGS.autofillConfirm && confirmTextEl) {
        confirmTextEl.value = (selected.mountpoints || [""])[0] || "";
      }
      updateFat32Notice();
      renderDetails(selected);
    } else {
      selectedDeviceDisplay && (selectedDeviceDisplay.textContent = "None");
      confirmTextEl && (confirmTextEl.value = "");
      hideFat32Notice();
      renderDetails(null);
    }

    updatePreview();

    if (manual) appendOutput(`✅ Found ${list.length} device(s).\n`);
  } catch (e) {
    appendOutput(`❌ Error listing drives: ${e.message}\n`);
  } finally {
    setListLoading(false);
  }
}

function renderDriveList(list) {
  if (!driveListEl) return;
  driveListEl.innerHTML = "";
  list.forEach(d => {
    const row = document.createElement("div");
    row.className = "drive-item" + (selected?.device === d.device ? " selected" : "");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "drv";
    radio.className = "form-check-input";
    radio.checked = selected?.device === d.device;

    const mainLabel = escapeHtml(d.description || "Drive");
    const sub = escapeHtml((d.volumeLabel ? `${d.volumeLabel} · ` : "") + d.device);
    const firstLetter = (d.mountpoints || ["—"])[0];

    row.innerHTML = `
      <div class="drive-radio"></div>
      <div class="drive-avatar"><i class="bi bi-usb-drive"></i></div>
      <div class="drive-main">
        <div class="drive-title">${mainLabel}</div>
        <div class="drive-sub">${sub}</div>
      </div>
      <div class="drive-meta">
        <span class="pill size">${prettyBytes(d.size)}</span>
        <span class="pill mount"><i class="bi bi-hdd-stack"></i> ${firstLetter || "—"}</span>
        <span class="pill usb"><span class="dot"></span> ${escapeHtml(d.busType || "USB")}</span>
      </div>
    `;
    row.querySelector(".drive-radio").appendChild(radio);

    const choose = () => {
      selected = d;
      lastSelectedKey = selectedKey(d);
      document.querySelectorAll(".drive-item").forEach(el => el.classList.remove("selected"));
      row.classList.add("selected");
      radio.checked = true;
      selectedDeviceDisplay && (selectedDeviceDisplay.textContent = d.device);
      if (SETTINGS.autofillConfirm && confirmTextEl) confirmTextEl.value = firstLetter || "";
      clearGuard();
      updatePreview();
      updateFat32Notice();
      renderDetails(d);
    };
    row.addEventListener("click", e => e.target === radio ? null : choose());
    radio.addEventListener("change", choose);

    // right-click = contextual
    row.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      openContextMenu(ev.clientX, ev.clientY, d);
    });

    driveListEl.appendChild(row);
  });
}

/* ------------------------------------------------------------------
   COMMAND PREVIEW
------------------------------------------------------------------- */
async function updatePreview() {
  if (!cmdPreviewEl) return;
  if (!selected) {
    cmdPreviewEl.textContent = "Select a device…";
    return;
  }
  try {
    const { plan } = await api.formatDrive({
      device: selected.device,
      fsType: fsTypeEl?.value || "exFAT",
      label: (labelEl?.value || "").trim(),
      quick: !!(quickEl?.checked),
      simulate: true,
      mountpoints: selected.mountpoints
    });
    cmdPreviewEl.textContent = `${plan.cmd} ${plan.args.map(a=>/\s/.test(a)?`"${a}"`:a).join(" ")}`;
  } catch {
    cmdPreviewEl.textContent = "Preview unavailable.";
  }
}

/* ------------------------------------------------------------------
   ELEVATION FLOW
------------------------------------------------------------------- */
async function showElevationModal() {
  return new Promise(res => {
    const modalEl = $("#elevateModal");
    if (!modalEl) return res(false);

    const ok = $("#elevateConfirmBtn");
    const cancel = $("#elevateCancelBtn");
    const spin = $("#elevateSpinner");
    const status = $("#elevateStatus");

    spin?.classList.add("d-none");
    if (ok && cancel) ok.disabled = cancel.disabled = false;
    status && (status.textContent = "Formatting requires admin rights.");

    const modal = new bootstrap.Modal(modalEl, { backdrop: "static" });

    modalEl.addEventListener("hidden.bs.modal", () => res(false), { once: true });
    cancel?.addEventListener("click", () => modal.hide(), { once: true });

    ok?.addEventListener("click", async () => {
      if (ok && cancel) ok.disabled = cancel.disabled = true;
      spin?.classList.remove("d-none");
      status && (status.textContent = "Requesting elevation…");
      const okd = await api.relaunchElevated();
      if (!okd) {
        spin?.classList.add("d-none");
        status && (status.textContent = "Could not relaunch. Run as Admin manually.");
        if (ok && cancel) ok.disabled = cancel.disabled = false;
        return;
      }
      status && (status.textContent = "Launching elevated…");
      setTimeout(() => modal.hide(), 500);
    }, { once: true });

    modal.show();
  });
}
async function ensureAdmin() {
  return (await api.isAdmin()) || await showElevationModal();
}

/* ------------------------------------------------------------------
   SAFETY CHECKS
------------------------------------------------------------------- */
function clientGuardsBeforeFormat() {
  clearGuard();

  if (!selected) {
    showGuard("Select a drive to format.");
    return false;
  }
  if (selected.isSystem) {
    showGuard("System disks cannot be formatted from here.");
    return false;
  }
  if (!selected.isUSB) {
    showGuard("Only USB/removable drives can be formatted.");
    return false;
  }

  const tgt = (selected.mountpoints || [""])[0]?.toUpperCase() || "";
  if (SETTINGS.requireConfirm &&
      (confirmTextEl?.value || "").trim().toUpperCase() !== tgt) {
    showGuard(`Type ${tgt || "the drive letter"} to confirm.`);
    return false;
  }
  const vol = (selected.volumes || [])[0];
  const size = vol?.size ?? selected.size ?? 0;
  if (fsTypeEl && fsTypeEl.value === "FAT32" && size > THIRTY_TWO_GIB) {
    showGuard("Windows cannot format FAT32 volumes larger than 32 GB. Choose exFAT or NTFS.", "warning");
    return false;
  }
  return true;
}

/* ------------------------------------------------------------------
   FORMAT SUBMISSION
------------------------------------------------------------------- */
formatForm?.addEventListener("submit", async e => {
  e.preventDefault();
  if (formatInFlight) return;

  if (!(await ensureAdmin())) return;
  if (!clientGuardsBeforeFormat()) return;

  setUiBusy(true);

  outputEl && (outputEl.textContent = "");
  progressBar && (progressBar.style.width = "0%");

  await updatePreview();

  appendOutput(`🧪 Command plan:\n  ${cmdPreviewEl?.textContent || ""}\n\n⚠️ Executing…\n`);
  setIndeterminate();

  formatInFlight = true;
  formatBtn && (formatBtn.disabled = true);

  try {
    const r = await api.formatDrive({
      device: selected.device,
      fsType: fsTypeEl?.value || "exFAT",
      label: (labelEl?.value || "").trim(),
      quick: !!(quickEl?.checked),
      simulate: false,
      mountpoints: selected.mountpoints
    });
    if (r.ok) {
      setPercent(100);
      appendOutput("\n✅ Format completed.\n");
      await refreshDrives({ keepSelection: true });
    } else {
      appendOutput("\n❌ The formatter did not report success.\n");
    }
  } catch (err) {
    appendOutput(`\n❌ Error: ${err.message}\n`);
  } finally {
    formatInFlight = false;
    formatBtn && (formatBtn.disabled = false);
    setUiBusy(false);
  }
});

function setUiBusy(b) {
  document.body.classList.toggle("app-busy", b);
  const leftPanel = document.querySelector(".panel .drive-container")?.parentElement;
  leftPanel && leftPanel.classList.toggle("ui-disabled", b);
}

/* ------------------------------------------------------------------
   SETTINGS MODAL
------------------------------------------------------------------- */
function openSettings() {
  applySettingsToUI();
  const m = $("#settingsModal");
  m && new bootstrap.Modal(m).show();
}

settingsForm?.addEventListener("submit", async e => {
  e.preventDefault();
  SETTINGS.defaultFs = $("#setDefaultFS")?.value || "exFAT";
  SETTINGS.quickDefault = !!$("#setQuickDefault")?.checked;
  SETTINGS.requireConfirm = !!$("#setRequireConfirm")?.checked;
  SETTINGS.autofillConfirm = !!($("#setAutofillConfirm")?.checked);
  SETTINGS.glowHover = !!($("#setGlowHover")?.checked);
  saveSettings();
  applySettingsToUI();

  const tok = (setGhToken?.value || "").trim();
  if (tok) {
    const r = await api.saveGitHubToken(tok);
    if (!r.ok) alert("Token save failed: " + r.error);
    setGhToken.value = "";
  }
  const inst = $("#settingsModal") && bootstrap.Modal.getInstance($("#settingsModal"));
  inst?.hide();
});

/* ------------------------------------------------------------------
   UPDATE MODAL
------------------------------------------------------------------- */
let UPDATE_INFO = null;
let DOWNLOADED_PATH = null;

function setUpdateUI({ current, latest, status, checking, changelog, canGet, footer }) {
  if (current && badgeCurrent) badgeCurrent.textContent = `Current: ${current}`;
  if (latest && badgeLatest) badgeLatest.textContent = `Latest: ${latest}`;
  if (status && updateStatus) updateStatus.textContent = status;
  if (typeof checking === "boolean" && updateSpinner)
    updateSpinner.classList.toggle("d-none", !checking);
  if (changelog && updateNotes) updateNotes.innerHTML = changelog;
  if (typeof canGet === "boolean" && updateGetBtn) updateGetBtn.disabled = !canGet;
  if (footer !== undefined && updateFooter) updateFooter.textContent = footer;
}

async function runUpdateCheck() {
  setUpdateUI({ checking: true, status: "Checking releases…" });
  const r = await api.checkForUpdate();
  if (!r.ok) {
    setUpdateUI({ checking: false, status: "Failed: " + (r.error || "unknown") });
    return;
  }
  UPDATE_INFO = r;
  const html = renderReleaseMarkdown(r.notes || "—");
  setUpdateUI({
    current: r.current,
    latest: r.latest,
    checking: false,
    status: r.upToDate ? "Already up to date." : "Update available.",
    changelog: html,
    canGet: !r.upToDate && !!r.asset,
    footer: r.upToDate ? "You’re on the latest version." : `New version: ${r.latest}`
  });
}

function openUpdate() {
  DOWNLOADED_PATH = null;
  UPDATE_INFO = null;
  setUpdateUI({
    current: APP_META.version,
    latest: "v—",
    status: "Preparing update check…",
    checking: false,
    changelog: "—",
    canGet: false,
    footer: ""
  });
  const modal = $("#updateModal") && new bootstrap.Modal($("#updateModal"));
  modal?.show();
  setTimeout(runUpdateCheck, 60);
}
updateCheckBtn?.addEventListener("click", runUpdateCheck);
updateOpenRelBtn?.addEventListener("click", () => api.openExternal(`https://github.com/${APP_META.repo}/releases`));
api.onUpdateProgress?.(p => { if (p.percent != null) setUpdateUI({ status: `Downloading… ${p.percent}%` }); });
updateGetBtn?.addEventListener("click", async () => {
  if (!UPDATE_INFO?.asset) return;
  if (!DOWNLOADED_PATH) {
    setUpdateUI({ checking: true, status: "Starting download…" });
    if (updateGetLabel) updateGetLabel.textContent = "Downloading…";
    const r = await api.downloadUpdate({ url: UPDATE_INFO.asset.url, name: UPDATE_INFO.asset.name });
    setUpdateUI({ checking: false });
    if (!r.ok) {
      setUpdateUI({ status: "Download failed: " + r.error });
      if (updateGetLabel) updateGetLabel.textContent = "Get update";
      return;
    }
    DOWNLOADED_PATH = r.file;
    setUpdateUI({ status: "Download complete.", canGet: true });
    if (updateGetLabel) updateGetLabel.textContent = "Install & Restart";
    return;
  }
  setUpdateUI({ checking: true, status: "Launching installer…" });
  const r = await api.installUpdate(DOWNLOADED_PATH);
  if (!r.ok) setUpdateUI({ checking: false, status: "Install failed: " + r.error });
});

/* minimal but robust markdown → HTML for release notes (XSS-safe) */
function renderReleaseMarkdown(md) {
  if (!md) return "<p>—</p>";

  // ---------- helpers ----------
  const esc = (s) =>
    String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : "#");

  const fmtInline = (s) => {
    // inline code
    s = s.replace(/`([^`]+)`/g, (_m, c) => `<code>${esc(c)}</code>`);
    // links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) =>
      `<a href="${safeUrl(u.trim())}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`
    );
    // bold (**…**)
    s = s.replace(/\*\*([^\*]+)\*\*/g, (_m, t) => `<strong>${esc(t)}</strong>`);
    // italic (*…*) — simplified to avoid bold overlap
    s = s.replace(/(^|[\s\(\[])_?(\*)([^*\n]+)\2/g, (_m, pre, _a, t) => `${pre}<em>${esc(t)}</em>`);
    // typographic en-dash for " -- "
    s = s.replace(/(^|\s)--(\s|$)/g, "$1&ndash;$2");
    return s;
  };

  // Normalize newlines
  md = String(md).replace(/\r\n?/g, "\n");

  // ---------- protect fenced code blocks ----------
  const codeFences = [];
  md = md.replace(/```([\s\S]*?)```/g, (_m, code) => {
    const i = codeFences.push(`<pre><code>${esc(code.trim())}</code></pre>`) - 1;
    return `@@CODEFENCE_${i}@@`;
  });

  // Escape everything else first
  md = esc(md);

  // Headings (H1–H3)
  md = md
    .replace(/^###\s+(.+)$/gm, "<h3>$1</h3>")
    .replace(/^##\s+(.+)$/gm, "<h2>$1</h2>")
    .replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Build lists/paragraphs line-by-line
  const lines = md.split("\n");
  let html = "";
  const listStack = []; // stack of {indent}
  let inPara = false;

  const closePara = () => {
    if (inPara) { html += "</p>"; inPara = false; }
  };
  const closeListsTo = (indent) => {
    while (listStack.length && listStack[listStack.length - 1].indent >= indent) {
      html += `</li></ul>`;
      listStack.pop();
    }
  };

  for (let raw of lines) {
    const hardBreak = /\s\s$/.test(raw);          // two spaces at EOL => <br>
    const line = raw.replace(/\s+$/g, "");

    if (!line.trim()) {                           // blank line
      closePara();
      continue;
    }

    // List item? (2-space indents for nesting)
    const m = line.match(/^(\s*)([-*+])\s+(.*)$/);
    if (m) {
      const indent = Math.floor((m[1] || "").length / 2);
      let text = m[3];

      // detect semantic icons at start and map to classes (strip markers)
      // negatives (x/cross/❌), positives (check/✅)
      let cls = "";
      if (/^(\[x\]|x|✖|❌)\s+/i.test(text)) {
        cls = "neg"; text = text.replace(/^(\[x\]|x|✖|❌)\s+/i, "");
      } else if (/^(\[✓\]|✓|✔|✅)\s+/i.test(text)) {
        cls = "pos"; text = text.replace(/^(\[✓\]|✓|✔|✅)\s+/i, "");
      }

      closePara();

      // open/continue/close list levels
      if (!listStack.length || indent > listStack[listStack.length - 1].indent) {
        html += `<ul><li${cls ? ` class="${cls}"` : ""}>`;
        listStack.push({ indent });
      } else if (indent === listStack[listStack.length - 1].indent) {
        html += `</li><li${cls ? ` class="${cls}"` : ""}>`;
      } else {
        closeListsTo(indent);
        if (!listStack.length || listStack[listStack.length - 1].indent !== indent) {
          html += `<ul><li${cls ? ` class="${cls}"` : ""}>`;
          listStack.push({ indent });
        } else {
          html += `</li><li${cls ? ` class="${cls}"` : ""}>`;
        }
      }

      html += fmtInline(text);
      if (hardBreak) html += "<br/>";
      continue;
    }

    // Not a list: close lists completely
    if (listStack.length) closeListsTo(-1);

    // Already-converted heading line?
    if (/^<h[1-3]>/.test(line)) {
      closePara();
      html += line;
      continue;
    }

    // Paragraph
    if (!inPara) { html += "<p>"; inPara = true; }
    html += fmtInline(line);
    html += hardBreak ? "<br/>" : " ";
  }

  closePara();
  if (listStack.length) closeListsTo(-1);

  // restore fenced code blocks
  html = html.replace(/@@CODEFENCE_(\d+)@@/g, (_m, i) => codeFences[+i] || "");

  return html.replace(/\s+<\/p>/g, "</p>").trim() || "<p>—</p>";
}



/* ------------------------------------------------------------------
   CONTEXTUAL MENU
------------------------------------------------------------------- */
function openContextMenu(x, y, drv) {
  closeContextMenu();
  const letter = (drv.mountpoints || [])[0] || "";
  const label = escapeHtml(drv.description || "Drive options");

  ctxEl = document.createElement("div");
  ctxEl.className = "ctx-menu";
  ctxEl.style.left = `${x}px`;
  ctxEl.style.top = `${y}px`;
  ctxEl.innerHTML = `
    <div class="ctx-header">
      <i class="bi bi-usb-drive"></i>
      <div class="ctx-title">${label}</div>
    </div>
    <div class="ctx-items">
      <div class="ctx-item" id="ctxOpen"><i class="bi bi-folder2-open"></i> Open in Explorer</div>
      <div class="ctx-divider"></div>
      <div class="ctx-item" id="ctxEject"><i class="bi bi-eject-fill"></i> Safely Eject</div>
    </div>
  `;
  document.body.appendChild(ctxEl);

  const offClick = (ev) => { if (ctxEl && !ctxEl.contains(ev.target)) closeContextMenu(); };
  requestAnimationFrame(() => document.addEventListener("mousedown", offClick, { once: true }));

  $("#ctxOpen")?.addEventListener("click", async () => {
    closeContextMenu();
    if (formatInFlight) return;
    if (letter) await api.openDrive(letter.replace(":", ""));
  });
  $("#ctxEject")?.addEventListener("click", async () => {
    closeContextMenu();
    if (formatInFlight || !letter) return;
    appendOutput(`⏏️  Ejecting ${letter}…\n`);
    const r = await api.ejectDrive(letter);
    if (r.ok) {
      appendOutput("✅ Eject complete. Safe to remove.\n");
      await refreshDrives({ keepSelection: false });
    } else {
      appendOutput(`❌ Eject failed: ${r.error}\n`);
    }
  });
}

function closeContextMenu() { if (ctxEl) { ctxEl.remove(); ctxEl = null; } }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeContextMenu(); });

/* ------------------------------------------------------------------
   DETAILS SHEET (now matches HTML IDs)
------------------------------------------------------------------- */
function renderDetails(drv) {
  if (!detailsAvailable()) return;

  // Show/hide sheet
  if (detailsSheetEl) detailsSheetEl.hidden = !drv;

  // Clear usage map
  usageMapEl.innerHTML = "";

  if (!drv) {
    detailsLetterEl.textContent = "—";
    detailsLabelEl.textContent = "—";
    detailsFSEl.textContent = "—";
    detailsCapEl.textContent = "—";
    detailsUsedEl.textContent = "—";
    detailsFreeEl.textContent = "—";
    detailsBusEl.textContent = "—";
    return;
  }

  const letter = (drv.mountpoints || [])[0] || "—";
  const vol = (drv.volumes || []).find(v => v.letter?.toUpperCase() === letter.toUpperCase()) || (drv.volumes || [])[0];

  const size = vol?.size ?? drv.size ?? 0;
  const free = vol?.free ?? 0;
  const used = Math.max(0, size - free);
  const fs = vol?.fs || "—";
  const label = vol?.label || drv.volumeLabel || "—";

  detailsLetterEl.textContent = letter || "—";
  detailsLabelEl.textContent = label || "—";
  detailsFSEl.textContent = fs;
  detailsCapEl.textContent = prettyBytes(size);
  detailsUsedEl.textContent = prettyBytes(used);
  detailsFreeEl.textContent = prettyBytes(free);
  detailsBusEl.textContent = drv.busType || "USB";

  // Mosaic usage map
  const CELLS = 220;
  const usedCells = size > 0 ? Math.min(CELLS, Math.round((used / size) * CELLS)) : 0;
  for (let i = 0; i < CELLS; i++) {
    const div = document.createElement("div");
    div.className = "usage-cell " + (i < usedCells ? "used" : "free");
    usageMapEl.appendChild(div);
  }
}

/* ------------------------------------------------------------------
   UTIL
------------------------------------------------------------------- */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ------------------------------------------------------------------
   DEVICE MONITOR (start on boot)
------------------------------------------------------------------- */
let refreshTimer = null;
let lastLogAt = 0;

api.onDrivesChanged?.(async ({ reason }) => {
  const now = Date.now();

  // Log first event in a burst, suppress spam for ~1.5s
  if (now - lastLogAt > 1500) {
    appendOutput(`📡 Device change — ${reason}\n`);
    lastLogAt = now;
  }

  // Coalesce rapid events before refreshing the list
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    await refreshDrives({ keepSelection: true });
  }, 200);
});

async function startMonitor() {
  try { await api.startDriveWatch(); } catch {}
}

/* ------------------------------------------------------------------
   INIT
------------------------------------------------------------------- */
loadVersion();
addAdminBadge();
startMonitor();
refreshDrives({ keepSelection: true }); // no auto-select when nothing stored
updateFsHelp();

/* Respond to option changes */
[fsTypeEl, labelEl, quickEl].forEach(el => el?.addEventListener("change", () => {
  updateFsHelp();
  updateFat32Notice();
  updatePreview();
}));

/* Stream formatter output */
api.onFormatProgress?.(msg => {
  appendOutput(msg);
  parsePercent(msg);
});
