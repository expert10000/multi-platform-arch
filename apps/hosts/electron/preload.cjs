const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dzoneDesktop", {
  openBrowser: (routePath, baseUrl) =>
    ipcRenderer.invoke("open-platform-browser", { path: routePath, baseUrl })
});
