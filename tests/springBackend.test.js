import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import test from "node:test";
import { createPlatformApi } from "../apps/hosts/shared/public/apiClient.js";

const hasMaven = await commandExists("mvn");

test("spring backend supports the shared contract flow", { skip: !hasMaven }, async () => {
  const fileRoot = await mkdtemp(join(tmpdir(), "dzone-spring-files-"));
  const port = await freePort();
  const backend = await startSpringBackend(port, fileRoot);
  const api = createPlatformApi({ baseUrl: backend.baseUrl });

  try {
    const health = await api.getHealth();
    assert.equal(health.runtime, "spring-boot");

    const admin = await fetch(backend.baseUrl);
    assert.equal(admin.status, 200);
    assert.match(await admin.text(), /Central Admin Console/);

    const springAdmin = await fetch(`${backend.baseUrl}/spring-admin/`);
    assert.equal(springAdmin.status, 200);
    assert.match(await springAdmin.text(), /Spring Admin/);

    const documentWorkerAdmin = await fetch(`${backend.baseUrl}/document-worker-admin/`);
    assert.equal(documentWorkerAdmin.status, 200);
    assert.match(await documentWorkerAdmin.text(), /Document Worker Admin/);

    const workspace = await api.createWorkspace({ name: "Spring Workspace" });
    const document = await api.createDocument({
      workspaceId: workspace.id,
      title: "Spring Document",
      tags: ["spring", "backend"]
    });
    const updatedDocument = await api.updateDocument(document.id, {
      status: "review"
    });
    const upload = await api.uploadDocumentFile(
      document.id,
      new File(["spring file"], "spring.txt", { type: "text/plain" })
    );
    const job = await api.processDocument(document.id, { type: "summarize" });
    const documents = await api.listDocuments(workspace.id);
    const jobs = await api.listJobs();

    assert.equal(updatedDocument.status, "review");
    assert.equal(upload.document.fileName, "spring.txt");
    assert.equal(upload.job.type, "extract-text");
    assert.equal(job.type, "summarize");
    assert.equal(documents.length, 1);
    assert.equal(jobs.length, 2);

    await api.deleteDocument(document.id);
    assert.deepEqual(await api.listDocuments(workspace.id), []);
  } finally {
    await backend.stop();
    await rm(fileRoot, { recursive: true, force: true });
  }
});

async function startSpringBackend(port, fileRoot) {
  const backendProcess = spawn(
    mavenExecutable(),
    mavenArgs(["-f", "apps/backends/spring/pom.xml", "spring-boot:run"]),
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        SERVER_PORT: String(port),
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
      // Keep polling until Spring finishes downloading dependencies and starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
  throw new Error(`Spring backend did not start. ${readOutput()}`);
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

function mavenExecutable() {
  return process.platform === "win32" ? "cmd.exe" : "mvn";
}

function mavenArgs(args) {
  return process.platform === "win32"
    ? ["/d", "/s", "/c", ["mvn", ...args].join(" ")]
    : args;
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
