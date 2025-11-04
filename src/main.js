const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeTheme,
} = require("electron");
const { Menu } = require("electron");
const path = require("path");
const Store = require("electron-store");
const store = new Store();
const fs = require("fs");

// Global error handlers to surface startup/runtime errors
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process", err);
  try {
    dialog.showErrorBox("Uncaught Exception", String(err.stack || err));
  } catch (e) {}
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection in main process", reason);
  try {
    dialog.showErrorBox("Unhandled Rejection", String(reason));
  } catch (e) {}
});

function createWindow() {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  // Read persisted preference: whether to use the custom frameless titlebar on Windows.
  // Default: true (use custom frameless titlebar)
  let useCustomTitlebar = true;
  try {
    if (isWindows) {
      const v = store.get("useCustomTitlebar");
      if (typeof v === "boolean") useCustomTitlebar = v;
    }
  } catch (e) {}
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: "Compressly",
    // Use the macOS icns when running on macOS; otherwise fall back to PNG
    icon: isMac
      ? path.join(__dirname, "compressly.icns")
      : path.join(__dirname, "compressly.png"),
    autoHideMenuBar: true,
    backgroundColor: "#f6f8fa",
    // If we're on macOS, use the native titlebar. On Windows allow the
    // persisted preference to opt-out of the custom frameless titlebar.
    frame: isMac ? true : isWindows ? !useCustomTitlebar : false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Allow renderer require() and built-in modules for this local app.
      // NOTE: this reduces isolation; we can refactor to use IPC-only access later.
      contextIsolation: false,
      // Prevent Chromium from throttling timers/raf when the window is in the
      // background or minimized so taskbar progress updates continue.
      backgroundThrottling: false,
      nodeIntegration: true,
      // disallow DevTools from being opened
      devTools: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => {
    win.show();
    // Inform renderer about user's lite preference so UI can be adjusted early
    try {
      const lite = !!store.get("liteMode");
      try {
        win.webContents.send("lite-mode", lite);
      } catch (e) {}
    } catch (e) {}
    // Inform renderer whether the app is using the custom (frameless) titlebar
    try {
      win.webContents.send("use-custom-titlebar", useCustomTitlebar);
    } catch (e) {}
  });

  // Forward maximize/unmaximize events to renderer so it can update UI
  try {
    win.on("maximize", () => {
      try {
        win.webContents.send("window-maximized");
      } catch (e) {}
    });
    win.on("unmaximize", () => {
      try {
        win.webContents.send("window-unmaximized");
      } catch (e) {}
    });
  } catch (e) {}
}

app.whenReady().then(() => {
  // On macOS set a friendly app name and dock icon where possible
  if (process.platform === "darwin") {
    try {
      app.setName("Compressly");
      // If an icns file exists next to the app sources, use it for the dock
      const dockIcon = path.join(__dirname, "compressly.icns");
      if (
        fs.existsSync(dockIcon) &&
        app.dock &&
        typeof app.dock.setIcon === "function"
      ) {
        try {
          app.dock.setIcon(dockIcon);
        } catch (e) {}
      }
    } catch (e) {}
  }
  // Apply stored theme preference (if any) so the native titlebar matches
  try {
    const saved = store.get("theme");
    if (saved === "dark" || saved === "light" || saved === "system") {
      try {
        nativeTheme.themeSource = saved;
      } catch (e) {}
    }
  } catch (e) {}

  createWindow();
  // On macOS, provide a standard application menu; on other platforms hide it
  try {
    if (process.platform === "darwin") {
      const template = [
        {
          label: app.name || "Compressly",
          submenu: [
            {
              label: "About Compressly",
              click: (menuItem, browserWindow) => {
                try {
                  const win = browserWindow || BrowserWindow.getFocusedWindow();
                  if (
                    win &&
                    win.webContents &&
                    typeof win.webContents.send === "function"
                  ) {
                    win.webContents.send("open-about-modal");
                  } else {
                    // broadcast to all windows if no focused window
                    const { BrowserWindow: BW } = require("electron");
                    BW.getAllWindows().forEach((w) => {
                      try {
                        w.webContents.send("open-about-modal");
                      } catch (e) {}
                    });
                  }
                } catch (e) {}
              },
            },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" },
            { role: "hideothers" },
            { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
    } else {
      Menu.setApplicationMenu(null);
    }
  } catch (e) {
    console.warn("Could not configure menu", e);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// Allow renderer to request the app change its appearance (dark/light/system).
ipcMain.handle("set-app-theme", async (event, theme) => {
  try {
    if (theme === "dark" || theme === "light" || theme === "system") {
      try {
        nativeTheme.themeSource = theme;
      } catch (e) {}
      try {
        store.set("theme", theme);
      } catch (e) {}
      return { ok: true, theme };
    }
    return { ok: false, error: "invalid theme" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// Allow renderer to set lite-mode (from in-app button) so menu and store stay in sync
ipcMain.on("set-lite-mode", (event, enabled) => {
  try {
    const v = !!enabled;
    store.set("liteMode", v);
    // update menu checkbox if present
    try {
      const menu = Menu.getApplicationMenu();
      if (menu && menu.items && menu.items.length) {
        // find app menu (first menu usually the app name on mac)
        const appMenu =
          menu.items.find(
            (mi) =>
              mi.role === "appmenu" || mi.label === (app.name || "Compressly")
          ) || menu.items[0];
        if (appMenu && appMenu.submenu && appMenu.submenu.items) {
          const liteItem = appMenu.submenu.items.find(
            (si) => si.label === "Lite"
          );
          if (liteItem) liteItem.checked = v;
        }
      }
    } catch (e) {}
    // notify all windows of the change
    try {
      const { BrowserWindow } = require("electron");
      BrowserWindow.getAllWindows().forEach((w) => {
        try {
          w.webContents.send("lite-mode", v);
        } catch (e) {}
      });
    } catch (e) {}
  } catch (e) {}
});

// Provide the renderer a reliable ffmpeg path lookup for macOS and other OSes.
// This checks common Homebrew locations on macOS before falling back to
// the packaged ffmpeg-static module (if installed) or the PATH.
ipcMain.handle("get-ffmpeg-path", async () => {
  try {
    // Common Homebrew locations for Intel and Apple Silicon
    const candidates = [
      "/usr/local/bin/ffmpeg",
      "/opt/homebrew/bin/ffmpeg",
      // also check in /usr/bin as a fallback
      "/usr/bin/ffmpeg",
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (e) {}
    }

    // Check for bundled ffmpeg shipped as an extraResource by the builder.
    // When packaged the files are copied to <app>/resources/ffmpeg/<platform>/*
    try {
      const resBase = process && process.resourcesPath;
      if (resBase) {
        const bundled = {
          win32: path.join(resBase, "ffmpeg", "win32", "ffmpeg.exe"),
          darwin: path.join(resBase, "ffmpeg", "darwin", "ffmpeg"),
        };
        const b = bundled[process.platform];
        if (b && fs.existsSync(b)) {
          try {
            if (process.platform !== "win32") fs.chmodSync(b, 0o755);
          } catch (e) {}
          return b;
        }
      }
    } catch (e) {}

    // Fallback to ffmpeg-static if available. If the binary is inside an
    // asar archive it cannot be executed directly, so copy it to a temp
    // location and return that path (with executable bit set).
    try {
      const ffmpegStatic = require("ffmpeg-static");
      let p = ffmpegStatic && (ffmpegStatic.path || ffmpegStatic);
      if (p && typeof p === "string") {
        try {
          // if the path points inside an asar archive, copy it out
          if (p.includes("app.asar")) {
            try {
              const os = require("os");
              const pathModule = require("path");
              const base = pathModule.basename(p);
              const out = pathModule.join(
                os.tmpdir(),
                `compressly_ffmpeg_${base}`
              );
              if (!fs.existsSync(out)) {
                fs.copyFileSync(p, out);
                try {
                  fs.chmodSync(out, 0o755);
                } catch (e) {}
              }
              return out;
            } catch (e) {
              // fall through to return original p below
            }
          }
          // if file is executable on disk, return it
          if (fs.existsSync(p)) return p;
        } catch (e) {}
      }
    } catch (e) {}

    // Last resort: rely on ffmpeg in PATH (let fluent-ffmpeg find it)
    return "ffmpeg";
  } catch (e) {
    return "ffmpeg";
  }
});

// Provide ffprobe path lookup similar to ffmpeg. Some platforms ship ffprobe
// separately, and fluent-ffmpeg requires ffprobe to probe files.
ipcMain.handle("get-ffprobe-path", async () => {
  try {
    const candidates = [
      "/usr/local/bin/ffprobe",
      "/opt/homebrew/bin/ffprobe",
      "/usr/bin/ffprobe",
    ];
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) return p;
      } catch (e) {}
    }

    // Check for bundled ffprobe shipped in resources alongside ffmpeg
    try {
      const resBase = process && process.resourcesPath;
      if (resBase) {
        const bundledProbe = {
          win32: path.join(resBase, "ffmpeg", "win32", "ffprobe.exe"),
          darwin: path.join(resBase, "ffmpeg", "darwin", "ffprobe"),
        };
        const bp = bundledProbe[process.platform];
        if (bp && fs.existsSync(bp)) {
          try {
            if (process.platform !== "win32") fs.chmodSync(bp, 0o755);
          } catch (e) {}
          return bp;
        }
      }
    } catch (e) {}

    try {
      const ffprobeStatic = require("ffprobe-static");
      let p = ffprobeStatic && (ffprobeStatic.path || ffprobeStatic);
      if (p && typeof p === "string") {
        if (p.includes("app.asar")) {
          try {
            const os = require("os");
            const pathModule = require("path");
            const base = pathModule.basename(p);
            const out = pathModule.join(
              os.tmpdir(),
              `compressly_ffprobe_${base}`
            );
            if (!fs.existsSync(out)) {
              fs.copyFileSync(p, out);
              try {
                fs.chmodSync(out, 0o755);
              } catch (e) {}
            }
            return out;
          } catch (e) {}
        }
        if (fs.existsSync(p)) return p;
      }
    } catch (e) {}

    // Last resort: let fluent-ffmpeg fall back to 'ffprobe' on PATH
    return "ffprobe";
  } catch (e) {
    return "ffprobe";
  }
});

// Expose a debug endpoint to help diagnose ffmpeg detection in packaged apps.
// Invoke from the renderer/devtools: require('electron').ipcRenderer.invoke('debug-ffmpeg').then(console.log)
ipcMain.handle("debug-ffmpeg", async () => {
  try {
    // reuse the same lookup logic by invoking our get-ffmpeg-path handler
    // (call the handler functionally by sending an internal invoke)
    const ffmpegPath = (await ipcMain.invoke)
      ? await ipcMain.invoke("get-ffmpeg-path")
      : null;
    // fallback: try to call the path directly if invoke isn't available
    let resolved = ffmpegPath;
    // if invoke() is not present (older electron), attempt to run same logic inline
    if (!resolved) {
      try {
        const candidates = [
          "/usr/local/bin/ffmpeg",
          "/opt/homebrew/bin/ffmpeg",
          "/usr/bin/ffmpeg",
        ];
        for (const p of candidates) {
          try {
            if (fs.existsSync(p)) {
              resolved = p;
              break;
            }
          } catch (e) {}
        }
        if (!resolved) {
          try {
            const ffmpegStatic = require("ffmpeg-static");
            resolved = ffmpegStatic && (ffmpegStatic.path || ffmpegStatic);
          } catch (e) {}
        }
      } catch (e) {}
    }

    const result = {
      path: resolved || null,
      ok: false,
      stdout: null,
      stderr: null,
      error: null,
    };
    if (!resolved) return result;
    try {
      const { spawnSync } = require("child_process");
      const proc = spawnSync(resolved, ["-version"], { encoding: "utf8" });
      result.stdout = proc.stdout;
      result.stderr = proc.stderr;
      result.ok =
        proc.status === 0 || /ffmpeg version/i.test(String(proc.stdout || ""));
      return result;
    } catch (e) {
      result.error = String(e && e.stack ? e.stack : e);
      return result;
    }
  } catch (e) {
    return {
      path: null,
      ok: false,
      stdout: null,
      stderr: null,
      error: String(e && e.stack ? e.stack : e),
    };
  }
});

ipcMain.handle("select-files", async (event) => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media",
        extensions: [
          "jpg",
          "jpeg",
          "png",
          "webp",
          "gif",
          "mp4",
          "mov",
          "mkv",
          "avi",
          // audio
          "mp3",
          "m4a",
          "wav",
          "flac",
          "aac",
          "ogg",
          "opus",
        ],
      },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle("save-dialog", async (event, defaultPath) => {
  const result = await dialog.showSaveDialog({
    defaultPath,
    buttonLabel: "Save compressed",
  });
  if (result.canceled) return null;
  return result.filePath;
});

ipcMain.on("log", (e, ...args) => console.log(...args));

// Expose a simple reveal helper so renderer can ask main to reveal files in Finder
ipcMain.on("reveal-file", (event, targetPath) => {
  try {
    const { shell } = require("electron");
    const pathModule = require("path");
    if (shell && typeof shell.showItemInFolder === "function") {
      try {
        shell.showItemInFolder(targetPath);
        return;
      } catch (e) {
        // fallthrough to openPath fallback
      }
    }
    // fallback: open the containing folder
    try {
      shell.openPath(pathModule.dirname(targetPath));
    } catch (e) {
      console.warn("reveal-file openPath fallback failed", e);
    }
  } catch (e) {
    console.warn("reveal-file failed", e);
  }
});

// Minimize the window, then close after a short delay (delay in ms passed from renderer)
ipcMain.on("minimize-and-close", (event, delayMs = 3000) => {
  try {
    const win =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow();
    if (win) {
      try {
        win.minimize();
      } catch (e) {}
      setTimeout(
        () => {
          try {
            win.close();
          } catch (e) {}
        },
        typeof delayMs === "number" ? delayMs : 3000
      );
    }
  } catch (e) {
    console.warn("minimize-and-close failed", e);
  }
});

// Window control IPC for custom titlebar buttons
ipcMain.on("window-minimize", (event) => {
  try {
    const win =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  } catch (e) {}
});
ipcMain.on("window-close", (event) => {
  try {
    const win =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow();
    if (win) win.close();
  } catch (e) {}
});
ipcMain.on("window-toggle-maximize", (event) => {
  try {
    const win =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow();
    if (!win) return;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
  } catch (e) {}
});

// Titlebar preference handlers (Windows-only UI control)
ipcMain.handle("get-use-custom-titlebar", async () => {
  try {
    const v = store.get("useCustomTitlebar");
    return typeof v === "boolean" ? v : true;
  } catch (e) {
    return true;
  }
});

// Apply the new titlebar preference and restart the app so BrowserWindow
// can be recreated with the updated `frame` option. Renderer prompts
// for confirmation before invoking this.
ipcMain.on("apply-titlebar-setting", (event, enabled) => {
  try {
    store.set("useCustomTitlebar", !!enabled);
  } catch (e) {}
  try {
    // Relaunch the app; quit current instance so new frame option is used.
    app.relaunch();
    app.exit(0);
  } catch (e) {}
});

// Run an installer executable (path provided by renderer) detached and then quit the app
// On macOS, DMG/PKG should be opened via the 'open' command (not spawned directly).
ipcMain.on("run-installer-and-exit", (event, installerPath, args = []) => {
  try {
    const { spawn } = require("child_process");
    const pathModule = require("path");
    // Normalize args to array
    const argv = Array.isArray(args) ? args : [];
    const ext =
      (installerPath && pathModule.extname(installerPath).toLowerCase()) || "";

    // Platform-specific handling
    if (process.platform === "darwin" && (ext === ".dmg" || ext === ".pkg")) {
      // Use the 'open' command to mount/run DMG or open PKG with installer
      try {
        const child = spawn("open", [installerPath, ...argv], {
          detached: true,
          stdio: "ignore",
        });
        try {
          child.unref();
        } catch (e) {}
      } catch (e) {
        console.warn("failed to open dmg/pkg with 'open'", e);
      }
    } else if (process.platform === "win32" && ext === ".msi") {
      // Use msiexec for MSI installers on Windows
      try {
        const child = spawn("msiexec", ["/i", installerPath, ...argv], {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        try {
          child.unref();
        } catch (e) {}
      } catch (e) {
        console.warn("failed to launch msi with msiexec", e);
      }
    } else {
      // Default: attempt to spawn the installer directly (for .exe, .msi, etc.)
      try {
        const child = spawn(installerPath, argv, {
          detached: true,
          stdio: "ignore",
          windowsHide: false,
        });
        try {
          child.unref();
        } catch (e) {}
      } catch (e) {
        console.warn("failed to launch installer directly", e);
      }
    }
  } catch (e) {
    console.warn("failed to launch installer", e);
  }
  try {
    // Quit the app immediately so the installer can proceed
    app.quit();
  } catch (e) {}
});

// Set the taskbar progress for the window (value between 0 and 1). Pass -1 to remove.
ipcMain.on("set-taskbar-progress", (event, value) => {
  try {
    const win =
      BrowserWindow.fromWebContents(event.sender) ||
      BrowserWindow.getFocusedWindow();
    if (win && typeof win.setProgressBar === "function") {
      // clamp to valid range: -1 (remove) or [0,1]
      let v = Number(value);
      if (!isFinite(v)) v = -1;
      if (v > 1) v = 1;
      if (v < 0 && v !== -1) v = -1;
      win.setProgressBar(v);
    }
  } catch (e) {
    console.warn("set-taskbar-progress failed", e);
  }
});
