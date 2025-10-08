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
