try {
  const electron = require("electron");
  const fs = require("fs");

  // If running with contextIsolation enabled, expose API via contextBridge.
  if (
    process &&
    process.contextIsolated &&
    electron.contextBridge &&
    electron.ipcRenderer
  ) {
    const { contextBridge, ipcRenderer } = electron;
    contextBridge.exposeInMainWorld("electronAPI", {
      selectFiles: () => ipcRenderer.invoke("select-files"),
      saveDialog: (defaultPath) =>
        ipcRenderer.invoke("save-dialog", defaultPath),
      getFfmpegPath: () => ipcRenderer.invoke("get-ffmpeg-path"),
      getFfprobePath: () => ipcRenderer.invoke("get-ffprobe-path"),
      // titlebar preference (Windows-only feature)
      getUseCustomTitlebar: () => ipcRenderer.invoke("get-use-custom-titlebar"),
      applyTitlebarSetting: (enabled) =>
        ipcRenderer.send("apply-titlebar-setting", enabled),
      // platform and dev flags are useful for UI tweaks in renderer
      platform: process.platform,
      isDev: !!(
        process &&
        (process.defaultApp || process.env.NODE_ENV === "development")
      ),
      // allow renderer to request app-level theme changes (macOS native titlebar will respond)
      setAppTheme: (theme) => ipcRenderer.invoke("set-app-theme", theme),
      readFile: (p) => fs.promises.readFile(p),
      writeFile: (p, data) => fs.promises.writeFile(p, data),
      log: (...args) => ipcRenderer.send("log", ...args),
    });
  } else {
    // When nodeIntegration=true and contextIsolation=false, expose a compatible API on window.
    if (typeof window !== "undefined") {
      window.electronAPI = {
        selectFiles: () => electron.ipcRenderer.invoke("select-files"),
        saveDialog: (defaultPath) =>
          electron.ipcRenderer.invoke("save-dialog", defaultPath),
        getFfmpegPath: () => electron.ipcRenderer.invoke("get-ffmpeg-path"),
        getFfprobePath: () => electron.ipcRenderer.invoke("get-ffprobe-path"),
        // titlebar preference (Windows-only feature)
        getUseCustomTitlebar: () =>
          electron.ipcRenderer.invoke("get-use-custom-titlebar"),
        applyTitlebarSetting: (enabled) =>
          electron.ipcRenderer.send("apply-titlebar-setting", enabled),
        // platform and isDev available to renderer when nodeIntegration is enabled
        platform: process.platform,
        isDev: !!(
          process &&
          (process.defaultApp || process.env.NODE_ENV === "development")
        ),
        setAppTheme: (theme) =>
          electron.ipcRenderer.invoke("set-app-theme", theme),
        readFile: (p) => fs.promises.readFile(p),
        writeFile: (p, data) => fs.promises.writeFile(p, data),
        log: (...args) => electron.ipcRenderer.send("log", ...args),
      };
    }
  }
} catch (err) {
  // Fail gracefully: don't throw during preload. Renderer will detect absence of electronAPI.
  try {
    console.error("preload initialization failed", err);
  } catch (e) {}
}
