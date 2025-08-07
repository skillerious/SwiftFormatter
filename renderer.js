/* global api, bootstrap */
const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------------
   ELEMENT REFERENCES
------------------------------------------------------------------- */
const driveListEl = $("#driveList");
const driveLoaderEl = $("#driveLoader");
const driveCountBadge = $("#driveCount");
const refreshBtn = $("#refresh");

const fsTypeEl = $("#fsType");
const labelEl = $("#label");
const quickEl = $("#quick");
const confirmTextEl = $("#confirmText");
const selectedDeviceDisplay = $("#selectedDeviceDisplay");
const clearSelectionBtn = $("#clearSelection");
const cmdPreviewEl = $("#cmdPreview");

const outputEl = $("#output");
const progressBar = $("#progressBar");
const percentLabel = $("#percentLabel");

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

/* Misc */
const docsLinkBtn = $("#docsLink");
const formatForm = $("#formatForm");

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
   VERSION META (from version.json via IPC)
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

        badgeCurrent.textContent = `Current: ${APP_META.version}`;
    } catch {
        /* noop */ }
}

/* ------------------------------------------------------------------
   ADMIN / STANDARD BADGE
------------------------------------------------------------------- */
async function addAdminBadge() {
    try {
        const isAdmin = await api.isAdmin();
        const t = document.querySelector(".app-title");
        const b = document.createElement("span");
        b.className = `badge ms-2 ${isAdmin ? "bg-success" : "bg-secondary"}`;
        b.textContent = isAdmin ? "Admin" : "Standard";
        t.appendChild(b);
    } catch {}
}

/* ------------------------------------------------------------------
   TITLE-BAR CONTROLS
------------------------------------------------------------------- */
btnUpdate.addEventListener("click", openUpdate);
btnSettings.addEventListener("click", openSettings);
btnAbout.addEventListener("click", () => new bootstrap.Modal($("#aboutModal")).show());
btnMin.addEventListener("click", () => api.minimize());
btnMax.addEventListener("click", () => api.maximize());
btnClose.addEventListener("click", () => api.close());

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
   LINKS
------------------------------------------------------------------- */
docsLinkBtn.addEventListener("click", () => api.openExternal("https://en.wikipedia.org/wiki/Disk_formatting"));
$("#aboutRepo").addEventListener("click", () =>
    api.openExternal(`https://github.com/${APP_META.repo}`));

/* ------------------------------------------------------------------
   DRIVE LIST
------------------------------------------------------------------- */
let drives = [];
let selected = null;

refreshBtn.addEventListener("click", refreshDrives);
clearSelectionBtn.addEventListener("click", () => {
    selected = null;
    selectedDeviceDisplay.textContent = "None";
    confirmTextEl.value = "";
    renderDriveList(drives);
    updatePreview();
});

/* live preview on change */
[fsTypeEl, labelEl, quickEl].forEach(el => el.addEventListener("change", updatePreview));

/* progress stream */
api.onFormatProgress(msg => {
    appendOutput(msg);
    parsePercent(msg);
});

/* ------------------------------------------------------------------
   SETTINGS HELPER FUNCTIONS
------------------------------------------------------------------- */
function loadSettings() {
    try {
        return {
            ...DEFAULT_SETTINGS,
            ...(JSON.parse(localStorage.getItem("sf.settings")) || {})
        };
    } catch {
        return {
            ...DEFAULT_SETTINGS
        };
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
}

/* utility helpers */
const prettyBytes = n => !n ? "—" : Intl.NumberFormat("en", {
    notation: "compact",
    style: "unit",
    unit: "byte"
}).format(n);
const appendOutput = msg => {
    outputEl.textContent = (outputEl.textContent + msg).slice(-4000);
    outputEl.scrollTop = outputEl.scrollHeight;
};

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
   DRIVE REFRESH / RENDER
------------------------------------------------------------------- */
async function refreshDrives() {
    try {
        driveLoaderEl.classList.remove("hidden");
        outputEl.textContent = "Scanning for removable drives…\n";
        drives = await api.listDrives() || [];
        renderDriveList(drives);
        outputEl.textContent += `Found ${drives.length} device(s).\n`;
    } catch (e) {
        outputEl.textContent = `Error listing drives: ${e.message}\n`;
    } finally {
        driveLoaderEl.classList.add("hidden");
        updatePreview();
    }
}

function renderDriveList(list) {
    driveListEl.innerHTML = "";
    driveCountBadge.textContent = list.length;

    list.forEach(d => {
        const el = document.createElement("div");
        el.className = "drive-item";
        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "drv";
        radio.className = "form-check-input";
        radio.checked = selected?.device === d.device;

        el.innerHTML = `
      <div class="drive-radio"></div>
      <div class="drive-avatar"><i class="bi bi-usb-drive"></i></div>
      <div class="drive-main">
        <div class="drive-title">${d.description||"Drive"}</div>
        <div class="drive-sub">${d.device}</div>
      </div>
      <div class="drive-meta">
        <span class="pill size">${prettyBytes(d.size)}</span>
        <span class="pill mount"><i class="bi bi-hdd-stack"></i> ${(d.mountpoints||["—"])[0]}</span>
        <span class="pill usb"><span class="dot"></span> ${d.busType||"USB"}</span>
      </div>`;

        el.querySelector(".drive-radio").appendChild(radio);
        if (selected?.device === d.device) el.classList.add("selected");

        const choose = () => {
            selected = d;
            document.querySelectorAll(".drive-item").forEach(e => e.classList.remove("selected"));
            el.classList.add("selected");
            radio.checked = true;
            selectedDeviceDisplay.textContent = d.device;
            confirmTextEl.value = SETTINGS.autofillConfirm ? (d.mountpoints || [""])[0] : "";
            updatePreview();
        };
        el.addEventListener("click", e => e.target === radio ? null : choose());
        radio.addEventListener("change", choose);
        driveListEl.appendChild(el);
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
        const {
            plan
        } = await api.formatDrive({
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
   ELEVATION FLOW
------------------------------------------------------------------- */
async function showElevationModal() {
    return new Promise(res => {
        const m = $("#elevateModal");
        const ok = $("#elevateConfirmBtn");
        const cancel = $("#elevateCancelBtn");
        const spin = $("#elevateSpinner");
        const status = $("#elevateStatus");
        spin.classList.add("d-none");
        ok.disabled = cancel.disabled = false;
        status.textContent = "Formatting requires admin rights.";
        const modal = new bootstrap.Modal(m, {
            backdrop: "static"
        });
        m.addEventListener("hidden.bs.modal", () => res(false), {
            once: true
        });
        cancel.addEventListener("click", () => modal.hide(), {
            once: true
        });
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
        }, {
            once: true
        });
        modal.show();
    });
}
async function ensureAdmin() {
    return (await api.isAdmin()) || await showElevationModal();
}

/* ------------------------------------------------------------------
   FORMAT SUBMISSION
------------------------------------------------------------------- */
formatForm.addEventListener("submit", async e => {
    e.preventDefault();
    if (!(await ensureAdmin())) return;

    outputEl.textContent = "";
    progressBar.style.width = "0%";
    if (!selected) {
        appendOutput("Select a device first.\n");
        return;
    }

    const tgt = (selected.mountpoints || [""])[0].toUpperCase();
    if (SETTINGS.requireConfirm && confirmTextEl.value.trim().toUpperCase() !== tgt) {
        appendOutput(`Type ${tgt} to confirm.\n`);
        return;
    }

    await updatePreview();
    appendOutput(`Command plan:\n  ${cmdPreviewEl.textContent}\n\n⚠️ Executing…\n`);
    setIndeterminate();

    try {
        const r = await api.formatDrive({
            device: selected.device,
            fsType: fsTypeEl.value,
            label: labelEl.value.trim(),
            quick: quickEl.checked,
            simulate: false,
            mountpoints: selected.mountpoints
        });
        r.ok ? (setPercent(100), appendOutput("\n✅ Format completed.\n")) : appendOutput("\n❌ Formatter did not report success.\n");
    } catch (err) {
        appendOutput(`\n❌ Error: ${err.message}\n`);
    }
});

/* ------------------------------------------------------------------
   SETTINGS MODAL
------------------------------------------------------------------- */
function openSettings() {
    applySettingsToUI();
    new bootstrap.Modal($("#settingsModal")).show();
}
settingsForm.addEventListener("submit", async e => {
    e.preventDefault();
    SETTINGS.defaultFs = $("#setDefaultFS").value;
    SETTINGS.quickDefault = $("#setQuickDefault").checked;
    SETTINGS.requireConfirm = $("#setRequireConfirm").checked;
    SETTINGS.autofillConfirm = $("#setAutofillConfirm").checked;
    SETTINGS.glowHover = $("#setGlowHover").checked;
    saveSettings();
    applySettingsToUI();

    const token = setGhToken.value.trim();
    if (token) {
        const r = await api.saveGitHubToken(token);
        if (!r.ok) alert("Token save failed: " + r.error);
        setGhToken.value = "";
    }
    bootstrap.Modal.getInstance($("#settingsModal")).hide();
});

/* ------------------------------------------------------------------
   UPDATE MODAL & AUTO-CHECK
------------------------------------------------------------------- */
let UPDATE_INFO = null,
    DOWNLOADED_PATH = null;

/* centralised UI helper */
function setUpdateUI({
    current,
    latest,
    status,
    checking,
    changelog,
    canGet,
    footer
}) {
    if (current) badgeCurrent.textContent = `Current: ${current}`;
    if (latest) badgeLatest.textContent = `Latest: ${latest}`;
    if (status) updateStatus.textContent = status;
    if (typeof checking === "boolean") updateSpinner.classList.toggle("d-none", !checking);
    if (changelog) updateNotes.textContent = changelog;
    if (typeof canGet === "boolean") updateGetBtn.disabled = !canGet;
    if (footer !== undefined) updateFooter.textContent = footer;
}

/* performs the GitHub API check and updates UI */
async function runUpdateCheck() {
    setUpdateUI({
        checking: true,
        status: "Checking releases…"
    });
    const r = await api.checkForUpdate();
    if (!r.ok) {
        setUpdateUI({
            checking: false,
            status: "Failed: " + (r.error || "unknown")
        });
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

    const modal = new bootstrap.Modal($("#updateModal"));
    modal.show();

    /* auto-run the check shortly after modal is visible */
    setTimeout(runUpdateCheck, 60);
}

/* manual “Check now” button (still works) */
updateCheckBtn.addEventListener("click", runUpdateCheck);

/* open releases link */
updateOpenRelBtn.addEventListener("click", () =>
    api.openExternal(`https://github.com/${APP_META.repo}/releases`));

/* download progress */
api.onUpdateProgress(p => {
    if (p.percent != null) setUpdateUI({
        status: `Downloading… ${p.percent}%`
    });
});

/* download / install flow */
updateGetBtn.addEventListener("click", async () => {
    if (!UPDATE_INFO?.asset) return;
    /* first click → download */
    if (!DOWNLOADED_PATH) {
        setUpdateUI({
            checking: true,
            status: "Starting download…"
        });
        updateGetLabel.textContent = "Downloading…";
        const r = await api.downloadUpdate({
            url: UPDATE_INFO.asset.url,
            name: UPDATE_INFO.asset.name
        });
        setUpdateUI({
            checking: false
        });
        if (!r.ok) {
            setUpdateUI({
                status: "Download failed: " + r.error
            });
            updateGetLabel.textContent = "Get update";
            return;
        }
        DOWNLOADED_PATH = r.file;
        setUpdateUI({
            status: "Download complete.",
            canGet: true
        });
        updateGetLabel.textContent = "Install & Restart";
        return;
    }
    /* second click → install */
    setUpdateUI({
        checking: true,
        status: "Launching installer…"
    });
    const r2 = await api.installUpdate(DOWNLOADED_PATH);
    if (!r2.ok) {
        setUpdateUI({
            checking: false,
            status: "Install failed: " + r2.error
        });
    }
});

/* ------------------------------------------------------------------
   INITIALISATION
------------------------------------------------------------------- */
loadVersion();
addAdminBadge();
refreshDrives();