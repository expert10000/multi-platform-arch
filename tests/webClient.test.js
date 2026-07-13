import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web app keeps HTTP calls inside the API client", async () => {
  const adminSource = await readFile(new URL("../apps/hosts/admin/public/app.js", import.meta.url), "utf8");
  const webSource = await readFile(new URL("../apps/hosts/web/public/app.js", import.meta.url), "utf8");
  const clientSource = await readFile(new URL("../apps/hosts/shared/public/apiClient.js", import.meta.url), "utf8");

  assert.equal(adminSource.includes("fetch("), false);
  assert.equal(webSource.includes("fetch("), false);
  assert.equal(clientSource.includes("fetch("), true);
});

test("platform architecture panel exposes clickable sections", async () => {
  const html = await readFile(new URL("../apps/hosts/admin/public/index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../apps/hosts/admin/public/app.js", import.meta.url), "utf8");
  const expectedSections = ["models", "contracts", "services", "hosts", "backends", "workers"];

  for (const section of expectedSections) {
    assert.match(html, new RegExp(`data-architecture-section="${section}"`));
    assert.match(appSource, new RegExp(`${section}:`));
  }

  assert.match(appSource, /renderArchitecture/);
});

test("central admin exposes hosts backends and workers panels", async () => {
  const html = await readFile(new URL("../apps/hosts/admin/public/index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../apps/hosts/admin/public/app.js", import.meta.url), "utf8");

  for (const section of ["hosts", "backends", "workers"]) {
    assert.match(html, new RegExp(`data-implementation-section="${section}"`));
    assert.match(appSource, new RegExp(`${section}: \\[`));
  }

  assert.match(html, /Central Admin Console/);
  assert.match(appSource, /Node Backend/);
  assert.match(appSource, /Python Backend/);
  assert.match(appSource, /\.NET Desktop Host/);
  assert.match(appSource, /Launch \.NET Desktop/);
  assert.match(appSource, /Stop \.NET Desktop/);
  assert.match(appSource, /launchDotnetDesktopHost/);
  assert.match(appSource, /closeDotnetDesktopHost/);
  assert.match(appSource, /\.NET MAUI Desktop/);
  assert.match(appSource, /dotnet workload install maui/);
  assert.match(appSource, /Electron Host/);
  assert.match(appSource, /Launch Desktop/);
  assert.match(appSource, /Stop Desktop/);
  assert.match(appSource, /launchElectronHost/);
  assert.match(appSource, /closeElectronHost/);
  assert.match(appSource, /Open Web Host/);
});

test(".NET Desktop host exposes workspace document and job surfaces", async () => {
  const projectSource = await readFile(new URL("../apps/hosts/dotnet-desktop/DzoneDotnetDesktopHost.csproj", import.meta.url), "utf8");
  const windowSource = await readFile(new URL("../apps/hosts/dotnet-desktop/MainWindow.xaml", import.meta.url), "utf8");
  const codeSource = await readFile(new URL("../apps/hosts/dotnet-desktop/MainWindow.xaml.cs", import.meta.url), "utf8");
  const mauiReadme = await readFile(new URL("../apps/hosts/maui/README.md", import.meta.url), "utf8");
  const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const mauiInstaller = await readFile(new URL("../scripts/install-maui-workload.ps1", import.meta.url), "utf8");

  assert.match(projectSource, /UseWPF/);
  assert.match(windowSource, /DZONE \.NET Desktop Host/);
  assert.match(windowSource, /Workspaces/);
  assert.match(windowSource, /Documents/);
  assert.match(windowSource, /Jobs/);
  assert.match(codeSource, /DZONE_BACKEND_URL/);
  assert.match(codeSource, /\/workspaces/);
  assert.match(codeSource, /\/documents/);
  assert.match(codeSource, /\/jobs/);
  assert.match(mauiReadme, /dotnet workload install maui/);
  assert.match(mauiReadme, /npm run setup:host:maui/);
  assert.match(packageSource, /setup:host:maui/);
  assert.match(packageSource, /check:host:maui/);
  assert.match(mauiInstaller, /dotnet workload install maui/);
  assert.match(mauiInstaller, /CheckOnly/);
});

test("distinct web host exposes workspace document and job surfaces", async () => {
  const html = await readFile(new URL("../apps/hosts/web/public/index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../apps/hosts/web/public/app.js", import.meta.url), "utf8");

  assert.match(html, /Workspace Portal/);
  assert.match(html, /Workspaces/);
  assert.match(html, /Documents/);
  assert.match(html, /Jobs/);
  assert.match(appSource, /renderWorkspaces/);
  assert.match(appSource, /renderDocuments/);
  assert.match(appSource, /renderJobs/);
});

test("electron host exposes desktop workspace document and job surfaces", async () => {
  const html = await readFile(new URL("../apps/hosts/electron/renderer/index.html", import.meta.url), "utf8");
  const rendererSource = await readFile(new URL("../apps/hosts/electron/renderer/renderer.js", import.meta.url), "utf8");
  const mainSource = await readFile(new URL("../apps/hosts/electron/main.cjs", import.meta.url), "utf8");
  const preloadSource = await readFile(new URL("../apps/hosts/electron/preload.cjs", import.meta.url), "utf8");

  assert.match(html, /Desktop Workspace/);
  assert.match(html, /backendUrlInput/);
  assert.match(html, /openAdminButton/);
  assert.match(html, /openWebButton/);
  assert.match(html, /Workspaces/);
  assert.match(html, /Documents/);
  assert.match(html, /Jobs/);
  assert.match(rendererSource, /createPlatformApi/);
  assert.match(rendererSource, /localStorage/);
  assert.match(rendererSource, /connectBackend/);
  assert.match(rendererSource, /renderWorkspaces/);
  assert.match(rendererSource, /renderDocuments/);
  assert.match(rendererSource, /renderJobs/);
  assert.match(rendererSource, /uploadDocumentFile/);
  assert.match(rendererSource, /processDocument/);
  assert.match(rendererSource, /openBrowserSurface/);
  assert.match(rendererSource, /dzoneDesktop/);
  assert.match(mainSource, /DZONE_BACKEND_URL/);
  assert.match(mainSource, /preload\.cjs/);
  assert.match(mainSource, /requestSingleInstanceLock/);
  assert.match(mainSource, /second-instance/);
  assert.match(mainSource, /if \(!mainWindow\) \{\s*createWindow\(\);/);
  assert.match(mainSource, /open-platform-browser/);
  assert.match(mainSource, /openExternal/);
  assert.match(preloadSource, /contextBridge/);
  assert.match(preloadSource, /openBrowser/);
});
