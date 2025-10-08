const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { Menu } = require("electron");
const path = require("path");
const Store = require("electron-store");
const store = new Store();

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
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 500,
    show: false,
    title: "Compressly",
    icon: path.join(__dirname, "compressly.png"),
    autoHideMenuBar: true,
    backgroundColor: "#f6f8fa",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Allow renderer require() and built-in modules for this local app.
      // NOTE: this reduces isolation; we can refactor to use IPC-only access later.
      contextIsolation: false,
      nodeIntegration: true,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));
  win.once("ready-to-show", () => {
    win.show();
  });
}

app.whenReady().then(() => {
  createWindow();
  // Remove the default application menu for a cleaner UI
  try {
    Menu.setApplicationMenu(null);
  } catch (e) {
    console.warn("Could not remove menu", e);
  }

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
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

// Run an installer executable (path provided by renderer) detached and then quit the app
ipcMain.on("run-installer-and-exit", (event, installerPath, args = []) => {
  try {
    const { spawn } = require("child_process");
    // Normalize args to array
    const argv = Array.isArray(args) ? args : [];
    // Spawn detached so the installer runs after we quit
    const child = spawn(installerPath, argv, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });
    try {
      child.unref();
    } catch (e) {}
  } catch (e) {
    console.warn("failed to launch installer", e);
  }
  try {
    // Quit the app immediately
    app.quit();
  } catch (e) {}
});
