import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform, NotFoundError, ValidationError } from "../packages/platform/src/index.js";

test("creates workspaces and documents through the shared service", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;

  const workspace = await service.createWorkspace({
    name: "Knowledge Base",
    description: "Shared document workspace"
  });
  const document = await service.createDocument({
    workspaceId: workspace.id,
    title: "Runtime-independent architecture",
    tags: ["architecture", "contracts", "architecture"]
  });

  assert.equal(document.status, "draft");
  assert.deepEqual(document.tags, ["architecture", "contracts"]);
  assert.equal((await service.listDocuments(workspace.id)).length, 1);
});

test("updates documents without changing persistence details", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;
  const workspace = await service.createWorkspace({ name: "Docs" });
  const document = await service.createDocument({
    workspaceId: workspace.id,
    title: "Draft"
  });

  const updated = await service.updateDocument(document.id, {
    title: "Ready for Review",
    status: "review"
  });

  assert.equal(updated.title, "Ready for Review");
  assert.equal(updated.status, "review");
  assert.notEqual(updated.updatedAt, document.updatedAt);
});

test("queues processing jobs through the worker protocol", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;
  const workspace = await service.createWorkspace({ name: "Docs" });
  const document = await service.createDocument({
    workspaceId: workspace.id,
    title: "Extract me"
  });

  const job = await service.processDocument(document.id, "summarize");
  const pending = await platform.workerQueue.pending();

  assert.equal(job.status, "queued");
  assert.equal(job.type, "summarize");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].id, job.id);
});

test("validates document status and missing records", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;
  const workspace = await service.createWorkspace({ name: "Docs" });

  await assert.rejects(
    () =>
      service.createDocument({
        workspaceId: workspace.id,
        title: "Bad status",
        status: "published"
      }),
    ValidationError
  );

  await assert.rejects(() => service.getDocument("document_missing"), NotFoundError);
});
