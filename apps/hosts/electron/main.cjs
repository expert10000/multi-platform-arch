const { app, BrowserWindow } = require("electron");
const path = require("node:path");

const backendUrl = process.env.DZONE_BACKEND_URL || "http://localhost:3000";

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 680,
    title: "DZONE Desktop Host",
    backgroundColor: "#f2f5f7",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "renderer", "index.html"), {
    query: { backendUrl }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
