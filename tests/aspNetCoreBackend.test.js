import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { createPlatformApi } from "../apps/hosts/shared/public/apiClient.js";

const hasDotnet = await commandExists("dotnet");

test("ASP.NET Core backend supports the shared contract flow", { skip: !hasDotnet }, async () => {
  const fileRoot = await mkdtemp(join(tmpdir(), "dzone-aspnet-files-"));
  const port = await freePort();
  const backend = await startAspNetCoreBackend(port, fileRoot);
  const api = createPlatformApi({ baseUrl: backend.baseUrl });

  try {
    const health = await api.getHealth();
    assert.equal(health.runtime, "aspnet-core");

    const admin = await fetch(backend.baseUrl);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /Central Admin Console/);

    const aspNetAdmin = await fetch(`${backend.baseUrl}/aspnet-admin/`);
    assert.equal(aspNetAdmin.status, 200);
    assert.match(await aspNetAdmin.text(), /ASP.NET Admin/);

    const workspace = await api.createWorkspace({ name: "ASP.NET Workspace" });
    const fetchedWorkspace = await api.getWorkspace(workspace.id);
    const document = await api.createDocument({
      workspaceId: workspace.id,
      title: "ASP.NET Document",
      tags: ["aspnet", "backend"]
    });
    const fetchedDocument = await api.getDocument(document.id);
    const updatedDocument = await api.updateDocument(document.id, {
      status: "review"
    });
    const upload = await api.uploadDocumentFile(
      document.id,
      new File(["aspnet file"], "aspnet.txt", { type: "text/plain" })
    );
    const job = await api.processDocument(document.id, { type: "summarize" });
    const fetchedJob = await api.getJob(job.id);
    const documents = await api.listDocuments(workspace.id);
    const jobs = await api.listJobs();
    const preflight = await fetch(`${backend.baseUrl}/documents/${document.id}/file`, {
      method: "OPTIONS",
      headers: {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-file-name"
      }
    });

    assert.equal(fetchedWorkspace.id, workspace.id);
    assert.equal(fetchedDocument.id, document.id);
    assert.equal(updatedDocument.status, "review");
    assert.equal(upload.document.fileName, "aspnet.txt");
    assert.equal(upload.job.type, "extract-text");
    assert.equal(job.type, "summarize");
    assert.equal(fetchedJob.id, job.id);
    assert.equal(documents.length, 1);
    assert.equal(jobs.length, 2);
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

    await api.deleteDocument(document.id);
    assert.deepEqual(await api.listDocuments(workspace.id), []);
  } finally {
    await backend.stop();
    await rm(fileRoot, { recursive: true, force: true });
  }
});

async function startAspNetCoreBackend(port, fileRoot) {
  const backendProcess = spawn(
    "dotnet",
    [
      "run",
      "--project",
      "apps/backends/aspnet-core/DzoneAspNetCoreBackend.csproj",
      "--urls",
      `http://127.0.0.1:${port}`
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        DZONE_FILE_STORAGE_PATH: fileRoot
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let output = "";
  backendProcess.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  backendProcess.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(baseUrl, () => output);

  return {
    baseUrl,
    stop() {
      return stopProcessTree(backendProcess);
    }
  };
}

async function waitForHealth(baseUrl, readOutput) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until dotnet restores, builds, and starts Kestrel.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`ASP.NET Core backend did not start. ${readOutput()}`);
}

function commandExists(command) {
  return new Promise((resolve) => {
    const child = process.platform === "win32"
      ? spawn("where.exe", [command], { stdio: "ignore" })
      : spawn("sh", ["-lc", `command -v ${command}`], { stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function stopProcessTree(processToStop) {
  return new Promise((resolve) => {
    if (!processToStop.pid || processToStop.exitCode !== null) {
      resolve();
      return;
    }

    processToStop.once("exit", resolve);
    if (process.platform === "win32") {
      const killer = spawn("taskkill", ["/pid", String(processToStop.pid), "/t", "/f"], {
        stdio: "ignore"
      });
      killer.once("error", () => {
        processToStop.kill();
      });
      return;
    }
    processToStop.kill();
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}
