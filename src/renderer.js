const fileListEl = document.getElementById("fileList");
const pickBtn = document.getElementById("pick");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const targetSizeEl = document.getElementById("targetSize");
const videoFpsEl = document.getElementById("videoFps");
const targetSizePresetEl = document.getElementById("targetSizePreset");
const videoFpsPresetEl = document.getElementById("videoFpsPreset");
const targetSizeControlEl = document.getElementById("targetSizeControl");
const videoFpsControlEl = document.getElementById("videoFpsControl");
const targetCustomCloseEl = document.getElementById("targetCustomClose");
const fpsCustomCloseEl = document.getElementById("fpsCustomClose");
const prioritySelectEl = document.getElementById("prioritySelect");
const targetResolutionEl = document.getElementById("targetResolution");
const footerInfoEl = document.getElementById("footer-info");
const clearBtn = document.getElementById("clearList");
const smartPickBtn = document.getElementById("smartPick");
const standardModeBtn = document.getElementById("standardModeBtn");
const smartModeBtn = document.getElementById("smartModeBtn");
const standardOptionsEl = document.getElementById("standardOptions");
const smartOptionsEl = document.getElementById("smartOptions");
const modeDescriptionEl = document.getElementById("modeDescription");
const smartQualityEl = document.getElementById("smartQuality");
const smartRetainResolutionEl = document.getElementById("smartRetainResolution");
const smartRetainFpsEl = document.getElementById("smartRetainFps");
const smartPreserveAudioEl = document.getElementById("smartPreserveAudio");
const smartStripMetadataEl = document.getElementById("smartStripMetadata");
const smartResultsViewEl = document.getElementById("smartResultsView");
const smartResultsListEl = document.getElementById("smartResultsList");
let compressionMode = "standard";
let tourActive = false;
let tourSession = null;
let tourStepIndex = 0;
let updateStartupCheckSettled = false;
let mediaStartupCheckSettled = false;
let tourSeenThisSession = false;

// Window control buttons for custom titlebar (only present in frameless mode)
const winMinBtn = document.getElementById("win-min");
const winMaxBtn = document.getElementById("win-max");
const winCloseBtn = document.getElementById("win-close");

// Utility: toggle a global processing lock that disables most UI controls
// while a file is compressing. Exceptions are the About, Lite and theme toggle.
function setGlobalProcessingLock(on) {
  try {
    const exceptionSelectors = [
      "#aboutBtn",
      "#liteBtn",
      "#themeToggle",
      ".file-action-btn.details",
      "#detailBack",
      "#detailCancel",
      "#detailReveal",
      "#win-min",
      "#win-max",
      "#win-close",
    ];
    // Find all interactive controls
    const controls = Array.from(
      document.querySelectorAll("button, input, select, textarea")
    );
    controls.forEach((el) => {
      try {
        // Skip exceptions: explicit selectors or any element inside the About modal
        if (exceptionSelectors.some((s) => el.matches && el.matches(s))) return;
        try {
          if (el.closest && el.closest("#aboutModal")) return;
        } catch (e) {}
        if (on) {
          // remember previous disabled state to avoid clobbering
          try {
            if (el.hasAttribute("data-prev-disabled")) {
              // already set by us
            } else {
              el.setAttribute("data-prev-disabled", el.disabled ? "1" : "0");
            }
          } catch (e) {}
          el.disabled = true;
          el.classList.add("processing-disabled");
        } else {
          // restore previous state
          try {
            const prev = el.getAttribute("data-prev-disabled");
            if (typeof prev === "string") el.disabled = prev === "1";
            el.removeAttribute("data-prev-disabled");
          } catch (e) {
            el.disabled = false;
          }
          el.classList.remove("processing-disabled");
        }
      } catch (e) {}
    });
    // also mark body so CSS rules can target if needed
    if (on) document.body.classList.add("processing");
    else document.body.classList.remove("processing");
  } catch (e) {}
}

try {
  const { ipcRenderer } = require("electron");
  if (winMinBtn)
    winMinBtn.addEventListener("click", () =>
      ipcRenderer.send("window-minimize")
    );
  if (winCloseBtn)
    winCloseBtn.addEventListener("click", () =>
      ipcRenderer.send("window-close")
    );
  if (winMaxBtn)
    winMaxBtn.addEventListener("click", () =>
      ipcRenderer.send("window-toggle-maximize")
    );

  // Keep maximize button appearance constant (do not change icon on maximize)
} catch (e) {}

// Handle lite-mode toggle sent from main process (via menu)
try {
  const { ipcRenderer } = require("electron");
  ipcRenderer.on("lite-mode", (ev, enabled) => {
    try {
      const on = !!enabled;
      if (on) document.body.classList.add("lite-mode");
      else document.body.classList.remove("lite-mode");
      try {
        localStorage.setItem("liteMode", on ? "1" : "0");
      } catch (e) {}
    } catch (e) {}
  });
} catch (e) {}

// Apply persisted lite-mode on startup (renderer fallback if main didn't send yet)
try {
  const persisted = localStorage.getItem("liteMode");
  if (persisted === "1") document.body.classList.add("lite-mode");
  else if (persisted === "0") document.body.classList.remove("lite-mode");
} catch (e) {}

// Wire up the in-app Lite button (if present)
try {
  const liteBtn = document.getElementById("liteBtn");
  if (liteBtn) {
    const updateLiteLabel = (on) => {
      try {
        liteBtn.textContent = on ? "Lite: On" : "Lite: Off";
        liteBtn.setAttribute("aria-pressed", on ? "true" : "false");
      } catch (e) {}
    };

    // initialize label from current state
    try {
      const initial =
        document.body.classList.contains("lite-mode") ||
        localStorage.getItem("liteMode") === "1";
      updateLiteLabel(!!initial);
    } catch (e) {}

    liteBtn.addEventListener("click", () => {
      try {
        const on = !document.body.classList.contains("lite-mode");
        if (on) document.body.classList.add("lite-mode");
        else document.body.classList.remove("lite-mode");
        try {
          localStorage.setItem("liteMode", on ? "1" : "0");
        } catch (e) {}
        try {
          require("electron").ipcRenderer.send("set-lite-mode", on);
        } catch (e) {}
        updateLiteLabel(on);
      } catch (e) {}
    });
  }
} catch (e) {}

// Windows-only: titlebar toggle (switch between custom frameless and native)
try {
  (async () => {
    try {
      const platform =
        (window && window.electronAPI && window.electronAPI.platform) ||
        (typeof process !== "undefined" ? process.platform : "");
      const wrap = document.getElementById("titlebarToggleWrap");
      const chk = document.getElementById("titlebarToggle");
      if (!wrap || !chk) return;
      if (platform !== "win32") {
        // only show on Windows
        wrap.style.display = "none";
        return;
      }
      // show the control on Windows
      wrap.style.display = "inline-flex";
      // request current persisted value from main
      try {
        const useCustom = await (window.electronAPI &&
        window.electronAPI.getUseCustomTitlebar
          ? window.electronAPI.getUseCustomTitlebar()
          : true);
        chk.checked = !!useCustom;
        // Hide/show the in-HTML custom titlebar element to match the actual frame mode
        try {
          const tb = document.querySelector(".titlebar");
          if (tb) tb.style.display = useCustom ? "flex" : "none";
          try {
            if (useCustom) document.body.classList.add("has-custom-titlebar");
            else document.body.classList.remove("has-custom-titlebar");
          } catch (e) {}
        } catch (e) {}
      } catch (e) {
        chk.checked = true;
        try {
          const tb = document.querySelector(".titlebar");
          if (tb) tb.style.display = "flex";
          try {
            document.body.classList.add("has-custom-titlebar");
          } catch (e) {}
        } catch (e) {}
      }

      chk.addEventListener("change", async (ev) => {
        try {
          const enabled = !!chk.checked;
          // Ask user to restart so BrowserWindow can be recreated with new frame
          const ok = confirm(
            "The app needs to restart to apply the titlebar change. Restart now?"
          );
          if (!ok) {
            // revert checkbox to previous state
            try {
              const cur = await (window.electronAPI &&
              window.electronAPI.getUseCustomTitlebar
                ? window.electronAPI.getUseCustomTitlebar()
                : true);
              chk.checked = !!cur;
            } catch (e) {}
            return;
          }
          // Apply and restart (main will persist and relaunch)
          try {
            if (window.electronAPI && window.electronAPI.applyTitlebarSetting) {
              window.electronAPI.applyTitlebarSetting(enabled);
            } else {
              // fallback: use ipcRenderer directly if available
              try {
                require("electron").ipcRenderer.send(
                  "apply-titlebar-setting",
                  enabled
                );
              } catch (e) {}
            }
          } catch (e) {}
        } catch (e) {}
      });
    } catch (e) {}
  })();
} catch (e) {}

// Listen for main asking us to show/hide the custom titlebar (sent at ready-to-show)
try {
  const { ipcRenderer } = require("electron");
  ipcRenderer.on("use-custom-titlebar", (ev, enabled) => {
    try {
      const tb = document.querySelector(".titlebar");
      if (tb) tb.style.display = enabled ? "flex" : "none";
      try {
        const platform =
          (window && window.electronAPI && window.electronAPI.platform) ||
          (typeof process !== "undefined" ? process.platform : "");
        if (platform === "win32") {
          if (enabled) document.body.classList.add("has-custom-titlebar");
          else document.body.classList.remove("has-custom-titlebar");
        }
      } catch (e) {}
    } catch (e) {}
  });
} catch (e) {}

// Dev-only: print resolved ffmpeg path at startup to help debugging.
(async function devLogFfmpegPath() {
  try {
    if (
      window.electronAPI &&
      window.electronAPI.isDev &&
      window.electronAPI.getFfmpegPath
    ) {
      const p = await window.electronAPI.getFfmpegPath();
      console.log("[DEV] resolved ffmpeg path:", p);
    }
  } catch (e) {}
})();

// Initialize FFmpeg modal UI per-platform immediately to avoid race conditions
try {
  setTimeout(() => {
    try {
      const platform =
        (window && window.electronAPI && window.electronAPI.platform) ||
        (typeof process !== "undefined" ? process.platform : "");
      const ffmpegDownloads = document.getElementById("ffmpegDownloads");
      const ffmpegCmdEl = document.getElementById("ffmpegCmd");
      const ffmpegCopyBtn = document.getElementById("ffmpegCopyBtn");
      const ffmpegInstallWrap = document.querySelector(".ffmpeg-install");
      const txtEl = document.getElementById("ffmpegInstallText");
      // don't bail out early if a single element is missing; handle gracefully
      if (platform === "win32") {
        try {
          if (ffmpegDownloads) ffmpegDownloads.style.display = "none";
        } catch (e) {}
        try {
          if (ffmpegInstallWrap) ffmpegInstallWrap.style.display = "flex";
        } catch (e) {}
        try {
          if (ffmpegCmdEl) {
            ffmpegCmdEl.textContent = "winget install ffmpeg";
            ffmpegCmdEl.style.display = "inline-block";
          }
        } catch (e) {}
        try {
          if (ffmpegCopyBtn) ffmpegCopyBtn.style.display = "inline-block";
        } catch (e) {}
        try {
          if (txtEl)
            txtEl.textContent =
              "Install FFmpeg using Windows Package Manager (PowerShell):";
        } catch (e) {}
      } else if (platform === "darwin") {
        try {
          if (ffmpegDownloads) ffmpegDownloads.style.display = "flex";
        } catch (e) {}
        try {
          if (ffmpegInstallWrap) ffmpegInstallWrap.style.display = "none";
        } catch (e) {}
        try {
          if (ffmpegCmdEl) ffmpegCmdEl.style.display = "none";
        } catch (e) {}
        try {
          if (ffmpegCopyBtn) ffmpegCopyBtn.style.display = "none";
        } catch (e) {}
        try {
          if (txtEl)
            txtEl.textContent =
              "Please download these 2 FFmpeg binaries for macOS, extract them, and place them in /usr/local/bin:";
        } catch (e) {}
      } else {
        // default: non-mac platforms assume Windows-style winget command
        try {
          if (ffmpegDownloads) ffmpegDownloads.style.display = "none";
        } catch (e) {}
        try {
          if (ffmpegInstallWrap) ffmpegInstallWrap.style.display = "flex";
        } catch (e) {}
        try {
          if (ffmpegCmdEl) {
            ffmpegCmdEl.textContent = "winget install ffmpeg";
            ffmpegCmdEl.style.display = "inline-block";
          }
        } catch (e) {}
        try {
          if (ffmpegCopyBtn) ffmpegCopyBtn.style.display = "inline-block";
        } catch (e) {}
        try {
          if (txtEl)
            txtEl.textContent =
              "Install FFmpeg using Windows Package Manager (PowerShell):";
        } catch (e) {}
      }
    } catch (e) {}
  }, 50);
} catch (e) {}

// Helper: choose the best release asset for this platform (case-insensitive)
function selectReleaseAsset(assets) {
  try {
    const platform =
      (window && window.electronAPI && window.electronAPI.platform) ||
      (typeof process !== "undefined" ? process.platform : "");
    return require("./update-utils").selectReleaseAsset(assets, platform);
  } catch (e) {
    return null;
  }
}

// Ensure update download always works: centralized download function and click handler
async function downloadLatestReleaseFromGitHub() {
  const downloadBtn = document.getElementById("updateDownloadBtn");
  if (!downloadBtn) return;
  // guard against double-clicks
  if (downloadBtn.dataset.running === "1") return;
  downloadBtn.dataset.running = "1";
  try {
    downloadBtn.disabled = true;
    downloadBtn.classList.add("loading");
    const progressWrap = document.getElementById("updateProgressWrap");
    const progEl = document.getElementById("updateProgressBar");
    const pctEl = document.getElementById("updateProgressPct");

    if (progressWrap) progressWrap.style.display = "block";
    if (pctEl) pctEl.style.display = "block";
    if (progEl) progEl.style.width = "0%";
    if (pctEl) pctEl.textContent = "0%";

    const r = await fetch(
      "https://api.github.com/repos/MinimackStudios/compressly/releases/latest",
      { headers: { Accept: "application/vnd.github.v3+json" } }
    );
    if (!r.ok) throw new Error("Could not fetch release info");
    const d = await r.json();
    const assets = d.assets || [];
    if (!assets.length) {
      // nothing to download for this release — report and bail
      try {
        if (statusEl)
          statusEl.textContent =
            "No downloadable installer found for the latest release.";
      } catch (e) {}
      return;
    }
    // Prefer platform-appropriate asset (on mac prefer .pkg). Fall back to first asset.
    const picked = selectReleaseAsset(assets);
    let asset = picked || (assets && assets[0]) || null;
    const assetUrl = asset && asset.browser_download_url;
    const defaultName =
      asset &&
      (asset.name || `compressly-${(d.tag_name || "").replace(/^v/i, "")}.zip`);
    if (!assetUrl) {
      try {
        if (statusEl)
          statusEl.textContent = "Release asset missing or unavailable.";
      } catch (e) {}
      return;
    }

    const resp = await fetch(assetUrl);
    if (!resp.ok) throw new Error("Failed to download asset");

    const contentLength = resp.headers.get("content-length");
    const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
    const reader =
      resp.body && resp.body.getReader ? resp.body.getReader() : null;
    const chunks = [];
    let received = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length || value.byteLength || 0;
        if (progEl && totalBytes) {
          const pct = Math.round((received / totalBytes) * 100);
          progEl.style.width = pct + "%";
          if (pctEl) pctEl.textContent = pct + "%";
        }
      }
    } else {
      const arrayBuffer = await resp.arrayBuffer();
      chunks.push(new Uint8Array(arrayBuffer));
      received = arrayBuffer.byteLength || 0;
      if (progEl && totalBytes) {
        const pct = Math.round((received / totalBytes) * 100);
        progEl.style.width = pct + "%";
        if (pctEl) pctEl.textContent = pct + "%";
      }
    }

    // concatenate
    let length = 0;
    for (const c of chunks) length += c.length || c.byteLength || 0;
    const merged = new Uint8Array(length);
    let offset = 0;
    for (const c of chunks) {
      merged.set(c instanceof Uint8Array ? c : new Uint8Array(c), offset);
      offset += c.length || c.byteLength || 0;
    }

    const os = require("os");
    const path = require("path");
    const downloadsDir = path.join(os.homedir(), "Downloads");
    const savePath = path.join(downloadsDir, defaultName);

    if (window.electronAPI && window.electronAPI.writeFile) {
      const updateBytes = Buffer.from(merged);
      const verification = require("./update-utils").verifyAssetDigest(
        updateBytes,
        asset.digest
      );
      if (verification.reason === "mismatch") {
        throw new Error("Downloaded update failed SHA-256 verification");
      }
      await window.electronAPI.writeFile(savePath, updateBytes);
      try {
        const { shell } = require("electron");
        if (shell && shell.showItemInFolder) shell.showItemInFolder(savePath);
        else shell.openPath(downloadsDir);
      } catch (e) {
        try {
          window.open(downloadsDir, "_blank");
        } catch (e) {}
      }
      if (statusEl) {
        statusEl.textContent = verification.verified
          ? "Update downloaded and SHA-256 verified. Open it from Downloads when ready."
          : "Update downloaded. Open it from Downloads when ready.";
      }
    } else {
      // fallback: open releases page
      const url =
        d.html_url ||
        localStorage.getItem("compressly_update_latestUrl") ||
        "https://github.com/MinimackStudios/compressly/releases";
      try {
        require("electron").shell.openExternal(url);
      } catch (e) {
        window.open(url, "_blank");
      }
    }

    // finish UI
    if (progEl) progEl.style.width = "100%";
    if (pctEl) pctEl.textContent = "100%";
    setTimeout(() => {
      if (progressWrap) progressWrap.style.display = "none";
      if (pctEl) pctEl.style.display = "none";
      downloadBtn.classList.remove("loading");
      downloadBtn.disabled = false;
    }, 600);
  } catch (err) {
    console.warn("download failed", err);
    try {
      const progressWrap = document.getElementById("updateProgressWrap");
      if (progressWrap) progressWrap.style.display = "none";
      const downloadBtn = document.getElementById("updateDownloadBtn");
      if (downloadBtn) {
        downloadBtn.classList.remove("loading");
        downloadBtn.disabled = false;
      }
    } catch (e) {}
  } finally {
    const downloadBtn = document.getElementById("updateDownloadBtn");
    if (downloadBtn) downloadBtn.dataset.running = "0";
  }
}

// attach always-present handler
try {
  const dl = document.getElementById("updateDownloadBtn");
  if (dl)
    dl.addEventListener("click", (ev) => {
      ev.preventDefault();
      downloadLatestReleaseFromGitHub();
    });
} catch (e) {}

// Settings persistence keys
const SETTINGS_KEYS = {
  targetSize: "compressly_targetSize",
  videoFps: "compressly_videoFps",
  targetResolution: "compressly_targetResolution",
  priority: "compressly_priority",
  compressionMode: "compressly_compressionMode",
  smartOptions: "compressly_smartOptions",
};

const TARGET_PRESETS = [1, 5, 10, 25, 50, 100];
const FPS_PRESETS = [24, 25, 30, 50, 60, 120];
const {
  selectPreset,
  isValidTargetSize,
  isValidFps,
  getMediaDetailCapabilities,
  parseSsimOutput,
  getSsimSampleTimestamps,
  summarizeSmartBatch,
} = require("./media-utils");
const {
  TOUR_STEP_IDS,
  clampTourIndex,
  hasSeenTour,
  markTourSeen,
  createTourSnapshot,
} = require("./tour-utils");

function persistSetting(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {}
}

function getSmartOptions() {
  return {
    quality: smartQualityEl.value,
    retainResolution: smartRetainResolutionEl.checked,
    retainFps: smartRetainFpsEl.checked,
    preserveAudio: smartPreserveAudioEl.checked,
    stripMetadata: smartStripMetadataEl.checked,
  };
}

function persistSmartOptions() {
  persistSetting(SETTINGS_KEYS.smartOptions, JSON.stringify(getSmartOptions()));
}

function setCompressionMode(mode, animate = true) {
  const nextMode = mode === "smart" ? "smart" : "standard";
  const leavingSmartMode = compressionMode === "smart" && nextMode === "standard";
  if (nextMode !== "smart") closeSmartResultsView();
  const allowMotion =
    animate &&
    !document.body.classList.contains("lite-mode") &&
    !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if (
    allowMotion &&
    compressionMode === "smart" &&
    nextMode === "standard" &&
    !document.body.classList.contains("smart-exiting")
  ) {
    document.body.classList.add("smart-exiting");
    setTimeout(() => {
      document.body.classList.remove("smart-exiting");
      setCompressionMode("standard", false);
      document.body.classList.add("standard-entering");
      setTimeout(
        () => document.body.classList.remove("standard-entering"),
        240
      );
    }, 280);
    return;
  }
  compressionMode = nextMode;
  const smart = compressionMode === "smart";
  standardModeBtn.classList.toggle("active", !smart);
  smartModeBtn.classList.toggle("active", smart);
  document.body.classList.toggle("smart-mode", smart);
  standardOptionsEl.classList.toggle("active", !smart);
  smartOptionsEl.classList.toggle("active", smart);
  if (leavingSmartMode && !tourActive) removeSmartBatchFilesFromRegularQueue();
  const incoming = smart ? smartOptionsEl : standardOptionsEl;
  if (allowMotion && smart) {
    incoming.classList.add("entering");
    setTimeout(() => incoming.classList.remove("entering"), 340);
  }
  modeDescriptionEl.textContent =
    "Make files meaningfully smaller while preserving the details, motion, and sound that matter.";
  const dropHint = document.querySelector(".drop-hint");
  if (dropHint)
    dropHint.textContent = smart
      ? "Drop media here and Smart Compression will analyze the best way to optimize it"
      : 'Drag & drop files here, or click "Select Files"';
  startBtn.textContent = smart ? "Smart Compress" : "Compress!";
  pickBtn.textContent = smart ? "Add Media" : "Select Files";
  if (!tourActive)
    persistSetting(SETTINGS_KEYS.compressionMode, compressionMode);
}

function applyTargetSizeControl(value, persist = false) {
  const validValue = isValidTargetSize(value) ? Number(value) : 10;
  const selected = selectPreset(validValue, TARGET_PRESETS);
  targetSizeEl.value = String(validValue);
  targetSizePresetEl.value = selected;
  if (selected !== "custom") targetSizePresetEl.dataset.lastPreset = selected;
  else if (!targetSizePresetEl.dataset.lastPreset)
    targetSizePresetEl.dataset.lastPreset = "10";
  targetSizeControlEl.classList.toggle("custom-active", selected === "custom");
  if (persist) persistSetting(SETTINGS_KEYS.targetSize, validValue);
}

function applyFpsControl(value, persist = false) {
  const validValue = isValidFps(value) ? Number(value) : 30;
  const selected = selectPreset(validValue, FPS_PRESETS);
  videoFpsEl.value = String(validValue);
  videoFpsPresetEl.value = selected;
  if (selected !== "custom") videoFpsPresetEl.dataset.lastPreset = selected;
  else if (!videoFpsPresetEl.dataset.lastPreset)
    videoFpsPresetEl.dataset.lastPreset = "30";
  videoFpsControlEl.classList.toggle("custom-active", selected === "custom");
  if (persist) persistSetting(SETTINGS_KEYS.videoFps, validValue);
}

// Load persisted settings (if present) and apply to inputs
try {
  const savedTarget = localStorage.getItem(SETTINGS_KEYS.targetSize);
  applyTargetSizeControl(savedTarget !== null ? savedTarget : targetSizeEl.value);
  const savedFps = localStorage.getItem(SETTINGS_KEYS.videoFps);
  applyFpsControl(savedFps !== null ? savedFps : videoFpsEl.value);
  const savedRes = localStorage.getItem(SETTINGS_KEYS.targetResolution);
  if (savedRes !== null && targetResolutionEl)
    targetResolutionEl.value = savedRes;
  const savedPriority = localStorage.getItem(SETTINGS_KEYS.priority);
  if (savedPriority !== null && prioritySelectEl)
    prioritySelectEl.value = savedPriority;
  try {
    const savedSmart = JSON.parse(
      localStorage.getItem(SETTINGS_KEYS.smartOptions) || "{}"
    );
    if (["fidelity", "balanced", "compact"].includes(savedSmart.quality))
      smartQualityEl.value = savedSmart.quality;
    for (const [element, key] of [
      [smartRetainResolutionEl, "retainResolution"],
      [smartRetainFpsEl, "retainFps"],
      [smartPreserveAudioEl, "preserveAudio"],
      [smartStripMetadataEl, "stripMetadata"],
    ]) {
      if (typeof savedSmart[key] === "boolean") element.checked = savedSmart[key];
    }
  } catch (e) {}
  setCompressionMode(
    localStorage.getItem(SETTINGS_KEYS.compressionMode) || "standard",
    false
  );
} catch (e) {
  console.warn("Could not load settings from localStorage", e);
}

// Save handlers to persist on change
try {
  standardModeBtn.addEventListener("click", () => setCompressionMode("standard"));
  smartModeBtn.addEventListener("click", () => setCompressionMode("smart"));
  [
    smartQualityEl,
    smartRetainResolutionEl,
    smartRetainFpsEl,
    smartPreserveAudioEl,
    smartStripMetadataEl,
  ].forEach((element) => element.addEventListener("change", persistSmartOptions));
  if (targetSizePresetEl)
    targetSizePresetEl.addEventListener("change", () => {
      if (targetSizePresetEl.value === "custom") {
        targetSizeControlEl.classList.add("custom-active");
        targetSizeEl.focus();
      } else {
        applyTargetSizeControl(targetSizePresetEl.value, true);
      }
    });
  if (targetSizeEl)
    targetSizeEl.addEventListener("change", () => {
      if (!isValidTargetSize(targetSizeEl.value)) targetSizeEl.value = "10";
      applyTargetSizeControl(targetSizeEl.value, true);
    });
  if (targetCustomCloseEl)
    targetCustomCloseEl.addEventListener("click", () => {
      applyTargetSizeControl(
        targetSizePresetEl.dataset.lastPreset || "10",
        true
      );
    });
  if (videoFpsPresetEl)
    videoFpsPresetEl.addEventListener("change", () => {
      if (videoFpsPresetEl.value === "custom") {
        videoFpsControlEl.classList.add("custom-active");
        videoFpsEl.focus();
      } else {
        applyFpsControl(videoFpsPresetEl.value, true);
      }
    });
  if (videoFpsEl)
    videoFpsEl.addEventListener("change", () => {
      if (!isValidFps(videoFpsEl.value)) videoFpsEl.value = "30";
      applyFpsControl(videoFpsEl.value, true);
    });
  if (fpsCustomCloseEl)
    fpsCustomCloseEl.addEventListener("click", () => {
      applyFpsControl(videoFpsPresetEl.dataset.lastPreset || "30", true);
    });
  if (targetResolutionEl)
    targetResolutionEl.addEventListener("change", (ev) => {
      try {
        const v = String(ev.target.value);
        localStorage.setItem(SETTINGS_KEYS.targetResolution, v);
      } catch (e) {}
    });
  if (prioritySelectEl)
    prioritySelectEl.addEventListener("change", (ev) => {
      try {
        const v = String(ev.target.value);
        localStorage.setItem(SETTINGS_KEYS.priority, v);
      } catch (e) {}
    });
} catch (e) {
  console.warn("Could not attach settings persistence handlers", e);
}

// The saved theme and custom-control states are now settled. Allow normal
// transitions only after Chromium has committed this stable initial layout.
requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    document.documentElement.classList.remove("booting", "startup-dark");
  });
});

// Global file lists/state (were accidentally removed) used by file pick, drag/drop, and processing
let files = [];
let fileStates = {}; // track per-file progress and status
let anyCancelled = false;
let smartBatchSummary = null;

// --- Update check with caching; auto-download to Downloads when user clicks Download ---
try {
  (async () => {
    try {
      const pj = require("../package.json");
      const localVer = pj.version || "0.0.0";

      const CACHE_KEY = "compressly_update_lastChecked";
      const now = Date.now();

      let latestTag =
        localStorage.getItem("compressly_update_latestTag") || null;
      let latestUrl =
        localStorage.getItem("compressly_update_latestUrl") || null;

      // Always attempt to fetch the latest release from GitHub on startup so
      // we don't rely on stale cached values. If the network call fails we
      // will gracefully fall back to any cached tag/url already stored.
      const updateCheckController = new AbortController();
      const updateCheckTimeout = setTimeout(
        () => updateCheckController.abort(),
        8000
      );
      try {
        const res = await fetch(
          "https://api.github.com/repos/MinimackStudios/compressly/releases/latest",
          {
            headers: { Accept: "application/vnd.github.v3+json" },
            signal: updateCheckController.signal,
          }
        );
        if (res.ok) {
          const data = await res.json();
          latestTag = (data.tag_name || data.name || "").replace(/^v/i, "");
          latestUrl =
            data.html_url ||
            "https://github.com/MinimackStudios/compressly/releases";
          // update cache timestamp and stored values
          localStorage.setItem(CACHE_KEY, String(now));
          if (latestTag)
            localStorage.setItem("compressly_update_latestTag", latestTag);
          if (latestUrl)
            localStorage.setItem("compressly_update_latestUrl", latestUrl);
        }
      } catch (e) {
        // network failure — keep using cached latestTag/latestUrl if present
      } finally {
        clearTimeout(updateCheckTimeout);
      }

      if (!latestTag) return; // nothing to compare

      function compareSemver(a, b) {
        const pa = a.split(/[.-]/).map((s) => parseInt(s, 10) || 0);
        const pb = b.split(/[.-]/).map((s) => parseInt(s, 10) || 0);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
          const na = pa[i] || 0;
          const nb = pb[i] || 0;
          if (na > nb) return 1;
          if (na < nb) return -1;
        }
        return 0;
      }

      if (compareSemver(latestTag, localVer) > 0) {
        if (updateLatest) updateLatest.textContent = latestTag;
        if (updateLocal) updateLocal.textContent = localVer;
        if (updateNotes)
          updateNotes.textContent =
            "Visit the GitHub releases page for the release notes.";
        if (updateModal) updateModal.classList.add("visible");

        const url =
          latestUrl || "https://github.com/MinimackStudios/compressly/releases";
        const openExternal = () => {
          try {
            const { shell } = require("electron");
            shell.openExternal(url);
          } catch (e) {
            window.open(url, "_blank");
          }
        };

        if (updateViewBtn)
          updateViewBtn.addEventListener("click", openExternal);
        if (updateClose)
          updateClose.addEventListener("click", () =>
            updateModal.classList.remove("visible")
          );
        if (updateCloseBtn)
          updateCloseBtn.addEventListener("click", () =>
            updateModal.classList.remove("visible")
          );

        // Downloading is handled once by downloadLatestReleaseFromGitHub().
        const downloadBtn = document.getElementById("updateDownloadBtn");
        if (false && downloadBtn) {
          downloadBtn.addEventListener("click", async () => {
            downloadBtn.disabled = true;
            downloadBtn.classList.add("loading");
            const progressWrap = document.getElementById("updateProgressWrap");
            const progEl = document.getElementById("updateProgressBar");
            try {
              const r = await fetch(
                "https://api.github.com/repos/MinimackStudios/compressly/releases/latest",
                { headers: { Accept: "application/vnd.github.v3+json" } }
              );
              if (!r.ok) throw new Error("Could not fetch release info");
              const d = await r.json();
              const assets = d.assets || [];
              if (!assets.length) {
                downloadBtn.classList.remove("loading");
                downloadBtn.disabled = false;
                openExternal();
                return;
              }
              // Select platform-appropriate asset using helper
              const picked = selectReleaseAsset(assets);
              const asset = picked || (assets && assets[0]) || null;
              const assetUrl = asset && asset.browser_download_url;
              const defaultName =
                asset && (asset.name || `compressly-${latestTag}.zip`);
              if (!assetUrl) {
                downloadBtn.classList.remove("loading");
                downloadBtn.disabled = false;
                openExternal();
                return;
              }

              // show progress bar and percentage
              const pctEl = document.getElementById("updateProgressPct");
              if (progressWrap) progressWrap.style.display = "block";
              if (pctEl) pctEl.style.display = "block";
              if (progEl) progEl.style.width = "0%";
              if (pctEl) pctEl.textContent = "0%";

              // stream the response so we can update progress
              const resp = await fetch(assetUrl);
              if (!resp.ok) throw new Error("Failed to download asset");

              const contentLength = resp.headers.get("content-length");
              const totalBytes = contentLength
                ? parseInt(contentLength, 10)
                : 0;
              const reader =
                resp.body && resp.body.getReader ? resp.body.getReader() : null;
              const chunks = [];
              let received = 0;

              if (reader) {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
                  chunks.push(value);
                  received += value.length || value.byteLength || 0;
                  if (progEl && totalBytes) {
                    const pct = Math.round((received / totalBytes) * 100);
                    progEl.style.width = pct + "%";
                    if (pctEl) pctEl.textContent = pct + "%";
                  }
                }
              } else {
                // fallback: read as arrayBuffer if streaming isn't available
                const arrayBuffer = await resp.arrayBuffer();
                chunks.push(new Uint8Array(arrayBuffer));
                received = arrayBuffer.byteLength || 0;
                if (progEl && totalBytes) {
                  const pct = Math.round((received / totalBytes) * 100);
                  progEl.style.width = pct + "%";
                  if (pctEl) pctEl.textContent = pct + "%";
                }
              }

              // concatenate chunks
              let length = 0;
              for (const c of chunks) length += c.length || c.byteLength || 0;
              const merged = new Uint8Array(length);
              let offset = 0;
              for (const c of chunks) {
                merged.set(
                  c instanceof Uint8Array ? c : new Uint8Array(c),
                  offset
                );
                offset += c.length || c.byteLength || 0;
              }

              const os = require("os");
              const path = require("path");
              const downloadsDir = path.join(os.homedir(), "Downloads");
              const savePath = path.join(downloadsDir, defaultName);

              if (window.electronAPI && window.electronAPI.writeFile) {
                await window.electronAPI.writeFile(
                  savePath,
                  Buffer.from(merged)
                );
                try {
                  const { shell } = require("electron");
                  if (shell && shell.showItemInFolder)
                    shell.showItemInFolder(savePath);
                  else shell.openPath(downloadsDir);
                } catch (e) {
                  try {
                    window.open(downloadsDir, "_blank");
                  } catch (e) {}
                }
              } else {
                openExternal();
              }

              // finish progress
              if (progEl) progEl.style.width = "100%";
              if (pctEl) pctEl.textContent = "100%";
              setTimeout(() => {
                if (progressWrap) progressWrap.style.display = "none";
                if (pctEl) pctEl.style.display = "none";
                downloadBtn.classList.remove("loading");
                downloadBtn.disabled = false;
              }, 600);
            } catch (e) {
              console.warn("download failed", e);
              if (progressWrap) progressWrap.style.display = "none";
              downloadBtn.classList.remove("loading");
              downloadBtn.disabled = false;
              openExternal();
            }
          });
        }

        if (updateModal)
          updateModal.addEventListener("click", (ev) => {
            if (ev.target === updateModal)
              updateModal.classList.remove("visible");
          });
      }
    } catch (e) {
      console.warn("update check failed", e);
    }
  })().finally(() => {
    updateStartupCheckSettled = true;
    maybeLaunchAutomaticTour();
  });
} catch (e) {
  updateStartupCheckSettled = true;
}

// (Removed fallback that opened the releases page - Download now only attempts the installer download)

function renderLongVideoList(listElement, videos) {
  if (!listElement) return;
  const fragment = document.createDocumentFragment();
  videos.forEach((video) => {
    const item = document.createElement("div");
    item.className = "long-video-item";
    const filename = require("path").basename(video.path);
    const minutes = Math.floor(video.duration / 60);
    const seconds = Math.round(video.duration % 60);
    item.textContent = `${filename} · ${minutes}m ${seconds}s`;
    fragment.appendChild(item);
  });
  listElement.replaceChildren(fragment);
}

// Prune cache files older than 7 days (run async, don't block UI)
setTimeout(() => {
  try {
    const fs = require("fs");
    const path = require("path");
    const cacheRoot = require("os").tmpdir();
    const filesInCache = fs.readdirSync(cacheRoot);
    const now = Date.now();
    for (const f of filesInCache) {
      if (!/^(?:compressly_thumb_.+|thumb_[a-z0-9]{7}|thumb_\d+(?:\.\d+)?_\d+_.+)\.png$/i.test(f)) continue;
      try {
        const st = fs.statSync(path.join(cacheRoot, f));
        if (now - st.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(path.join(cacheRoot, f));
        }
      } catch (e) {}
    }
  } catch (e) {}
}, 5000);

// Helper: when packaged to asar, binaries inside app.asar are not directly executable.
// If the ffmpeg-static path points inside an asar, copy it to a temp location and return the temp path.
function resolveBinaryPath(maybeObjOrPath) {
  try {
    const fs = require("fs");
    const path = require("path");
    const os = require("os");

    const p =
      maybeObjOrPath && maybeObjOrPath.path
        ? maybeObjOrPath.path
        : maybeObjOrPath;
    if (!p || typeof p !== "string") return p;

    // If the binary is inside an asar archive, copy to temp and return that path.
    if (p.includes("app.asar")) {
      const base = path.basename(p);
      const out = path.join(os.tmpdir(), `compressly_${base}`);
      try {
        if (!fs.existsSync(out)) {
          // copy file out of the asar bundle so it can be executed.
          fs.copyFileSync(p, out);
          try {
            // ensure executable bit (no-op on Windows)
            fs.chmodSync(out, 0o755);
          } catch (e) {}
        }
        return out;
      } catch (e) {
        console.warn("resolveBinaryPath copy failed", e);
        return p;
      }
    }
    return p;
  } catch (e) {
    return maybeObjOrPath;
  }
}

async function getFfmpegPath() {
  try {
    if (window.electronAPI && window.electronAPI.getFfmpegPath) {
      const p = await window.electronAPI.getFfmpegPath();
      if (p) return p;
    }
  } catch (e) {}
  try {
    const ffmpegStatic = require("ffmpeg-static");
    return ffmpegStatic && (ffmpegStatic.path || ffmpegStatic);
  } catch (e) {}
  return "ffmpeg";
}

async function getFfprobePath() {
  try {
    if (window.electronAPI && window.electronAPI.getFfprobePath) {
      const p = await window.electronAPI.getFfprobePath();
      if (p) return p;
    }
  } catch (e) {}
  try {
    const ffprobeStatic = require("ffprobe-static");
    return ffprobeStatic && (ffprobeStatic.path || ffprobeStatic);
  } catch (e) {}
  return "ffprobe";
}
// Allowed extensions for drag/drop and basic type checks
const IMAGE_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".bmp",
  ".tif",
  ".tiff",
];
const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"];

const SSIM_FILTER = [
  "color=c=white:s=1280x720[base0]",
  "color=c=white:s=1280x720[base1]",
  "[0:v]format=rgba,scale=1280:720:force_original_aspect_ratio=decrease[scaled0]",
  "[1:v]format=rgba,scale=1280:720:force_original_aspect_ratio=decrease[scaled1]",
  "[base0][scaled0]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,format=yuv420p[ref]",
  "[base1][scaled1]overlay=(W-w)/2:(H-h)/2:shortest=1,setsar=1,format=yuv420p[dist]",
  "[dist][ref]ssim",
].join(";");

async function runSsimSample(sourcePath, outputPath, timestamp = null) {
  const { spawn } = require("child_process");
  const ffmpegPath = resolveBinaryPath(await getFfmpegPath());
  const seek = timestamp === null ? [] : ["-ss", String(timestamp)];
  const args = [
    "-hide_banner",
    ...seek,
    "-i", sourcePath,
    ...seek,
    "-i", outputPath,
    "-filter_complex", SSIM_FILTER,
    "-frames:v", "1",
    "-f", "null",
    "-",
  ];

  return await new Promise((resolve) => {
    let stderr = "";
    let finished = false;
    const child = spawn(ffmpegPath, args, { windowsHide: true });
    const finish = (value) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch (e) {}
      finish(null);
    }, 15000);
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 200000) stderr += String(chunk);
    });
    child.on("error", () => finish(null));
    child.on("close", () => finish(parseSsimOutput(stderr)));
  });
}

async function analyzeSmartFileQuality(filePath) {
  const fs = require("fs");
  const state = fileStates[filePath];
  if (!state || !state.lastOut || !fs.existsSync(state.lastOut)) return;
  const kind = (state.sourceDetails && state.sourceDetails.kind) || mediaKindForPath(filePath);
  state.resultDetails = state.resultDetails || {};

  if (kind === "Audio") {
    state.resultDetails.qualityAnalysis = {
      status: "not-applicable",
      reason: "Audio is reported using encoding facts",
    };
    return;
  }
  if (kind !== "Image" && kind !== "Video") return;

  state.resultDetails.qualityAnalysis = { status: "analyzing" };
  const timestamps = kind === "Video"
    ? getSsimSampleTimestamps(state.sourceDetails && state.sourceDetails.duration)
    : [null];
  if (!timestamps.length) {
    state.resultDetails.qualityAnalysis = {
      status: "unavailable",
      reason: "Source duration is unavailable",
    };
    return;
  }

  const scores = [];
  for (const timestamp of timestamps) {
    try {
      const score = await runSsimSample(filePath, state.lastOut, timestamp);
      if (score !== null) scores.push(score);
    } catch (e) {}
  }
  if (!scores.length) {
    state.resultDetails.qualityAnalysis = {
      status: "unavailable",
      reason: "Visual comparison could not be completed",
      attemptedSamples: timestamps.length,
    };
    return;
  }

  const similarity =
    (scores.reduce((sum, value) => sum + value, 0) / scores.length) * 100;
  state.resultDetails.qualityAnalysis = {
    status: "complete",
    metric: "SSIM",
    similarity,
    difference: Math.max(0, 100 - similarity),
    samples: scores.length,
    attemptedSamples: timestamps.length,
  };
}

async function analyzeSmartBatch(batchFiles) {
  const successful = batchFiles.filter((filePath) => {
    const state = fileStates[filePath];
    return state && (state.status === "done" || state.status === "done-oversize");
  });
  const visualFiles = successful.filter((filePath) => {
    const state = fileStates[filePath];
    const kind = state && state.sourceDetails && state.sourceDetails.kind;
    return kind === "Image" || kind === "Video";
  });
  successful
    .filter((filePath) => !visualFiles.includes(filePath))
    .forEach((filePath) => {
      const state = fileStates[filePath];
      if (!state) return;
      state.resultDetails = state.resultDetails || {};
      state.resultDetails.qualityAnalysis = {
        status: "not-applicable",
        reason: "Audio is reported using encoding facts",
      };
    });
  if (!visualFiles.length) statusEl.textContent = "Preparing results…";
  for (let index = 0; index < visualFiles.length; index += 1) {
    statusEl.textContent = `Analyzing visual quality… ${index + 1} of ${visualFiles.length}`;
    await analyzeSmartFileQuality(visualFiles[index]);
    updateDetailedView();
  }
}

// File.path was removed by Electron 32. Keep the old-property fallback so
// development with older Electron versions continues to work.
function getLocalFilePath(file) {
  try {
    if (window.electronAPI && window.electronAPI.getPathForFile) {
      return window.electronAPI.getPathForFile(file);
    }
  } catch (e) {}
  return file && file.path;
}

// Theme initialization
const themeToggle = document.getElementById("themeToggle");
function applyTheme(dark) {
  if (dark) document.body.classList.add("dark");
  else document.body.classList.remove("dark");
  try {
    localStorage.setItem("themeDark", dark ? "1" : "0");
  } catch (e) {}
  if (themeToggle) themeToggle.checked = !!dark;
  // Inform main process to switch native theme (so mac titlebar matches app)
  try {
    if (
      window.electronAPI &&
      typeof window.electronAPI.setAppTheme === "function"
    ) {
      const t = dark ? "dark" : "light";
      // don't await (fire-and-forget), but catch errors
      window.electronAPI.setAppTheme(t).catch(() => {});
    }
  } catch (e) {}
}
try {
  const prev = localStorage.getItem("themeDark");
  applyTheme(prev === "1");
} catch (e) {}
// Also sync the native theme on startup (if the preload exposes setAppTheme)
try {
  const prev = localStorage.getItem("themeDark");
  if (
    typeof prev !== "undefined" &&
    window.electronAPI &&
    typeof window.electronAPI.setAppTheme === "function"
  ) {
    try {
      const t = prev === "1" ? "dark" : "light";
      window.electronAPI.setAppTheme(t).catch(() => {});
    } catch (e) {}
  }
} catch (e) {}
if (themeToggle) {
  themeToggle.addEventListener("change", (e) => applyTheme(e.target.checked));
}

// Restart blob animations after theme is applied so long-running CSS animations
// reliably start in the Electron renderer (some platforms may defer long/slow animations)
setTimeout(() => {
  try {
    const blobs = document.querySelectorAll(".bg-blobs .blob");
    blobs.forEach((b) => {
      const computed = getComputedStyle(b).animation || b.style.animation;
      if (computed && computed !== "none") {
        b.style.animation = "none";
        setTimeout(() => (b.style.animation = computed), 40);
      }
    });
  } catch (e) {}
}, 120);

pickBtn.addEventListener("click", async () => {
  try {
    if (!window.electronAPI || !window.electronAPI.selectFiles)
      throw new Error("Electron API not available");
    const paths = await window.electronAPI.selectFiles();
    if (!paths || paths.length === 0) {
      statusEl.textContent = "No files selected";
      return;
    }
    // Add files but avoid duplicates (case-insensitive)
    const existing = new Set(files.map((x) => x.toLowerCase()));
    const added = [];
    const skipped = [];
    for (const p of paths) {
      if (!existing.has(p.toLowerCase())) {
        files.push(p);
        existing.add(p.toLowerCase());
        added.push(p);
      } else skipped.push(p);
    }
    renderList();
    statusEl.textContent =
      `Added ${added.length} file(s)` +
      (skipped.length ? `, skipped ${skipped.length} duplicate(s)` : "");
    updateFooterInfo();
    // check for long videos among newly added files
    try {
      const longVideos = [];
      if (added.length) {
        const ffmpeg = require("fluent-ffmpeg");
        const getMeta = (src) =>
          new Promise((res, rej) =>
            ffmpeg.ffprobe(src, (err, meta) => (err ? rej(err) : res(meta)))
          );
        for (const p of added) {
          try {
            const ext = require("path").extname(p).toLowerCase();
            if (!VIDEO_EXTS.includes(ext)) continue;
            const meta = await getMeta(p);
            const dur = (meta && meta.format && meta.format.duration) || 0;
            if (dur > 30 * 60) longVideos.push({ path: p, duration: dur });
          } catch (e) {}
        }
      }
      if (longVideos.length) {
        const listEl = document.getElementById("longVideoList");
        renderLongVideoList(listEl, longVideos);
        const modal = document.getElementById("longVideoModal");
        if (modal) modal.classList.add("visible");
      }
    } catch (e) {}
  } catch (err) {
    console.error("select files failed", err);
    statusEl.textContent = "Error opening file picker. See console.";
    if (window.electronAPI && window.electronAPI.log)
      window.electronAPI.log("select-files error", err.message);
  }
});
if (smartPickBtn) smartPickBtn.addEventListener("click", () => pickBtn.click());

// Drag & drop support
const dropArea = document.getElementById("dropArea");
if (dropArea) {
  ["dragenter", "dragover"].forEach((e) =>
    dropArea.addEventListener(e, (ev) => {
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "copy";
      dropArea.classList.add("dragover");
    })
  );
  ["dragleave", "drop", "dragend"].forEach((e) =>
    dropArea.addEventListener(e, (ev) => {
      ev.preventDefault();
      dropArea.classList.remove("dragover");
    })
  );
  dropArea.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    const accepted = [];
    const ignoredNames = [];
    if (ev.dataTransfer && ev.dataTransfer.files) {
      for (const f of ev.dataTransfer.files) {
        try {
          const p = getLocalFilePath(f);
          if (!p) throw new Error("Could not resolve dropped file path");
          const ext = require("path").extname(p).toLowerCase();
          if (
            IMAGE_EXTS.includes(ext) ||
            VIDEO_EXTS.includes(ext) ||
            AUDIO_EXTS.includes(ext)
          ) {
            accepted.push(p);
          } else {
            ignoredNames.push(require("path").basename(p));
          }
        } catch (e) {
          ignoredNames.push(f.name || "unknown");
        }
      }
    }
    if (accepted.length) {
      // dedupe against existing files
      const existing = new Set(files.map((x) => x.toLowerCase()));
      const actuallyAdded = [];
      const skipped = [];
      for (const p of accepted) {
        if (!existing.has(p.toLowerCase())) {
          files.push(p);
          existing.add(p.toLowerCase());
          actuallyAdded.push(p);
        } else skipped.push(p);
      }
      renderList();
      let msg = `Added ${actuallyAdded.length} file(s)`;
      if (ignoredNames.length) {
        const shown = ignoredNames.slice(0, 6).join(", ");
        msg +=
          `. Ignored unsupported: ${shown}` +
          (ignoredNames.length > 6 ? `, +${ignoredNames.length - 6} more` : "");
      }
      if (skipped.length) msg += `, skipped ${skipped.length} duplicate(s)`;
      statusEl.textContent = msg;
      updateFooterInfo();
      // check for long videos among newly added files
      try {
        const actuallyLong = [];
        const ffmpeg = require("fluent-ffmpeg");
        const getMeta = (src) =>
          new Promise((res, rej) =>
            ffmpeg.ffprobe(src, (err, meta) => (err ? rej(err) : res(meta)))
          );
        for (const p of actuallyAdded) {
          try {
            const ext = require("path").extname(p).toLowerCase();
            if (!VIDEO_EXTS.includes(ext)) continue;
            const meta = await getMeta(p);
            const dur = (meta && meta.format && meta.format.duration) || 0;
            if (dur > 30 * 60) actuallyLong.push({ path: p, duration: dur });
          } catch (e) {}
        }
        if (actuallyLong.length) {
          const listEl = document.getElementById("longVideoList");
          renderLongVideoList(listEl, actuallyLong);
          const modal = document.getElementById("longVideoModal");
          if (modal) modal.classList.add("visible");
        }
      } catch (e) {}
    } else if (ignoredNames.length) {
      const shown = ignoredNames.slice(0, 6).join(", ");
      statusEl.textContent =
        `No supported image/video files. Ignored: ${shown}` +
        (ignoredNames.length > 6 ? `, +${ignoredNames.length - 6} more` : "");
    }
  });

  // Clear list handler
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      closeSmartResultsView();
      smartBatchSummary = null;
      files = [];
      fileStates = {};
      anyCancelled = false;
      renderList();
      updateFooterInfo();
    });
  }

  // About modal handlers
  if (aboutModal) {
    // central show function so menu IPC can reuse the same behavior
    async function showAboutModal() {
      try {
        // read package.json for version and deps
        const pj = require("../package.json");
        if (aboutVersion) aboutVersion.textContent = pj.version || "?";
        if (aboutAuthor) aboutAuthor.textContent = "Minimack Studios";
        if (aboutRuntime)
          aboutRuntime.textContent = `${process.platform} • Node ${process.versions.node} • Electron ${process.versions.electron}`;
        if (aboutDeps)
          aboutDeps.textContent =
            "Dependencies: " + Object.keys(pj.dependencies || {}).join(", ");
      } catch (e) {
        try {
          if (aboutVersion) aboutVersion.textContent = "?";
        } catch (e) {}
      }
      try {
        aboutModal.classList.add("visible");
      } catch (e) {}
    }

    if (aboutBtn) {
      aboutBtn.addEventListener("click", () => showAboutModal());
    }

    const resetAppDataBtn = document.getElementById("resetAppDataBtn");
    if (resetAppDataBtn) {
      resetAppDataBtn.addEventListener("click", async () => {
        if (document.body.classList.contains("processing")) {
          alert("Finish or cancel the active compression before resetting app data.");
          return;
        }
        const confirmed = window.confirm(
          "Reset Compressly's thumbnails, cache, settings, and tour history?\n\nYour source files and compressed outputs will not be deleted. Compressly will restart."
        );
        if (!confirmed) return;
        resetAppDataBtn.disabled = true;
        resetAppDataBtn.textContent = "Resetting…";
        try {
          const result = await require("electron").ipcRenderer.invoke("reset-app-data");
          if (result && result.errors && result.errors.length)
            console.warn("Compressly reset completed with warnings", result.errors);
        } catch (error) {
          console.error("Could not reset Compressly data", error);
          alert("Compressly could not reset its data. See the console for details.");
          resetAppDataBtn.disabled = false;
          resetAppDataBtn.textContent = "Reset data";
        }
      });
    }

    // Close handlers: button, clicking overlay background, and ESC key
    try {
      if (aboutClose)
        aboutClose.addEventListener("click", () => {
          aboutModal.classList.remove("visible");
        });
    } catch (e) {}
    try {
      aboutModal.addEventListener("click", (ev) => {
        if (ev.target === aboutModal) aboutModal.classList.remove("visible");
      });
    } catch (e) {}
    // ESC key closes modal(s)
    try {
      window.addEventListener("keydown", (ev) => {
        if (ev.key === "Escape") {
          try {
            aboutModal.classList.remove("visible");
          } catch (e) {}
          try {
            if (ffmpegModal) ffmpegModal.classList.remove("visible");
          } catch (e) {}
          try {
            if (updateModal) updateModal.classList.remove("visible");
          } catch (e) {}
          try {
            if (longVideoModal) longVideoModal.classList.remove("visible");
          } catch (e) {}
        }
      });
    } catch (e) {}

    // Listen for menu-triggered About requests from main process
    try {
      const { ipcRenderer } = require("electron");
      if (ipcRenderer && typeof ipcRenderer.on === "function") {
        ipcRenderer.on("open-about-modal", () => {
          try {
            showAboutModal();
          } catch (e) {}
        });
      }
    } catch (e) {}
  }
  // long video modal handlers
  try {
    const longClose = document.getElementById("longVideoClose");
    const longIgnore = document.getElementById("longVideoIgnore");
    const longModal = document.getElementById("longVideoModal");
    if (longClose)
      longClose.addEventListener("click", () =>
        longModal.classList.remove("visible")
      );
    if (longIgnore)
      longIgnore.addEventListener("click", () =>
        longModal.classList.remove("visible")
      );
    if (longModal)
      longModal.addEventListener("click", (ev) => {
        if (ev.target === longModal) longModal.classList.remove("visible");
      });
  } catch (e) {}

  // Footer info update function
function updateFooterInfo() {
    try {
      if (!footerInfoEl) return;
      const fs = require("fs");
      let total = 0;
      for (const p of files) {
        try {
          const st = fs.statSync(p);
          total += st.size || 0;
        } catch (e) {}
      }
      const totalMB = (total / 1024 / 1024).toFixed(2);
      footerInfoEl.textContent = `${files.length} file(s) • ${totalMB} MB total`;
      // compute compressed total from outputs (live): prefer outPath while processing, fallback to lastOut
      let compressedTotal = 0;
      for (const p of files) {
        try {
          const state = fileStates[p] || {};
          const outCandidate = state.outPath || state.lastOut || null;
          if (outCandidate && fs.existsSync(outCandidate)) {
            const st = fs.statSync(outCandidate);
            compressedTotal += st.size || 0;
          }
        } catch (e) {}
      }
      const compressedMB = (compressedTotal / 1024 / 1024).toFixed(2);
      footerInfoEl.textContent = `${files.length} file(s) • ${totalMB} MB total • compressed ${compressedMB} MB`;
    } catch (e) {
      console.warn("updateFooterInfo failed", e);
    }
  }
}

const detailViewEl = document.getElementById("detailView");
let detailedFilePath = null;
let detailRefreshTimer = null;
let detailBackgroundScroll = null;

function setFullWindowViewState(className, open) {
  document.documentElement.classList.toggle(className, open);
  document.body.classList.toggle(className, open);
}

function mediaKindForPath(filePath) {
  const ext = require("path").extname(filePath).toLowerCase();
  if (IMAGE_EXTS.includes(ext)) return "Image";
  if (VIDEO_EXTS.includes(ext)) return "Video";
  if (AUDIO_EXTS.includes(ext)) return "Audio";
  return "Media";
}

function setDetailRows(elementId, rows) {
  const list = document.getElementById(elementId);
  if (!list) return;
  list.replaceChildren();
  rows.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value === null || value === undefined || value === ""
      ? "Unavailable"
      : String(value);
    list.append(dt, dd);
  });
}

function parseFrameRate(value) {
  if (!value) return null;
  const [a, b = "1"] = String(value).split("/").map(Number);
  return b && Number.isFinite(a / b) ? Math.round((a / b) * 100) / 100 : null;
}

async function loadSourceDetails(filePath) {
  if (!fileStates[filePath]) return;
  const state = fileStates[filePath];
  if (state.sourceDetailsLoaded || state.sourceDetailsLoading) return;
  state.sourceDetailsLoading = true;
  const fs = require("fs");
  const kind = mediaKindForPath(filePath);
  const details = { kind };
  try {
    details.originalBytes = fs.statSync(filePath).size;
    if (kind === "Image") {
      const metadata = await require("sharp")(filePath, {
        limitInputPixels: false,
      }).metadata();
      details.width = metadata.width;
      details.height = metadata.height;
      details.codec = metadata.format;
    } else {
      const ffmpeg = require("fluent-ffmpeg");
      try {
        ffmpeg.setFfmpegPath(resolveBinaryPath(await getFfmpegPath()));
        ffmpeg.setFfprobePath(resolveBinaryPath(await getFfprobePath()));
      } catch (e) {}
      const metadata = await new Promise((resolve, reject) =>
        ffmpeg.ffprobe(filePath, (err, data) => (err ? reject(err) : resolve(data)))
      );
      details.duration = metadata.format && metadata.format.duration;
      const video = (metadata.streams || []).find((s) => s.codec_type === "video");
      const audio = (metadata.streams || []).find((s) => s.codec_type === "audio");
      if (video) {
        details.width = video.width;
        details.height = video.height;
        details.fps = parseFrameRate(video.avg_frame_rate || video.r_frame_rate);
        details.videoCodec = video.codec_name;
      }
      if (audio) {
        details.audioCodec = audio.codec_name;
        details.audioBitrateKbps = audio.bit_rate
          ? Math.round(Number(audio.bit_rate) / 1000)
          : null;
      }
    }
    state.sourceDetails = details;
    state.sourceDetailsLoaded = true;
  } catch (error) {
    state.sourceDetails = { ...details, error: error.message };
    state.sourceDetailsLoaded = true;
  } finally {
    state.sourceDetailsLoading = false;
    updateDetailedView();
  }
}

function updateDetailedView() {
  if (!detailedFilePath || !fileStates[detailedFilePath]) return;
  const fs = require("fs");
  const path = require("path");
  const {
    formatBytes,
    formatDuration,
    formatReduction,
  } = require("./media-utils");
  const state = fileStates[detailedFilePath];
  const source = state.sourceDetails || {};
  const settings = state.settingsSnapshot || {};
  const processing = state.processingDetails || {};
  const result = state.resultDetails || {};
  const mediaKind = source.kind || settings.mediaKind || mediaKindForPath(detailedFilePath);
  const detailCapabilities = getMediaDetailCapabilities(mediaKind);
  let liveOutputBytes = result.outputBytes;
  try {
    if (state.outPath && fs.existsSync(state.outPath))
      liveOutputBytes = fs.statSync(state.outPath).size;
  } catch (e) {}

  document.getElementById("detailName").textContent = path.basename(detailedFilePath);
  document.getElementById("detailPath").textContent = detailedFilePath;
  document.getElementById("detailStatus").textContent =
    state.status === "done-oversize" ? "Over target" : state.status || "Ready";
  const progress = Math.max(0, Math.min(100, state.displayedProgress || state.progress || 0));
  document.getElementById("detailProgressPct").textContent = `${Math.round(progress)}%`;
  document.getElementById("detailProgressBar").style.width = `${progress}%`;
  document.getElementById("detailProgressLabel").textContent =
    state.status === "processing" ? "Compressing" : state.status || "Ready";
  const endTime = processing.endedAt || Date.now();
  document.getElementById("detailElapsed").textContent = processing.startedAt
    ? formatDuration((endTime - processing.startedAt) / 1000)
    : "—";
  document.getElementById("detailCurrentSize").textContent =
    liveOutputBytes === undefined ? "—" : formatBytes(liveOutputBytes);
  document.getElementById("detailAttempt").textContent = processing.stage || "—";

  const sourceRows = [
    ["Type", mediaKind],
    ["Original size", formatBytes(source.originalBytes)],
  ];
  if (detailCapabilities.duration)
    sourceRows.push([
      "Duration",
      source.duration === undefined ? "Unavailable" : formatDuration(source.duration),
    ]);
  if (detailCapabilities.dimensions)
    sourceRows.push([
      "Dimensions",
      source.width && source.height ? `${source.width} × ${source.height}` : "Unavailable",
    ]);
  if (detailCapabilities.fps) sourceRows.push(["Source FPS", source.fps]);
  if (detailCapabilities.videoCodec)
    sourceRows.push(["Video codec", source.videoCodec]);
  if (mediaKind === "Image") sourceRows.push(["Image format", source.codec]);
  if (detailCapabilities.audio) {
    sourceRows.push(["Audio codec", source.audioCodec]);
    sourceRows.push([
      "Audio bitrate",
      source.audioBitrateKbps ? `${source.audioBitrateKbps} kbps` : null,
    ]);
  }
  setDetailRows("detailSource", sourceRows);
  const smartSettings = settings.mode === "Smart Compression";
  const settingRows = [
    ["Mode", settings.mode || "Target Size"],
    ["Target size", smartSettings ? "Quality based" : settings.targetMB ? `${settings.targetMB} MB` : "Not started"],
    ["Quality", smartSettings ? settings.quality : null],
  ];
  if (detailCapabilities.fps)
    settingRows.push([
      "FPS",
      smartSettings ? (settings.retainFps ? "Retain source" : "Optimize") : settings.fps,
    ]);
  if (detailCapabilities.resolutionSetting && (smartSettings || mediaKind === "Video"))
    settingRows.push([
      "Resolution",
      smartSettings
        ? (settings.retainResolution ? "Retain source" : "Optimize")
        : settings.resolution,
    ]);
  if (detailCapabilities.audio && (smartSettings || mediaKind === "Video"))
    settingRows.push([
      "Audio",
      smartSettings
        ? (settings.preserveAudio ? "Preserve quality" : "Optimize")
        : settings.priority,
    ]);
  if (smartSettings)
    settingRows.push(["Metadata", settings.stripMetadata ? "Remove" : "Preserve"]);
  settingRows.push(["Output format", processing.outputFormat]);
  if (detailCapabilities.videoCodec)
    settingRows.push([
      "Video quality",
      smartSettings
        ? processing.videoBitrateKbps
        : processing.videoBitrateKbps
          ? `${processing.videoBitrateKbps} kbps`
          : null,
    ]);
  if (detailCapabilities.audio)
    settingRows.push([
      "Audio bitrate",
      processing.audioBitrateKbps ? `${processing.audioBitrateKbps} kbps` : null,
    ]);
  setDetailRows("detailSettings", settingRows);
  const originalBytes = source.originalBytes;
  const targetResult =
    state.status === "done-oversize"
      ? "Over target"
      : state.status === "done"
        ? smartSettings ? "Smart compression complete" : "Within target"
        : state.status === "cancelled"
          ? "Cancelled"
          : state.status === "error"
            ? "Failed"
            : "Pending";
  const resultRows = [
    ["Target result", targetResult],
    ["Output size", result.outputBytes === undefined ? "Pending" : formatBytes(result.outputBytes)],
    ["Reduction", result.outputBytes === undefined ? "Pending" : formatReduction(originalBytes, result.outputBytes)],
    ["Output path", state.lastOut || state.outPath || "Pending"],
    ["Error", result.error],
  ];
  if (result.qualityAnalysis && result.qualityAnalysis.status === "complete") {
    resultRows.push(["Visual similarity", `${result.qualityAnalysis.similarity.toFixed(1)}% sampled SSIM`]);
    resultRows.push(["Measured difference", `${result.qualityAnalysis.difference.toFixed(1)}%`]);
  }
  if (result.audioResult) {
    resultRows.push(["Audio handling", result.audioResult.handling]);
    if (result.audioResult.codec)
      resultRows.push(["Output audio", `${result.audioResult.codec}${result.audioResult.bitrateKbps ? ` · ${result.audioResult.bitrateKbps} kbps` : ""}`]);
  }
  setDetailRows("detailResult", resultRows);

  const active = state.status === "queued" || state.status === "processing";
  const cancel = document.getElementById("detailCancel");
  const reveal = document.getElementById("detailReveal");
  cancel.style.display = active ? "inline-flex" : "none";
  cancel.disabled = !active;
  reveal.style.display = state.lastOut && fs.existsSync(state.lastOut) ? "inline-flex" : "none";
}

function openDetailedView(filePath) {
  if (!detailViewEl.classList.contains("visible")) {
    const scrollHost = document.body.classList.contains("has-custom-titlebar")
      ? document.querySelector(".app")
      : document.scrollingElement;
    detailBackgroundScroll = scrollHost
      ? { host: scrollHost, top: scrollHost.scrollTop }
      : null;
  }
  detailedFilePath = filePath;
  detailViewEl.classList.add("visible");
  detailViewEl.setAttribute("aria-hidden", "false");
  setFullWindowViewState("detail-open", true);
  updateDetailedView();
  loadSourceDetails(filePath);
  clearInterval(detailRefreshTimer);
  detailRefreshTimer = setInterval(updateDetailedView, 250);
}

function closeDetailedView() {
  detailViewEl.classList.remove("visible");
  detailViewEl.setAttribute("aria-hidden", "true");
  setFullWindowViewState("detail-open", false);
  detailedFilePath = null;
  clearInterval(detailRefreshTimer);
  detailRefreshTimer = null;
  if (detailBackgroundScroll) {
    const { host, top } = detailBackgroundScroll;
    detailBackgroundScroll = null;
    requestAnimationFrame(() => { host.scrollTop = top; });
  }
}

document.getElementById("detailBack").addEventListener("click", closeDetailedView);
document.getElementById("detailCancel").addEventListener("click", () => {
  const state = detailedFilePath && fileStates[detailedFilePath];
  if (!state) return;
  state.cancelRequested = true;
  if (state.cmd && typeof state.cmd.kill === "function") {
    try { state.cmd.kill("SIGKILL"); } catch (e) {}
  }
  state.status = "cancelled";
  updateDetailedView();
});
document.getElementById("detailReveal").addEventListener("click", () => {
  const state = detailedFilePath && fileStates[detailedFilePath];
  if (state && state.lastOut)
    require("electron").ipcRenderer.send("reveal-file", state.lastOut);
});
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && detailedFilePath) closeDetailedView();
});

function closeSmartResultsView() {
  smartResultsViewEl.classList.remove("visible");
  smartResultsViewEl.setAttribute("aria-hidden", "true");
  setFullWindowViewState("smart-results-open", false);
}

function removeSmartBatchFilesFromRegularQueue() {
  const smartBatchFiles = files.filter((filePath) => {
    const state = fileStates[filePath];
    return !!(
      state &&
      state.settingsSnapshot &&
      state.settingsSnapshot.mode === "Smart Compression" &&
      (state.status === "done" || state.status === "done-oversize")
    );
  });
  if (!smartBatchFiles.length) return;
  const removed = new Set(smartBatchFiles);
  files = files.filter((filePath) => !removed.has(filePath));
  smartBatchFiles.forEach((filePath) => delete fileStates[filePath]);
  smartBatchSummary = null;
  statusEl.textContent = "Ready";
  renderList();
  updateFooterInfo();
}

function getSmartBatchEntry(filePath) {
  const fs = require("fs");
  const state = fileStates[filePath] || {};
  let originalBytes = state.sourceDetails && state.sourceDetails.originalBytes;
  let outputBytes = state.resultDetails && state.resultDetails.outputBytes;
  try {
    if (!(originalBytes >= 0)) originalBytes = fs.statSync(filePath).size;
  } catch (e) {}
  try {
    if (!(outputBytes >= 0) && state.lastOut)
      outputBytes = fs.statSync(state.lastOut).size;
  } catch (e) {}
  const quality = state.resultDetails && state.resultDetails.qualityAnalysis;
  return {
    filePath,
    status: state.status,
    originalBytes,
    outputBytes,
    similarity: quality && quality.status === "complete" ? quality.similarity : null,
  };
}

function buildSmartBatchSummary(batchFiles, startedAt) {
  const entries = batchFiles.map(getSmartBatchEntry);
  const aggregate = summarizeSmartBatch(
    entries,
    (Date.now() - startedAt) / 1000
  );
  return {
    ...aggregate,
    files: batchFiles.slice(),
    firstOutput: batchFiles
      .map((filePath) => fileStates[filePath] && fileStates[filePath].lastOut)
      .find(Boolean) || null,
  };
}

function makeSmartResultButton(label, onClick, primary = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `btn${primary ? " primary" : ""}`;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderSmartResultRow(filePath) {
  const path = require("path");
  const state = fileStates[filePath] || {};
  const source = state.sourceDetails || {};
  const result = state.resultDetails || {};
  const quality = result.qualityAnalysis || {};
  const originalBytes = getSmartBatchEntry(filePath).originalBytes;
  const outputBytes = getSmartBatchEntry(filePath).outputBytes;
  const kind = source.kind || mediaKindForPath(filePath);
  const row = document.createElement("div");
  row.className = "smart-result-row";

  const file = document.createElement("div");
  file.className = "smart-result-file";
  const thumbnailPath = state.thumb || (kind === "Image" ? filePath : null);
  let thumbnail;
  if (thumbnailPath) {
    thumbnail = document.createElement("img");
    thumbnail.src = `file://${thumbnailPath}`;
  } else {
    thumbnail = document.createElement("div");
    thumbnail.className = "smart-result-thumb";
    thumbnail.textContent = kind === "Audio" ? "♪" : kind === "Video" ? "▶" : "◆";
  }
  const identity = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = path.basename(filePath);
  const status = document.createElement("span");
  status.textContent = state.status === "done"
    ? `${kind} · Complete`
    : state.status === "error"
      ? `${kind} · Failed`
      : state.status === "cancelled"
        ? `${kind} · Cancelled`
        : `${kind} · ${state.status || "Unknown"}`;
  identity.append(name, status);
  file.append(thumbnail, identity);

  const size = document.createElement("div");
  size.className = "smart-result-size";
  const sizeValue = document.createElement("strong");
  sizeValue.textContent = outputBytes >= 0
    ? `${formatDashboardBytes(originalBytes)} → ${formatDashboardBytes(outputBytes)}`
    : formatDashboardBytes(originalBytes);
  const reduction = originalBytes > 0 && outputBytes >= 0
    ? (1 - outputBytes / originalBytes) * 100
    : null;
  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = reduction === null
    ? "No output size"
    : reduction >= 0
      ? `${reduction.toFixed(1)}% smaller`
      : `${Math.abs(reduction).toFixed(1)}% larger`;
  const savingTrack = document.createElement("div");
  savingTrack.className = "smart-result-saving-track";
  const savingFill = document.createElement("i");
  savingFill.style.width = `${Math.max(0, Math.min(100, reduction || 0))}%`;
  savingTrack.appendChild(savingFill);
  size.append(sizeValue, sizeLabel, savingTrack);

  const qualityEl = document.createElement("div");
  qualityEl.className = "smart-result-quality";
  const qualityValue = document.createElement("strong");
  const qualityNote = document.createElement("span");
  if (quality.status === "complete") {
    qualityValue.textContent = `${quality.similarity.toFixed(1)}% visual similarity`;
    qualityNote.textContent = `${quality.difference.toFixed(1)}% measured difference · ${quality.samples} ${quality.samples === 1 ? "sample" : "samples"}`;
  } else if (result.audioResult) {
    const audio = result.audioResult;
    qualityValue.textContent = audio.handling;
    qualityNote.textContent = audio.codec
      ? `${audio.codec}${audio.bitrateKbps ? ` · ${audio.bitrateKbps} kbps` : ""}`
      : "No audio stream was present";
  } else if (state.status === "error") {
    qualityValue.textContent = "Compression failed";
    qualityNote.textContent = result.error || "No output was produced";
  } else if (state.status === "cancelled") {
    qualityValue.textContent = "Cancelled";
    qualityNote.textContent = "No comparison was performed";
  } else {
    qualityValue.textContent = "Comparison unavailable";
    qualityNote.textContent = quality.reason || "No visual score was produced";
  }
  qualityEl.append(qualityValue, qualityNote);

  const actions = document.createElement("div");
  actions.className = "smart-result-actions";
  actions.appendChild(makeSmartResultButton("Details", () => openDetailedView(filePath)));
  if (state.lastOut) {
    actions.appendChild(makeSmartResultButton("Reveal", () => {
      require("electron").ipcRenderer.send("reveal-file", state.lastOut);
    }));
  }

  row.append(file, size, qualityEl, actions);
  return row;
}

function formatDashboardBytes(bytes) {
  return require("./media-utils").formatBytes(bytes);
}

function showSmartResults(summary) {
  smartBatchSummary = summary;
  const reduction = summary.reductionPercent;
  document.getElementById("smartResultsSubtitle").textContent =
    `${summary.successful} of ${summary.total} files completed successfully.`;
  document.getElementById("smartResultsStatus").textContent =
    summary.failed || summary.cancelled ? "Completed with issues" : "Complete";
  document.getElementById("smartResultsReduction").textContent = reduction === null
    ? "—"
    : reduction >= 0
      ? `${reduction.toFixed(1)}% smaller`
      : `${Math.abs(reduction).toFixed(1)}% larger`;
  document.getElementById("smartResultsBefore").textContent = formatDashboardBytes(summary.originalBytes);
  document.getElementById("smartResultsAfter").textContent = formatDashboardBytes(summary.outputBytes);
  document.getElementById("smartResultsSaved").textContent = summary.bytesSaved >= 0
    ? `${formatDashboardBytes(summary.bytesSaved)} saved`
    : `${formatDashboardBytes(Math.abs(summary.bytesSaved))} larger than the source`;
  const afterRatio = summary.originalBytes > 0
    ? Math.min(100, (summary.outputBytes / summary.originalBytes) * 100)
    : 0;
  document.getElementById("smartResultsAfterBar").style.width = `${afterRatio}%`;

  const similarity = summary.visualSimilarity;
  const ring = document.getElementById("smartQualityRing");
  ring.style.setProperty("--quality-angle", `${similarity === null ? 0 : similarity * 3.6}deg`);
  ring.classList.toggle("unavailable", similarity === null);
  document.getElementById("smartResultsSimilarity").textContent =
    similarity === null ? "—" : `${similarity.toFixed(1)}%`;
  document.getElementById("smartResultsDifference").textContent = similarity === null
    ? "No image or video comparison was available."
    : `${summary.visualDifference.toFixed(1)}% measured difference across ${summary.measuredVisualFiles} visual ${summary.measuredVisualFiles === 1 ? "file" : "files"}.`;
  document.getElementById("smartResultsProcessed").textContent = `${summary.successful}/${summary.total}`;
  document.getElementById("smartResultsElapsed").textContent = require("./media-utils").formatDuration(summary.elapsedSeconds);
  document.getElementById("smartResultsFailed").textContent = String(summary.failed);
  document.getElementById("smartResultsCancelled").textContent = String(summary.cancelled);

  smartResultsListEl.replaceChildren();
  summary.files.forEach((filePath) =>
    smartResultsListEl.appendChild(renderSmartResultRow(filePath))
  );
  document.getElementById("smartResultsReveal").disabled = !summary.firstOutput;
  smartResultsViewEl.classList.add("visible");
  smartResultsViewEl.setAttribute("aria-hidden", "false");
  setFullWindowViewState("smart-results-open", true);
}

document.getElementById("smartResultsBack").addEventListener("click", closeSmartResultsView);
document.getElementById("smartResultsReveal").addEventListener("click", () => {
  if (smartBatchSummary && smartBatchSummary.firstOutput)
    require("electron").ipcRenderer.send("reveal-file", smartBatchSummary.firstOutput);
});
document.getElementById("smartResultsMore").addEventListener("click", () => {
  closeSmartResultsView();
  smartBatchSummary = null;
  files = [];
  fileStates = {};
  anyCancelled = false;
  statusEl.textContent = "Ready for more media";
  renderList();
  updateFooterInfo();
});

const TOUR_STEPS = [
  {
    id: "welcome",
    page: "welcome",
    target: null,
    placement: "center",
    label: "Welcome to 2.0",
    title: "Welcome to Compressly 2.0",
    body: "This release adds flexible compression controls, a complete Smart Compression workspace, richer per-file details, and a new results dashboard.",
    example: "Nothing in this tour touches your files. Every media item and result you see is a safe example.",
  },
  {
    id: "standard-controls",
    page: "standard",
    target: "#standardPresetControls",
    placement: "bottom",
    label: "Flexible controls",
    title: "Size and FPS presets",
    body: "Start quickly with common target-size and frame-rate presets. The menus keep useful choices close at hand, while Custom remains available when a file needs a more specific value.",
    example: "Choose the 25 MB size preset and the 60 FPS preset, or select Custom to enter an exact value.",
    presetDemo: true,
  },
  {
    id: "details",
    page: "details",
    target: "#detailView",
    placement: "bottom-right",
    spotlightPadding: 0,
    label: "Detailed View",
    title: "Understand every file",
    body: "Detailed View follows a file before, during, and after compression with source metadata, settings, live progress, attempts, and final results.",
    example: "epik-clip.mp4 · 1080p · 60 FPS · H.264/AAC · 72% through a quality-aware encode.",
  },
  {
    id: "smart-workspace",
    page: "smart",
    target: ".smart-hero-copy",
    placement: "bottom",
    spotlightPadding: { top: 22, right: 22, bottom: 8, left: 22 },
    label: "Smart Compression",
    title: "A workspace built around fidelity",
    body: "Smart Compression chooses efficient settings for each media type while keeping the workflow focused and easy to understand.",
    example: "Use Smart mode when you want a meaningfully smaller file without choosing an exact maximum size.",
  },
  {
    id: "smart-preferences",
    page: "smart",
    target: "#smartOptions",
    placement: "bottom",
    label: "Compression preferences",
    title: "Protect what matters",
    body: "Choose a quality profile, then decide whether resolution, frame rate, and audio should remain untouched. Metadata can be removed independently.",
    example: "Maximum fidelity + Retain resolution + Retain FPS shrinks the video while keeping its picture and motion very close to the original.",
  },
  {
    id: "smart-processing",
    page: "processing",
    target: "#dropArea",
    placement: "top",
    spotlightPadding: { top: 10, right: 10, bottom: 20, left: 10 },
    label: "Smart processing",
    title: "Encoding, then an honest comparison",
    body: "Smart mode first creates the optimized output. It then compares decoded source and output samples with SSIM instead of inventing a quality percentage from an encoder preset.",
    example: "The animated example is for presentation only. FFmpeg is not started and no output file is created.",
  },
  {
    id: "results",
    page: "results",
    target: ".smart-results-overview",
    placement: "bottom",
    spotlightPadding: { top: 8, right: 8, bottom: 3, left: 22 },
    label: "Completion dashboard",
    title: "See what changed at a glance",
    body: "The results dashboard combines processed volume, actual space saved, elapsed time, sampled visual similarity, and clear per-file outcomes.",
    example: "148.2 MB → 42.6 MB · 71.3% smaller · 97.8% visual similarity · 2.2% measured difference.",
  },
];

const tourOverlayEl = document.getElementById("tourOverlay");
const tourSpotlightEl = document.getElementById("tourSpotlight");
const tourPopoverEl = document.getElementById("tourPopover");
let tourLaunchTimer = null;

function getTourScrollHost() {
  return document.body.classList.contains("has-custom-titlebar")
    ? document.querySelector(".app")
    : document.scrollingElement;
}

function hideTourDetailExample() {
  if (detailedFilePath) return;
  detailViewEl.classList.remove("visible");
  detailViewEl.setAttribute("aria-hidden", "true");
  setFullWindowViewState("detail-open", false);
}

function showTourDetailExample() {
  document.getElementById("detailName").textContent = "epik-clip.mp4";
  document.getElementById("detailPath").textContent = "Example media · no file is opened";
  document.getElementById("detailStatus").textContent = "Example";
  document.getElementById("detailProgressPct").textContent = "72%";
  document.getElementById("detailProgressBar").style.width = "72%";
  document.getElementById("detailProgressLabel").textContent = "Quality-aware encoding";
  document.getElementById("detailElapsed").textContent = "0:18";
  document.getElementById("detailCurrentSize").textContent = "31.4 MB";
  document.getElementById("detailAttempt").textContent = "Pass 1";
  setDetailRows("detailSource", [
    ["Type", "Video"], ["Original size", "148.2 MB"], ["Duration", "1:24"],
    ["Dimensions", "1920 × 1080"], ["Source FPS", "60"],
    ["Video codec", "H.264"], ["Audio codec", "AAC"],
  ]);
  setDetailRows("detailSettings", [
    ["Mode", "Smart Compression"], ["Quality", "Maximum fidelity"],
    ["FPS", "Retain source"], ["Resolution", "Retain source"],
    ["Audio", "Preserve quality"], ["Metadata", "Remove"],
  ]);
  setDetailRows("detailResult", [
    ["Output size", "Calculating"], ["Visual similarity", "Pending sampled SSIM"],
    ["Output path", "Example only"],
  ]);
  document.getElementById("detailCancel").style.display = "none";
  document.getElementById("detailReveal").style.display = "none";
  detailViewEl.classList.add("visible");
  detailViewEl.setAttribute("aria-hidden", "false");
  setFullWindowViewState("detail-open", true);
}

function renderTourProcessingExample() {
  const row = document.createElement("li");
  row.className = "tour-demo-row";
  const file = document.createElement("div");
  file.className = "tour-demo-file";
  const thumb = document.createElement("div");
  thumb.className = "tour-demo-thumb";
  thumb.textContent = "▶";
  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.textContent = "epik-clip.mp4";
  const note = document.createElement("span");
  note.textContent = "Example · Quality-aware encoding";
  copy.append(name, note);
  file.append(thumb, copy);
  const progress = document.createElement("div");
  progress.className = "tour-demo-progress";
  const progressText = document.createElement("span");
  progressText.textContent = "Analyzing motion and detail";
  const track = document.createElement("div");
  track.className = "tour-demo-progress-track";
  track.appendChild(document.createElement("i"));
  progress.append(progressText, track);
  row.append(file, progress);
  fileListEl.replaceChildren(row);
  document.body.classList.add("smart-has-files");
  statusEl.textContent = "Example Smart compression in progress…";
}

function createTourDashboardRow() {
  const row = document.createElement("div");
  row.className = "smart-result-row";
  row.innerHTML = `
    <div class="smart-result-file">
      <div class="smart-result-thumb">▶</div>
      <div><strong>epik-clip.mp4</strong><span>Video · Example result</span></div>
    </div>
    <div class="smart-result-size">
      <strong>148.2 MB → 42.6 MB</strong><span>71.3% smaller</span>
      <div class="smart-result-saving-track"><i style="width:71.3%"></i></div>
    </div>
    <div class="smart-result-quality">
      <strong>97.8% visual similarity</strong><span>2.2% measured difference · 5 samples</span>
    </div>
    <div class="smart-result-actions">
      <button class="btn" type="button" disabled title="Example only">Details</button>
      <button class="btn" type="button" disabled title="Example only">Reveal</button>
    </div>`;
  return row;
}

function createTourPresetMenu(values, selectedValue) {
  const menu = document.createElement("div");
  menu.className = "tour-preset-menu";
  menu.setAttribute("aria-hidden", "true");
  values.forEach((value) => {
    const item = document.createElement("span");
    item.textContent = value.label;
    item.className = value.value === selectedValue ? "selected" : "";
    menu.appendChild(item);
  });
  return menu;
}

function showTourPresetExample() {
  targetSizePresetEl.value = "25";
  videoFpsPresetEl.value = "60";
  document.getElementById("targetSizeControl").classList.remove("custom-active");
  document.getElementById("videoFpsControl").classList.remove("custom-active");
  document.querySelector(".target-size-field").appendChild(createTourPresetMenu([
    { value: "1", label: "1 MB" }, { value: "5", label: "5 MB" },
    { value: "10", label: "10 MB" }, { value: "25", label: "25 MB" },
    { value: "50", label: "50 MB" }, { value: "100", label: "100 MB" },
    { value: "custom", label: "Custom" },
  ], "25"));
  document.getElementById("videoFpsControl").closest("label").appendChild(createTourPresetMenu([
    { value: "24", label: "24 FPS" }, { value: "25", label: "25 FPS" },
    { value: "30", label: "30 FPS" }, { value: "50", label: "50 FPS" },
    { value: "60", label: "60 FPS" }, { value: "120", label: "120 FPS" },
    { value: "custom", label: "Custom" },
  ], "60"));
  document.body.classList.add("tour-presets-open");
}

function hideTourPresetExample() {
  document.querySelectorAll(".tour-preset-menu").forEach((menu) => menu.remove());
  document.body.classList.remove("tour-presets-open");
  if (!tourSession || !tourSession.presetPresentation) return;
  const saved = tourSession.presetPresentation;
  targetSizePresetEl.value = saved.targetValue;
  videoFpsPresetEl.value = saved.fpsValue;
  document.getElementById("targetSizeControl").classList.toggle("custom-active", saved.targetCustom);
  document.getElementById("videoFpsControl").classList.toggle("custom-active", saved.fpsCustom);
}

function showTourResultsExample() {
  document.getElementById("smartResultsSubtitle").textContent = "1 of 1 example files completed successfully.";
  document.getElementById("smartResultsStatus").textContent = "Example";
  document.getElementById("smartResultsReduction").textContent = "71.3% smaller";
  document.getElementById("smartResultsBefore").textContent = "148.2 MB";
  document.getElementById("smartResultsAfter").textContent = "42.6 MB";
  document.getElementById("smartResultsSaved").textContent = "105.6 MB saved";
  document.getElementById("smartResultsAfterBar").style.width = "28.7%";
  document.getElementById("smartQualityRing").style.setProperty("--quality-angle", "352.08deg");
  document.getElementById("smartQualityRing").classList.remove("unavailable");
  document.getElementById("smartResultsSimilarity").textContent = "97.8%";
  document.getElementById("smartResultsDifference").textContent = "2.2% measured difference across 1 visual file.";
  document.getElementById("smartResultsProcessed").textContent = "1/1";
  document.getElementById("smartResultsElapsed").textContent = "0:26";
  document.getElementById("smartResultsFailed").textContent = "0";
  document.getElementById("smartResultsCancelled").textContent = "0";
  smartResultsListEl.replaceChildren(createTourDashboardRow());
  document.getElementById("smartResultsReveal").disabled = true;
  smartResultsViewEl.classList.add("visible");
  smartResultsViewEl.setAttribute("aria-hidden", "false");
  setFullWindowViewState("smart-results-open", true);
}

function resetTourPresentation() {
  hideTourPresetExample();
  hideTourDetailExample();
  closeSmartResultsView();
  if (tourSession && tourSession.fileListNodes)
    fileListEl.replaceChildren(...tourSession.fileListNodes);
  if (tourSession)
    document.body.classList.toggle("smart-has-files", tourSession.smartHasFiles);
}

function enterTourStep(step) {
  resetTourPresentation();
  if (step.page === "standard") {
    setCompressionMode("standard", false);
    if (step.presetDemo) showTourPresetExample();
  } else if (step.page === "details") {
    setCompressionMode("standard", false);
    showTourDetailExample();
  } else if (step.page === "smart" || step.page === "processing" || step.page === "results") {
    setCompressionMode("smart", false);
    if (step.page === "processing") renderTourProcessingExample();
    if (step.page === "results") showTourResultsExample();
  }
}

function positionTourStep() {
  if (!tourActive) return;
  const step = TOUR_STEPS[tourStepIndex];
  const target = step.target ? document.querySelector(step.target) : null;
  const usableTarget = target && target.getClientRects().length ? target : null;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const minTop = document.body.classList.contains("has-custom-titlebar") ? 44 : 16;
  tourOverlayEl.classList.toggle("centered", !usableTarget);

  if (!usableTarget) {
    const popoverRect = tourPopoverEl.getBoundingClientRect();
    tourPopoverEl.style.left = `${Math.max(16, (viewportWidth - popoverRect.width) / 2)}px`;
    tourPopoverEl.style.top = `${Math.max(minTop, (viewportHeight - popoverRect.height) / 2)}px`;
    return;
  }

  const rect = usableTarget.getBoundingClientRect();
  const configuredPadding = step.spotlightPadding ?? 8;
  const padding = typeof configuredPadding === "number"
    ? { top: configuredPadding, right: configuredPadding, bottom: configuredPadding, left: configuredPadding }
    : { top: 8, right: 8, bottom: 8, left: 8, ...configuredPadding };
  const spotlightLeft = Math.max(4, rect.left - padding.left);
  const spotlightTop = Math.max(minTop, rect.top - padding.top);
  const spotlightRight = Math.min(viewportWidth - 4, rect.right + padding.right);
  const spotlightBottom = Math.min(viewportHeight - 4, rect.bottom + padding.bottom);
  tourSpotlightEl.style.left = `${spotlightLeft}px`;
  tourSpotlightEl.style.top = `${spotlightTop}px`;
  tourSpotlightEl.style.width = `${Math.max(0, spotlightRight - spotlightLeft)}px`;
  tourSpotlightEl.style.height = `${Math.max(0, spotlightBottom - spotlightTop)}px`;

  const popoverRect = tourPopoverEl.getBoundingClientRect();
  const gap = 16;
  const candidates = {
    center: { left: (viewportWidth - popoverRect.width) / 2, top: (viewportHeight - popoverRect.height) / 2 },
    "bottom-right": { left: viewportWidth - popoverRect.width - 28, top: viewportHeight - popoverRect.height - 28 },
    bottom: { left: rect.left + (rect.width - popoverRect.width) / 2, top: rect.bottom + gap },
    top: { left: rect.left + (rect.width - popoverRect.width) / 2, top: rect.top - popoverRect.height - gap },
    right: { left: rect.right + gap, top: rect.top + (rect.height - popoverRect.height) / 2 },
    left: { left: rect.left - popoverRect.width - gap, top: rect.top + (rect.height - popoverRect.height) / 2 },
  };
  const order = [step.placement, "bottom", "top", "right", "left"].filter(
    (value, index, values) => value && values.indexOf(value) === index
  );
  let chosen = candidates[order[0]] || candidates.bottom;
  for (const placement of order) {
    const candidate = candidates[placement];
    if (
      candidate.left >= 16 &&
      candidate.left + popoverRect.width <= viewportWidth - 16 &&
      candidate.top >= minTop &&
      candidate.top + popoverRect.height <= viewportHeight - 16
    ) {
      chosen = candidate;
      break;
    }
  }
  tourPopoverEl.style.left = `${Math.max(16, Math.min(viewportWidth - popoverRect.width - 16, chosen.left))}px`;
  tourPopoverEl.style.top = `${Math.max(minTop, Math.min(viewportHeight - popoverRect.height - 16, chosen.top))}px`;
}

function renderTourStep() {
  tourStepIndex = clampTourIndex(tourStepIndex, TOUR_STEPS.length);
  const step = TOUR_STEPS[tourStepIndex];
  enterTourStep(step);
  document.getElementById("tourStepLabel").textContent = step.label;
  document.getElementById("tourTitle").textContent = step.title;
  document.getElementById("tourBody").textContent = step.body;
  const example = document.getElementById("tourExample");
  example.hidden = !step.example;
  example.textContent = step.example || "";
  document.getElementById("tourProgressText").textContent = `${tourStepIndex + 1} of ${TOUR_STEPS.length}`;
  document.getElementById("tourBack").disabled = tourStepIndex === 0;
  document.getElementById("tourNext").textContent =
    tourStepIndex === TOUR_STEPS.length - 1 ? "Finish tour" : "Next";
  const dots = document.getElementById("tourDots");
  dots.replaceChildren();
  TOUR_STEP_IDS.forEach((id, index) => {
    const dot = document.createElement("span");
    dot.className = `tour-dot${index === tourStepIndex ? " active" : index < tourStepIndex ? " complete" : ""}`;
    dot.title = id.replace(/-/g, " ");
    dots.appendChild(dot);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = step.target ? document.querySelector(step.target) : null;
    if (target) target.scrollIntoView({ block: "center", inline: "nearest" });
    positionTourStep();
    tourPopoverEl.focus({ preventScroll: true });
  }));
}

function startVersionTour(replay = false) {
  if (
    tourActive ||
    document.body.classList.contains("processing") ||
    detailViewEl.classList.contains("visible") ||
    smartResultsViewEl.classList.contains("visible")
  ) return false;
  if (!replay && (tourSeenThisSession || hasSeenTour(localStorage))) return false;
  const activeElement = document.activeElement;
  const scrollHost = getTourScrollHost();
  const aboutWasVisible = document.getElementById("aboutModal").classList.contains("visible");
  tourSession = {
    snapshot: createTourSnapshot({
      mode: compressionMode,
      statusText: statusEl.textContent,
      scrollTop: scrollHost ? scrollHost.scrollTop : 0,
      resultsVisible: smartResultsViewEl.classList.contains("visible"),
      detailVisible: detailViewEl.classList.contains("visible"),
      focusedId: aboutWasVisible ? "aboutBtn" : activeElement && activeElement.id,
    }),
    detailPath: detailedFilePath,
    batchSummary: smartBatchSummary,
    fileListNodes: [...fileListEl.childNodes],
    smartHasFiles: document.body.classList.contains("smart-has-files"),
    presetPresentation: {
      targetValue: targetSizePresetEl.value,
      fpsValue: videoFpsPresetEl.value,
      targetCustom: document.getElementById("targetSizeControl").classList.contains("custom-active"),
      fpsCustom: document.getElementById("videoFpsControl").classList.contains("custom-active"),
    },
    inertStates: [
      ...document.querySelectorAll(
        ".topbar, .container, .modal-overlay, .detail-view, .smart-results-view"
      ),
    ].map((element) => ({ element, inert: !!element.inert })),
  };
  tourSession.inertStates.forEach(({ element }) => { element.inert = true; });
  document.getElementById("aboutModal").classList.remove("visible");
  tourActive = true;
  tourStepIndex = 0;
  document.body.classList.add("tour-active");
  tourOverlayEl.classList.add("visible");
  tourOverlayEl.setAttribute("aria-hidden", "false");
  renderTourStep();
  return true;
}

function finishVersionTour() {
  if (!tourActive || !tourSession) return;
  const session = tourSession;
  markTourSeen(localStorage);
  tourSeenThisSession = true;
  resetTourPresentation();
  setCompressionMode(session.snapshot.mode, false);
  document.body.classList.toggle("smart-has-files", session.smartHasFiles);
  statusEl.textContent = session.snapshot.statusText || "Ready";
  tourOverlayEl.classList.remove("visible", "centered");
  tourOverlayEl.setAttribute("aria-hidden", "true");
  document.body.classList.remove("tour-active");
  session.inertStates.forEach(({ element, inert }) => { element.inert = inert; });
  tourActive = false;
  tourSession = null;
  smartBatchSummary = session.batchSummary;
  if (session.snapshot.resultsVisible && smartBatchSummary)
    showSmartResults(smartBatchSummary);
  if (session.snapshot.detailVisible && session.detailPath)
    openDetailedView(session.detailPath);
  requestAnimationFrame(() => {
    const scrollHost = getTourScrollHost();
    if (scrollHost) scrollHost.scrollTop = session.snapshot.scrollTop;
    const focusTarget = session.snapshot.focusedId
      ? document.getElementById(session.snapshot.focusedId)
      : null;
    if (focusTarget && typeof focusTarget.focus === "function") focusTarget.focus();
  });
}

function changeTourStep(delta) {
  if (!tourActive) return;
  const next = tourStepIndex + delta;
  if (next >= TOUR_STEPS.length) return finishVersionTour();
  tourStepIndex = clampTourIndex(next, TOUR_STEPS.length);
  renderTourStep();
}

function maybeLaunchAutomaticTour() {
  clearTimeout(tourLaunchTimer);
  if (
    tourActive ||
    tourSeenThisSession ||
    hasSeenTour(localStorage) ||
    !updateStartupCheckSettled ||
    !mediaStartupCheckSettled
  ) return;
  tourLaunchTimer = setTimeout(() => {
    const blockingModal = document.querySelector(".modal-overlay.visible");
    if (blockingModal || document.body.classList.contains("processing")) {
      tourLaunchTimer = setTimeout(maybeLaunchAutomaticTour, 500);
      return;
    }
    startVersionTour(false);
  }, 500);
}

document.getElementById("tourNext").addEventListener("click", () => changeTourStep(1));
document.getElementById("tourBack").addEventListener("click", () => changeTourStep(-1));
document.getElementById("tourSkip").addEventListener("click", finishVersionTour);
document.getElementById("tourReplayBtn").addEventListener("click", () => {
  if (!startVersionTour(true))
    alert("Close the active view or finish the current compression before starting the tour.");
});
window.addEventListener("resize", positionTourStep);
window.addEventListener("scroll", positionTourStep, true);
window.addEventListener("keydown", (event) => {
  if (!tourActive) return;
  if (event.key === "Escape") {
    event.preventDefault();
    finishVersionTour();
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    changeTourStep(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    changeTourStep(-1);
  } else if (event.key === "Tab") {
    const focusable = [...tourPopoverEl.querySelectorAll("button:not(:disabled)")];
    if (!focusable.length) return;
    const current = focusable.indexOf(document.activeElement);
    let next = event.shiftKey ? current - 1 : current + 1;
    if (next < 0) next = focusable.length - 1;
    if (next >= focusable.length) next = 0;
    event.preventDefault();
    focusable[next].focus();
  }
});

function renderList() {
  fileListEl.innerHTML = "";
  document.body.classList.toggle("smart-has-files", files.length > 0);
  for (const p of files) {
    // initialize state
    if (!fileStates[p])
      fileStates[p] = { progress: 0, displayedProgress: 0, status: "ready" };
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const img = document.createElement("img");
    img.width = 46;
    img.height = 46;
    img.src = "./compressly.ico";
    img.onerror = () => {
      // Avoid repeatedly assigning a missing fallback and triggering an error loop.
      img.onerror = null;
      img.src = "./compressly.ico";
    };
    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("div");
    const fileName = document.createElement("div");
    const filePath = document.createElement("div");
    fileName.className = "file-name";
    fileName.textContent = require("path").basename(p);
    filePath.className = "small file-path";
    filePath.textContent = p;
    name.append(fileName, filePath);
    // no per-file estimate (removed by user). show path only
    info.appendChild(name);
    meta.appendChild(img);
    meta.appendChild(info);

    // If video, generate a middle-frame thumbnail
    try {
      const path = require("path");
      const ext = path.extname(p).toLowerCase();
      const videoExts = [
        ".mp4",
        ".mov",
        ".mkv",
        ".avi",
        ".webm",
        ".flv",
        ".wmv",
      ];
      const audioExts = AUDIO_EXTS || [
        ".mp3",
        ".wav",
        ".m4a",
        ".aac",
        ".flac",
        ".ogg",
        ".opus",
      ];
      if (videoExts.includes(ext)) {
        const leaveThumbnailSpaceEmpty = () => {
          img.onload = null;
          img.onerror = null;
          img.removeAttribute("src");
          img.classList.remove("show");
          img.classList.add("thumb-fade");
        };
        const revealVideoThumbnail = (thumbnailPath) => {
          // Progress updates rebuild the row. Record the first reveal so those
          // later renders do not replay the entrance animation every time.
          fileStates[p].thumbnailFadePlayed = true;
          img.onload = () => {
            img.onload = null;
            // Establish the hidden state before revealing the decoded frame so
            // Chromium consistently runs the fade transition.
            img.classList.remove("show");
            img.getBoundingClientRect();
            requestAnimationFrame(() => img.classList.add("show"));
          };
          img.src = "file://" + thumbnailPath;
        };
        // use cached thumbnail if available
        if (fileStates[p].thumb) {
          if (fileStates[p].thumbnailFadePlayed) {
            img.onload = null;
            img.src = "file://" + fileStates[p].thumb;
            img.classList.add("thumb-fade", "show");
          } else {
            leaveThumbnailSpaceEmpty();
            revealVideoThumbnail(fileStates[p].thumb);
          }
        } else if (!fileStates[p].thumbGenerating) {
          fileStates[p].thumbGenerating = true;
          // Render nothing while FFmpeg works, but keep the fixed 46px image
          // box in layout so the filename and controls never shift.
          leaveThumbnailSpaceEmpty();
          // compute a simple cache key: mtime-size
          try {
            const fs = require("fs");
            const st = fs.statSync(p);
            const cacheName = `compressly_thumb_${st.mtimeMs}_${
              st.size
            }_${require("path").basename(p)}.png`;
            const tmp = require("os").tmpdir();
            const cachePath = require("path").join(tmp, cacheName);
            if (fs.existsSync(cachePath)) {
              fileStates[p].thumb = cachePath;
              revealVideoThumbnail(cachePath);
              fileStates[p].thumbGenerating = false;
            } else {
              generateVideoThumbnail(p, { middle: true })
                .then((th) => {
                  if (th) {
                    try {
                      // move to cachePath
                      fs.copyFileSync(th, cachePath);
                      fileStates[p].thumb = cachePath;
                      revealVideoThumbnail(cachePath);
                    } catch (e) {
                      fileStates[p].thumb = th;
                      revealVideoThumbnail(th);
                    }
                  }
                })
                .catch((err) => console.warn("thumb err", err))
                .finally(() => {
                  fileStates[p].thumbGenerating = false;
                });
            }
          } catch (e) {
            // fallback to direct generation
            generateVideoThumbnail(p, { middle: true })
              .then((th) => {
                if (th) {
                  fileStates[p].thumb = th;
                  revealVideoThumbnail(th);
                }
              })
              .catch((err) => console.warn("thumb err", err))
              .finally(() => {
                fileStates[p].thumbGenerating = false;
              });
          }
        } else {
          // A render can occur while an existing thumbnail job is still
          // running. Preserve the same empty, fixed-width layout slot.
          leaveThumbnailSpaceEmpty();
        }
      } else if (audioExts.includes(ext)) {
        // show a simple music SVG for audio files using the brand gradient
        // use a unique gradient id to avoid duplicate-id collisions when multiple SVGs are inserted
        const _gid = "g" + Math.random().toString(36).slice(2, 8);
        const svg = `
            <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' width='64' height='64'>
              <defs>
                <linearGradient id='${_gid}' x1='0%' y1='0%' x2='100%' y2='0%'>
                  <stop offset='0%' stop-color='#4f46e5' />
                  <stop offset='100%' stop-color='#ba39ff' />
                </linearGradient>
              </defs>
              <path fill='url(#${_gid})' d='M12 3v10.55A4 4 0 0010 13a4 4 0 100 8 4 4 0 004-4V7h4V3h-6z'/>
            </svg>`;
        try {
          img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
          img.classList.add("thumb-fade", "show");
        } catch (e) {
          img.src = "./compressly.ico";
        }
      } else {
        // for images, show file directly
        img.src = "file://" + p;
      }
    } catch (e) {
      console.warn("thumb generation failed", e);
    }

    // Thumbnail click behavior: open original before compression; open compressed after
    try {
      img.style.cursor = "pointer";
      img.addEventListener("click", () => {
        try {
          const fs = require("fs");
          const path = require("path");
          const state = fileStates[p] || {};
          const target =
            state.lastOut && fs.existsSync(state.lastOut) ? state.lastOut : p;

          // Primary: ask main process to reveal the file (more reliable on macOS)
          try {
            const { ipcRenderer } = require("electron");
            if (ipcRenderer && ipcRenderer.send) {
              try {
                ipcRenderer.send("reveal-file", target);
                return;
              } catch (e) {
                // fall through to local fallback
                console.warn("ipc reveal-file send failed", e);
              }
            }
          } catch (e) {
            // ignore and fall back
          }

          // Fallback: try to use shell from renderer if IPC isn't available
          try {
            const { shell } = require("electron");
            if (shell && shell.showItemInFolder) shell.showItemInFolder(target);
            else shell.openPath(path.dirname(target));
          } catch (e) {
            try {
              const { shell } = require("electron");
              shell.openPath(path.dirname(target));
            } catch (ee) {
              console.warn("reveal failed", ee);
            }
          }
        } catch (e) {
          console.warn("reveal file failed", e);
        }
      });
    } catch (e) {}

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const status = document.createElement("div");
    status.className = "small";
    // show a helpful CTA when the file is done
    if (fileStates[p] && fileStates[p].status === "done-oversize") {
      status.textContent = "Over target";
    } else if (
      (fileStates[p] && fileStates[p].status === "done") ||
      (fileStates[p] && fileStates[p].progress >= 100)
    ) {
      status.textContent = "Done - click thumbnail to reveal location";
    } else {
      status.textContent = fileStates[p].status || "Ready";
    }
    const progressWrap = document.createElement("div");
    progressWrap.className = "progress-bar";
    // allow the progress bar to sit inline so pct label can appear to its right
    progressWrap.style.display = "inline-block";
    progressWrap.style.verticalAlign = "middle";
    const prog = document.createElement("i");
    // ensure displayedProgress exists
    if (typeof fileStates[p].displayedProgress !== "number")
      fileStates[p].displayedProgress = fileStates[p].progress || 0;
    prog.style.width = (fileStates[p].displayedProgress || 0) + "%";
    // save element reference for animation loop
    fileStates[p].progEl = prog;
    progressWrap.appendChild(prog);

    // per-file percentage label (hidden until processing/progress)
    const pctEl = document.createElement("div");
    pctEl.className = "small";
    pctEl.style.minWidth = "44px";
    pctEl.style.textAlign = "right";
    pctEl.style.color = "var(--muted)";
    pctEl.style.display = "inline-block";
    pctEl.style.marginRight = "8px";
    pctEl.textContent = Math.round(fileStates[p].displayedProgress || 0) + "%";
    pctEl.style.display =
      fileStates[p].status === "processing" || (fileStates[p].progress || 0) > 0
        ? "block"
        : "none";
    // save reference for the animation loop
    fileStates[p].pctEl = pctEl;

    // remove button (trash icon)
    const removeBtn = document.createElement("button");
    removeBtn.className = "file-action-btn remove";
    // Disable and mute removal while the file is queued or processing.
    removeBtn.disabled = !!(
      fileStates[p] &&
      (fileStates[p].status === "queued" ||
        fileStates[p].status === "processing")
    );
    removeBtn.title = removeBtn.disabled
      ? "Cannot remove while queued or processing"
      : "Remove";
    // inline the provided trash SVG but ensure it uses currentColor for fill
    removeBtn.innerHTML = `<svg aria-hidden="true" focusable="false" width="1em" height="1em" viewBox="0 0 800 800" style="vertical-align:middle; fill:currentColor;">
      <path d="m600 200l-26.7 400.4c-2.3 35.1-3.5 52.6-11.1 65.9-6.6 11.7-16.7 21.2-28.8 27-13.8 6.7-31.4 6.7-66.5 6.7h-133.8c-35.1 0-52.7 0-66.5-6.7-12.1-5.8-22.2-15.3-28.8-27-7.6-13.3-8.8-30.8-11.1-65.9l-26.7-400.4m-66.7 0h533.4m-133.4 0l-9-27.1c-8.7-26.2-13.1-39.3-21.2-49-7.2-8.6-16.4-15.2-26.7-19.3-11.8-4.6-25.6-4.6-53.3-4.6h-46.2c-27.7 0-41.5 0-53.2 4.6-10.4 4.1-19.6 10.7-26.8 19.3-8.1 9.7-12.5 22.8-21.2 49l-9 27.1m200 133.3v233.4m-133.4-233.4v233.4"/>
    </svg>`;
    removeBtn.addEventListener("click", () => {
      // do nothing if removal is disabled (file processing)
      if (removeBtn.disabled) return;
      // if queued, allow removing (and attempt cancel if necessary)
      if (
        fileStates[p] &&
        (fileStates[p].status === "processing" ||
          fileStates[p].status === "queued")
      ) {
        if (fileStates[p].cmd && typeof fileStates[p].cmd.kill === "function") {
          try {
            fileStates[p].cmd.kill("SIGKILL");
          } catch (e) {}
        }
        fileStates[p].cancelRequested = true;
      }
      files = files.filter((x) => x !== p);
      delete fileStates[p];
      renderList();
    });

    // cancel button (X icon)
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "file-action-btn cancel";
    cancelBtn.title = "Cancel";
    cancelBtn.innerText = "✕";
    // allow cancel while queued or processing so users can stop immediately
    cancelBtn.disabled = !(
      fileStates[p] &&
      (fileStates[p].status === "processing" ||
        fileStates[p].status === "queued")
    );
    cancelBtn.title = cancelBtn.disabled ? "Cancel (not available)" : "Cancel";
    cancelBtn.addEventListener("click", () => {
      if (fileStates[p] && fileStates[p].status === "processing") {
        anyCancelled = true;
        fileStates[p].cancelRequested = true;
        if (fileStates[p].cmd && typeof fileStates[p].cmd.kill === "function") {
          try {
            fileStates[p].cmd.kill("SIGKILL");
          } catch (e) {}
        }
        fileStates[p].status = "cancelled";
        fileStates[p].progress = 0;
        renderList();
      }
    });

    // group action buttons together so they appear next to each other
    const btnGroup = document.createElement("div");
    btnGroup.className = "file-action-buttons";
    const detailsBtn = document.createElement("button");
    detailsBtn.className = "file-action-btn details";
    detailsBtn.type = "button";
    detailsBtn.textContent = "Details";
    detailsBtn.addEventListener("click", () => openDetailedView(p));
    btnGroup.appendChild(detailsBtn);
    btnGroup.appendChild(cancelBtn);
    btnGroup.appendChild(removeBtn);

    actions.appendChild(status);
    // put progress bar and percentage in a horizontal row so pct appears to the right
    const progressRow = document.createElement("div");
    progressRow.style.display = "flex";
    progressRow.style.alignItems = "center";
    progressRow.style.gap = "8px";
    progressRow.style.flexWrap = "nowrap";
    // place percentage to the left of the progress bar
    pctEl.style.whiteSpace = "nowrap";
    // ensure the progress bar doesn't expand to full width and push the pct to next line
    progressWrap.style.flex = "0 0 220px";
    progressWrap.style.width = "220px";
    progressRow.appendChild(pctEl);
    progressRow.appendChild(progressWrap);
    actions.appendChild(progressRow);
    actions.appendChild(btnGroup);

    li.appendChild(meta);
    li.appendChild(actions);
    // make list items focusable and interactive so we can persist hover state
    li.tabIndex = 0;
    // restore hovering state if present to avoid flicker during re-renders
    if (fileStates[p] && fileStates[p].hovering) {
      try {
        // Persist hover visually but suppress the entrance animation so
        // frequent re-renders (progress updates) don't retrigger it.
        li.style.transition = "none";
        li.classList.add("hovering");
        // restore transition on next frame so future mouseenter animates
        requestAnimationFrame(() => {
          try {
            // force layout then restore
            li.getBoundingClientRect();
            li.style.transition = "";
          } catch (e) {}
        });
      } catch (e) {}
    }
    li.addEventListener("mouseenter", () => {
      try {
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].hovering = true;
        li.classList.add("hovering");
      } catch (e) {}
    });
    li.addEventListener("mouseleave", () => {
      try {
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].hovering = false;
        li.classList.remove("hovering");
      } catch (e) {}
    });
    li.addEventListener("focus", () => li.classList.add("hovering"));
    li.addEventListener("blur", () => li.classList.remove("hovering"));

    // Ensure the newly-created element's hover class matches the actual
    // :hover state (fixes cases where re-renders replace elements while the
    // mouse is stationary and mouseenter/mouseleave do not fire).
    try {
      if (typeof li.matches === "function") {
        if (li.matches(":hover")) {
          if (!fileStates[p]) fileStates[p] = {};
          fileStates[p].hovering = true;
          // Suppress animation when restoring hover during a re-render
          try {
            li.style.transition = "none";
            li.classList.add("hovering");
            requestAnimationFrame(() => {
              try {
                li.getBoundingClientRect();
                li.style.transition = "";
              } catch (e) {}
            });
          } catch (e) {}
        } else {
          // If the element isn't hovered but we have stale state, clear it
          if (fileStates[p] && fileStates[p].hovering) {
            fileStates[p].hovering = false;
            li.classList.remove("hovering");
          }
        }
      }
    } catch (e) {}

    fileListEl.appendChild(li);
  }
  // update footer info every render
  updateFooterInfo();
}

startBtn.addEventListener("click", async () => {
  if (files.length === 0) return alert("No files selected");
  const batchMode = compressionMode;
  const batchStartedAt = Date.now();
  const batchFiles = files.slice();
  smartBatchSummary = null;
  closeSmartResultsView();
  statusEl.textContent =
    batchMode === "smart" ? "Smart compression in progress..." : "Compressing...";
  // Lock UI globally (except About, Lite, Theme)
  try {
    setGlobalProcessingLock(true);
  } catch (e) {}
  startBtn.disabled = true;
  // clear any previous cancellation state for a fresh run
  anyCancelled = false;
  let anyOversize = false;
  let firstOutDir = null;
  let firstOutPath = null;
  for (const p of batchFiles) {
    // use copy since files can be removed
    try {
      // mark this file as queued so the UI enables cancel immediately
      if (!fileStates[p]) fileStates[p] = {};
      // clear any previous cancel request for this file so a fresh run proceeds
      fileStates[p].cancelRequested = false;
      // If a video thumbnail is still generating, wait for it to finish before queuing/compressing
      if (fileStates[p].thumbGenerating) {
        // wait up to 15s for thumbnail generation to complete
        await waitForThumb(p, 15000);
      }
      fileStates[p].status = "queued";
      renderList();
      const result = await compressFile(p, (progress, status, outPath) => {
        if (fileStates[p]) {
          fileStates[p].progress = progress;
          fileStates[p].status = status || fileStates[p].status;
          if (status === "done" || status === "done-oversize") {
            try {
              const outputBytes = require("fs").statSync(outPath).size;
              fileStates[p].resultDetails = {
                ...(fileStates[p].resultDetails || {}),
                outputBytes,
                targetMet: status === "done",
              };
            } catch (e) {}
            if (fileStates[p].processingDetails)
              fileStates[p].processingDetails.endedAt = Date.now();
          }
        }
        if (outPath && !firstOutDir) {
          try {
            firstOutDir = require("path").dirname(outPath);
            if (!firstOutPath) firstOutPath = outPath;
          } catch (e) {}
        }
        renderList();
        updateDetailedView();
      });
      if (result === null) {
        if (fileStates[p]) fileStates[p].status = "cancelled";
        if (fileStates[p] && fileStates[p].processingDetails)
          fileStates[p].processingDetails.endedAt = Date.now();
        anyCancelled = true;
      }
      if (fileStates[p] && fileStates[p].status === "done-oversize") {
        anyOversize = true;
      }
      // recent outputs handling removed
    } catch (err) {
      console.error(err);
      if (fileStates[p]) fileStates[p].status = "error";
      if (fileStates[p]) {
        fileStates[p].resultDetails = { error: err.message };
        if (fileStates[p].processingDetails)
          fileStates[p].processingDetails.endedAt = Date.now();
      }
      window.electronAPI.log("Error compressing", p, err.message);
      renderList();
    }
  }

  if (batchMode === "smart") {
    try {
      await analyzeSmartBatch(batchFiles);
      smartBatchSummary = buildSmartBatchSummary(batchFiles, batchStartedAt);
    } catch (error) {
      console.warn("Smart quality analysis failed", error);
      smartBatchSummary = buildSmartBatchSummary(batchFiles, batchStartedAt);
    }
  }

  statusEl.textContent = anyCancelled
    ? "Cancelled"
    : anyOversize
      ? "Done with size warnings"
      : "Done";
  startBtn.disabled = false;
  try {
    setGlobalProcessingLock(false);
  } catch (e) {}
  if (
    batchMode === "smart" &&
    smartBatchSummary &&
    smartBatchSummary.successful > 0
  ) {
    showSmartResults(smartBatchSummary);
  }
  // open output and highlight first file (skip if user cancelled)
  // removed automatic opening of file explorer per user request
  // user can now click the thumbnail to open the original file (before compress)
  // or the compressed file (after compress)
  anyCancelled = false;
});

// Helper: wait until a file's thumbnail generation flag clears (no timeout)
function waitForThumb(p) {
  return new Promise((resolve) => {
    const check = () => {
      try {
        if (!fileStates[p] || !fileStates[p].thumbGenerating)
          return resolve(true);
      } catch (e) {
        return resolve(false);
      }
      setTimeout(check, 120);
    };
    check();
  });
}

async function compressFile(p, onProgress) {
  const buffer = await window.electronAPI.readFile(p);
  const targetMB = parseFloat(targetSizeEl.value) || 10;
  const path = require("path");
  const ext = path.extname(p).toLowerCase();

  const imageExts = IMAGE_EXTS;
  const videoExts = VIDEO_EXTS;
  const audioExts = AUDIO_EXTS;
  if (!fileStates[p]) fileStates[p] = {};
  const mediaKind = imageExts.includes(ext)
    ? "Image"
    : videoExts.includes(ext)
      ? "Video"
      : audioExts.includes(ext)
        ? "Audio"
        : "Media";
  try {
    fileStates[p].sourceDetails = {
      ...(fileStates[p].sourceDetails || {}),
      kind: mediaKind,
      originalBytes: require("fs").statSync(p).size,
    };
  } catch (e) {}
  const fpsSetting = videoFpsEl ? parseInt(videoFpsEl.value || "30", 10) : 30;
  fileStates[p].settingsSnapshot = {
    mediaKind,
    targetMB,
    fps: fpsSetting,
    resolution: targetResolutionEl ? targetResolutionEl.value : "720p",
    priority: prioritySelectEl ? prioritySelectEl.value : "balanced",
  };
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    startedAt: Date.now(),
    endedAt: null,
    stage: "Starting",
  };
  fileStates[p].resultDetails = {};

  if (compressionMode === "smart") {
    const smartOptions = getSmartOptions();
    fileStates[p].settingsSnapshot = {
      mediaKind,
      mode: "Smart Compression",
      ...smartOptions,
    };
    if (imageExts.includes(ext))
      return await smartCompressImage(p, buffer, onProgress, smartOptions);
    if (videoExts.includes(ext))
      return await smartCompressVideo(p, onProgress, smartOptions);
    if (audioExts.includes(ext))
      return await smartCompressAudio(p, onProgress, smartOptions);
  }

  if (imageExts.includes(ext)) {
    return await compressImage(p, buffer, { ext }, targetMB, onProgress);
  } else if (videoExts.includes(ext)) {
    // read UI options for video
    const fps = fpsSetting;
    const priority = prioritySelectEl
      ? prioritySelectEl.value || "balanced"
      : "balanced";
    return await compressVideo(p, targetMB, onProgress, { fps, priority });
  } else if (audioExts.includes(ext)) {
    // audio-only file
    return await compressAudio(p, targetMB, onProgress, {});
  } else {
    // Fallback: try to infer from header using file-type if available dynamically
    try {
      const ftModule = await import("file-type");
      const ft = await ftModule.fileTypeFromBuffer(buffer);
      if (ft && ft.mime.startsWith("image/")) {
        return await compressImage(p, buffer, ft, targetMB, onProgress);
      }
      if (ft && ft.mime.startsWith("video/")) {
        return await compressVideo(p, targetMB, onProgress);
      }
      if (ft && ft.mime.startsWith("audio/")) {
        return await compressAudio(p, targetMB, onProgress);
      }
    } catch (e) {
      console.warn(
        "file-type not available, using extension fallback",
        e.message
      );
    }
    console.warn("Unknown type (extension fallback)", p);
  }
}

function smartOutputPath(inputPath, extension) {
  const path = require("path");
  const fs = require("fs");
  const parsed = path.parse(inputPath);
  let candidate = path.join(parsed.dir, `${parsed.name}_smart${extension}`);
  let count = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(parsed.dir, `${parsed.name}_smart-${count}${extension}`);
    count++;
  }
  return candidate;
}

async function smartCompressImage(p, buffer, onProgress, opts) {
  const sharp = require("sharp");
  const fs = require("fs");
  const path = require("path");
  const { getImageOutputExtension } = require("./media-utils");
  const inputExt = path.extname(p).toLowerCase();
  const outputExt = getImageOutputExtension(p);
  const outPath = smartOutputPath(p, outputExt);
  const quality = require("./media-utils").getSmartQualitySettings(
    opts.quality
  ).imageQuality;
  let pipeline = sharp(buffer, { limitInputPixels: false });
  const metadata = await pipeline.metadata();
  fileStates[p].sourceDetails = {
    ...(fileStates[p].sourceDetails || {}),
    kind: "Image",
    width: metadata.width,
    height: metadata.height,
    codec: metadata.format,
  };
  fileStates[p].sourceDetailsLoaded = true;
  fileStates[p].outPath = outPath;
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    stage: "Analyzing image",
    outputFormat: outputExt.replace(/^\./, "").toUpperCase(),
  };
  if (!opts.retainResolution)
    pipeline = pipeline.resize({ width: 2560, height: 1440, fit: "inside", withoutEnlargement: true });
  if (!opts.stripMetadata) pipeline = pipeline.withMetadata();
  if ((outputExt === ".jpg" || outputExt === ".jpeg") && metadata.hasAlpha)
    pipeline = pipeline.flatten({ background: "#ffffff" });
  if (outputExt === ".png") pipeline = pipeline.png({ compressionLevel: 9, effort: 10 });
  else if (outputExt === ".webp") pipeline = pipeline.webp({ quality, effort: 6 });
  else pipeline = pipeline.jpeg({ quality, progressive: true, mozjpeg: true });
  if (onProgress) onProgress(20, "processing", outPath);
  fileStates[p].processingDetails.stage = "Optimizing image";
  const data = await pipeline.toBuffer();
  if (fileStates[p].cancelRequested) return null;
  if (data.length >= buffer.length && opts.quality !== "compact") {
    fileStates[p].processingDetails.stage = "Finding a smaller quality-safe result";
    return smartCompressImage(p, buffer, onProgress, {
      ...opts,
      quality: "compact",
    });
  }
  if (onProgress) onProgress(85, "processing", outPath);
  await window.electronAPI.writeFile(outPath, data);
  fileStates[p].lastOut = outPath;
  fileStates[p].processingDetails.stage = "Complete";
  if (onProgress) onProgress(100, "done", outPath);
  return outPath;
}

async function configureSmartFfmpeg() {
  const ffmpeg = require("fluent-ffmpeg");
  try {
    ffmpeg.setFfmpegPath(resolveBinaryPath(await getFfmpegPath()));
    ffmpeg.setFfprobePath(resolveBinaryPath(await getFfprobePath()));
  } catch (e) {}
  return ffmpeg;
}

async function smartCompressVideo(p, onProgress, opts) {
  const ffmpeg = await configureSmartFfmpeg();
  const fs = require("fs");
  const outPath = smartOutputPath(p, ".mp4");
  const metadata = await new Promise((resolve, reject) =>
    ffmpeg.ffprobe(p, (err, data) => (err ? reject(err) : resolve(data)))
  );
  const duration = Number(metadata.format.duration) || 1;
  const video = (metadata.streams || []).find((s) => s.codec_type === "video");
  const audio = (metadata.streams || []).find((s) => s.codec_type === "audio");
  const sourceFps = parseFrameRate(video && (video.avg_frame_rate || video.r_frame_rate));
  const crf = require("./media-utils").getSmartQualitySettings(
    opts.quality
  ).videoCrf;
  const audioCopied = !!(
    opts.preserveAudio && audio && audio.codec_name === "aac"
  );
  const sourceAudioBitrate = audio && audio.bit_rate
    ? Math.round(Number(audio.bit_rate) / 1000)
    : null;
  fileStates[p].sourceDetails = {
    ...(fileStates[p].sourceDetails || {}), kind: "Video", duration,
    width: video && video.width, height: video && video.height, fps: sourceFps,
    videoCodec: video && video.codec_name, audioCodec: audio && audio.codec_name,
    audioBitrateKbps: sourceAudioBitrate,
  };
  fileStates[p].sourceDetailsLoaded = true;
  fileStates[p].outPath = outPath;
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    stage: "Quality-aware encoding", outputFormat: "MP4 (H.264/AAC)",
    videoBitrateKbps: `CRF ${crf}`,
    audioBitrateKbps: opts.preserveAudio ? 192 : 128,
  };
  fileStates[p].resultDetails = {
    ...(fileStates[p].resultDetails || {}),
    audioResult: audio
      ? {
          handling: audioCopied ? "Copied" : "Re-encoded",
          codec: audioCopied ? String(audio.codec_name).toUpperCase() : "AAC",
          bitrateKbps: audioCopied ? sourceAudioBitrate : (opts.preserveAudio ? 192 : 128),
        }
      : { handling: "No audio track" },
  };
  return new Promise((resolve, reject) => {
    let command = ffmpeg(p);
    fileStates[p].cmd = command;
    fileStates[p].status = "processing";
    if (onProgress) onProgress(0, "processing", outPath);
    const outputOptions = [
      "-c:v libx264", `-crf ${crf}`, "-preset slow", "-pix_fmt yuv420p",
      "-movflags +faststart",
      audioCopied ? "-c:a copy" : "-c:a aac",
    ];
    if (!audioCopied)
      outputOptions.push(`-b:a ${opts.preserveAudio ? 192 : 128}k`);
    if (opts.stripMetadata) outputOptions.push("-map_metadata -1");
    if (!opts.retainFps && sourceFps) outputOptions.push(`-r ${Math.min(30, Math.round(sourceFps))}`);
    if (!opts.retainResolution)
      command = command.videoFilters("scale='if(gt(iw/ih,16/9),min(1920,iw),-2)':'if(gt(iw/ih,16/9),-2,min(1080,ih))'");
    command.outputOptions(outputOptions)
      .on("progress", (progress) => {
        let pct = typeof progress.percent === "number" ? progress.percent : 0;
        if (!pct && progress.timemark) {
          const parts = String(progress.timemark).split(":").map(Number);
          const seconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
          pct = (seconds / duration) * 100;
        }
        if (onProgress) onProgress(Math.min(99, Math.round(pct)), "processing", outPath);
      })
      .on("end", () => {
        fileStates[p].cmd = null;
        if (fileStates[p].cancelRequested) {
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        try {
          const originalBytes = fs.statSync(p).size;
          const outputBytes = fs.statSync(outPath).size;
          if (
            outputBytes >= originalBytes &&
            opts.quality !== "compact"
          ) {
            fs.unlinkSync(outPath);
            fileStates[p].processingDetails.stage =
              "Retrying with a more efficient profile";
            fileStates[p].displayedProgress = 0;
            smartCompressVideo(p, onProgress, {
              ...opts,
              quality: "compact",
            }).then(resolve, reject);
            return;
          }
        } catch (e) {}
        fileStates[p].lastOut = outPath;
        fileStates[p].processingDetails.stage = "Complete";
        if (onProgress) onProgress(100, "done", outPath);
        resolve(outPath);
      })
      .on("error", (error) => {
        fileStates[p].cmd = null;
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
        if (fileStates[p].cancelRequested) return resolve(null);
        reject(error);
      })
      .save(outPath);
  });
}

async function smartCompressAudio(p, onProgress, opts) {
  const ffmpeg = await configureSmartFfmpeg();
  const fs = require("fs");
  const outPath = smartOutputPath(p, ".mp3");
  const bitrate = require("./media-utils").getSmartQualitySettings(
    opts.quality
  ).audioBitrateKbps;
  fileStates[p].outPath = outPath;
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}), stage: "High-quality audio encoding",
    outputFormat: "MP3", audioBitrateKbps: bitrate,
  };
  fileStates[p].resultDetails = {
    ...(fileStates[p].resultDetails || {}),
    audioResult: {
      handling: "Re-encoded",
      codec: "MP3",
      bitrateKbps: bitrate,
    },
  };
  return new Promise((resolve, reject) => {
    const command = ffmpeg(p).noVideo().audioCodec("libmp3lame").audioBitrate(`${bitrate}k`).format("mp3");
    fileStates[p].cmd = command;
    if (opts.stripMetadata) command.outputOptions(["-map_metadata -1"]);
    if (onProgress) onProgress(0, "processing", outPath);
    command.on("progress", (pr) => onProgress && onProgress(Math.min(99, Math.round(pr.percent || 0)), "processing", outPath))
      .on("end", () => {
        fileStates[p].cmd = null;
        if (fileStates[p].cancelRequested) {
          try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        fileStates[p].lastOut = outPath;
        fileStates[p].processingDetails.stage = "Complete";
        if (onProgress) onProgress(100, "done", outPath);
        resolve(outPath);
      })
      .on("error", (error) => {
        fileStates[p].cmd = null;
        try { if (fs.existsSync(outPath)) fs.unlinkSync(outPath); } catch (e) {}
        if (fileStates[p].cancelRequested) return resolve(null);
        reject(error);
      }).save(outPath);
  });
}

async function compressImage(p, buffer, ft, targetMB, onProgress) {
  const sharp = require("sharp");
  const path = require("path");
  const fs = require("fs");
  const origExt = path.extname(p).toLowerCase();
  const {
    getImageOutputExtension,
    buildAvailableOutputPath,
    isWithinTarget,
    formatSizeWarning,
  } = require("./media-utils");
  const outputExt = getImageOutputExtension(p);

  // Don't support animated GIFs (explicitly removed)
  if (origExt === ".gif") {
    if (onProgress) onProgress(0, "unsupported");
    return null;
  }

  // prepare output path (avoid overwrite)
  const outPath = buildAvailableOutputPath(p, outputExt, fs.existsSync);

  // expose outPath early so UI can stat an in-progress output file
  if (!fileStates[p]) fileStates[p] = {};
  fileStates[p].outPath = outPath;

  // load image and metadata
  const img = sharp(buffer, { limitInputPixels: false });
  const metadata = await img.metadata();
  fileStates[p].sourceDetails = {
    ...(fileStates[p].sourceDetails || {}),
    kind: "Image",
    width: metadata.width,
    height: metadata.height,
    codec: metadata.format,
  };
  fileStates[p].sourceDetailsLoaded = true;
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    outputFormat: outputExt.replace(/^\./, "").toUpperCase(),
  };
  let width = metadata.width || null;
  let quality = 90; // starting quality for lossy formats

  const targetBytes = Math.max(1024 * 10, Math.round(targetMB * 1024 * 1024));
  const maxPasses = 16;

  // try multiple passes: reduce quality and/or width until under target or until limits
  for (let pass = 0; pass < maxPasses; pass++) {
    fileStates[p].processingDetails.stage = `Pass ${pass + 1} of ${maxPasses}`;
    let pipeline = img.clone();
    // reduce width progressively after first few passes
    if (width && pass > 0)
      pipeline = pipeline.resize({ width: Math.max(32, Math.round(width)) });

    // ensure JPEG doesn't receive alpha
    if ((outputExt === ".jpg" || outputExt === ".jpeg") && metadata.hasAlpha) {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
    }

    let data;
    if (outputExt === ".png") {
      // PNG: use compressionLevel and resize attempts
      data = await pipeline
        .png({ compressionLevel: Math.min(9, 9 - Math.floor(pass / 2)) })
        .toBuffer();
    } else if (outputExt === ".webp") {
      data = await pipeline
        .webp({ quality: Math.max(10, Math.round(quality)) })
        .toBuffer();
    } else {
      data = await pipeline
        .jpeg({
          quality: Math.max(10, Math.round(quality)),
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer();
    }

    // progress callback (estimate)
    if (onProgress) {
      const pct = Math.min(
        90,
        Math.round(((pass + 1) / maxPasses) * 90)
      );
      try {
        onProgress(pct, "processing");
      } catch (e) {}
    }

    // respond to cancellation requests during multi-pass image compression
    try {
      if (fileStates[p] && fileStates[p].cancelRequested) {
        try {
          const fs = require("fs");
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch (e) {}
        if (onProgress) onProgress(0, "cancelled");
        return null;
      }
    } catch (e) {}

    if (data.length <= targetBytes || pass === maxPasses - 1) {
      // ensure outPath is visible to UI before/while writing
      if (!fileStates[p]) fileStates[p] = {};
      fileStates[p].outPath = outPath;
      await window.electronAPI.writeFile(outPath, data);
      // If the user cancelled while the final write was happening, remove the file
      try {
        if (fileStates[p] && fileStates[p].cancelRequested) {
          const fs = require("fs");
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          // clear exposed outPath when we removed the file
          if (fileStates[p]) fileStates[p].outPath = null;
          if (onProgress) onProgress(0, "cancelled");
          return null;
        }
      } catch (e) {}
      if (!fileStates[p]) fileStates[p] = {};
      fileStates[p].lastOut = outPath;
      const reachedTarget = isWithinTarget(data.length, targetBytes);
      fileStates[p].sizeWarning = reachedTarget
        ? null
        : formatSizeWarning(data.length, targetBytes);
      // leave outPath set to the final file so footer shows compressed size
      if (onProgress)
        onProgress(100, reachedTarget ? "done" : "done-oversize", outPath);
      return outPath;
    }

    // shrink further for next pass
    width = width ? Math.max(32, Math.round(width * 0.85)) : null;
    quality = Math.max(10, Math.round(quality * 0.82));
  }

  // fallback (shouldn't reach here) - write original buffer
  try {
    // ensure outPath is exposed while writing the fallback
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].outPath = outPath;
    await window.electronAPI.writeFile(outPath, buffer);
    fileStates[p].lastOut = outPath;
    if (onProgress) onProgress(100, "done", outPath);
    return outPath;
  } catch (e) {
    console.warn("compressImage final write failed", e);
    return null;
  }
}

async function compressVideo(p, targetMB, onProgress, opts = {}) {
  const ffmpegPath = await getFfmpegPath();
  const ffmpeg = require("fluent-ffmpeg");
  try {
    ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath));
    try {
      const ffprobePath = await getFfprobePath();
      if (ffprobePath) ffmpeg.setFfprobePath(resolveBinaryPath(ffprobePath));
    } catch (e) {}
  } catch (e) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }

  const { promisify } = require("util");
  const fs = require("fs");
  let outPath = p.replace(/(\.[^.]+)$/, "_compressed.mp4");
  let count = 1;
  while (fs.existsSync(outPath)) {
    outPath = p.replace(/(\.[^.]+)$/, `_compressed-${count}.mp4`);
    count++;
  }

  // target bytes
  const targetBytes = targetMB * 1024 * 1024;
  const attempt = Number.isInteger(opts._attempt) ? opts._attempt : 0;
  const maxAttempts = 3;
  const bitrateScale =
    typeof opts._bitrateScale === "number" ? opts._bitrateScale : 1;

  // simple strategy: set bitrate based on file duration and target size
  const getMetadata = (src) =>
    new Promise((res, rej) =>
      ffmpeg.ffprobe(src, (err, meta) => (err ? rej(err) : res(meta)))
    );
  const meta = await getMetadata(p);
  const duration = meta.format.duration || 10;
  // Infer audio stream bitrate and codec
  const audioStream = (meta.streams || []).find(
    (s) => s.codec_type === "audio"
  );
  const audioBitrate =
    audioStream && audioStream.bit_rate
      ? Math.round(audioStream.bit_rate / 1000)
      : 128; // kbps fallback
  const audioCodec =
    audioStream && audioStream.codec_name ? audioStream.codec_name : null;
  const videoStream = (meta.streams || []).find(
    (stream) => stream.codec_type === "video"
  );
  fileStates[p].sourceDetails = {
    ...(fileStates[p].sourceDetails || {}),
    kind: "Video",
    duration,
    width: videoStream && videoStream.width,
    height: videoStream && videoStream.height,
    fps:
      videoStream &&
      parseFrameRate(videoStream.avg_frame_rate || videoStream.r_frame_rate),
    videoCodec: videoStream && videoStream.codec_name,
    audioCodec,
    audioBitrateKbps: audioBitrate,
  };
  fileStates[p].sourceDetailsLoaded = true;
  // Apply priority adjustments
  const priority = opts.priority || "balanced";
  let adjAudioBitrate = audioBitrate;
  if (priority === "video") {
    adjAudioBitrate = Math.max(64, Math.round(audioBitrate * 0.6));
  } else if (priority === "audio") {
    adjAudioBitrate = Math.max(128, Math.round(audioBitrate * 1.4));
  }
  // Calculate target video bitrate (kbps) subtracting expected audio size
  // Compute total target in kbps
  const totalTargetKbps = Math.max(
    1,
    Math.round((targetBytes * 8) / duration / 1000)
  );

  // Allocate audio budget adaptively. If the audio alone would exceed the total
  // budget, we must force a much smaller audio bitrate (or drop audio) so the
  // video can fit within the target size. For tiny targets allocate a small
  // proportional share to audio.
  let audioAllocKbps;
  if (totalTargetKbps <= 64) {
    // very small targets: give audio a tiny share
    audioAllocKbps = Math.max(8, Math.round(totalTargetKbps * 0.15));
  } else if (totalTargetKbps <= 256) {
    audioAllocKbps = Math.max(16, Math.round(totalTargetKbps * 0.12));
  } else {
    // for larger targets, allow more audio but cap to the detected audio bitrate
    audioAllocKbps = Math.min(
      adjAudioBitrate,
      Math.round(totalTargetKbps * 0.15)
    );
  }

  // Ensure audioAllocKbps doesn't exceed total target
  audioAllocKbps = Math.min(audioAllocKbps, Math.max(1, totalTargetKbps - 1));
  audioAllocKbps = Math.max(8, Math.round(audioAllocKbps * bitrateScale));

  // Now compute video bitrate budget (kbps). Allow it to go low (>=16kbps) so
  // we can meet very small targets instead of clamping up and producing larger
  // files.
  let videoBitrate = Math.max(
    16,
    Math.round((totalTargetKbps - audioAllocKbps) * bitrateScale)
  );
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    outputFormat: "MP4 (H.264/AAC)",
    videoBitrateKbps: videoBitrate,
    audioBitrateKbps: audioAllocKbps,
    stage: `Attempt ${attempt + 1} of ${maxAttempts}`,
  };

  return new Promise(async (resolve, reject) => {
    let cmd = ffmpeg(p);
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].cmd = cmd;
    fileStates[p].status = "processing";
    // expose outPath so the UI can stat a growing output file while ffmpeg writes
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].outPath = outPath;
    if (attempt > 0) fileStates[p].displayedProgress = 0;
    if (onProgress) onProgress(0, "processing", outPath);
    // build video filter to respect target resolution and preserve portrait orientation
    // targetResolution: auto / 480p / 720p / 1080p
    const resChoice =
      (opts && opts.resolution) ||
      (targetResolutionEl && targetResolutionEl.value) ||
      "auto";
    // default to 720p if not specified
    let maxW = 1280,
      maxH = 720;
    // Map resolution labels to target box (width x height)
    // New supported resolutions: 64p, 144p, 240p, 360p, 480p, 720p, 1080p
    if (resChoice === "64p") {
      // very small: 112x64 (approx 16:9)
      maxW = 112;
      maxH = 64;
    } else if (resChoice === "144p") {
      // 256x144 (16:9)
      maxW = 256;
      maxH = 144;
    } else if (resChoice === "240p") {
      // 426x240 (approx 16:9)
      maxW = 426;
      maxH = 240;
    } else if (resChoice === "360p") {
      // 640x360
      maxW = 640;
      maxH = 360;
    } else if (resChoice === "480p") {
      maxW = 854;
      maxH = 480;
    } else if (resChoice === "720p") {
      maxW = 1280;
      maxH = 720;
    } else if (resChoice === "1080p") {
      maxW = 1920;
      maxH = 1080;
    }
    // We will scale down to fit within maxW x maxH while preserving aspect ratio.
    // For portrait videos (ih>iw) avoid forcing widescreen padding — instead scale to maxH height and center horizontally without forcing a wide canvas.
    const vf = `scale='if(gt(iw/ih,${maxW}/${maxH}),min(${maxW},iw),-2)':'if(gt(iw/ih,${maxW}/${maxH}),-2,min(${maxH},ih))'`;

    // If audio codec is already AAC we can copy to preserve quality and avoid re-encoding
    // Constrain encoder to the computed average bitrate using maxrate/bufsize
    const outOpts = [
      "-c:v libx264",
      `-b:v ${videoBitrate}k`,
      `-maxrate ${videoBitrate}k`,
      `-bufsize ${Math.max(2, Math.round(videoBitrate * 2))}k`,
      "-preset fast",
      "-movflags +faststart",
      "-pix_fmt yuv420p",
    ];
    // apply FPS if provided
    const fps =
      opts.fps && Number.isFinite(opts.fps)
        ? Math.max(1, Math.min(120, Math.round(opts.fps)))
        : null;
    if (fps) outOpts.push(`-r ${fps}`);
    // If the existing audio bitrate is small enough to fit in our allocation
    // and the user didn't force a different priority, we could copy, otherwise
    // re-encode audio to the allocated audio bitrate so the total size stays
    // within budget.
    if (
      attempt === 0 &&
      audioCodec === "aac" &&
      adjAudioBitrate <= audioAllocKbps
    ) {
      outOpts.push("-c:a copy");
    } else {
      // re-encode audio at the allocated audio bitrate
      outOpts.push("-c:a aac", `-b:a ${audioAllocKbps}k`);
    }

    cmd
      .videoFilters(vf)
      .outputOptions(outOpts)
      .on("progress", (p) => {
        try {
          window.electronAPI.log("ffmpeg progress", p);
        } catch (e) {}
        // Prefer explicit percent; if absent but timemark present, compute from duration
        let percent = 0;
        if (typeof p.percent === "number") {
          percent = Math.min(99, Math.round(p.percent));
        } else if (p.timemark) {
          // parse timemark (HH:MM:SS[.xx]) into seconds
          try {
            const parts = String(p.timemark).split(":").map(parseFloat);
            let secs = 0;
            if (parts.length === 3)
              secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
            else secs = parts[0] || 0;
            if (duration && isFinite(secs)) {
              percent = Math.min(
                99,
                Math.round((secs / Math.max(1, duration)) * 100)
              );
            } else {
              percent = 0;
            }
          } catch (e) {
            percent = 0;
          }
        } else {
          percent = 0;
        }
        if (onProgress) onProgress(percent, "processing");
      })
      .on("end", () => {
        if (fileStates[p]) fileStates[p].cmd = null;
        if (fileStates[p] && fileStates[p].cancelRequested) {
          // remove any partially written output file produced by ffmpeg
          try {
            const fs = require("fs");
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            // clear exposed outPath when partial output removed
            if (fileStates[p]) fileStates[p].outPath = null;
          } catch (e) {}
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        let actualBytes;
        try {
          actualBytes = fs.statSync(outPath).size;
        } catch (e) {
          return reject(new Error(`Could not verify video output size: ${e.message}`));
        }
        const {
          isWithinTarget,
          calculateRetryScale,
          formatSizeWarning,
        } = require("./media-utils");
        if (
          !isWithinTarget(actualBytes, targetBytes) &&
          attempt + 1 < maxAttempts
        ) {
          const correction = calculateRetryScale(actualBytes, targetBytes);
          try {
            fs.unlinkSync(outPath);
          } catch (e) {}
          if (fileStates[p]) fileStates[p].displayedProgress = 0;
          if (onProgress) onProgress(0, "processing");
          compressVideo(p, targetMB, onProgress, {
            ...opts,
            _attempt: attempt + 1,
            _bitrateScale: bitrateScale * correction,
          }).then(resolve, reject);
          return;
        }
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].lastOut = outPath;
        const reachedTarget = isWithinTarget(actualBytes, targetBytes);
        fileStates[p].sizeWarning = reachedTarget
          ? null
          : formatSizeWarning(actualBytes, targetBytes);
        // keep outPath set to final file so footer can stat it
        if (onProgress)
          onProgress(100, reachedTarget ? "done" : "done-oversize", outPath);
        resolve(outPath);
      })
      .on("error", (err) => {
        // attempt to remove any partial output
        try {
          const fs = require("fs");
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          // clear exposed outPath on error
          if (fileStates[p]) fileStates[p].outPath = null;
        } catch (e) {}
        if (fileStates[p]) fileStates[p].cmd = null;
        if (fileStates[p] && fileStates[p].cancelRequested) {
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        reject(err);
      })
      .save(outPath);
  });
}

// Compress audio files by re-encoding at a target average bitrate derived from targetMB
async function compressAudio(p, targetMB, onProgress, opts = {}) {
  const ffmpegPath = await getFfmpegPath();
  const ffmpeg = require("fluent-ffmpeg");
  try {
    ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath));
    try {
      const ffprobePath = await getFfprobePath();
      if (ffprobePath) ffmpeg.setFfprobePath(resolveBinaryPath(ffprobePath));
    } catch (e) {}
  } catch (e) {
    ffmpeg.setFfmpegPath(ffmpegPath);
  }

  const path = require("path");
  const fs = require("fs");
  const attempt = Number.isInteger(opts._attempt) ? opts._attempt : 0;
  const maxAttempts = 4;
  const bitrateScale =
    typeof opts._bitrateScale === "number" ? opts._bitrateScale : 1;

  // decide codec & output extension. For FLAC inputs we convert to lossy Opus
  // to achieve meaningful size reduction (FLAC is lossless so re-encoding to
  // FLAC won't reduce size). finalExt is the extension used for output file.
  const origExt = path.extname(p).toLowerCase() || ".m4a";
  let finalExt = origExt;
  let codec = "aac";
  if (origExt === ".mp3") {
    codec = "libmp3lame";
    finalExt = ".mp3";
  } else if (origExt === ".wav") {
    // PCM cannot reliably meet a requested file size, so WAV becomes MP3.
    codec = "libmp3lame";
    finalExt = ".mp3";
  } else if (origExt === ".flac") {
    // convert lossless FLAC to MP3 by default to achieve smaller output
    codec = "libmp3lame";
    finalExt = ".mp3";
  } else if (origExt === ".ogg" || origExt === ".opus") {
    codec = "libopus";
    finalExt = origExt;
  } else if (origExt === ".m4a" || origExt === ".aac") {
    codec = "aac";
    finalExt = origExt;
  }

  // build output path using finalExt and avoid collisions
  let outPath = p.replace(/(\.[^.]+)$/, `_compressed${finalExt}`);
  let count = 1;
  while (fs.existsSync(outPath)) {
    outPath = p.replace(/(\.[^.]+)$/, `_compressed-${count}${finalExt}`);
    count++;
  }

  // expose outPath for live stat'ing
  if (!fileStates[p]) fileStates[p] = {};
  fileStates[p].outPath = outPath;

  // get duration to compute bitrate
  const getMetadata = (src) =>
    new Promise((res, rej) =>
      ffmpeg.ffprobe(src, (err, meta) => (err ? rej(err) : res(meta)))
    );
  let duration = 0;
  try {
    const meta = await getMetadata(p);
    duration = Math.max(1, Math.floor(meta.format.duration || 1));
    const audioStream = (meta.streams || []).find(
      (stream) => stream.codec_type === "audio"
    );
    fileStates[p].sourceDetails = {
      ...(fileStates[p].sourceDetails || {}),
      kind: "Audio",
      duration,
      audioCodec: audioStream && audioStream.codec_name,
      audioBitrateKbps:
        audioStream && audioStream.bit_rate
          ? Math.round(Number(audioStream.bit_rate) / 1000)
          : null,
    };
    fileStates[p].sourceDetailsLoaded = true;
  } catch (e) {
    duration = 1; // fallback to avoid divide-by-zero
  }

  // target kbps for the entire file, allocated to audio (since it's audio-only)
  const targetBytes = Math.max(1024 * 10, Math.round(targetMB * 1024 * 1024));
  const totalTargetKbps = Math.max(
    8,
    Math.round((targetBytes * 8) / duration / 1000)
  );

  // final audio bitrate (kbps)
  // Keep requested rates within broadly supported encoder limits. The target
  // is a maximum, so producing a smaller file is preferable to encoder failure.
  const codecMaxKbps = codec === "libopus" ? 256 : 320;
  const audioBitrateKbps = Math.max(
    16,
    Math.min(codecMaxKbps, Math.round(totalTargetKbps * bitrateScale))
  );
  fileStates[p].processingDetails = {
    ...(fileStates[p].processingDetails || {}),
    outputFormat: finalExt.replace(/^\./, "").toUpperCase(),
    audioBitrateKbps,
    stage: `Attempt ${attempt + 1} of ${maxAttempts}`,
  };

  return new Promise((resolve, reject) => {
    let cmd = ffmpeg(p);
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].cmd = cmd;
    fileStates[p].status = "processing";
    if (onProgress) onProgress(0, "processing", outPath);

    // apply codec and bitrate options where appropriate
    if (codec === "libmp3lame") {
      cmd = cmd.audioCodec("libmp3lame").audioBitrate(`${audioBitrateKbps}k`);
    } else if (codec === "pcm_s16le") {
      // WAV PCM: set sample rate to control filesize indirectly
      cmd = cmd.audioCodec("pcm_s16le").outputOptions([`-ar 44100`]);
    } else if (codec === "flac") {
      cmd = cmd.audioCodec("flac");
    } else if (codec === "libopus") {
      cmd = cmd.audioCodec("libopus").audioBitrate(`${audioBitrateKbps}k`);
    } else {
      // default to AAC
      cmd = cmd.audioCodec("aac").audioBitrate(`${audioBitrateKbps}k`);
    }
    // set an explicit output format for known containers
    if (origExt === ".m4a" || origExt === ".aac") cmd = cmd.format("mp4");
    // when converting to MP3 ensure output format is explicitly set
    if (finalExt === ".mp3") {
      try {
        cmd = cmd.format("mp3");
      } catch (e) {}
    }

    // debug log chosen codec and bitrate
    try {
      if (window && window.electronAPI && window.electronAPI.log)
        window.electronAPI.log(
          "compressAudio: codec=",
          codec,
          "bitrate=",
          audioBitrateKbps,
          "out=",
          outPath
        );
      else
        console.debug(
          "compressAudio: codec=",
          codec,
          "bitrate=",
          audioBitrateKbps,
          "out=",
          outPath
        );
    } catch (e) {}

    // Always strip non-audio streams: map only the primary audio stream
    try {
      cmd = cmd.noVideo().outputOptions(["-map", "0:a:0"]);
    } catch (e) {
      cmd = cmd.outputOptions(["-map", "0:a:0"]);
    }

    cmd = cmd
      .outputOptions(["-movflags +faststart"])
      .on("progress", (pr) => {
        let pct = 0;
        if (typeof pr.percent === "number") {
          pct = Math.min(99, Math.round(pr.percent));
        } else if (pr.timemark) {
          try {
            const parts = String(pr.timemark).split(":").map(parseFloat);
            let secs = 0;
            if (parts.length === 3)
              secs = parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) secs = parts[0] * 60 + parts[1];
            else secs = parts[0] || 0;
            if (duration && isFinite(secs)) {
              pct = Math.min(
                99,
                Math.round((secs / Math.max(1, duration)) * 100)
              );
            } else pct = 0;
          } catch (e) {
            pct = 0;
          }
        } else pct = 0;
        if (onProgress) onProgress(pct, "processing");
      })
      .on("end", () => {
        if (fileStates[p]) fileStates[p].cmd = null;
        if (fileStates[p] && fileStates[p].cancelRequested) {
          try {
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
            if (fileStates[p]) fileStates[p].outPath = null;
          } catch (e) {}
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        let actualBytes;
        try {
          actualBytes = fs.statSync(outPath).size;
        } catch (e) {
          return reject(new Error(`Could not verify audio output size: ${e.message}`));
        }
        const {
          isWithinTarget,
          calculateRetryScale,
          formatSizeWarning,
        } = require("./media-utils");
        if (
          !isWithinTarget(actualBytes, targetBytes) &&
          attempt + 1 < maxAttempts &&
          audioBitrateKbps > 16
        ) {
          const correction = calculateRetryScale(actualBytes, targetBytes);
          try {
            fs.unlinkSync(outPath);
          } catch (e) {}
          if (fileStates[p]) {
            fileStates[p].outPath = null;
            fileStates[p].displayedProgress = 0;
            fileStates[p].processingDetails.stage =
              `Retrying audio after attempt ${attempt + 1}`;
          }
          if (onProgress) onProgress(0, "processing");
          compressAudio(p, targetMB, onProgress, {
            ...opts,
            _attempt: attempt + 1,
            _bitrateScale: bitrateScale * correction,
          }).then(resolve, reject);
          return;
        }
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].lastOut = outPath;
        const reachedTarget = isWithinTarget(actualBytes, targetBytes);
        fileStates[p].sizeWarning = reachedTarget
          ? null
          : formatSizeWarning(actualBytes, targetBytes);
        if (onProgress)
          onProgress(100, reachedTarget ? "done" : "done-oversize", outPath);
        resolve(outPath);
      })
      .on("error", (err, stdout, stderr) => {
        try {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          if (fileStates[p]) fileStates[p].outPath = null;
        } catch (e) {}
        if (fileStates[p]) fileStates[p].cmd = null;
        if (fileStates[p] && fileStates[p].cancelRequested) {
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        try {
          console.error(
            "ffmpeg audio error:",
            err && err.message,
            stderr || stdout || err
          );
        } catch (e) {}
        const msg =
          (err && err.message ? err.message : String(err)) +
          "\n" +
          (stderr || stdout || "");
        reject(new Error(msg));
      })
      .save(outPath);
  });
}
// GIF support removed: no animated conversion function

// Generate a thumbnail for a video by extracting a single frame.
// If opts.middle is true, pick the exact middle frame for deterministic previews.
async function generateVideoThumbnail(videoPath, opts = {}) {
  try {
    const ffmpegPath = await getFfmpegPath();
    const ffmpeg = require("fluent-ffmpeg");
    try {
      ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath));
    } catch (e) {
      ffmpeg.setFfmpegPath(ffmpegPath);
    }
    const { promisify } = require("util");
    const os = require("os");
    const path = require("path");

    const tmpdir = os.tmpdir();
    const outFile = path.join(
      tmpdir,
      "compressly_thumb_" + Math.random().toString(36).slice(2, 9) + ".png"
    );

    const getMetadata = (src) =>
      new Promise((res, rej) =>
        ffmpeg.ffprobe(src, (err, meta) => (err ? rej(err) : res(meta)))
      );
    const meta = await getMetadata(videoPath);
    const duration = Math.max(1, Math.floor(meta.format.duration || 5));
    let t;
    if (opts && opts.middle) {
      // choose the middle second (clamped between 1 and duration-1)
      t = Math.min(duration - 1, Math.max(1, Math.floor(duration / 2)));
    } else {
      // pick a random second between 1 and duration-1
      t = Math.min(
        duration - 1,
        Math.max(1, Math.floor(Math.random() * (duration - 1)))
      );
    }

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [t],
          filename: path.basename(outFile),
          folder: path.dirname(outFile),
          size: "320x?",
        })
        .on("end", () => resolve(outFile))
        .on("error", (err) => reject(err));
    });
  } catch (err) {
    console.warn("generateVideoThumbnail failed", err);
    return null;
  }
}

// Smooth animation loop to ease progress bars to their target values
(() => {
  let last = performance.now();
  // throttle sending updates to main process (ms)
  const TASKBAR_SEND_THROTTLE = 200;
  let lastTaskbarSend = 0;
  let lastTaskbarValue = null; // null means not set yet

  function tick(now) {
    const dt = Math.min(100, now - last) / 1000; // seconds, cap to avoid big jumps
    last = now;
    let needsRender = false;
    for (const p of Object.keys(fileStates)) {
      const s = fileStates[p];
      if (!s) continue;
      const displayed =
        typeof s.displayedProgress === "number" ? s.displayedProgress : 0;
      const target = typeof s.progress === "number" ? s.progress : 0;
      if (Math.abs(displayed - target) > 0.25) {
        // ease towards target using exponential smoothing
        const alpha = 1 - Math.pow(0.001, dt); // smoothing factor depends on dt
        s.displayedProgress =
          displayed + (target - displayed) * Math.min(1, alpha * 6);
        if (s.progEl)
          s.progEl.style.width =
            Math.max(0, Math.min(100, s.displayedProgress)) + "%";
        if (s.pctEl)
          s.pctEl.textContent =
            Math.round(Math.max(0, Math.min(100, s.displayedProgress))) + "%";
        needsRender = true;
      } else if (s.progEl && displayed !== target) {
        s.displayedProgress = target;
        s.progEl.style.width = Math.max(0, Math.min(100, target)) + "%";
        if (s.pctEl)
          s.pctEl.textContent =
            Math.round(Math.max(0, Math.min(100, target))) + "%";
        needsRender = true;
      }
      // show/hide pct element based on whether there's active progress or status
      try {
        if (s.pctEl) {
          const shouldShow =
            s.status === "processing" ||
            (typeof s.progress === "number" && s.progress > 0);
          s.pctEl.style.display = shouldShow ? "block" : "none";
        }
      } catch (e) {}
    }

    // Compute aggregate progress and send to main process (throttled)
    try {
      const fs = require("fs");
      let totalWeight = 0;
      let weightedSum = 0;
      let anyActive = false;
      // use files array ordering/weights when available to keep values stable
      const keys = Object.keys(fileStates).length
        ? Object.keys(fileStates)
        : files.slice();
      for (const p of keys) {
        try {
          const s = fileStates[p];
          if (!s) continue;
          // consider queued or processing files as active; also include any with progress > 0 and < 100
          const active =
            s.status === "processing" ||
            s.status === "queued" ||
            (typeof s.progress === "number" &&
              s.progress > 0 &&
              s.progress < 100);
          if (active) anyActive = true;
          // weight by original file size when possible, fallback to 1
          let weight = 1;
          try {
            const st = fs.statSync(p);
            weight = st && st.size ? st.size : 1;
          } catch (e) {
            weight = 1;
          }
          const disp =
            typeof s.displayedProgress === "number" ? s.displayedProgress : 0;
          weightedSum += disp * weight;
          totalWeight += weight;
        } catch (e) {}
      }
      let overallPct = 0;
      if (totalWeight > 0) overallPct = weightedSum / totalWeight; // 0..100
      else {
        // fallback: average displayedProgress across any states
        let sum = 0;
        let count = 0;
        for (const p of Object.keys(fileStates)) {
          const s = fileStates[p];
          if (!s) continue;
          sum +=
            typeof s.displayedProgress === "number" ? s.displayedProgress : 0;
          count++;
        }
        overallPct = count ? sum / count : 0;
      }
      const newValue = anyActive
        ? Math.max(0, Math.min(1, overallPct / 100))
        : -1;
      const nowMs = Date.now();
      const changed =
        lastTaskbarValue === null ||
        Math.abs((lastTaskbarValue || 0) - newValue) > 0.005;
      if (
        (nowMs - lastTaskbarSend > TASKBAR_SEND_THROTTLE && changed) ||
        (newValue === -1 && lastTaskbarValue !== -1)
      ) {
        try {
          const { ipcRenderer } = require("electron");
          if (ipcRenderer && typeof ipcRenderer.send === "function") {
            ipcRenderer.send("set-taskbar-progress", newValue);
            lastTaskbarSend = nowMs;
            lastTaskbarValue = newValue;
          }
        } catch (e) {
          // ignore send failures
        }
      }
    } catch (e) {}

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

// --- FFmpeg presence check and modal wiring ---
// Use an async check that prefers the app-resolved ffmpeg/ffprobe paths
function checkMediaBinary(binaryPath, versionPattern) {
  return new Promise((resolve) => {
    try {
      const { spawn } = require("child_process");
      const child = spawn(binaryPath, ["-version"], {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let output = "";
      const collect = (chunk) => {
        if (output.length < 8192) output += String(chunk || "");
      };
      if (child.stdout) child.stdout.on("data", collect);
      if (child.stderr) child.stderr.on("data", collect);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(value);
      };
      const timeout = setTimeout(() => {
        try { child.kill(); } catch (e) {}
        finish(false);
      }, 5000);
      child.on("error", () => finish(false));
      child.on("close", (code) =>
        finish(code === 0 || versionPattern.test(output))
      );
    } catch (e) {
      resolve(false);
    }
  });
}

(async () => {
  try {
    const ffmpegModal = document.getElementById("ffmpegModal");
    const ffmpegDontShow = document.getElementById("ffmpegDontShow");
    const ffmpegOk = document.getElementById("ffmpegOk");

    let ffmpegFound = false;
    let ffprobeFound = false;

    try {
      const fp = await getFfmpegPath();
      if (fp) {
        const resolved = resolveBinaryPath(fp) || fp;
        ffmpegFound = await checkMediaBinary(resolved, /ffmpeg version/i);
      }
    } catch (e) {}

    try {
      const pp = await getFfprobePath();
      if (pp) {
        const resolved = resolveBinaryPath(pp) || pp;
        ffprobeFound = await checkMediaBinary(resolved, /ffprobe version/i);
      }
    } catch (e) {}

    const dontShow = (() => {
      try {
        return localStorage.getItem("ffmpegDontShow") === "1";
      } catch (e) {
        return false;
      }
    })();

    // Only show the modal if either binary is missing and the user hasn't opted out
    if (!(ffmpegFound && ffprobeFound) && ffmpegModal && !dontShow) {
      try {
        const cmdEl = document.getElementById("ffmpegCmd");
        const ffmpegBtn = document.getElementById("ffmpegBtn");
        const ffprobeBtn = document.getElementById("ffprobeBtn");
        const txtEl = document.getElementById("ffmpegInstallText");
        const platform =
          (window && window.electronAPI && window.electronAPI.platform) ||
          process.platform;
        // locate new elements
        const ffmpegDownloads = document.getElementById("ffmpegDownloads");
        const ffmpegCmdEl = document.getElementById("ffmpegCmd");
        const ffmpegCopyBtn = document.getElementById("ffmpegCopyBtn");
        if (platform === "darwin") {
          if (txtEl)
            txtEl.textContent =
              "Please download these 2 FFmpeg binaries for macOS, extract them, and place them in /usr/local/bin:";
          // show download buttons, hide command UI
          try {
            if (ffmpegDownloads) ffmpegDownloads.style.display = "flex";
          } catch (e) {}
          try {
            if (ffmpegCmdEl) ffmpegCmdEl.style.display = "none";
          } catch (e) {}
          try {
            if (ffmpegCopyBtn) ffmpegCopyBtn.style.display = "none";
          } catch (e) {}
        } else {
          // Non-mac platforms: show winget command by default (Windows)
          if (cmdEl) cmdEl.textContent = "winget install ffmpeg";
          if (txtEl)
            txtEl.textContent =
              "Install FFmpeg using Windows Package Manager (PowerShell):";
          try {
            if (ffmpegDownloads) ffmpegDownloads.style.display = "none";
          } catch (e) {}
          try {
            if (ffmpegCmdEl) {
              ffmpegCmdEl.textContent = "winget install ffmpeg";
              ffmpegCmdEl.style.display = "inline-block";
            }
          } catch (e) {}
          try {
            if (ffmpegCopyBtn) ffmpegCopyBtn.style.display = "inline-block";
          } catch (e) {}
        }
      } catch (e) {}
      try {
        ffmpegModal.classList.add("visible");
      } catch (e) {}
      try {
        if (ffmpegDontShow) ffmpegDontShow.checked = false;
      } catch (e) {}
    }

    // Wire the FFmpeg and FFprobe buttons and other modal helpers (open links, copy)
    if (ffmpegModal) {
      try {
        const ffmpegBtn = document.getElementById("ffmpegBtn");
        const ffprobeBtn = document.getElementById("ffprobeBtn");
        if (ffmpegBtn) {
          ffmpegBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            try {
              const { shell } = require("electron");
              const url =
                ffmpegBtn.getAttribute("data-url") ||
                "https://evermeet.cx/ffmpeg/ffmpeg-8.0.7z";
              shell.openExternal(url);
            } catch (e) {
              window.open(
                ffmpegBtn.getAttribute("data-url") ||
                  "https://evermeet.cx/ffmpeg/ffmpeg-8.0.7z",
                "_blank"
              );
            }
          });
        }
        if (ffprobeBtn) {
          ffprobeBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            try {
              const { shell } = require("electron");
              const url =
                ffprobeBtn.getAttribute("data-url") ||
                "https://evermeet.cx/ffmpeg/ffprobe-8.0.7z";
              shell.openExternal(url);
            } catch (e) {
              window.open(
                ffprobeBtn.getAttribute("data-url") ||
                  "https://evermeet.cx/ffmpeg/ffprobe-8.0.7z",
                "_blank"
              );
            }
          });
        }
      } catch (e) {}

      document.querySelectorAll(".ffmpeg-link").forEach((a) => {
        a.addEventListener("click", (ev) => {
          ev.preventDefault();
          try {
            const { shell } = require("electron");
            const url = a.getAttribute("data-url") || a.href;
            shell.openExternal(url);
          } catch (e) {
            window.open(a.href, "_blank");
          }
        });
      });

      try {
        const copyBtn = document.getElementById("ffmpegCopyBtn");
        const cmdEl = document.getElementById("ffmpegCmd");
        if (copyBtn && cmdEl) {
          copyBtn.addEventListener("click", async () => {
            const txt = cmdEl.textContent || cmdEl.innerText || "";
            let ok = false;
            try {
              if (
                navigator &&
                navigator.clipboard &&
                navigator.clipboard.writeText
              ) {
                await navigator.clipboard.writeText(txt);
                ok = true;
              }
            } catch (e) {}
            if (!ok) {
              try {
                const ta = document.createElement("textarea");
                ta.value = txt;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand("copy");
                document.body.removeChild(ta);
                ok = true;
              } catch (e) {
                ok = false;
              }
            }
            const prev = copyBtn.textContent;
            if (ok) copyBtn.textContent = "Copied!";
            else copyBtn.textContent = "Copy failed";
            setTimeout(() => (copyBtn.textContent = prev), 1500);
          });
        }
      } catch (e) {}
    }

    try {
      const ffmpegOkBtn = document.getElementById("ffmpegOk");
      if (ffmpegOkBtn) {
        ffmpegOkBtn.addEventListener("click", () => {
          try {
            const ffmpegDontShowEl = document.getElementById("ffmpegDontShow");
            if (ffmpegDontShowEl && ffmpegDontShowEl.checked) {
              try {
                localStorage.setItem("ffmpegDontShow", "1");
              } catch (e) {}
            }
            const ffm = document.getElementById("ffmpegModal");
            if (ffm) ffm.classList.remove("visible");
          } catch (e) {}
        });
      }
    } catch (e) {}
  } catch (e) {
    // ignore any detection errors
  }
})().finally(() => {
  mediaStartupCheckSettled = true;
  maybeLaunchAutomaticTour();
});
