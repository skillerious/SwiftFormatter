/*  renderer.js — Swift Formatter PRO
    =====================================================================
    Front-end controller
    • Reads & persists settings
    • Lists removable drives  ➜  shows volumeLabel
    • Builds live PowerShell command preview
    • Streams formatter output & progress
    • Auto-refreshes drive list after a successful format
    • Client-side FAT32 size guard + non-USB/system guard
    • Inline filesystem microcopy
    • Prevents double-submission on “Format”
    • Handles update, settings, about, elevation modals
    • Contextual menu (Open in Explorer / Safely Eject) with full keyboard/mouse support
    • Busy mode: fully disables UI during formatting (prevents eject/open/refresh/context menu)
    • Auto-refresh on device change (paused during busy, resumes after)
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
const fsHelpTextEl = $("#fsHelpText"); // inline microcopy
const fat32NoticeEl = $("#fat32Notice"); // FAT32 >32GB notice
const labelEl = $("#label");
const quickEl = $("#quick");
const confirmTextEl = $("#confirmText");
const selectedDeviceDisplay = $("#selectedDeviceDisplay");
const clearSelectionBtn = $("#clearSelection");
const cmdPreviewEl = $("#cmdPreview");

const guardMsgEl = $("#guardMsg"); // client-side guard messages

const outputEl = $("#output");
const progressBar = $("#progressBar");
const percentLabel = $("#percentLabel");
const formatForm = $("#formatForm");
const formatBtn = $("#formatBtn"); // for double-submit protection

/* Title-bar buttons */
const btnUpdate = $("#btn-update");
const btnSettings = $("#btn-settings");
const btnAbout = $("#btn-about");
const btnMin = $("#btn-min");
const btnMax = $("#btn-max");
const btnClose = $("#btn-close");

/* Update modal */
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

/* Settings modal */
const settingsForm = $("#settingsForm");
const setGhToken = $("#setGhToken");

/* Toast host */
const toastHost = $("#toastHost");

/* Misc */
const docsLinkBtn = $("#docsLink");

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
   VERSION META (loaded from version.json via main process)
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

		$("#aboutVersion").textContent = APP_META.version;
		$("#aboutChannel").textContent = APP_META.channel;
		$("#aboutReleased").textContent = APP_META.releasedAt ?
			new Date(APP_META.releasedAt).toLocaleDateString() :
			"—";
		if (badgeCurrent) badgeCurrent.textContent = `Current: ${APP_META.version}`;
	} catch {
		/* ignore */ }
}

/* ------------------------------------------------------------------
   ADMIN / STANDARD BADGE (title-bar)
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
btnUpdate.addEventListener("click", openUpdate);
btnSettings.addEventListener("click", openSettings);
btnAbout.addEventListener("click", () => new bootstrap.Modal($("#aboutModal")).show());
btnMin.addEventListener("click", () => api.minimize());
btnMax.addEventListener("click", () => api.maximize());
btnClose.addEventListener("click", () => api.close());

/* ------------------------------------------------------------------
   BOOTSTRAP POPOVERS (global)
------------------------------------------------------------------- */
document.querySelectorAll('[data-bs-toggle="popover"]').forEach(el => {
	new bootstrap.Popover(el, {
		container: "body",
		sanitize: true
	});
});

/* ------------------------------------------------------------------
   EXTERNAL LINK BUTTONS
------------------------------------------------------------------- */
docsLinkBtn.addEventListener("click", () =>
	api.openExternal("https://en.wikipedia.org/wiki/Disk_formatting"));
$("#aboutRepo")?.addEventListener("click", () =>
	api.openExternal(`https://github.com/${APP_META.repo}`));

/* ------------------------------------------------------------------
   DRIVE LIST
------------------------------------------------------------------- */
let drives = [];
let selected = null;

/* Busy/format state */
let formatInFlight = false;              // running a format job
let uiBusy = false;                      // UI locked (includes during format)
let pendingAutoRefresh = false;          // if device change happens while busy, refresh once after

refreshBtn.addEventListener("click", () => refreshDrives());
clearSelectionBtn.addEventListener("click", () => {
	if (uiBusy) return;
	selected = null;
	selectedDeviceDisplay.textContent = "None";
	confirmTextEl.value = "";
	hideFat32Notice();
	clearGuard();
	renderDriveList(drives);
	updatePreview();
});

/* Live-update preview + help text + FAT32 notice as options change */
[fsTypeEl, labelEl, quickEl].forEach(el => el.addEventListener("change", () => {
	if (uiBusy) return;
	updateFsHelp();
	updateFat32Notice();
	updatePreview();
}));

/* Stream formatter output */
api.onFormatProgress?.((msg) => {
	appendOutput(msg);
	parsePercent(msg);
});

/* ------------------------------------------------------------------
   SETTINGS HELPERS
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
	fsTypeEl.value = SETTINGS.defaultFs;
	quickEl.checked = SETTINGS.quickDefault;
	document.body.classList.toggle("no-glow", !SETTINGS.glowHover);

	$("#setDefaultFS").value = SETTINGS.defaultFs;
	$("#setQuickDefault").checked = SETTINGS.quickDefault;
	$("#setRequireConfirm").checked = SETTINGS.requireConfirm;
	$("#setAutofillConfirm").checked = SETTINGS.autofillConfirm;
	$("#setGlowHover").checked = SETTINGS.glowHover;

	updateFsHelp();
}

/* ------------------------------------------------------------------
   BYTE → human-readable helper
------------------------------------------------------------------- */
function prettyBytes(n) {
	if (!n) return "—";
	const u = ["B", "KB", "MB", "GB", "TB", "PB"];
	let i = 0, v = n;
	while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
	return `${v.toFixed(i?1:0)} ${u[i]}`;
}

/* ------------------------------------------------------------------
   TERMINAL OUTPUT helpers (emoji-rich)
------------------------------------------------------------------- */
function appendOutput(msg) {
	outputEl.textContent = (outputEl.textContent + msg).slice(-4000);
	outputEl.scrollTop = outputEl.scrollHeight;
}

function parsePercent(t) {
	const m = t.match(/(\d{1,3})%/);
	if (m) setPercent(+m[1]);
}

function setIndeterminate() {
	progressBar.classList.add("progress-bar-striped", "progress-bar-animated");
	progressBar.style.width = "100%";
	percentLabel.textContent = "Working…";
}

function setPercent(p) {
	progressBar.classList.remove("progress-bar-animated");
	progressBar.style.width = `${p}%`;
	percentLabel.textContent = `${p}%`;
}

/* ------------------------------------------------------------------
   GUARD messaging helpers
------------------------------------------------------------------- */
function showGuard(message, level = "danger") {
	guardMsgEl.classList.remove("d-none", "alert-danger", "alert-warning", "alert-info", "alert-success");
	guardMsgEl.classList.add(`alert-${level}`);
	guardMsgEl.textContent = message;
}

function clearGuard() {
	guardMsgEl.classList.add("d-none");
	guardMsgEl.textContent = "";
	guardMsgEl.classList.remove("alert-danger", "alert-warning", "alert-info", "alert-success");
}

/* ------------------------------------------------------------------
   Filesystem microcopy + FAT32 size notice
------------------------------------------------------------------- */
function updateFsHelp() {
	const fs = fsTypeEl.value;
	let text = "";
	if (fs === "exFAT") {
		text = "exFAT — modern and cross-platform (Windows/macOS/Linux). Supports files > 4 GB.";
	} else if (fs === "FAT32") {
		text = "FAT32 — highly compatible, but 4 GB per-file limit. Windows cannot format > 32 GB.";
	} else {
		text = "NTFS — Windows features (permissions/compression), great for large files; limited macOS write support.";
	}
	if (fsHelpTextEl) fsHelpTextEl.textContent = text;
}
const THIRTY_TWO_GIB = 32 * 1024 * 1024 * 1024;

function updateFat32Notice() {
	if (!selected) { hideFat32Notice(); return; }
	const show = fsTypeEl.value === "FAT32" && (selected.size || 0) > THIRTY_TWO_GIB;
	fat32NoticeEl?.classList.toggle("d-none", !show);
}

function hideFat32Notice() {
	fat32NoticeEl?.classList.add("d-none");
}

/* ------------------------------------------------------------------
   DRIVE REFRESH + RENDER
------------------------------------------------------------------- */
async function refreshDrives({ quiet = false } = {}) {
	try {
		if (!quiet) {
			driveLoaderEl.classList.remove("hidden");
			appendOutput("🔍 Scanning for removable drives…\n");
		}
		drives = await api.listDrives() || [];
		renderDriveList(drives);
		if (!quiet) appendOutput(`✅ Found ${drives.length} device(s).\n`);
	} catch (e) {
		appendOutput(`❌ Error listing drives: ${e.message}\n`);
	} finally {
		driveLoaderEl.classList.add("hidden");
		updatePreview();
		updateFat32Notice();
	}
}

/* ------------------------------------------------------------------
   DRIVE RENDER — hide unmounted devices (no mountpoints)
------------------------------------------------------------------- */
function renderDriveList(list) {
	driveListEl.innerHTML = "";

	// Only show drives that actually have a mounted letter
	const visible = (list || []).filter(d =>
		Array.isArray(d.mountpoints) && d.mountpoints.length > 0
	);

	// If the currently selected device lost its mountpoint, clear selection
	if (selected && !visible.some(d => d.device === selected.device)) {
		selected = null;
		selectedDeviceDisplay.textContent = "None";
		confirmTextEl.value = "";
		updatePreview();
		hideFat32Notice();
		clearGuard();
	}

	// Update badge with the number of visible (mounted) drives
	driveCountBadge.textContent = String(visible.length);

	// Empty state
	if (!visible.length) {
		const empty = document.createElement("div");
		empty.className = "text-muted small px-2 py-1";
		empty.textContent = "No removable drives found";
		driveListEl.appendChild(empty);
		return;
	}

	// Render each visible drive
	visible.forEach(d => {
		const row = document.createElement("div");
		row.className = "drive-item";
		if (uiBusy) row.classList.add("disabled");

		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "drv";
		radio.className = "form-check-input";
		radio.checked = selected?.device === d.device;
		radio.disabled = uiBusy;

		row.innerHTML = `
      <div class="drive-radio"></div>
      <div class="drive-avatar"><i class="bi bi-usb-drive"></i></div>

      <div class="drive-main">
        <div class="drive-title">${escapeHtml(d.description || "Drive")}</div>
        <div class="drive-sub">
          ${d.volumeLabel ? `${escapeHtml(d.volumeLabel)} · ` : ""}${escapeHtml(d.device)}
        </div>
      </div>

      <div class="drive-meta">
        <span class="pill size">${prettyBytes(d.size)}</span>
        <span class="pill mount"><i class="bi bi-hdd-stack"></i> ${escapeHtml((d.mountpoints||["—"])[0])}</span>
        <span class="pill usb"><span class="dot"></span> ${escapeHtml(d.busType || "USB")}</span>
      </div>`;

		row.querySelector(".drive-radio").appendChild(radio);
		if (selected?.device === d.device) row.classList.add("selected");

		const choose = () => {
			if (uiBusy) return;
			selected = d;
			document.querySelectorAll(".drive-item").forEach(el => el.classList.remove("selected"));
			row.classList.add("selected");
			radio.checked = true;
			selectedDeviceDisplay.textContent = d.device;
			if (SETTINGS.autofillConfirm) confirmTextEl.value = (d.mountpoints || [""])[0] || "";
			clearGuard();
			updatePreview();
			updateFat32Notice();
		};

		// Left click selects
		row.addEventListener("click", e => { if (uiBusy) return; if (e.target !== radio) choose(); });
		radio.addEventListener("change", () => { if (uiBusy) return; choose(); });

		// Right click opens contextual menu (and also selects for clarity)
		row.addEventListener("contextmenu", (ev) => {
			if (uiBusy) return;
			ev.preventDefault();
			if (selected?.device !== d.device) choose();
			showDriveContextMenu(ev, d);
		});

		driveListEl.appendChild(row);
	});
}

/* ------------------------------------------------------------------
   COMMAND PREVIEW
------------------------------------------------------------------- */
async function updatePreview() {
	if (!selected) {
		cmdPreviewEl.textContent = "Select a device…";
		return;
	}
	try {
		const { plan } = await api.formatDrive({
			device: selected.device,
			fsType: fsTypeEl.value,
			label: labelEl.value.trim(),
			quick: quickEl.checked,
			simulate: true,
			mountpoints: selected.mountpoints
		});
		cmdPreviewEl.textContent = `${plan.cmd} ${plan.args.map(a=>/\s/.test(a)?`"${a}"`:a).join(" ")}`;
	} catch {
		cmdPreviewEl.textContent = "Preview unavailable.";
	}
}

/* ------------------------------------------------------------------
   ELEVATION FLOW (modal)
------------------------------------------------------------------- */
async function showElevationModal() {
	return new Promise(res => {
		const modalEl = $("#elevateModal");
		const ok = $("#elevateConfirmBtn");
		const cancel = $("#elevateCancelBtn");
		const spin = $("#elevateSpinner");
		const status = $("#elevateStatus");

		spin.classList.add("d-none");
		ok.disabled = cancel.disabled = false;
		status.textContent = "Formatting requires admin rights.";

		const modal = new bootstrap.Modal(modalEl, { backdrop: "static" });

		modalEl.addEventListener("hidden.bs.modal", () => res(false), { once: true });
		cancel.addEventListener("click", () => modal.hide(), { once: true });

		ok.addEventListener("click", async () => {
			ok.disabled = cancel.disabled = true;
			spin.classList.remove("d-none");
			status.textContent = "Requesting elevation…";
			const okd = await api.relaunchElevated();
			if (!okd) {
				spin.classList.add("d-none");
				status.textContent = "Could not relaunch. Run as Admin manually.";
				ok.disabled = cancel.disabled = false;
				return;
			}
			status.textContent = "Launching elevated…";
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
	// Do not allow formatting non-USB or system disks (belt-and-braces client side)
	if (selected.isSystem) { showGuard("System disks cannot be formatted from here."); return false; }
	if (!selected.isUSB)   { showGuard("Only USB/removable drives can be formatted."); return false; }

	const tgt = (selected.mountpoints || [""])[0]?.toUpperCase() || "";
	if (SETTINGS.requireConfirm && confirmTextEl.value.trim().toUpperCase() !== tgt) {
		showGuard(`Type ${tgt || "the drive letter"} to confirm.`);
		return false;
	}
	// FAT32 > 32GB guard
	if (fsTypeEl.value === "FAT32" && (selected.size || 0) > THIRTY_TWO_GIB) {
		showGuard("Windows cannot format FAT32 volumes larger than 32 GB. Choose exFAT or NTFS.", "warning");
		return false;
	}
	return true;
}

/* ------------------------------------------------------------------
   BUSY MODE (lock UI during formatting and other exclusive ops)
------------------------------------------------------------------- */
function setUIBusy(busy) {
	uiBusy = !!busy;
	document.body.classList.toggle("app-busy", uiBusy);

	// Core form controls
	fsTypeEl.disabled = uiBusy;
	labelEl.disabled = uiBusy;
	quickEl.disabled = uiBusy;
	confirmTextEl.disabled = uiBusy;
	formatBtn.disabled = uiBusy;

	// Other buttons/controls
	refreshBtn.disabled = uiBusy;
	btnUpdate.disabled = uiBusy;
	btnSettings.disabled = uiBusy;
	clearSelectionBtn.disabled = uiBusy;

	// Disable drive list interactions (keep visible)
	if (uiBusy) driveListEl.classList.add("ui-disabled");
	else driveListEl.classList.remove("ui-disabled");

	// Close any open context menu
	if (uiBusy) closeCtxMenu();
}

/* ------------------------------------------------------------------
   FORMAT SUBMISSION (prevents double submit + locks UI)
------------------------------------------------------------------- */
formatForm.addEventListener("submit", async e => {
	e.preventDefault();
	if (formatInFlight) return; // block rapid re-clicks

	if (!(await ensureAdmin())) return;
	if (!clientGuardsBeforeFormat()) return;

	// Clear output for this run
	outputEl.textContent = "";
	progressBar.style.width = "0%";

	await updatePreview();

	appendOutput(`🧪 Command plan:\n  ${cmdPreviewEl.textContent}\n\n⚠️ Executing…\n`);
	setIndeterminate();

	// disable while running
	formatInFlight = true;
	setUIBusy(true);

	try {
		const r = await api.formatDrive({
			device: selected.device,
			fsType: fsTypeEl.value,
			label: labelEl.value.trim(),
			quick: quickEl.checked,
			simulate: false,
			mountpoints: selected.mountpoints
		});
		if (r.ok) {
			setPercent(100);
			appendOutput("\n✅ Format completed.\n");
			await refreshDrives(); // auto-refresh
		} else {
			appendOutput("\n❌ The formatter did not report success.\n");
		}
	} catch (err) {
		appendOutput(`\n❌ Error: ${err.message}\n`);
	} finally {
		formatInFlight = false;
		setUIBusy(false);
		// If any device events queued while busy, process once
		if (pendingAutoRefresh) {
			pendingAutoRefresh = false;
			await refreshDrives({ quiet: false });
		}
	}
});

/* ------------------------------------------------------------------
   SETTINGS MODAL
------------------------------------------------------------------- */
function openSettings() {
	if (uiBusy) return;
	applySettingsToUI();
	new bootstrap.Modal($("#settingsModal")).show();
}

settingsForm.addEventListener("submit", async e => {
	e.preventDefault();
	if (uiBusy) return;

	SETTINGS.defaultFs = $("#setDefaultFS").value;
	SETTINGS.quickDefault = $("#setQuickDefault").checked;
	SETTINGS.requireConfirm = $("#setRequireConfirm").checked;
	SETTINGS.autofillConfirm = $("#setAutofillConfirm").checked;
	SETTINGS.glowHover = $("#setGlowHover").checked;
	saveSettings();
	applySettingsToUI();

	const tok = setGhToken.value.trim();
	if (tok) {
		const r = await api.saveGitHubToken(tok);
		if (!r.ok) alert("Token save failed: " + r.error);
		setGhToken.value = "";
	}
	bootstrap.Modal.getInstance($("#settingsModal")).hide();
});

/* ------------------------------------------------------------------
   UPDATE MODAL & AUTO-CHECK
------------------------------------------------------------------- */
let UPDATE_INFO = null;
let DOWNLOADED_PATH = null;

function setUpdateUI({ current, latest, status, checking, changelog, canGet, footer }) {
  if (current) badgeCurrent.textContent = `Current: ${current}`;
  if (latest) badgeLatest.textContent = `Latest: ${latest}`;
  if (status) updateStatus.textContent = status;
  if (typeof checking === "boolean") updateSpinner.classList.toggle("d-none", !checking);
  if (changelog !== undefined) {
    // Render markdown to HTML and inject
    updateNotes.innerHTML = renderMarkdown(changelog || "—");
  }
  if (typeof canGet === "boolean") updateGetBtn.disabled = !canGet;
  if (footer !== undefined) updateFooter.textContent = footer;
}


async function runUpdateCheck() {
	setUpdateUI({ checking: true, status: "Checking releases…" });
	const r = await api.checkForUpdate();
	if (!r.ok) {
		setUpdateUI({ checking: false, status: "Failed: " + (r.error || "unknown") });
		return;
	}
	UPDATE_INFO = r;
	setUpdateUI({
		current: r.current,
		latest: r.latest,
		checking: false,
		status: r.upToDate ? "Already up to date." : "Update available.",
		changelog: r.notes || "—",
		canGet: !r.upToDate && !!r.asset,
		footer: r.upToDate ? "You’re on the latest version." : `New version: ${r.latest}`
	});
}

function openUpdate() {
	if (uiBusy) return;
	DOWNLOADED_PATH = null;
	UPDATE_INFO = null;
	setUpdateUI({
		current: APP_META.version, latest: "v—", status: "Preparing update check…",
		checking: false, changelog: "—", canGet: false, footer: ""
	});
	const modal = new bootstrap.Modal($("#updateModal"));
	modal.show();
	setTimeout(runUpdateCheck, 60);
}

updateCheckBtn.addEventListener("click", () => { if (!uiBusy) runUpdateCheck(); });
updateOpenRelBtn.addEventListener("click", () =>
	api.openExternal(`https://github.com/${APP_META.repo}/releases`)
);

api.onUpdateProgress?.(p => {
	if (p.percent != null) setUpdateUI({ status: `Downloading… ${p.percent}%` });
});

updateGetBtn.addEventListener("click", async () => {
	if (uiBusy) return;
	if (!UPDATE_INFO?.asset) return;
	/* first click → download */
	if (!DOWNLOADED_PATH) {
		setUpdateUI({ checking: true, status: "Starting download…" });
		updateGetLabel.textContent = "Downloading…";
		const r = await api.downloadUpdate({ url: UPDATE_INFO.asset.url, name: UPDATE_INFO.asset.name });
		setUpdateUI({ checking: false });
		if (!r.ok) {
			setUpdateUI({ status: "Download failed: " + r.error });
			updateGetLabel.textContent = "Get update";
			return;
		}
		DOWNLOADED_PATH = r.file;
		setUpdateUI({ status: "Download complete.", canGet: true });
		updateGetLabel.textContent = "Install & Restart";
		return;
	}
	/* second click → install */
	setUpdateUI({ checking: true, status: "Launching installer…" });
	const r = await api.installUpdate(DOWNLOADED_PATH);
	if (!r.ok) setUpdateUI({ checking: false, status: "Install failed: " + r.error });
});

/* ------------------------------------------------------------------
   UTIL: minimal HTML escaper for labels in list
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
   TOAST (in-app notification)
------------------------------------------------------------------- */
function showToast({ title = "", body = "", variant = "info", delay = 3500 } = {}) {
	try {
		const w = document.createElement("div");
		w.className = `toast align-items-center border-0 text-bg-${variant}`;
		w.setAttribute("role", "status");
		w.setAttribute("aria-live", "polite");
		w.setAttribute("aria-atomic", "true");
		w.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">
          <div class="fw-semibold">${escapeHtml(title)}</div>
          <div class="small">${escapeHtml(body)}</div>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    `;
		toastHost.appendChild(w);
		const t = new bootstrap.Toast(w, { autohide: true, delay });
		w.addEventListener("hidden.bs.toast", () => w.remove());
		t.show();
	} catch {}
}

/* ------------------------------------------------------------------
   CONTEXTUAL MENU — robust outside-close + header shows device name
------------------------------------------------------------------- */
let currentCtxMenu = null;
let ctxCleanup = null;

function closeCtxMenu() {
	if (currentCtxMenu) {
		currentCtxMenu.remove();
		currentCtxMenu = null;
	}
	if (ctxCleanup) {
		ctxCleanup();
		ctxCleanup = null;
	}
}

/** Outside-to-close menu handler — packaged build safe */
function addOutsideAutoDismiss(menu) {
	const bindings = [];

	const bind = (target, type, handler, opts = false) => {
		target.addEventListener(type, handler, opts);
		bindings.push(() => target.removeEventListener(type, handler, opts));
	};

	const closeIfOutside = (e) => {
		if (!menu.contains(e.target)) {
			closeCtxMenu();
		}
	};

	// Use bubble phase for mouse/touch so item click runs first
	bind(document, "mousedown", closeIfOutside, false);
	bind(document, "touchstart", closeIfOutside, false);

	// Still capture right-click and wheel to close instantly
	bind(document, "contextmenu", closeIfOutside, true);
	bind(document, "wheel", closeIfOutside, true);

	// Escape key to close
	const onKey = (e) => { if (e.key === "Escape") closeCtxMenu(); };
	bind(document, "keydown", onKey, true);

	// Window losing focus or resizing
	bind(window, "blur", () => closeCtxMenu());
	bind(window, "resize", () => closeCtxMenu());
	bind(window, "scroll", () => closeCtxMenu(), true);

	// Block native context menu inside our custom one
	menu.addEventListener("contextmenu", (e) => e.preventDefault());

	return () => bindings.forEach(off => off());
}

/* keyboard modality helper for rings */
let lastInputWasKeyboard = false;
document.addEventListener("keydown", (e) => {
	if (["Tab","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) {
		lastInputWasKeyboard = true;
		document.body.classList.add("kbd-mode");
	}
});
["mousedown","pointerdown","touchstart"].forEach(evt=>{
	document.addEventListener(evt, ()=>{ lastInputWasKeyboard = false; document.body.classList.remove("kbd-mode"); }, {passive:true});
});

function showDriveContextMenu(ev, drive) {
	if (uiBusy) return; // block during busy
	closeCtxMenu();

	const name   = String(drive.description || drive.volumeLabel || "Drive");
	const letter = (drive.mountpoints && drive.mountpoints[0]) ? String(drive.mountpoints[0]) : "";
	const headerText = `${name} ${letter ? `— ${letter}` : ""}`;

	const menu = document.createElement("div");
	menu.className = "ctx-menu";
	menu.innerHTML = `
    <div class="ctx-header" title="${escapeHtml(headerText)}">
      <i class="bi bi-usb-drive"></i>
      <span class="ctx-title">${escapeHtml(headerText)}</span>
    </div>
    <div class="ctx-items">
      <div class="ctx-item" role="button" tabindex="0" data-action="open">
        <i class="bi bi-folder2-open"></i><span>Open in Explorer</span>
      </div>
      <div class="ctx-divider" aria-hidden="true"></div>
      <div class="ctx-item" role="button" tabindex="0" data-action="eject">
        <i class="bi bi-eject"></i><span>Safely Eject</span>
      </div>
    </div>
  `;

	document.body.appendChild(menu);
	currentCtxMenu = menu;

	// Position (avoid viewport overflow)
	const { clientX, clientY } = ev;
	const rect = menu.getBoundingClientRect();
	const maxX = window.innerWidth  - rect.width  - 8;
	the_maxY = window.innerHeight - rect.height - 8;
	menu.style.left = Math.max(8, Math.min(clientX, maxX)) + "px";
	menu.style.top  = Math.max(8, Math.min(clientY, the_maxY)) + "px";

	// Robust auto-dismiss wiring
	ctxCleanup = addOutsideAutoDismiss(menu);
	menu.addEventListener("contextmenu", (e) => e.preventDefault()); // prevent native menu

	// Keyboard focus only when opened via keyboard modality
	const items = Array.from(menu.querySelectorAll(".ctx-item"));
	if (lastInputWasKeyboard) items[0]?.focus();

	// Activate actions (mouse/keyboard)
	const runAction = async (action) => {
		if (uiBusy) return; // deny during busy
		closeCtxMenu();
		if (action === "open")  return openInExplorer(drive);
		if (action === "eject") return ejectDrive(drive);
	};

	items.forEach((el, idx) => {
		el.addEventListener("click", () => runAction(el.dataset.action));
		el.addEventListener("keydown", (e) => {
			if (e.key === "Enter" || e.key === " ") { e.preventDefault(); runAction(el.dataset.action); return; }
			if (e.key === "ArrowDown") { e.preventDefault(); (items[idx+1] || items[0])?.focus(); return; }
			if (e.key === "ArrowUp")   { e.preventDefault(); (items[idx-1] || items[items.length-1])?.focus(); return; }
		});
	});
}

/* ------------------------------------------------------------------
   OPEN / EJECT HELPERS (blocked during busy)
------------------------------------------------------------------- */
async function openInExplorer(drive) {
	if (uiBusy) {
		showToast({ title: "Busy", body: "Please wait for formatting to finish.", variant: "warning" });
		return;
	}
	const letter = (drive.mountpoints && drive.mountpoints[0]) || "";
	if (!letter) return showToast({ title:"Open failed", body:"No drive letter found.", variant:"danger" });

	const r = await api.openDrive(letter.replace(":", ""));
	if (!r?.ok) {
		appendOutput(`❌ Open failed: ${r?.error || "unknown"}\n`);
		showToast({ title:"Open failed", body:String(r?.error || "Windows refused to open the drive."), variant:"danger" });
	}
}

async function ejectDrive(drive) {
	if (uiBusy) {
		showToast({ title: "Busy", body: "Please wait for formatting to finish.", variant: "warning" });
		return;
	}

	const letter = (drive.mountpoints && drive.mountpoints[0]) || "";
	const deviceId = drive.device;

	if (!letter) {
		appendOutput("❌ Cannot eject: no mount letter.\n");
		showToast({ title: "Eject failed", body: "No drive letter found.", variant: "danger" });
		return;
	}

	appendOutput(`⏏️  Ejecting ${letter}…\n`);
	closeCtxMenu();

	const r = await api.ejectDrive(letter.replace(":", ""));
	if (!r?.ok) {
		appendOutput(`❌ Eject failed: ${r?.error || "unknown"}\n`);
		showToast({ title:"Eject failed", body:r?.error ? String(r.error) : "Windows refused to eject.", variant:"danger" });
		await refreshDrives();
		return;
	}

	// Wait briefly for Windows to dismount/update the letter, then decide.
	const outcome = await waitForUnmount({ letter, deviceId, tries: 8, interval: 250 });

	// Refresh now that we know the state
	await refreshDrives();

	if (outcome.safe) {
		if (selected?.device === deviceId) {
			selected = null;
			selectedDeviceDisplay.textContent = "None";
			confirmTextEl.value = "";
			updatePreview();
		}
		appendOutput("✅ Eject complete. Safe to remove.\n");
		showToast({ title:"Safe to remove", body:`${letter} can now be safely disconnected.`, variant:"success" });
	} else {
		appendOutput("⚠️ Volume may still be mounted.\n");
		showToast({ title:"Still in use", body:`Close any open files on ${letter} and try again.`, variant:"warning" });
	}
}

/* Minimal Markdown → HTML (safe) */
function renderMarkdown(md) {
  if (!md) return "";
  // Escape HTML first
  let s = String(md)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  // Code fences ```lang\n...\n```
  s = s.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.replace(/\n$/, "")}</code></pre>`
  );

  // Headings ######
  s = s.replace(/^###### (.*)$/gm, "<h6>$1</h6>")
       .replace(/^##### (.*)$/gm, "<h5>$1</h5>")
       .replace(/^#### (.*)$/gm,  "<h4>$1</h4>")
       .replace(/^### (.*)$/gm,   "<h3>$1</h3>")
       .replace(/^## (.*)$/gm,    "<h2>$1</h2>")
       .replace(/^# (.*)$/gm,     "<h1>$1</h1>");

  // Lists (very small, contiguous blocks)
  s = s.replace(/(^|\n)([-*] .+(?:\n[-*] .+)*)/g, (m, lead, block) => {
    const items = block.split(/\n/).map(l => l.replace(/^[-*] /, "").trim());
    return `${lead}<ul>${items.map(i=>`<li>${i}</li>`).join("")}</ul>`;
  });

  // Bold, italic, inline code, links
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
       .replace(/\*(.+?)\*/g, "<em>$1</em>")
       .replace(/`([^`]+?)`/g, "<code>$1</code>")
       .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                `<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>`);

  // Paragraphs: split on blank lines
  s = s.replace(/(?:\r?\n){2,}/g, "</p><p>");
  s = `<p>${s}</p>`.replace(/<p>(\s*)<\/p>/g, ""); // remove empty p

  return s;
}


/**
 * Polls for the letter to disappear OR the device to remain but without mountpoints.
 * Treats either case as "safe to remove".
 */
async function waitForUnmount({ letter, deviceId, tries = 8, interval = 250 }) {
	const targetLetter = String(letter).toUpperCase();
	let delay = interval;

	for (let i = 0; i < tries; i++) {
		const list = await api.listDrives();

		const anyWithLetter = list.some(d =>
			(d.mountpoints || []).some(mp => String(mp).toUpperCase() === targetLetter)
		);

		if (!anyWithLetter) {
			// The letter is gone: definitely safe
			return { safe: true, reason: "letter-gone" };
		}

		// If the same device is still enumerated but has no mountpoints, that's also safe
		const dev = list.find(d => d.device === deviceId);
		if (dev && (!dev.mountpoints || dev.mountpoints.length === 0)) {
			return { safe: true, reason: "dismounted" };
		}

		// Backoff a touch to give the OS time to finalize
		await sleep(delay);
		delay = Math.min(Math.round(delay * 1.25), 800);
	}

	// Could still be mounted
	return { safe: false };
}

/* ------------------------------------------------------------------
   AUTO-REFRESH ON DEVICE CHANGES (paused while busy)
------------------------------------------------------------------- */
if (api?.onDeviceEvent) {
	api.onDeviceEvent(({ type, letter }) => {
		// If formatting / busy, defer a single refresh
		if (uiBusy) {
			pendingAutoRefresh = true;
			return;
		}
		const tag = type === "arrival" ? "arrival" : "change";
		appendOutput(`📡 Device ${tag} — ${letter || "?"}\n`);
		appendOutput(`🔁 Auto-refresh (device ${tag}: ${letter || "?"})…\n`);
		refreshDrives();
	});
}

/* ------------------------------------------------------------------
   MISC HELPERS
------------------------------------------------------------------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ------------------------------------------------------------------
   INITIALISATION
------------------------------------------------------------------- */
loadVersion();
addAdminBadge();
refreshDrives();
updateFsHelp();
