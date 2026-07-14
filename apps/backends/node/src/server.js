import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatform, NotFoundError, ValidationError } from "../../../../packages/platform/src/index.js";

const adminPublicRoot = fileURLToPath(new URL("../../../hosts/admin/public", import.meta.url));
const webPublicRoot = fileURLToPath(new URL("../../../hosts/web/public", import.meta.url));
const sharedPublicRoot = fileURLToPath(new URL("../../../hosts/shared/public", import.meta.url));
const electronHostRoot = fileURLToPath(new URL("../../../hosts/electron/", import.meta.url));
const dotnetDesktopHostRoot = fileURLToPath(new URL("../../../hosts/dotnet-desktop/", import.meta.url));
const mauiHostRoot = fileURLToPath(new URL("../../../hosts/maui/DzoneMauiHost/", import.meta.url));
const aspNetCoreBackendRoot = fileURLToPath(new URL("../../aspnet-core/", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const mauiInstallScript = fileURLToPath(new URL("../../../../scripts/install-maui-workload.ps1", import.meta.url));
const springInstallScript = fileURLToPath(new URL("../../../../scripts/install-spring-tooling.ps1", import.meta.url));
const pythonInstallScript = fileURLToPath(new URL("../../../../scripts/install-python-tooling.ps1", import.meta.url));
const dotnetInstallScript = fileURLToPath(new URL("../../../../scripts/install-dotnet-tooling.ps1", import.meta.url));
const electronDepsInstallScript = fileURLToPath(new URL("../../../../scripts/install-electron-deps.ps1", import.meta.url));
const defaultMauiSetupLog = fileURLToPath(new URL("../../../../data/runtime/maui-setup.log", import.meta.url));
const defaultSpringSetupLog = fileURLToPath(new URL("../../../../data/runtime/spring-setup.log", import.meta.url));
const defaultPythonSetupLog = fileURLToPath(new URL("../../../../data/runtime/python-setup.log", import.meta.url));
const defaultDotnetSetupLog = fileURLToPath(new URL("../../../../data/runtime/dotnet-setup.log", import.meta.url));
const defaultElectronDepsSetupLog = fileURLToPath(new URL("../../../../data/runtime/electron-deps-setup.log", import.meta.url));
const defaultFileStorageRoot = fileURLToPath(new URL("../../../../data/files/", import.meta.url));

export function createServer(
  platform = createPlatform(),
  options = {}
) {
  const {
    fileStorageRoot = defaultFileStorageRoot,
    launchElectronHost,
    closeElectronHost,
    launchDotnetDesktopHost,
    closeDotnetDesktopHost,
    launchMauiHost,
    closeMauiHost,
    launchSpringBackend,
    closeSpringBackend,
    setupMauiHost,
    getMauiSetupStatus,
    setupSpringBackend,
    getSpringSetupStatus,
    launchAspNetCoreBackend,
    closeAspNetCoreBackend,
    setupPythonTooling,
    getPythonToolingStatus,
    setupDotnetTooling,
    getDotnetToolingStatus,
    setupElectronDependencies,
    getElectronDependenciesStatus
  } = options;
  const electronHostController =
    launchElectronHost || closeElectronHost
      ? {
          launchElectronHost,
          closeElectronHost: closeElectronHost ?? defaultCloseElectronHost
        }
      : createElectronHostController();
  const dotnetDesktopHostController =
    launchDotnetDesktopHost || closeDotnetDesktopHost
      ? {
          launchDotnetDesktopHost,
          closeDotnetDesktopHost: closeDotnetDesktopHost ?? defaultCloseDotnetDesktopHost
        }
      : createDotnetDesktopHostController();
  const mauiHostController =
    launchMauiHost || closeMauiHost
      ? {
          launchMauiHost,
          closeMauiHost: closeMauiHost ?? defaultCloseMauiHost
        }
      : createMauiHostController();
  const defaultMauiSetupRunner = createMauiSetupRunner();
  const mauiSetup = setupMauiHost ?? defaultMauiSetupRunner;
  const mauiSetupStatus = getMauiSetupStatus ?? defaultMauiSetupRunner.status;
  const springBackendController =
    launchSpringBackend || closeSpringBackend
      ? {
          launchSpringBackend,
          closeSpringBackend: closeSpringBackend ?? defaultCloseSpringBackend
        }
      : createSpringBackendController();
  const defaultSpringSetupRunner = createSpringSetupRunner();
  const springSetup = setupSpringBackend ?? defaultSpringSetupRunner;
  const springSetupStatus = getSpringSetupStatus ?? defaultSpringSetupRunner.status;
  const aspNetCoreBackendController =
    launchAspNetCoreBackend || closeAspNetCoreBackend
      ? {
          launchAspNetCoreBackend,
          closeAspNetCoreBackend: closeAspNetCoreBackend ?? defaultCloseAspNetCoreBackend
        }
      : createAspNetCoreBackendController();
  const defaultPythonSetupRunner = createToolSetupRunner({
    host: "python",
    command: "winget install Python.Python.3.11",
    scriptPath: pythonInstallScript,
    logPath: defaultPythonSetupLog,
    checks: { python: () => commandAvailable("python") }
  });
  const pythonSetup = setupPythonTooling ?? defaultPythonSetupRunner;
  const pythonSetupStatus = getPythonToolingStatus ?? defaultPythonSetupRunner.status;
  const defaultDotnetSetupRunner = createToolSetupRunner({
    host: "dotnet",
    command: "winget install Microsoft.DotNet.SDK.10",
    scriptPath: dotnetInstallScript,
    logPath: defaultDotnetSetupLog,
    checks: { dotnet: () => commandAvailable("dotnet") }
  });
  const dotnetSetup = setupDotnetTooling ?? defaultDotnetSetupRunner;
  const dotnetSetupStatus = getDotnetToolingStatus ?? defaultDotnetSetupRunner.status;
  const defaultElectronDepsSetupRunner = createToolSetupRunner({
    host: "electron-deps",
    command: "npm --prefix apps/hosts/electron install",
    scriptPath: electronDepsInstallScript,
    logPath: defaultElectronDepsSetupLog,
    checks: { electronDependencies: electronDependenciesState }
  });
  const electronDepsSetup = setupElectronDependencies ?? defaultElectronDepsSetupRunner;
  const electronDepsSetupStatus = getElectronDependenciesStatus ?? defaultElectronDepsSetupRunner.status;
  const service = platform.services.documents;

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const method = request.method ?? "GET";
      const path = url.pathname;

      if (method === "OPTIONS") {
        return sendNoContent(response);
      }

      if (method === "GET" && isStaticRequest(path)) {
        const served = await tryServeStatic(path, response);
        if (served) {
          return;
        }
      }

      if (method === "GET" && path === "/health") {
        return sendJson(response, 200, { ok: true, runtime: "node" });
      }

      if (method === "POST" && path === "/runtime/hosts/electron/open") {
        return sendJson(response, 202, await electronHostController.launchElectronHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "POST" && path === "/runtime/hosts/electron/close") {
        return sendJson(response, 202, await electronHostController.closeElectronHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "POST" && path === "/runtime/hosts/dotnet-desktop/open") {
        return sendJson(response, 202, await dotnetDesktopHostController.launchDotnetDesktopHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "POST" && path === "/runtime/hosts/dotnet-desktop/close") {
        return sendJson(response, 202, await dotnetDesktopHostController.closeDotnetDesktopHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "POST" && path === "/runtime/hosts/maui/setup") {
        return sendJson(response, 202, await mauiSetup());
      }

      if (method === "GET" && path === "/runtime/hosts/maui/setup") {
        return sendJson(response, 200, await mauiSetupStatus());
      }

      if (method === "POST" && path === "/runtime/backends/spring/setup") {
        return sendJson(response, 202, await springSetup());
      }

      if (method === "GET" && path === "/runtime/backends/spring/setup") {
        return sendJson(response, 200, await springSetupStatus());
      }

      if (method === "POST" && path === "/runtime/setup/python") {
        return sendJson(response, 202, await pythonSetup());
      }

      if (method === "GET" && path === "/runtime/setup/python") {
        return sendJson(response, 200, await pythonSetupStatus());
      }

      if (method === "POST" && path === "/runtime/setup/dotnet") {
        return sendJson(response, 202, await dotnetSetup());
      }

      if (method === "GET" && path === "/runtime/setup/dotnet") {
        return sendJson(response, 200, await dotnetSetupStatus());
      }

      if (method === "POST" && path === "/runtime/setup/electron-deps") {
        return sendJson(response, 202, await electronDepsSetup());
      }

      if (method === "GET" && path === "/runtime/setup/electron-deps") {
        return sendJson(response, 200, await electronDepsSetupStatus());
      }

      if (method === "POST" && path === "/runtime/backends/spring/open") {
        return sendJson(response, 202, await springBackendController.launchSpringBackend({ backendUrl: "http://localhost:3200" }));
      }

      if (method === "POST" && path === "/runtime/backends/spring/close") {
        return sendJson(response, 202, await springBackendController.closeSpringBackend({ backendUrl: "http://localhost:3200" }));
      }

      if (method === "POST" && path === "/runtime/backends/aspnet-core/open") {
        return sendJson(response, 202, await aspNetCoreBackendController.launchAspNetCoreBackend({ backendUrl: "http://localhost:3300" }));
      }

      if (method === "POST" && path === "/runtime/backends/aspnet-core/close") {
        return sendJson(response, 202, await aspNetCoreBackendController.closeAspNetCoreBackend({ backendUrl: "http://localhost:3300" }));
      }

      if (method === "POST" && path === "/runtime/hosts/maui/open") {
        return sendJson(response, 202, await mauiHostController.launchMauiHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "POST" && path === "/runtime/hosts/maui/close") {
        return sendJson(response, 202, await mauiHostController.closeMauiHost({ backendUrl: requestBaseUrl(request) }));
      }

      if (method === "GET" && path === "/workspaces") {
        return sendJson(response, 200, await service.listWorkspaces());
      }

      if (method === "POST" && path === "/workspaces") {
        return sendJson(response, 201, await service.createWorkspace(await readJson(request)));
      }

      const workspaceMatch = path.match(/^\/workspaces\/([^/]+)$/);
      if (workspaceMatch && method === "GET") {
        return sendJson(response, 200, await service.getWorkspace(workspaceMatch[1]));
      }

      if (method === "GET" && path === "/documents") {
        const workspaceId = url.searchParams.get("workspaceId");
        return sendJson(response, 200, await service.listDocuments(workspaceId));
      }

      if (method === "POST" && path === "/documents") {
        return sendJson(response, 201, await service.createDocument(await readJson(request)));
      }

      const documentFileMatch = path.match(/^\/documents\/([^/]+)\/file$/);
      if (documentFileMatch && method === "POST") {
        const documentId = decodeURIComponent(documentFileMatch[1]);
        await service.getDocument(documentId);
        const content = await readBinary(request);
        const fileName = readFileNameHeader(request);
        const mimeType = request.headers["content-type"] ?? "application/octet-stream";
        await writeDocumentFile(fileStorageRoot, documentId, fileName, content);
        const document = await service.attachDocumentFile(documentId, {
          fileName,
          mimeType,
          size: content.length
        });
        const job = await service.processDocument(documentId, "extract-text");
        return sendJson(response, 202, { document, job });
      }

      const documentProcessMatch = path.match(/^\/documents\/([^/]+)\/process$/);
      if (documentProcessMatch && method === "POST") {
        const body = await readJson(request, {});
        const job = await service.processDocument(documentProcessMatch[1], body.type);
        return sendJson(response, 202, job);
      }

      const documentMatch = path.match(/^\/documents\/([^/]+)$/);
      if (documentMatch && method === "GET") {
        return sendJson(response, 200, await service.getDocument(documentMatch[1]));
      }

      if (documentMatch && method === "PUT") {
        return sendJson(
          response,
          200,
          await service.updateDocument(documentMatch[1], await readJson(request))
        );
      }

      if (documentMatch && method === "DELETE") {
        await service.deleteDocument(documentMatch[1]);
        return sendNoContent(response);
      }

      if (method === "GET" && path === "/jobs") {
        const documentId = url.searchParams.get("documentId");
        return sendJson(response, 200, await service.listJobs(documentId));
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        return sendJson(response, 200, await service.getJob(jobMatch[1]));
      }

      throw new NotFoundError(`Route '${method} ${path}' was not found.`);
    } catch (error) {
      return sendError(response, error);
    }
  });
}

export function createElectronHostLauncher({
  hostRoot = electronHostRoot,
  fileExists = existsSync,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess
} = {}) {
  const controller = createElectronHostController({
    hostRoot,
    fileExists,
    spawnProcess,
    isProcessRunning,
    stopProcess
  });
  controller.launchElectronHost.close = controller.closeElectronHost;
  return controller.launchElectronHost;
}

export function createElectronHostController({
  hostRoot = electronHostRoot,
  fileExists = existsSync,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess
} = {}) {
  let hostProcess = null;

  return {
    async launchElectronHost({ backendUrl }) {
      const command = electronLaunchCommand(hostRoot, fileExists);

      if (isProcessRunning(hostProcess)) {
        focusElectronHost(command, hostRoot, backendUrl, spawnProcess);
        return { host: "electron", status: "running", backendUrl };
      }
      hostProcess = null;

      hostProcess = spawnElectronHost(command, hostRoot, backendUrl, spawnProcess);
      hostProcess.once?.("exit", () => {
        hostProcess = null;
      });
      hostProcess.unref();

      return { host: "electron", status: "starting", backendUrl };
    },

    async closeElectronHost({ backendUrl }) {
      if (!isProcessRunning(hostProcess)) {
        hostProcess = null;
        return { host: "electron", status: "stopped", backendUrl };
      }

      const processToStop = hostProcess;
      hostProcess = null;
      stopProcess(processToStop, spawnProcess);
      return { host: "electron", status: "stopping", backendUrl };
    }
  };
}

export function createDotnetDesktopHostController({
  hostRoot = dotnetDesktopHostRoot,
  fileExists = existsSync,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess
} = {}) {
  let hostProcess = null;

  return {
    async launchDotnetDesktopHost({ backendUrl }) {
      const command = dotnetDesktopLaunchCommand(hostRoot, fileExists);

      if (isProcessRunning(hostProcess)) {
        focusRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
        return { host: "dotnet-desktop", status: "running", backendUrl };
      }
      hostProcess = null;

      hostProcess = spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
      hostProcess.once?.("exit", () => {
        hostProcess = null;
      });
      hostProcess.unref();

      return { host: "dotnet-desktop", status: "starting", backendUrl };
    },

    async closeDotnetDesktopHost({ backendUrl }) {
      if (!isProcessRunning(hostProcess)) {
        hostProcess = null;
        return { host: "dotnet-desktop", status: "stopped", backendUrl };
      }

      const processToStop = hostProcess;
      hostProcess = null;
      stopProcess(processToStop, spawnProcess);
      return { host: "dotnet-desktop", status: "stopping", backendUrl };
    }
  };
}

export function createMauiHostController({
  hostRoot = mauiHostRoot,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess
} = {}) {
  let hostProcess = null;

  return {
    async launchMauiHost({ backendUrl }) {
      const command = mauiLaunchCommand();

      if (isProcessRunning(hostProcess)) {
        return { host: "maui-desktop", status: "running", backendUrl };
      }
      hostProcess = null;

      hostProcess = spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
      hostProcess.once?.("exit", () => {
        hostProcess = null;
      });
      hostProcess.unref();

      return { host: "maui-desktop", status: "starting", backendUrl };
    },

    async closeMauiHost({ backendUrl }) {
      if (!isProcessRunning(hostProcess)) {
        hostProcess = null;
        return { host: "maui-desktop", status: "stopped", backendUrl };
      }

      const processToStop = hostProcess;
      hostProcess = null;
      stopProcess(processToStop, spawnProcess);
      return { host: "maui-desktop", status: "stopping", backendUrl };
    }
  };
}

export function createMauiSetupRunner({
  scriptPath = mauiInstallScript,
  workingDirectory = repoRoot,
  logPath = defaultMauiSetupLog,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  now = () => new Date()
} = {}) {
  let setupProcess = null;
  let state = {
    host: "maui",
    status: "idle",
    command: "dotnet workload install maui",
    logPath,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    lastOutput: ""
  };

  async function setupMauiHost() {
    if (isProcessRunning(setupProcess)) {
      return setupStatus("running");
    }
    setupProcess = null;

    await mkdir(dirname(logPath), { recursive: true });
    await appendLog(logPath, `\n[maui] Setup requested at ${now().toISOString()}\n`);
    state = {
      ...state,
      status: "starting",
      startedAt: now().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      lastOutput: ""
    };

    setupProcess = spawnProcess(mauiSetupExecutable(), mauiSetupArgs(scriptPath), {
      cwd: workingDirectory,
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    await appendLog(logPath, `[maui] Setup process started${setupProcess.pid ? ` with pid ${setupProcess.pid}` : ""}\n`);
    captureInstallerOutput(setupProcess.stdout, logPath, (text) => updateLastOutput(text));
    captureInstallerOutput(setupProcess.stderr, logPath, (text) => updateLastOutput(text));
    setupProcess.once?.("close", async (exitCode, signal) => {
      const finishedAt = now().toISOString();
      const status = exitCode === 0 ? "completed" : "failed";
      state = {
        ...state,
        status,
        finishedAt,
        exitCode,
        signal
      };
      await appendLog(logPath, `[maui] Setup ${status} at ${finishedAt} (exit ${exitCode ?? "none"}${signal ? `, signal ${signal}` : ""})\n`);
      setupProcess = null;
    });

    return setupStatus("starting");
  }

  async function setupStatus(statusOverride) {
    const running = isProcessRunning(setupProcess);
    const lastOutput = await readLogTail(logPath);
    return {
      ...state,
      status: statusOverride ?? (running ? "running" : state.status),
      lastOutput
    };
  }

  function updateLastOutput(text) {
    state = {
      ...state,
      lastOutput: trimLog(`${state.lastOutput}${text}`)
    };
  }

  setupMauiHost.status = setupStatus;
  return setupMauiHost;
}

export function createSpringSetupRunner({
  scriptPath = springInstallScript,
  workingDirectory = repoRoot,
  logPath = defaultSpringSetupLog,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  now = () => new Date(),
  checkCommand = commandAvailable,
  checkSpringRuntime = springRuntimeState
} = {}) {
  let setupProcess = null;
  let state = {
    host: "spring",
    status: "idle",
    command: "winget install Microsoft.OpenJDK.17 and Apache.Maven",
    logPath,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    lastOutput: "",
    java: "unknown",
    maven: "unknown",
    spring: "unknown"
  };

  async function setupSpringBackend() {
    if (isProcessRunning(setupProcess)) {
      return setupStatus("running");
    }
    setupProcess = null;

    await mkdir(dirname(logPath), { recursive: true });
    await appendLog(logPath, `\n[spring] Setup requested at ${now().toISOString()}\n`);
    state = {
      ...state,
      status: "starting",
      startedAt: now().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      lastOutput: ""
    };

    setupProcess = spawnProcess(springSetupExecutable(), springSetupArgs(scriptPath), {
      cwd: workingDirectory,
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    await appendLog(logPath, `[spring] Setup process started${setupProcess.pid ? ` with pid ${setupProcess.pid}` : ""}\n`);
    captureInstallerOutput(setupProcess.stdout, logPath, (text) => updateLastOutput(text));
    captureInstallerOutput(setupProcess.stderr, logPath, (text) => updateLastOutput(text));
    setupProcess.once?.("close", async (exitCode, signal) => {
      const finishedAt = now().toISOString();
      const status = exitCode === 0 ? "completed" : "failed";
      state = {
        ...state,
        status,
        finishedAt,
        exitCode,
        signal
      };
      await appendLog(logPath, `[spring] Setup ${status} at ${finishedAt} (exit ${exitCode ?? "none"}${signal ? `, signal ${signal}` : ""})\n`);
      setupProcess = null;
    });

    return setupStatus("starting");
  }

  async function setupStatus(statusOverride) {
    const running = isProcessRunning(setupProcess);
    const [java, maven, spring] = await Promise.all([
      checkCommand("java"),
      checkCommand("mvn"),
      checkSpringRuntime()
    ]);
    const lastOutput = await readLogTail(logPath);
    const ready = java === "installed" && maven === "installed";
    const status = statusOverride ?? (running ? "running" : ready ? "completed" : state.status);
    state = {
      ...state,
      java,
      maven,
      spring,
      lastOutput
    };
    return {
      ...state,
      status
    };
  }

  function updateLastOutput(text) {
    state = {
      ...state,
      lastOutput: trimLog(`${state.lastOutput}${text}`)
    };
  }

  setupSpringBackend.status = setupStatus;
  return setupSpringBackend;
}

export function createSpringBackendController({
  workingDirectory = repoRoot,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess,
  checkSpringRuntime = springRuntimeState
} = {}) {
  let backendProcess = null;

  return {
    async launchSpringBackend({ backendUrl }) {
      if (isProcessRunning(backendProcess)) {
        return { host: "spring-backend", status: "running", backendUrl };
      }
      if (await checkSpringRuntime() === "running") {
        return { host: "spring-backend", status: "running", backendUrl };
      }
      backendProcess = null;

      backendProcess = spawnSpringBackend(workingDirectory, spawnProcess);
      backendProcess.once?.("exit", () => {
        backendProcess = null;
      });
      backendProcess.unref();

      return { host: "spring-backend", status: "starting", backendUrl };
    },

    async closeSpringBackend({ backendUrl }) {
      if (!isProcessRunning(backendProcess)) {
        backendProcess = null;
        return { host: "spring-backend", status: "stopped", backendUrl };
      }

      const processToStop = backendProcess;
      backendProcess = null;
      stopProcess(processToStop, spawnProcess);
      return { host: "spring-backend", status: "stopping", backendUrl };
    }
  };
}

export function createToolSetupRunner({
  host,
  command,
  scriptPath,
  workingDirectory = repoRoot,
  logPath,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  now = () => new Date(),
  checks = {}
} = {}) {
  let setupProcess = null;
  let state = {
    host,
    status: "idle",
    command,
    logPath,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    signal: null,
    lastOutput: ""
  };

  async function setupTooling() {
    if (isProcessRunning(setupProcess)) {
      return setupStatus("running");
    }
    setupProcess = null;

    await mkdir(dirname(logPath), { recursive: true });
    await appendLog(logPath, `\n[${host}] Setup requested at ${now().toISOString()}\n`);
    state = {
      ...state,
      status: "starting",
      startedAt: now().toISOString(),
      finishedAt: null,
      exitCode: null,
      signal: null,
      lastOutput: ""
    };

    setupProcess = spawnProcess(setupExecutable(), setupArgs(scriptPath), {
      cwd: workingDirectory,
      detached: false,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    await appendLog(logPath, `[${host}] Setup process started${setupProcess.pid ? ` with pid ${setupProcess.pid}` : ""}\n`);
    captureInstallerOutput(setupProcess.stdout, logPath, (text) => updateLastOutput(text));
    captureInstallerOutput(setupProcess.stderr, logPath, (text) => updateLastOutput(text));
    setupProcess.once?.("close", async (exitCode, signal) => {
      const finishedAt = now().toISOString();
      const status = exitCode === 0 ? "completed" : "failed";
      state = {
        ...state,
        status,
        finishedAt,
        exitCode,
        signal
      };
      await appendLog(logPath, `[${host}] Setup ${status} at ${finishedAt} (exit ${exitCode ?? "none"}${signal ? `, signal ${signal}` : ""})\n`);
      setupProcess = null;
    });

    return setupStatus("starting");
  }

  async function setupStatus(statusOverride) {
    const running = isProcessRunning(setupProcess);
    const checkEntries = await Promise.all(
      Object.entries(checks).map(async ([key, check]) => [key, await check()])
    );
    const checkState = Object.fromEntries(checkEntries);
    const lastOutput = await readLogTail(logPath);
    const ready = checkEntries.length > 0 && checkEntries.every(([, value]) => value === "installed");
    const status = statusOverride ?? (running ? "running" : ready ? "completed" : state.status);
    state = {
      ...state,
      ...checkState,
      lastOutput
    };
    return {
      ...state,
      status
    };
  }

  function updateLastOutput(text) {
    state = {
      ...state,
      lastOutput: trimLog(`${state.lastOutput}${text}`)
    };
  }

  setupTooling.status = setupStatus;
  return setupTooling;
}

export function createAspNetCoreBackendController({
  workingDirectory = aspNetCoreBackendRoot,
  spawnProcess = spawn,
  isProcessRunning = isChildProcessRunning,
  stopProcess = stopChildProcess,
  checkAspNetCoreRuntime = aspNetCoreRuntimeState
} = {}) {
  let backendProcess = null;

  return {
    async launchAspNetCoreBackend({ backendUrl }) {
      if (isProcessRunning(backendProcess)) {
        return { host: "aspnet-core-backend", status: "running", backendUrl };
      }
      if (await checkAspNetCoreRuntime() === "running") {
        return { host: "aspnet-core-backend", status: "running", backendUrl };
      }
      backendProcess = null;

      backendProcess = spawnAspNetCoreBackend(workingDirectory, spawnProcess);
      backendProcess.once?.("exit", () => {
        backendProcess = null;
      });
      backendProcess.unref();

      return { host: "aspnet-core-backend", status: "starting", backendUrl };
    },

    async closeAspNetCoreBackend({ backendUrl }) {
      if (!isProcessRunning(backendProcess)) {
        backendProcess = null;
        return { host: "aspnet-core-backend", status: "stopped", backendUrl };
      }

      const processToStop = backendProcess;
      backendProcess = null;
      stopProcess(processToStop, spawnProcess);
      return { host: "aspnet-core-backend", status: "stopping", backendUrl };
    }
  };
}

function electronLaunchCommand(hostRoot, fileExists) {
  const executablePath =
    process.platform === "win32"
      ? join(hostRoot, "node_modules", "electron", "dist", "electron.exe")
      : join(hostRoot, "node_modules", "electron", "dist", "electron");

  if (fileExists(executablePath)) {
    return { file: executablePath, args: ["."], windowsHide: false };
  }

  return process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "npm start"], windowsHide: true }
    : { file: "npm", args: ["start"], windowsHide: false };
}

function focusElectronHost(command, hostRoot, backendUrl, spawnProcess) {
  const focusProcess = spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
  focusProcess.unref();
}

function spawnElectronHost(command, hostRoot, backendUrl, spawnProcess) {
  return spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
}

function focusRuntimeHost(command, hostRoot, backendUrl, spawnProcess) {
  const focusProcess = spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess);
  focusProcess.unref();
}

function spawnRuntimeHost(command, hostRoot, backendUrl, spawnProcess) {
  return spawnProcess(command.file, command.args, {
    cwd: hostRoot,
    detached: true,
    env: { ...process.env, DZONE_BACKEND_URL: backendUrl },
    shell: false,
    stdio: "ignore",
    windowsHide: command.windowsHide
  });
}

function dotnetDesktopLaunchCommand(hostRoot, fileExists) {
  const executablePath = join(hostRoot, "bin", "Debug", "net10.0-windows", "DzoneDotnetDesktopHost.exe");

  if (fileExists(executablePath)) {
    return { file: executablePath, args: [], windowsHide: false };
  }

  return {
    file: "dotnet",
    args: ["run", "--project", "DzoneDotnetDesktopHost.csproj", "--no-launch-profile"],
    windowsHide: true
  };
}

function mauiLaunchCommand() {
  return {
    file: "dotnet",
    args: ["run", "--project", "DzoneMauiHost.csproj", "-f", "net10.0-windows10.0.19041.0", "--no-launch-profile"],
    windowsHide: true
  };
}

function mauiSetupExecutable() {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

function mauiSetupArgs(scriptPath) {
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
}

function springSetupExecutable() {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

function springSetupArgs(scriptPath) {
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
}

function setupExecutable() {
  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

function setupArgs(scriptPath) {
  return ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
}

function spawnSpringBackend(workingDirectory, spawnProcess) {
  const command = springBackendCommand();
  return spawnProcess(command.file, command.args, {
    cwd: workingDirectory,
    detached: true,
    env: { ...process.env, SERVER_PORT: "3200" },
    shell: false,
    stdio: "ignore",
    windowsHide: command.windowsHide
  });
}

function springBackendCommand() {
  return process.platform === "win32"
    ? {
        file: "cmd.exe",
        args: ["/d", "/s", "/c", "mvn -f apps/backends/spring/pom.xml spring-boot:run"],
        windowsHide: true
      }
    : {
        file: "mvn",
        args: ["-f", "apps/backends/spring/pom.xml", "spring-boot:run"],
        windowsHide: false
      };
}

function spawnAspNetCoreBackend(workingDirectory, spawnProcess) {
  return spawnProcess("dotnet", ["run", "--project", "DzoneAspNetCoreBackend.csproj", "--urls", "http://127.0.0.1:3300"], {
    cwd: workingDirectory,
    detached: true,
    env: { ...process.env, ASPNETCORE_URLS: "http://127.0.0.1:3300" },
    shell: false,
    stdio: "ignore",
    windowsHide: true
  });
}

function commandAvailable(commandName, spawnProcess = spawn) {
  return new Promise((resolve) => {
    const command = process.platform === "win32"
      ? {
          file: "powershell.exe",
          args: ["-NoProfile", "-Command", `if (Get-Command ${commandName} -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }`]
        }
      : {
          file: "sh",
          args: ["-lc", `command -v ${commandName}`]
        };
    const child = spawnProcess(command.file, command.args, {
      stdio: "ignore",
      windowsHide: true
    });
    child.once?.("error", () => resolve("missing"));
    child.once?.("exit", (exitCode) => resolve(exitCode === 0 ? "installed" : "missing"));
  });
}

async function springRuntimeState() {
  try {
    const response = await fetch("http://127.0.0.1:3200/health", { signal: AbortSignal.timeout(1200) });
    if (!response.ok) {
      return "stopped";
    }
    const health = await response.json();
    return health.runtime === "spring-boot" ? "running" : "unknown";
  } catch {
    return "stopped";
  }
}

async function aspNetCoreRuntimeState() {
  try {
    const response = await fetch("http://127.0.0.1:3300/health", { signal: AbortSignal.timeout(1200) });
    if (!response.ok) {
      return "stopped";
    }
    const health = await response.json();
    return health.runtime === "aspnet-core" ? "running" : "unknown";
  } catch {
    return "stopped";
  }
}

async function electronDependenciesState() {
  return existsSync(join(electronHostRoot, "node_modules", "electron"))
    ? "installed"
    : "missing";
}

function captureInstallerOutput(stream, logPath, onOutput) {
  stream?.on?.("data", (chunk) => {
    const text = String(chunk);
    onOutput(text);
    appendLog(logPath, text);
  });
}

async function appendLog(logPath, text) {
  await appendFile(logPath, text, "utf8").catch(() => undefined);
}

async function readLogTail(logPath) {
  const content = await readFile(logPath, "utf8").catch(() => "");
  return trimLog(content);
}

function trimLog(content) {
  return content.slice(-4000).trim();
}

function isChildProcessRunning(childProcess) {
  if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return false;
  }
  if (!childProcess.pid) {
    return true;
  }

  try {
    process.kill(childProcess.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopChildProcess(childProcess, spawnProcess) {
  if (!childProcess?.pid) {
    childProcess?.kill?.();
    return;
  }

  if (process.platform === "win32") {
    const stopProcess = spawnProcess("taskkill", ["/pid", String(childProcess.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    stopProcess.unref?.();
    return;
  }

  childProcess.kill();
}

async function defaultCloseElectronHost({ backendUrl }) {
  return { host: "electron", status: "stopped", backendUrl };
}

async function defaultCloseDotnetDesktopHost({ backendUrl }) {
  return { host: "dotnet-desktop", status: "stopped", backendUrl };
}

async function defaultCloseMauiHost({ backendUrl }) {
  return { host: "maui-desktop", status: "stopped", backendUrl };
}

async function defaultCloseSpringBackend({ backendUrl }) {
  return { host: "spring-backend", status: "stopped", backendUrl };
}

async function defaultCloseAspNetCoreBackend({ backendUrl }) {
  return { host: "aspnet-core-backend", status: "stopped", backendUrl };
}

function isStaticRequest(path) {
  return path === "/" || path === "/admin" || path === "/web" || path === "/node-admin" || path === "/spring-admin" || path === "/python-admin" || path === "/aspnet-admin" || path === "/document-worker-admin" || path === "/python-worker-admin" || path === "/search-worker-admin" || path.startsWith("/admin/") || path.startsWith("/web/") || path.startsWith("/shared/") || path.startsWith("/node-admin/") || path.startsWith("/spring-admin/") || path.startsWith("/python-admin/") || path.startsWith("/aspnet-admin/") || path.startsWith("/document-worker-admin/") || path.startsWith("/python-worker-admin/") || path.startsWith("/search-worker-admin/");
}

async function tryServeStatic(path, response) {
  const staticTarget = staticTargetFor(path);
  if (!staticTarget) {
    return false;
  }

  const { root, relativePath } = staticTarget;
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    throw new NotFoundError(`Route 'GET ${path}' was not found.`);
  }

  try {
    const filePath = join(root, normalizedPath);
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "no-store"
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function staticTargetFor(path) {
  if (path === "/" || path === "/admin" || path === "/admin/") {
    return { root: adminPublicRoot, relativePath: "index.html" };
  }
  if (path === "/web" || path === "/web/") {
    return { root: webPublicRoot, relativePath: "index.html" };
  }
  if (path === "/node-admin" || path === "/node-admin/") {
    return { root: join(adminPublicRoot, "node-admin"), relativePath: "index.html" };
  }
  if (path === "/spring-admin" || path === "/spring-admin/") {
    return { root: join(adminPublicRoot, "spring-admin"), relativePath: "index.html" };
  }
  if (path === "/python-admin" || path === "/python-admin/") {
    return { root: join(adminPublicRoot, "python-admin"), relativePath: "index.html" };
  }
  if (path === "/aspnet-admin" || path === "/aspnet-admin/") {
    return { root: join(adminPublicRoot, "aspnet-admin"), relativePath: "index.html" };
  }
  if (path === "/document-worker-admin" || path === "/document-worker-admin/") {
    return { root: join(adminPublicRoot, "document-worker-admin"), relativePath: "index.html" };
  }
  if (path === "/python-worker-admin" || path === "/python-worker-admin/") {
    return { root: join(adminPublicRoot, "python-worker-admin"), relativePath: "index.html" };
  }
  if (path === "/search-worker-admin" || path === "/search-worker-admin/") {
    return { root: join(adminPublicRoot, "search-worker-admin"), relativePath: "index.html" };
  }
  if (path.startsWith("/admin/")) {
    return { root: adminPublicRoot, relativePath: path.slice("/admin/".length) };
  }
  if (path.startsWith("/web/")) {
    return { root: webPublicRoot, relativePath: path.slice("/web/".length) };
  }
  if (path.startsWith("/node-admin/")) {
    return { root: join(adminPublicRoot, "node-admin"), relativePath: path.slice("/node-admin/".length) };
  }
  if (path.startsWith("/spring-admin/")) {
    return { root: join(adminPublicRoot, "spring-admin"), relativePath: path.slice("/spring-admin/".length) };
  }
  if (path.startsWith("/python-admin/")) {
    return { root: join(adminPublicRoot, "python-admin"), relativePath: path.slice("/python-admin/".length) };
  }
  if (path.startsWith("/aspnet-admin/")) {
    return { root: join(adminPublicRoot, "aspnet-admin"), relativePath: path.slice("/aspnet-admin/".length) };
  }
  if (path.startsWith("/document-worker-admin/")) {
    return { root: join(adminPublicRoot, "document-worker-admin"), relativePath: path.slice("/document-worker-admin/".length) };
  }
  if (path.startsWith("/python-worker-admin/")) {
    return { root: join(adminPublicRoot, "python-worker-admin"), relativePath: path.slice("/python-worker-admin/".length) };
  }
  if (path.startsWith("/search-worker-admin/")) {
    return { root: join(adminPublicRoot, "search-worker-admin"), relativePath: path.slice("/search-worker-admin/".length) };
  }
  if (path.startsWith("/shared/")) {
    return { root: sharedPublicRoot, relativePath: path.slice("/shared/".length) };
  }
  return null;
}

async function readJson(request, fallback) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw && fallback !== undefined) {
    return fallback;
  }
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function readBinary(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  if (content.length === 0) {
    throw new ValidationError("File content is required.");
  }
  return content;
}

function readFileNameHeader(request) {
  const value = request.headers["x-file-name"];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError("x-file-name header is required.");
  }
  return decodeURIComponent(value).trim();
}

async function writeDocumentFile(fileStorageRoot, documentId, fileName, content) {
  const directory = join(fileStorageRoot, safePathSegment(documentId));
  const filePath = join(directory, safeFileName(fileName));
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, content);
}

function safePathSegment(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function safeFileName(value) {
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return sanitized || "upload.bin";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function sendError(response, error) {
  const statusCode =
    error instanceof ValidationError || error instanceof NotFoundError
      ? error.statusCode
      : 500;
  const message = statusCode === 500 ? "Internal server error." : error.message;
  sendJson(response, statusCode, { error: message });
}

function requestBaseUrl(request) {
  const host = request.headers.host || "localhost:3000";
  return `http://${host}`;
}

function contentTypeFor(filePath) {
  const extension = extname(filePath);
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".png") {
    return "image/png";
  }
  return "application/octet-stream";
}

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, x-file-name"
  };
}
