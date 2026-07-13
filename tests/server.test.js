import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createElectronHostController,
  createElectronHostLauncher,
  createServer
} from "../apps/backends/node/src/server.js";
import { createPlatformApi } from "../apps/hosts/shared/public/apiClient.js";

test("serves the central admin host from the backend root", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
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
