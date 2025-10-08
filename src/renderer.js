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
const aboutBtn = document.getElementById("aboutBtn");
const aboutModal = document.getElementById("aboutModal");
const aboutClose = document.getElementById("aboutClose");
const aboutVersion = document.getElementById("aboutVersion");
const aboutDeps = document.getElementById("aboutDeps");
const aboutAuthor = document.getElementById("aboutAuthor");
const aboutRuntime = document.getElementById("aboutRuntime");
const ffmpegModal = document.getElementById("ffmpegModal");
const ffmpegOk = document.getElementById("ffmpegOk");
const ffmpegDontShow = document.getElementById("ffmpegDontShow");

let files = [];
let fileStates = {}; // track per-file progress and status
let anyCancelled = false;

// persistent thumbnail cache directory (in user's home folder)
const os = require("os");
const fs = require("fs");
const path = require("path");
const cacheRoot = path.join(os.homedir(), ".compressly", "cache");
try {
  if (!fs.existsSync(cacheRoot)) fs.mkdirSync(cacheRoot, { recursive: true });
} catch (e) {}

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
          if (IMAGE_EXTS.includes(ext) || VIDEO_EXTS.includes(ext)) {
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
      }
    });
  }

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
      // compute compressed total from produced outputs when available
      let compressedTotal = 0;
      for (const p of files) {
        try {
          if (fileStates[p] && fileStates[p].lastOut) {
            const st = fs.statSync(fileStates[p].lastOut);
            compressedTotal += st.size || 0;
          }
        } catch (e) {}
      }
      const compressedMB = compressedTotal
        ? (compressedTotal / 1024 / 1024).toFixed(2)
        : null;
      footerInfoEl.textContent =
        `${files.length} file(s) • ${totalMB} MB total` +
        (compressedMB ? ` • compressed ${compressedMB} MB` : "");
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
      } else {
        // for images, show file directly
        img.src = "file://" + p;
      }
    } catch (e) {
      console.warn("thumb generation failed", e);
    }

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const status = document.createElement("div");
    status.className = "small";
    status.textContent = fileStates[p].status || "Ready";
    const progressWrap = document.createElement("div");
    progressWrap.className = "progress-bar";
    const prog = document.createElement("i");
    // ensure displayedProgress exists
    if (typeof fileStates[p].displayedProgress !== "number")
      fileStates[p].displayedProgress = fileStates[p].progress || 0;
    prog.style.width = (fileStates[p].displayedProgress || 0) + "%";
    // save element reference for animation loop
    fileStates[p].progEl = prog;
    progressWrap.appendChild(prog);

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
    removeBtn.innerText = "🗑";
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
    actions.appendChild(progressWrap);
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
  try {
    const { shell } = require("electron");
    if (firstOutPath && !anyCancelled) {
      // open and select the first produced file so user sees it immediately
      try {
        shell.showItemInFolder(firstOutPath);
      } catch (e) {
        // fallback to opening the folder
        try {
          if (firstOutDir) shell.openPath(firstOutDir);
        } catch (e) {}
      }
    } else if (firstOutDir && !anyCancelled) {
      try {
        shell.openPath(firstOutDir);
      } catch (e) {}
    }
  } catch (e) {
    console.warn("open folder failed", e);
  }
  anyCancelled = false;
});

async function compressFile(p, onProgress) {
  const buffer = await window.electronAPI.readFile(p);
  const targetMB = parseFloat(targetSizeEl.value) || 10;
  const path = require("path");
  const ext = path.extname(p).toLowerCase();

  const imageExts = IMAGE_EXTS;
  const videoExts = VIDEO_EXTS;

  if (imageExts.includes(ext)) {
    await compressImage(p, buffer, { ext }, targetMB, onProgress);
  } else if (videoExts.includes(ext)) {
    // read UI options for video
    const fps = videoFpsEl ? parseInt(videoFpsEl.value || "30", 10) : 30;
    const priority = prioritySelectEl
      ? prioritySelectEl.value || "balanced"
      : "balanced";
    await compressVideo(p, targetMB, onProgress, { fps, priority });
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
      await window.electronAPI.writeFile(outPath, data);
      // If the user cancelled while the final write was happening, remove the file
      try {
        if (fileStates[p] && fileStates[p].cancelRequested) {
          const fs = require("fs");
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
          if (onProgress) onProgress(0, "cancelled");
          return null;
        }
      } catch (e) {}
      if (!fileStates[p]) fileStates[p] = {};
      fileStates[p].lastOut = outPath;
      if (onProgress) onProgress(100, "done", outPath);
      return outPath;
    }

    // shrink further for next pass
    width = width ? Math.round(width * 0.9) : null;
    quality = Math.max(20, Math.round(quality * 0.85));
  }

  // fallback (shouldn't reach here) - write original buffer
  try {
    await window.electronAPI.writeFile(outPath, buffer);
    if (!fileStates[p]) fileStates[p] = {};
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
  const videoBitrate = Math.max(
    200,
    Math.round(((targetBytes * 8) / duration - adjAudioBitrate * 1000) / 1000)
  ); // kbps

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(p);
    if (!fileStates[p]) fileStates[p] = {};
    fileStates[p].cmd = cmd;
    fileStates[p].status = "processing";
    if (onProgress) onProgress(0, "processing", outPath);
    // build video filter to respect target resolution and preserve portrait orientation
    // targetResolution: auto / 480p / 720p / 1080p
    const resChoice =
      (opts && opts.resolution) ||
      (targetResolutionEl && targetResolutionEl.value) ||
      "auto";
    let maxW = 1280,
      maxH = 720;
    if (resChoice === "480p") {
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
    const outOpts = [
      "-c:v libx264",
      `-b:v ${videoBitrate}k`,
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
    if (audioCodec === "aac") {
      outOpts.push("-c:a copy");
    } else {
      // re-encode audio at source bitrate (or fallback)
      outOpts.push("-c:a aac", `-b:a ${adjAudioBitrate}k`);
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
          } catch (e) {}
          if (onProgress) onProgress(0, "cancelled");
          return resolve(null);
        }
        if (!fileStates[p]) fileStates[p] = {};
        fileStates[p].lastOut = outPath;
        if (onProgress) onProgress(100, "done", outPath);
        resolve(outPath);
      })
      .on("error", (err) => {
        // attempt to remove any partial output
        try {
          const fs = require("fs");
          if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch (e) {}
        if (fileStates[p]) fileStates[p].cmd = null;
        reject(err);
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
        needsRender = true;
      } else if (s.progEl && displayed !== target) {
        s.displayedProgress = target;
        s.progEl.style.width = Math.max(0, Math.min(100, target)) + "%";
        needsRender = true;
      }
    }
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
