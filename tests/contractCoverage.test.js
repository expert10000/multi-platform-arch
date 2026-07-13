import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createServer } from "../apps/backends/node/src/server.js";
import {
  apiOperations,
  createPlatformApi
} from "../apps/hosts/shared/public/apiClient.js";

test("browser API client exposes every OpenAPI operation", async () => {
  const contractOperations = await readOpenApiOperations();
  assert.deepEqual(
    Object.keys(apiOperations).sort(),
    contractOperations.map((operation) => operation.operationId).sort()
  );

  for (const operation of contractOperations) {
    assert.equal(
      apiOperations[operation.operationId],
      `${operation.method.toUpperCase()} ${operation.path}`
    );
  }
});

test("backend covers every OpenAPI operation", async () => {
  const fileStorageRoot = await mkdtemp(join(tmpdir(), "dzone-contract-files-"));
  const { server, baseUrl } = await startServer({ fileStorageRoot });
  const api = createPlatformApi({ baseUrl });
  const coveredOperations = new Set();

  try {
    const health = await api.getHealth();
    coveredOperations.add("getHealth");
    assert.equal(health.ok, true);

    const launch = await api.launchElectronHost();
    coveredOperations.add("launchElectronHost");
    assert.equal(launch.host, "electron");

    const initialWorkspaces = await api.listWorkspaces();
    coveredOperations.add("listWorkspaces");
    assert.deepEqual(initialWorkspaces, []);

    const workspace = await api.createWorkspace({
      name: "Contract Workspace",
      description: "Route coverage"
    });
    coveredOperations.add("createWorkspace");

    const fetchedWorkspace = await api.getWorkspace(workspace.id);
    coveredOperations.add("getWorkspace");
    assert.equal(fetchedWorkspace.id, workspace.id);

    const initialDocuments = await api.listDocuments(workspace.id);
    coveredOperations.add("listDocuments");
    assert.deepEqual(initialDocuments, []);

    const document = await api.createDocument({
      workspaceId: workspace.id,
      title: "Contract Document",
      status: "draft",
      tags: ["openapi", "coverage"]
    });
    coveredOperations.add("createDocument");

    const fetchedDocument = await api.getDocument(document.id);
    coveredOperations.add("getDocument");
    assert.equal(fetchedDocument.id, document.id);

    const updatedDocument = await api.updateDocument(document.id, {
      status: "review"
    });
    coveredOperations.add("updateDocument");
    assert.equal(updatedDocument.status, "review");

    const upload = await api.uploadDocumentFile(
      document.id,
      new File(["contract file"], "contract.txt", { type: "text/plain" })
    );
    coveredOperations.add("uploadDocumentFile");
    assert.equal(upload.document.fileName, "contract.txt");
    assert.equal(upload.job.documentId, document.id);

    const job = await api.processDocument(document.id, {
      type: "extract-text"
    });
    coveredOperations.add("processDocument");

    const allJobs = await api.listJobs();
    coveredOperations.add("listJobs");
    assert.equal(allJobs.length, 2);

    const fetchedJob = await api.getJob(job.id);
    coveredOperations.add("getJob");
    assert.equal(fetchedJob.id, job.id);

    await api.deleteDocument(document.id);
    coveredOperations.add("deleteDocument");

    const contractOperations = await readOpenApiOperations();
    assert.deepEqual(
      [...coveredOperations].sort(),
      contractOperations.map((operation) => operation.operationId).sort()
    );
  } finally {
    server.close();
    await rm(fileStorageRoot, { recursive: true, force: true });
  }
});

async function readOpenApiOperations() {
  const openApi = await readFile(new URL("../contracts/openapi.yaml", import.meta.url), "utf8");
  const operations = [];
  let inPaths = false;
  let currentPath = null;
  let currentMethod = null;

  for (const line of openApi.split(/\r?\n/)) {
    if (line === "paths:") {
      inPaths = true;
      continue;
    }
    if (line === "components:") {
      break;
    }
    if (!inPaths) {
      continue;
    }

    const pathMatch = line.match(/^  (\/[^:]+):$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = null;
      continue;
    }

    const methodMatch = line.match(/^    (get|post|put|delete):$/);
    if (methodMatch) {
      currentMethod = methodMatch[1];
      continue;
    }

    const operationMatch = line.match(/^      operationId: ([A-Za-z0-9_]+)$/);
    if (operationMatch && currentPath && currentMethod) {
      operations.push({
        path: currentPath,
        method: currentMethod,
        operationId: operationMatch[1]
      });
    }
  }

  return operations;
}

async function startServer(options) {
  const server = createServer(undefined, {
    ...options,
    launchElectronHost: async ({ backendUrl }) => ({
      host: "electron",
      status: "starting",
      backendUrl
    })
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}
