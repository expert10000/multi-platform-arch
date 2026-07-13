import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createElectronHostController,
  createElectronHostLauncher,
  createDotnetDesktopHostController,
  createMauiHostController,
  createMauiSetupRunner,
  createAspNetCoreBackendController,
  createSpringBackendController,
  createSpringSetupRunner,
  createServer
} from "../apps/backends/node/src/server.js";
import { createPlatformApi } from "../apps/hosts/shared/public/apiClient.js";

test("serves the central admin host from the backend root", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(html, /Central Admin Console/);
  } finally {
    server.close();
  }
});

test("serves the distinct web host", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(`${baseUrl}/web/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Workspace Portal/);
  } finally {
    server.close();
  }
});

test("supports workspace, document, and job flow through HTTP", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const workspace = await postJson(`${baseUrl}/workspaces`, {
      name: "HTTP Workspace"
    });
    const document = await postJson(`${baseUrl}/documents`, {
      workspaceId: workspace.id,
      title: "HTTP Document"
    });
    const job = await postJson(`${baseUrl}/documents/${document.id}/process`, {
      type: "extract-text"
    });

    assert.equal(document.workspaceId, workspace.id);
    assert.equal(job.documentId, document.id);
    assert.equal(job.status, "queued");
  } finally {
    server.close();
  }
});

test("uploads document files to local storage and records metadata", async () => {
  const fileStorageRoot = await mkdtemp(join(tmpdir(), "dzone-files-"));
  const { server, baseUrl } = await startServer({ fileStorageRoot });
  const api = createPlatformApi({ baseUrl });

  try {
    const workspace = await api.createWorkspace({ name: "File Workspace" });
    const document = await api.createDocument({
      workspaceId: workspace.id,
      title: "Uploaded Document"
    });
    const upload = await api.uploadDocumentFile(
      document.id,
      new File(["hello file"], "hello.txt", { type: "text/plain" })
    );

    const uploadedNames = await readdir(join(fileStorageRoot, document.id));
    const uploadedContent = await readFile(join(fileStorageRoot, document.id, uploadedNames[0]), "utf8");

    assert.equal(upload.document.fileName, "hello.txt");
    assert.equal(upload.document.mimeType, "text/plain");
    assert.equal(upload.document.size, 10);
    assert.equal(upload.job.status, "queued");
    assert.equal(uploadedContent, "hello file");
  } finally {
    server.close();
    await rm(fileStorageRoot, { recursive: true, force: true });
  }
});

test("node backend supports cross-origin preflight for separated hosts", async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/documents/document_1/file`, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-file-name"
      }
    });

    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
  } finally {
    server.close();
  }
});

test("launches the Electron host through a local runtime command", async () => {
  const launches = [];
  const closes = [];
  const { server, baseUrl } = await startServer({
    launchElectronHost: async (input) => {
      launches.push(input);
      return { host: "electron", status: "starting", backendUrl: input.backendUrl };
    },
    closeElectronHost: async (input) => {
      closes.push(input);
      return { host: "electron", status: "stopping", backendUrl: input.backendUrl };
    }
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.launchElectronHost();
    const close = await api.closeElectronHost();

    assert.equal(result.host, "electron");
    assert.equal(result.status, "starting");
    assert.equal(result.backendUrl, baseUrl);
    assert.equal(close.host, "electron");
    assert.equal(close.status, "stopping");
    assert.equal(close.backendUrl, baseUrl);
    assert.deepEqual(launches, [{ backendUrl: baseUrl }]);
    assert.deepEqual(closes, [{ backendUrl: baseUrl }]);
  } finally {
    server.close();
  }
});

test("launches the .NET Desktop host through a local runtime command", async () => {
  const launches = [];
  const closes = [];
  const { server, baseUrl } = await startServer({
    launchDotnetDesktopHost: async (input) => {
      launches.push(input);
      return { host: "dotnet-desktop", status: "starting", backendUrl: input.backendUrl };
    },
    closeDotnetDesktopHost: async (input) => {
      closes.push(input);
      return { host: "dotnet-desktop", status: "stopping", backendUrl: input.backendUrl };
    }
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.launchDotnetDesktopHost();
    const close = await api.closeDotnetDesktopHost();

    assert.equal(result.host, "dotnet-desktop");
    assert.equal(result.status, "starting");
    assert.equal(result.backendUrl, baseUrl);
    assert.equal(close.host, "dotnet-desktop");
    assert.equal(close.status, "stopping");
    assert.equal(close.backendUrl, baseUrl);
    assert.deepEqual(launches, [{ backendUrl: baseUrl }]);
    assert.deepEqual(closes, [{ backendUrl: baseUrl }]);
  } finally {
    server.close();
  }
});

test("runs optional MAUI setup through the backend", async () => {
  const setups = [];
  const { server, baseUrl } = await startServer({
    setupMauiHost: async () => {
      setups.push({});
      return { host: "maui", status: "starting", command: "dotnet workload install maui" };
    },
    getMauiSetupStatus: async () => ({
      host: "maui",
      status: "idle",
      command: "dotnet workload install maui",
      lastOutput: ""
    })
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.setupMauiHost();
    const status = await api.getMauiSetupStatus();

    assert.equal(result.host, "maui");
    assert.equal(result.status, "starting");
    assert.equal(result.command, "dotnet workload install maui");
    assert.equal(status.status, "idle");
    assert.equal(setups.length, 1);
  } finally {
    server.close();
  }
});

test("serves dedicated runtime admin hosts", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const nodeAdmin = await fetch(`${baseUrl}/node-admin/`);
    const springAdmin = await fetch(`${baseUrl}/spring-admin/`);
    const pythonAdmin = await fetch(`${baseUrl}/python-admin/`);
    const aspNetAdmin = await fetch(`${baseUrl}/aspnet-admin/`);
    const runtimeScript = await fetch(`${baseUrl}/admin/runtime-admin.js`);

    assert.equal(nodeAdmin.status, 200);
    assert.match(await nodeAdmin.text(), /Node Admin/);
    assert.equal(springAdmin.status, 200);
    assert.match(await springAdmin.text(), /Spring Admin/);
    assert.equal(pythonAdmin.status, 200);
    assert.match(await pythonAdmin.text(), /Python Admin/);
    assert.equal(aspNetAdmin.status, 200);
    assert.match(await aspNetAdmin.text(), /ASP.NET Admin/);
    assert.equal(runtimeScript.status, 200);
    assert.match(await runtimeScript.text(), /runtimeCatalog/);
  } finally {
    server.close();
  }
});

test("reports and runs Spring backend setup through the backend", async () => {
  const setups = [];
  const { server, baseUrl } = await startServer({
    setupSpringBackend: async () => {
      setups.push({});
      return {
        host: "spring",
        status: "starting",
        command: "winget install Microsoft.OpenJDK.17 and Apache.Maven",
        java: "missing",
        maven: "missing",
        spring: "stopped",
        lastOutput: ""
      };
    },
    getSpringSetupStatus: async () => ({
      host: "spring",
      status: "idle",
      command: "winget install Microsoft.OpenJDK.17 and Apache.Maven",
      java: "missing",
      maven: "missing",
      spring: "stopped",
      lastOutput: ""
    })
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.setupSpringBackend();
    const status = await api.getSpringSetupStatus();

    assert.equal(result.host, "spring");
    assert.equal(result.status, "starting");
    assert.equal(status.maven, "missing");
    assert.equal(status.spring, "stopped");
    assert.equal(setups.length, 1);
  } finally {
    server.close();
  }
});

test("launches the Spring backend through a local runtime command", async () => {
  const launches = [];
  const closes = [];
  const { server, baseUrl } = await startServer({
    launchSpringBackend: async (input) => {
      launches.push(input);
      return { host: "spring-backend", status: "starting", backendUrl: input.backendUrl };
    },
    closeSpringBackend: async (input) => {
      closes.push(input);
      return { host: "spring-backend", status: "stopping", backendUrl: input.backendUrl };
    }
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.launchSpringBackend();
    const close = await api.closeSpringBackend();

    assert.equal(result.host, "spring-backend");
    assert.equal(result.status, "starting");
    assert.equal(result.backendUrl, "http://localhost:3200");
    assert.equal(close.host, "spring-backend");
    assert.equal(close.status, "stopping");
    assert.equal(close.backendUrl, "http://localhost:3200");
    assert.deepEqual(launches, [{ backendUrl: "http://localhost:3200" }]);
    assert.deepEqual(closes, [{ backendUrl: "http://localhost:3200" }]);
  } finally {
    server.close();
  }
});

test("launches the .NET MAUI host through a local runtime command", async () => {
  const launches = [];
  const closes = [];
  const { server, baseUrl } = await startServer({
    launchMauiHost: async (input) => {
      launches.push(input);
      return { host: "maui-desktop", status: "starting", backendUrl: input.backendUrl };
    },
    closeMauiHost: async (input) => {
      closes.push(input);
      return { host: "maui-desktop", status: "stopping", backendUrl: input.backendUrl };
    }
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.launchMauiHost();
    const close = await api.closeMauiHost();

    assert.equal(result.host, "maui-desktop");
    assert.equal(result.status, "starting");
    assert.equal(result.backendUrl, baseUrl);
    assert.equal(close.host, "maui-desktop");
    assert.equal(close.status, "stopping");
    assert.equal(close.backendUrl, baseUrl);
    assert.deepEqual(launches, [{ backendUrl: baseUrl }]);
    assert.deepEqual(closes, [{ backendUrl: baseUrl }]);
  } finally {
    server.close();
  }
});

test("electron launcher starts the desktop executable without a shell", async () => {
  const hostRoot = process.platform === "win32" ? "C:\\host" : "/tmp/host";
  const launches = [];
  let unrefCalled = false;
  const launcher = createElectronHostLauncher({
    hostRoot,
    fileExists: (filePath) => filePath.includes("electron"),
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: launches.length,
        once() {
          return undefined;
        },
        unref() {
          unrefCalled = true;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess)
  });

  const firstLaunch = await launcher({ backendUrl: "http://localhost:3000" });
  const secondLaunch = await launcher({ backendUrl: "http://localhost:3000" });

  assert.equal(firstLaunch.status, "starting");
  assert.equal(secondLaunch.status, "running");
  assert.equal(launches.length, 2);
  assert.match(launches[0].file, /electron(\.exe)?$/);
  assert.deepEqual(launches[0].args, ["."]);
  assert.equal(launches[0].options.shell, false);
  assert.equal(launches[0].options.windowsHide, false);
  assert.equal(launches[0].options.env.DZONE_BACKEND_URL, "http://localhost:3000");
  assert.match(launches[1].file, /electron(\.exe)?$/);
  assert.deepEqual(launches[1].args, ["."]);
  assert.equal(unrefCalled, true);
});

test("electron launcher relaunches when the previous desktop process closed", async () => {
  const launches = [];
  const runningStates = [false];
  const launcher = createElectronHostLauncher({
    hostRoot: process.platform === "win32" ? "C:\\host" : "/tmp/host",
    fileExists: () => true,
    spawnProcess: () => {
      launches.push({});
      return {
        exitCode: null,
        signalCode: null,
        once() {
          return undefined;
        },
        unref() {
          return undefined;
        }
      };
    },
    isProcessRunning: () => runningStates.shift() ?? false
  });

  const firstLaunch = await launcher({ backendUrl: "http://localhost:3000" });
  const secondLaunch = await launcher({ backendUrl: "http://localhost:3000" });

  assert.equal(firstLaunch.status, "starting");
  assert.equal(secondLaunch.status, "starting");
  assert.equal(launches.length, 2);
});

test("electron controller stops a running desktop process", async () => {
  const stops = [];
  const controller = createElectronHostController({
    hostRoot: process.platform === "win32" ? "C:\\host" : "/tmp/host",
    fileExists: () => true,
    spawnProcess: () => ({
      exitCode: null,
      signalCode: null,
      pid: 123,
      once() {
        return undefined;
      },
      unref() {
        return undefined;
      }
    }),
    isProcessRunning: (childProcess) => Boolean(childProcess),
    stopProcess: (childProcess) => {
      stops.push(childProcess.pid);
    }
  });

  const launch = await controller.launchElectronHost({ backendUrl: "http://localhost:3000" });
  const close = await controller.closeElectronHost({ backendUrl: "http://localhost:3000" });
  const secondClose = await controller.closeElectronHost({ backendUrl: "http://localhost:3000" });

  assert.equal(launch.status, "starting");
  assert.equal(close.status, "stopping");
  assert.equal(secondClose.status, "stopped");
  assert.deepEqual(stops, [123]);
});

test("dotnet desktop controller starts and stops the desktop host", async () => {
  const launches = [];
  const stops = [];
  const controller = createDotnetDesktopHostController({
    hostRoot: process.platform === "win32" ? "C:\\host" : "/tmp/host",
    fileExists: () => false,
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 456,
        once() {
          return undefined;
        },
        unref() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess),
    stopProcess: (childProcess) => {
      stops.push(childProcess.pid);
    }
  });

  const launch = await controller.launchDotnetDesktopHost({ backendUrl: "http://localhost:3000" });
  const close = await controller.closeDotnetDesktopHost({ backendUrl: "http://localhost:3000" });
  const secondClose = await controller.closeDotnetDesktopHost({ backendUrl: "http://localhost:3000" });

  assert.equal(launch.status, "starting");
  assert.equal(close.status, "stopping");
  assert.equal(secondClose.status, "stopped");
  assert.equal(launches[0].file, "dotnet");
  assert.deepEqual(launches[0].args, ["run", "--project", "DzoneDotnetDesktopHost.csproj", "--no-launch-profile"]);
  assert.equal(launches[0].options.windowsHide, true);
  assert.deepEqual(stops, [456]);
});

test("MAUI host controller starts and stops the desktop host", async () => {
  const launches = [];
  const stops = [];
  const controller = createMauiHostController({
    hostRoot: process.platform === "win32" ? "C:\\host" : "/tmp/host",
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 654,
        once() {
          return undefined;
        },
        unref() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess),
    stopProcess: (childProcess) => {
      stops.push(childProcess.pid);
    }
  });

  const launch = await controller.launchMauiHost({ backendUrl: "http://localhost:3000" });
  const secondLaunch = await controller.launchMauiHost({ backendUrl: "http://localhost:3000" });
  const close = await controller.closeMauiHost({ backendUrl: "http://localhost:3000" });
  const secondClose = await controller.closeMauiHost({ backendUrl: "http://localhost:3000" });

  assert.equal(launch.status, "starting");
  assert.equal(secondLaunch.status, "running");
  assert.equal(close.status, "stopping");
  assert.equal(secondClose.status, "stopped");
  assert.equal(launches[0].file, "dotnet");
  assert.deepEqual(launches[0].args, ["run", "--project", "DzoneMauiHost.csproj", "-f", "net10.0-windows10.0.19041.0", "--no-launch-profile"]);
  assert.equal(launches[0].options.windowsHide, true);
  assert.equal(launches.length, 1);
  assert.deepEqual(stops, [654]);
});

test("MAUI setup runner starts the installer once in the background", async () => {
  const setupRoot = await mkdtemp(join(tmpdir(), "dzone-maui-setup-"));
  const launches = [];
  const runner = createMauiSetupRunner({
    scriptPath: join(setupRoot, "install-maui-workload.ps1"),
    workingDirectory: setupRoot,
    logPath: join(setupRoot, "maui-setup.log"),
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 789,
        once() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess)
  });

  try {
    const firstSetup = await runner();
    const secondSetup = await runner();
    const status = await runner.status();

    assert.equal(firstSetup.status, "starting");
    assert.equal(secondSetup.status, "running");
    assert.equal(status.status, "running");
    assert.equal(launches.length, 1);
    assert.match(launches[0].file, process.platform === "win32" ? /powershell\.exe$/ : /pwsh$/);
    assert.deepEqual(launches[0].args.slice(0, 3), ["-NoProfile", "-ExecutionPolicy", "Bypass"]);
    assert.equal(launches[0].args[3], "-File");
    assert.match(launches[0].args[4], /install-maui-workload\.ps1$/);
    assert.equal(launches[0].options.detached, false);
    assert.equal(launches[0].options.shell, false);
    assert.deepEqual(launches[0].options.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(launches[0].options.windowsHide, true);
  } finally {
    await rm(setupRoot, { recursive: true, force: true });
  }
});

test("launches the ASP.NET Core backend through a local runtime command", async () => {
  const launches = [];
  const closes = [];
  const { server, baseUrl } = await startServer({
    launchAspNetCoreBackend: async (input) => {
      launches.push(input);
      return { host: "aspnet-core-backend", status: "starting", backendUrl: input.backendUrl };
    },
    closeAspNetCoreBackend: async (input) => {
      closes.push(input);
      return { host: "aspnet-core-backend", status: "stopping", backendUrl: input.backendUrl };
    }
  });
  const api = createPlatformApi({ baseUrl });

  try {
    const result = await api.launchAspNetCoreBackend();
    const close = await api.closeAspNetCoreBackend();

    assert.equal(result.host, "aspnet-core-backend");
    assert.equal(result.status, "starting");
    assert.equal(result.backendUrl, "http://localhost:3300");
    assert.equal(close.host, "aspnet-core-backend");
    assert.equal(close.status, "stopping");
    assert.equal(close.backendUrl, "http://localhost:3300");
    assert.deepEqual(launches, [{ backendUrl: "http://localhost:3300" }]);
    assert.deepEqual(closes, [{ backendUrl: "http://localhost:3300" }]);
  } finally {
    server.close();
  }
});

test("Spring setup runner reports tool state and starts installer once", async () => {
  const setupRoot = await mkdtemp(join(tmpdir(), "dzone-spring-setup-"));
  const launches = [];
  const runner = createSpringSetupRunner({
    scriptPath: join(setupRoot, "install-spring-tooling.ps1"),
    workingDirectory: setupRoot,
    logPath: join(setupRoot, "spring-setup.log"),
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 987,
        once() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess),
    checkCommand: async (name) => (name === "mvn" ? "missing" : "installed"),
    checkSpringRuntime: async () => "stopped"
  });

  try {
    const firstSetup = await runner();
    const secondSetup = await runner();
    const status = await runner.status();

    assert.equal(firstSetup.status, "starting");
    assert.equal(secondSetup.status, "running");
    assert.equal(status.java, "installed");
    assert.equal(status.maven, "missing");
    assert.equal(status.spring, "stopped");
    assert.equal(launches.length, 1);
    assert.match(launches[0].file, process.platform === "win32" ? /powershell\.exe$/ : /pwsh$/);
    assert.deepEqual(launches[0].args.slice(0, 3), ["-NoProfile", "-ExecutionPolicy", "Bypass"]);
    assert.equal(launches[0].args[3], "-File");
    assert.match(launches[0].args[4], /install-spring-tooling\.ps1$/);
    assert.equal(launches[0].options.detached, false);
    assert.equal(launches[0].options.shell, false);
    assert.deepEqual(launches[0].options.stdio, ["ignore", "pipe", "pipe"]);
    assert.equal(launches[0].options.windowsHide, true);
  } finally {
    await rm(setupRoot, { recursive: true, force: true });
  }
});

test("Spring backend controller starts and stops Maven runtime", async () => {
  const launches = [];
  const stops = [];
  const controller = createSpringBackendController({
    workingDirectory: process.platform === "win32" ? "C:\\repo" : "/tmp/repo",
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 321,
        once() {
          return undefined;
        },
        unref() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess),
    stopProcess: (childProcess) => {
      stops.push(childProcess.pid);
    },
    checkSpringRuntime: async () => "stopped"
  });

  const launch = await controller.launchSpringBackend({ backendUrl: "http://localhost:3200" });
  const secondLaunch = await controller.launchSpringBackend({ backendUrl: "http://localhost:3200" });
  const close = await controller.closeSpringBackend({ backendUrl: "http://localhost:3200" });
  const secondClose = await controller.closeSpringBackend({ backendUrl: "http://localhost:3200" });

  assert.equal(launch.status, "starting");
  assert.equal(secondLaunch.status, "running");
  assert.equal(close.status, "stopping");
  assert.equal(secondClose.status, "stopped");
  assert.equal(launches.length, 1);
  assert.equal(launches[0].options.env.SERVER_PORT, "3200");
  assert.equal(launches[0].options.windowsHide, process.platform === "win32");
  assert.deepEqual(stops, [321]);
});

test("ASP.NET Core backend controller starts and stops dotnet runtime", async () => {
  const launches = [];
  const stops = [];
  const controller = createAspNetCoreBackendController({
    workingDirectory: process.platform === "win32" ? "C:\\repo\\apps\\backends\\aspnet-core" : "/tmp/repo/apps/backends/aspnet-core",
    spawnProcess: (file, args, options) => {
      launches.push({ file, args, options });
      return {
        exitCode: null,
        signalCode: null,
        pid: 331,
        once() {
          return undefined;
        },
        unref() {
          return undefined;
        }
      };
    },
    isProcessRunning: (childProcess) => Boolean(childProcess),
    stopProcess: (childProcess) => {
      stops.push(childProcess.pid);
    },
    checkAspNetCoreRuntime: async () => "stopped"
  });

  const launch = await controller.launchAspNetCoreBackend({ backendUrl: "http://localhost:3300" });
  const secondLaunch = await controller.launchAspNetCoreBackend({ backendUrl: "http://localhost:3300" });
  const close = await controller.closeAspNetCoreBackend({ backendUrl: "http://localhost:3300" });
  const secondClose = await controller.closeAspNetCoreBackend({ backendUrl: "http://localhost:3300" });

  assert.equal(launch.status, "starting");
  assert.equal(secondLaunch.status, "running");
  assert.equal(close.status, "stopping");
  assert.equal(secondClose.status, "stopped");
  assert.equal(launches.length, 1);
  assert.equal(launches[0].file, "dotnet");
  assert.deepEqual(launches[0].args, ["run", "--project", "DzoneAspNetCoreBackend.csproj", "--urls", "http://127.0.0.1:3300"]);
  assert.equal(launches[0].options.env.ASPNETCORE_URLS, "http://127.0.0.1:3300");
  assert.equal(launches[0].options.windowsHide, true);
  assert.deepEqual(stops, [331]);
});

async function startServer(options) {
  const server = createServer(undefined, options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    assert.fail(`${response.status} ${await response.text()}`);
  }
  return response.json();
}
