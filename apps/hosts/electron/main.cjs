const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");

const backendUrl = process.env.DZONE_BACKEND_URL || "http://localhost:3000";
const browserPaths = new Set(["/admin/", "/web/"]);
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow = null;

function browserUrl(baseUrl, routePath) {
  if (!browserPaths.has(routePath)) {
    throw new Error("Unsupported browser route.");
  }

  const url = new URL(routePath, baseUrl);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Unsupported browser protocol.");
  }
  return url.toString();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: "DZONE Desktop Host",
    backgroundColor: "#f2f5f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { backendUrl }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

ipcMain.handle("open-platform-browser", async (_event, payload) => {
  const url = browserUrl(payload?.baseUrl || backendUrl, payload?.path);
  await shell.openExternal(url);
  return url;
});

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
