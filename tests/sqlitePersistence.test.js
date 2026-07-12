import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { createSqlitePlatform } from "../packages/platform/src/index.js";

test("persists workspaces, documents, and jobs across platform instances", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "dzone-platform-"));
  const databasePath = join(tempDir, "platform.sqlite");

  try {
    const firstPlatform = createSqlitePlatform({ databasePath });
    const firstService = firstPlatform.services.documents;
    const workspace = await firstService.createWorkspace({ name: "Persistent Workspace" });
    const document = await firstService.createDocument({
      workspaceId: workspace.id,
      title: "Persistent Document",
      tags: ["sqlite", "contract"]
    });
    const job = await firstService.processDocument(document.id, "index-search");
    firstPlatform.close();

    const secondPlatform = createSqlitePlatform({ databasePath });
    const secondService = secondPlatform.services.documents;
    const workspaces = await secondService.listWorkspaces();
    const documents = await secondService.listDocuments(workspace.id);
    const jobs = await secondService.listJobs(document.id);

    assert.equal(workspaces[0].name, "Persistent Workspace");
    assert.equal(documents[0].title, "Persistent Document");
    assert.deepEqual(documents[0].tags, ["sqlite", "contract"]);
    assert.equal(jobs[0].id, job.id);
    secondPlatform.close();
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
