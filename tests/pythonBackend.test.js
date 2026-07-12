import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPlatformApi } from "../apps/hosts/web/public/apiClient.js";

test("python backend supports the shared contract flow", async () => {
  const fileRoot = await mkdtemp(join(tmpdir(), "dzone-python-files-"));
  const backend = await startPythonBackend(fileRoot);
  const api = createPlatformApi({ baseUrl: backend.baseUrl });

  try {
    const health = await api.getHealth();
    assert.equal(health.runtime, "python");

    const workspace = await api.createWorkspace({ name: "Python Workspace" });
    const fetchedWorkspace = await api.getWorkspace(workspace.id);
    const document = await api.createDocument({
      workspaceId: workspace.id,
      title: "Python Document",
      tags: ["python", "backend"]
    });
    const fetchedDocument = await api.getDocument(document.id);
    const updatedDocument = await api.updateDocument(document.id, {
      status: "review"
    });
    const upload = await api.uploadDocumentFile(
      document.id,
      new File(["python file"], "python.txt", { type: "text/plain" })
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
    assert.equal(upload.document.fileName, "python.txt");
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

async function startPythonBackend(fileRoot) {
  const process = spawn(
    "python",
    ["apps/backends/python/app.py", "--port", "0", "--file-root", fileRoot],
    {
      cwd: new URL("..", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  let stderr = "";
  process.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Python backend did not start. ${stderr}`));
    }, 10000);

    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Python backend exited with ${code}. ${stderr}`));
    });

    process.stdout.once("data", (chunk) => {
      clearTimeout(timeout);
      const started = JSON.parse(chunk.toString());
      resolve(started.url);
    });
  });

  return {
    baseUrl,
    stop() {
      return new Promise((resolve) => {
        process.once("exit", resolve);
        process.kill();
      });
    }
  };
}
