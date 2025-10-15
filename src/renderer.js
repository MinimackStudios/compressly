const fileListEl = document.getElementById("fileList");
const pickBtn = document.getElementById("pick");
const startBtn = document.getElementById("start");
const statusEl = document.getElementById("status");
const targetSizeEl = document.getElementById("targetSize");
const videoFpsEl = document.getElementById("videoFps");
const prioritySelectEl = document.getElementById("prioritySelect");
const targetResolutionEl = document.getElementById("targetResolution");
const footerInfoEl = document.getElementById("footer-info");
const clearBtn = document.getElementById("clearList");

// Window control buttons for custom titlebar (only present in frameless mode)
const winMinBtn = document.getElementById("win-min");
const winMaxBtn = document.getElementById("win-max");
const winCloseBtn = document.getElementById("win-close");

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
    const asset = assets[0];
    const assetUrl = asset.browser_download_url;
    const defaultName =
      asset.name || `compressly-${(d.tag_name || "").replace(/^v/i, "")}.zip`;
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
      await window.electronAPI.writeFile(savePath, Buffer.from(merged));
      try {
        const { shell } = require("electron");
        if (shell && shell.showItemInFolder) shell.showItemInFolder(savePath);
        else shell.openPath(downloadsDir);
      } catch (e) {
        try {
          window.open(downloadsDir, "_blank");
        } catch (e) {}
      }
      // attempt to run installer via main ipc
      try {
        const { ipcRenderer } = require("electron");
        if (ipcRenderer && ipcRenderer.send)
          ipcRenderer.send("run-installer-and-exit", savePath, []);
      } catch (e) {}
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
};

// Load persisted settings (if present) and apply to inputs
try {
  const savedTarget = localStorage.getItem(SETTINGS_KEYS.targetSize);
  if (savedTarget !== null && targetSizeEl) targetSizeEl.value = savedTarget;
  const savedFps = localStorage.getItem(SETTINGS_KEYS.videoFps);
  if (savedFps !== null && videoFpsEl) videoFpsEl.value = savedFps;
  const savedRes = localStorage.getItem(SETTINGS_KEYS.targetResolution);
  if (savedRes !== null && targetResolutionEl)
    targetResolutionEl.value = savedRes;
  const savedPriority = localStorage.getItem(SETTINGS_KEYS.priority);
  if (savedPriority !== null && prioritySelectEl)
    prioritySelectEl.value = savedPriority;
} catch (e) {
  console.warn("Could not load settings from localStorage", e);
}

// Save handlers to persist on change
try {
  if (targetSizeEl)
    targetSizeEl.addEventListener("change", (ev) => {
      try {
        const v = String(ev.target.value);
        localStorage.setItem(SETTINGS_KEYS.targetSize, v);
      } catch (e) {}
    });
  if (videoFpsEl)
    videoFpsEl.addEventListener("change", (ev) => {
      try {
        const v = String(ev.target.value);
        localStorage.setItem(SETTINGS_KEYS.videoFps, v);
      } catch (e) {}
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

// Global file lists/state (were accidentally removed) used by file pick, drag/drop, and processing
let files = [];
let fileStates = {}; // track per-file progress and status
let anyCancelled = false;

// --- Update check with caching; auto-download to Downloads when user clicks Download ---
try {
  (async () => {
    try {
      const pj = require("../package.json");
      const localVer = pj.version || "0.0.0";

      const CACHE_KEY = "compressly_update_lastChecked";
      const now = Date.now();
      const lastChecked =
        parseInt(localStorage.getItem(CACHE_KEY) || "0", 10) || 0;
      const twelveHours = 12 * 60 * 60 * 1000;

      let latestTag =
        localStorage.getItem("compressly_update_latestTag") || null;
      let latestUrl =
        localStorage.getItem("compressly_update_latestUrl") || null;

      // Always attempt to fetch the latest release from GitHub on startup so
      // we don't rely on stale cached values. If the network call fails we
      // will gracefully fall back to any cached tag/url already stored.
      try {
        const res = await fetch(
          "https://api.github.com/repos/MinimackStudios/compressly/releases/latest",
          { headers: { Accept: "application/vnd.github.v3+json" } }
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

        // Download: auto-save to Downloads and reveal
        const downloadBtn = document.getElementById("updateDownloadBtn");
        if (downloadBtn) {
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
              const asset = assets[0];
              const assetUrl = asset.browser_download_url;
              const defaultName = asset.name || `compressly-${latestTag}.zip`;
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
                // run installer and exit the app
                try {
                  const electron = require("electron");
                  if (electron && electron.ipcRenderer) {
                    electron.ipcRenderer.send(
                      "run-installer-and-exit",
                      savePath,
                      []
                    );
                  } else if (
                    window &&
                    window.electronAPI &&
                    window.electronAPI.ipc
                  ) {
                    // no-op: preload currently doesn't expose ipc send; main listens for 'run-installer-and-exit'
                  }
                } catch (e) {}
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
  })();
} catch (e) {}

// (Removed fallback that opened the releases page - Download now only attempts the installer download)

// Prune cache files older than 7 days (run async, don't block UI)
setTimeout(() => {
  try {
    const filesInCache = fs.readdirSync(cacheRoot);
    const now = Date.now();
    for (const f of filesInCache) {
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

// Estimate compressed size: images -> min(orig, target), videos -> compute bitrates similarly to compressVideo
async function estimateCompressedMB(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();
    const st = fs.statSync(filePath);
    const origMB = st.size / 1024 / 1024;
    if (IMAGE_EXTS.includes(ext)) {
      // image heuristic: if already smaller, keep original; otherwise assume we'll reach close to target minus small overhead
      const targetMB = parseFloat(targetSizeEl.value || "10");
      if (origMB <= targetMB) return origMB;
      // assume encoder/headers take ~5% overhead
      return Math.max(0.01, Math.min(origMB, targetMB * 0.95));
    }
    if (VIDEO_EXTS.includes(ext)) {
      // use ffprobe to get duration and audio bitrate
      const ffmpeg = require("fluent-ffmpeg");
      const ffmpegPath = require("ffmpeg-static");
      try {
        ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath.path || ffmpegPath));
      } catch (e) {
        ffmpeg.setFfmpegPath(ffmpegPath.path || ffmpegPath);
      }
      const meta = await new Promise((res, rej) =>
        ffmpeg.ffprobe(filePath, (err, m) => (err ? rej(err) : res(m)))
      );
      const duration = meta.format.duration || 10;
      const audioStream = (meta.streams || []).find(
        (s) => s.codec_type === "audio"
      );
      // use kbps as float for more precise math
      const audioBitrate =
        audioStream && audioStream.bit_rate ? audioStream.bit_rate / 1000 : 128;
      const priority = prioritySelectEl
        ? prioritySelectEl.value || "balanced"
        : "balanced";
      let adjAudioBitrate = audioBitrate;
      if (priority === "video")
        adjAudioBitrate = Math.max(64, audioBitrate * 0.6);
      else if (priority === "audio")
        adjAudioBitrate = Math.max(128, audioBitrate * 1.4);
      const targetMB = parseFloat(targetSizeEl.value || "10");
      const targetBytes = targetMB * 1024 * 1024;
      // compute float kbps precisely and clamp
      let videoKbps =
        ((targetBytes * 8) / duration - adjAudioBitrate * 1000) / 1000; // kbps (float)
      if (!isFinite(videoKbps) || videoKbps <= 0) videoKbps = 200;
      videoKbps = Math.max(200, videoKbps);
      // estimate bytes from (video + audio) kbps over duration; add small container overhead (~1%)
      const estBytes =
        (((videoKbps + adjAudioBitrate) * 1000) / 8) * duration * 1.01;
      const estMB = Math.max(Math.min(estBytes / 1024 / 1024, origMB), 0.01);
      return estMB;
    }
    return origMB;
  } catch (e) {
    return null;
  }
}

// Allowed extensions for drag/drop and basic type checks
const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tiff"];
const VIDEO_EXTS = [".mp4", ".mov", ".mkv", ".avi", ".webm", ".flv", ".wmv"];
const AUDIO_EXTS = [".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus"];

// Theme initialization
const themeToggle = document.getElementById("themeToggle");
function applyTheme(dark) {
  if (dark) document.body.classList.add("dark");
  else document.body.classList.remove("dark");
  try {
    localStorage.setItem("themeDark", dark ? "1" : "0");
  } catch (e) {}
  if (themeToggle) themeToggle.checked = !!dark;
}
try {
  const prev = localStorage.getItem("themeDark");
  applyTheme(prev === "1");
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

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

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
        if (listEl) {
          listEl.innerHTML = longVideos
            .map(
              (v) =>
                `<div style="padding:6px 0;border-bottom:1px solid var(--muted);">${require("path").basename(
                  v.path
                )} — ${Math.floor(v.duration / 60)}m ${Math.round(
                  v.duration % 60
                )}s</div>`
            )
            .join("");
        }
        const modal = document.getElementById("longVideoModal");
        if (modal) modal.classList.add("visible");
      }
    } catch (e) {}
  } catch (err) {
    console.error("select files failed", err);
    statusEl.textContent = "Error opening file picker — see console";
    if (window.electronAPI && window.electronAPI.log)
      window.electronAPI.log("select-files error", err.message);
  }
});

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
          const p = f.path;
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
          ` — ignored unsupported: ${shown}` +
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
          if (listEl) {
            listEl.innerHTML = actuallyLong
              .map(
                (v) =>
                  `<div style="padding:6px 0;border-bottom:1px solid var(--muted);">${require("path").basename(
                    v.path
                  )} — ${Math.floor(v.duration / 60)}m ${Math.round(
                    v.duration % 60
                  )}s</div>`
              )
              .join("");
          }
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
      files = [];
      fileStates = {};
      anyCancelled = false;
      renderList();
      updateFooterInfo();
    });
  }

  // About modal handlers
  if (aboutBtn && aboutModal) {
    aboutBtn.addEventListener("click", async () => {
      try {
        // read package.json for version and deps
        const pj = require("../package.json");
        aboutVersion.textContent = pj.version || "?";
        aboutAuthor.textContent = "Minimack Studios";
        aboutRuntime.textContent = `${process.platform} • Node ${process.versions.node} • Electron ${process.versions.electron}`;
        aboutDeps.textContent =
          "Dependencies: " + Object.keys(pj.dependencies || {}).join(", ");
      } catch (e) {
        aboutVersion.textContent = "?";
      }
      // animate in by toggling a visible class
      aboutModal.classList.add("visible");
    });
    // Close handlers: button, clicking overlay background, and ESC key
    aboutClose.addEventListener("click", () => {
      aboutModal.classList.remove("visible");
    });
    // clicking outside the modal closes it
    aboutModal.addEventListener("click", (ev) => {
      if (ev.target === aboutModal) aboutModal.classList.remove("visible");
    });
    // ESC key closes modal(s)
    window.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") {
        aboutModal.classList.remove("visible");
        if (ffmpegModal) ffmpegModal.classList.remove("visible");
        if (updateModal) updateModal.classList.remove("visible");
        if (longVideoModal) longVideoModal.classList.remove("visible");
      }
    });
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
      const targetMB = parseFloat(targetSizeEl.value || "10");
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

function renderList() {
  fileListEl.innerHTML = "";
  for (const p of files) {
    // initialize state
    if (!fileStates[p])
      fileStates[p] = { progress: 0, displayedProgress: 0, status: "ready" };
    const li = document.createElement("li");
    const meta = document.createElement("div");
    meta.className = "file-meta";
    const img = document.createElement("img");
    img.src = "./file-icon.png";
    img.onerror = () => {
      img.src = "./file-icon.png";
    };
    const info = document.createElement("div");
    info.className = "file-info";
    const name = document.createElement("div");
    name.innerHTML = `<div style="font-weight:600">${p
      .split("\\")
      .pop()}</div><div class='small'>${p}</div>`;
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
        // use cached thumbnail if available
        if (fileStates[p].thumb) {
          img.src = "file://" + fileStates[p].thumb;
          img.classList.add("thumb-fade", "show");
        } else if (!fileStates[p].thumbGenerating) {
          fileStates[p].thumbGenerating = true;
          // show placeholder immediately
          img.src = "./file-icon.png";
          img.classList.add("thumb-fade");
          // compute a simple cache key: mtime-size
          try {
            const fs = require("fs");
            const st = fs.statSync(p);
            const cacheName = `thumb_${st.mtimeMs}_${
              st.size
            }_${require("path").basename(p)}.png`;
            const tmp = require("os").tmpdir();
            const cachePath = require("path").join(tmp, cacheName);
            if (fs.existsSync(cachePath)) {
              fileStates[p].thumb = cachePath;
              img.src = "file://" + cachePath;
              img.classList.add("show");
              fileStates[p].thumbGenerating = false;
            } else {
              generateVideoThumbnail(p, { middle: true })
                .then((th) => {
                  if (th) {
                    try {
                      // move to cachePath
                      fs.copyFileSync(th, cachePath);
                      fileStates[p].thumb = cachePath;
                      img.src = "file://" + cachePath;
                      img.classList.add("show");
                    } catch (e) {
                      fileStates[p].thumb = th;
                      img.src = "file://" + th;
                      img.classList.add("show");
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
                  img.src = "file://" + th;
                  img.classList.add("show");
                }
              })
              .catch((err) => console.warn("thumb err", err))
              .finally(() => {
                fileStates[p].thumbGenerating = false;
              });
          }
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
          img.src = "./file-icon.png";
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
      img.addEventListener("click", (ev) => {
        try {
          const { shell } = require("electron");
          const fs = require("fs");
          const path = require("path");
          // if compressed output exists for this file, reveal it; otherwise reveal original
          const state = fileStates[p] || {};
          const target =
            state.lastOut && fs.existsSync(state.lastOut) ? state.lastOut : p;
          try {
            if (shell && shell.showItemInFolder) shell.showItemInFolder(target);
            else shell.openPath(path.dirname(target));
          } catch (e) {
            try {
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
    if (
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
    // disable remove while the file is actively processing
    removeBtn.disabled = !!(
      fileStates[p] && fileStates[p].status === "processing"
    );
    removeBtn.title = removeBtn.disabled
      ? "Cannot remove while processing"
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
    if (fileStates[p] && fileStates[p].hovering) li.classList.add("hovering");
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

    fileListEl.appendChild(li);
  }
  // update footer info every render
  updateFooterInfo();
}

startBtn.addEventListener("click", async () => {
  if (files.length === 0) return alert("No files selected");
  statusEl.textContent = "Compressing...";
  startBtn.disabled = true;
  let firstOutDir = null;
  let firstOutPath = null;
  for (const p of files.slice()) {
    // use copy since files can be removed
    try {
      // mark this file as queued so the UI enables cancel immediately
      if (!fileStates[p]) fileStates[p] = {};
      fileStates[p].status = "queued";
      renderList();
      const result = await compressFile(p, (progress, status, outPath) => {
        if (fileStates[p]) {
          fileStates[p].progress = progress;
          fileStates[p].status = status || fileStates[p].status;
        }
        if (outPath && !firstOutDir) {
          try {
            firstOutDir = require("path").dirname(outPath);
            if (!firstOutPath) firstOutPath = outPath;
          } catch (e) {}
        }
        renderList();
      });
      if (result === null) {
        if (fileStates[p]) fileStates[p].status = "cancelled";
        anyCancelled = true;
      }
      // recent outputs handling removed
    } catch (err) {
      console.error(err);
      if (fileStates[p]) fileStates[p].status = "error";
      window.electronAPI.log("Error compressing", p, err.message);
      renderList();
    }
  }

  statusEl.textContent = anyCancelled ? "Cancelled" : "Done";
  startBtn.disabled = false;
  // open output and highlight first file (skip if user cancelled)
  // removed automatic opening of file explorer per user request
  // user can now click the thumbnail to open the original file (before compress)
  // or the compressed file (after compress)
  anyCancelled = false;
});

async function compressFile(p, onProgress) {
  const buffer = await window.electronAPI.readFile(p);
  const targetMB = parseFloat(targetSizeEl.value) || 10;
  const path = require("path");
  const ext = path.extname(p).toLowerCase();

  const imageExts = IMAGE_EXTS;
  const videoExts = VIDEO_EXTS;
  const audioExts = AUDIO_EXTS;

  if (imageExts.includes(ext)) {
    await compressImage(p, buffer, { ext }, targetMB, onProgress);
  } else if (videoExts.includes(ext)) {
    // read UI options for video
    const fps = videoFpsEl ? parseInt(videoFpsEl.value || "30", 10) : 30;
    const priority = prioritySelectEl
      ? prioritySelectEl.value || "balanced"
      : "balanced";
    await compressVideo(p, targetMB, onProgress, { fps, priority });
  } else if (audioExts.includes(ext)) {
    // audio-only file
    await compressAudio(p, targetMB, onProgress, {});
  } else {
    // Fallback: try to infer from header using file-type if available dynamically
    try {
      const ftModule = await import("file-type");
      const ft = await ftModule.fileTypeFromBuffer(buffer);
      if (ft && ft.mime.startsWith("image/")) {
        await compressImage(p, buffer, ft, targetMB);
        return;
      }
      if (ft && ft.mime.startsWith("video/")) {
        await compressVideo(p, targetMB);
        return;
      }
      if (ft && ft.mime.startsWith("audio/")) {
        await compressAudio(p, targetMB);
        return;
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

async function compressImage(p, buffer, ft, targetMB, onProgress) {
  const sharp = require("sharp");
  const path = require("path");
  const fs = require("fs");
  const origExt = path.extname(p).toLowerCase();

  // Don't support animated GIFs (explicitly removed)
  if (origExt === ".gif") {
    if (onProgress) onProgress(0, "unsupported");
    return null;
  }

  // prepare output path (avoid overwrite)
  let outPath = p.replace(/(\.[^.]+)$/, `_compressed${origExt}`);
  let count = 1;
  while (fs.existsSync(outPath)) {
    outPath = p.replace(/(\.[^.]+)$/, `_compressed-${count}${origExt}`);
    count++;
  }

  // expose outPath early so UI can stat an in-progress output file
  if (!fileStates[p]) fileStates[p] = {};
  fileStates[p].outPath = outPath;

  // load image and metadata
  const img = sharp(buffer, { limitInputPixels: false });
  const metadata = await img.metadata();
  let width = metadata.width || null;
  let quality = 90; // starting quality for lossy formats

  const targetBytes = Math.max(1024 * 10, Math.round(targetMB * 1024 * 1024));

  // try multiple passes: reduce quality and/or width until under target or until limits
  for (let pass = 0; pass < 10; pass++) {
    let pipeline = img.clone();
    // reduce width progressively after first few passes
    if (width && pass > 0)
      pipeline = pipeline.resize({ width: Math.max(32, Math.round(width)) });

    // ensure JPEG doesn't receive alpha
    if ((origExt === ".jpg" || origExt === ".jpeg") && metadata.hasAlpha) {
      pipeline = pipeline.flatten({ background: { r: 255, g: 255, b: 255 } });
    }

    let data;
    if (origExt === ".png") {
      // PNG: use compressionLevel and resize attempts
      data = await pipeline
        .png({ compressionLevel: Math.min(9, 9 - Math.floor(pass / 2)) })
        .toBuffer();
    } else if (origExt === ".webp") {
      data = await pipeline
        .webp({ quality: Math.max(20, Math.round(quality)) })
        .toBuffer();
    } else {
      data = await pipeline
        .jpeg({
          quality: Math.max(20, Math.round(quality)),
          progressive: true,
          mozjpeg: true,
        })
        .toBuffer();
    }

    // progress callback (estimate)
    if (onProgress) {
      const pct = Math.min(90, Math.round(((pass + 1) / 10) * 90));
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

    if (data.length <= targetBytes || pass === 9) {
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
      // leave outPath set to the final file so footer shows compressed size
      if (onProgress) onProgress(100, "done", outPath);
      return outPath;
    }

    // shrink further for next pass
    width = width ? Math.round(width * 0.9) : null;
    quality = Math.max(20, Math.round(quality * 0.85));
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
  const ffmpegPath = require("ffmpeg-static");
  const ffmpeg = require("fluent-ffmpeg");
  try {
    ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath.path || ffmpegPath));
  } catch (e) {
    ffmpeg.setFfmpegPath(ffmpegPath.path || ffmpegPath);
  }

  const { promisify } = require("util");
  const tmp = require("os").tmpdir();
  const path = require("path");
  const fs = require("fs");
  let outPath = p.replace(/(\.[^.]+)$/, "_compressed.mp4");
  let count = 1;
  while (fs.existsSync(outPath)) {
    outPath = p.replace(/(\.[^.]+)$/, `_compressed-${count}.mp4`);
    count++;
  }

  // target bytes
  const targetBytes = targetMB * 1024 * 1024;

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

  // Now compute video bitrate budget (kbps). Allow it to go low (>=16kbps) so
  // we can meet very small targets instead of clamping up and producing larger
  // files.
  let videoBitrate = Math.max(16, totalTargetKbps - audioAllocKbps);

  return new Promise(async (resolve, reject) => {
    let cmd = ffmpeg(p);
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].cmd = cmd;
    fileStates[p].status = "processing";
    // expose outPath so the UI can stat a growing output file while ffmpeg writes
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].outPath = outPath;
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
    if (audioCodec === "aac" && adjAudioBitrate <= audioAllocKbps) {
      outOpts.push("-c:a copy");
    } else {
      // re-encode audio at the allocated audio bitrate
      outOpts.push("-c:a aac", `-b:a ${audioAllocKbps}k`);
    }

    cmd
      .videoFilters(vf)
      .outputOptions(outOpts)
      .on("progress", (p) => {
        window.electronAPI.log("ffmpeg progress", p);
        // p.percent is not always present; approximate
        const percent = Math.min(
          99,
          Math.round(p.percent || (p.timemark ? 50 : 0))
        );
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
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].lastOut = outPath;
        // keep outPath set to final file so footer can stat it
        if (onProgress) onProgress(100, "done", outPath);
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
        reject(err);
      })
      .save(outPath);
  });
}

// Compress audio files by re-encoding at a target average bitrate derived from targetMB
async function compressAudio(p, targetMB, onProgress, opts = {}) {
  const ffmpegPath = require("ffmpeg-static");
  const ffmpeg = require("fluent-ffmpeg");
  try {
    ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath.path || ffmpegPath));
  } catch (e) {
    ffmpeg.setFfmpegPath(ffmpegPath.path || ffmpegPath);
  }

  const path = require("path");
  const fs = require("fs");

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
    codec = "pcm_s16le"; // raw PCM in WAV container
    finalExt = ".wav";
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
  const audioBitrateKbps = Math.max(16, Math.round(totalTargetKbps));

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
        const pct = Math.min(
          99,
          Math.round(pr.percent || (pr.timemark ? 50 : 0))
        );
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
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].lastOut = outPath;
        if (onProgress) onProgress(100, "done", outPath);
        resolve(outPath);
      })
      .on("error", (err, stdout, stderr) => {
        try {
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          if (fileStates[p]) fileStates[p].outPath = null;
        } catch (e) {}
        if (fileStates[p]) fileStates[p].cmd = null;
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
    const ffmpegPath = require("ffmpeg-static");
    const ffmpeg = require("fluent-ffmpeg");
    try {
      ffmpeg.setFfmpegPath(resolveBinaryPath(ffmpegPath.path || ffmpegPath));
    } catch (e) {
      ffmpeg.setFfmpegPath(ffmpegPath.path || ffmpegPath);
    }
    const { promisify } = require("util");
    const os = require("os");
    const path = require("path");

    const tmpdir = os.tmpdir();
    const outFile = path.join(
      tmpdir,
      "thumb_" + Math.random().toString(36).slice(2, 9) + ".png"
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
try {
  const { spawnSync } = require("child_process");
  const res = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  const ffmpegFound =
    res.status === 0 || /ffmpeg version/i.test(res.stdout || "");
  const dontShow = (() => {
    try {
      return localStorage.getItem("ffmpegDontShow") === "1";
    } catch (e) {
      return false;
    }
  })();

  if (!ffmpegFound && ffmpegModal && !dontShow) {
    // show notice
    ffmpegModal.classList.add("visible");
    // default checkbox state
    try {
      ffmpegDontShow.checked = false;
    } catch (e) {}
  }

  // open links externally
  if (ffmpegModal) {
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
    // copy-to-clipboard for the ffmpeg install command
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
          if (ok) {
            copyBtn.textContent = "Copied!";
          } else {
            copyBtn.textContent = "Copy failed";
          }
          setTimeout(() => (copyBtn.textContent = prev), 1500);
        });
      }
    } catch (e) {}
  }

  if (ffmpegOk) {
    ffmpegOk.addEventListener("click", () => {
      if (ffmpegDontShow && ffmpegDontShow.checked) {
        try {
          localStorage.setItem("ffmpegDontShow", "1");
        } catch (e) {}
      }
      if (ffmpegModal) ffmpegModal.classList.remove("visible");
    });
  }
} catch (e) {
  // ignore if child_process or spawnSync not available in this environment
}
