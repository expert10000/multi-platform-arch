import assert from "node:assert/strict";
import test from "node:test";
import { createPlatform, JobWorker } from "../packages/platform/src/index.js";

test("worker moves a queued job through running to completed", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;
  const workspace = await service.createWorkspace({ name: "Worker Workspace" });
  const document = await service.createDocument({
    workspaceId: workspace.id,
    title: "Worker Document"
  });
  const job = await service.processDocument(document.id, "extract-text");

  let releaseHandler;
  let markHandlerStarted;
  const handlerStarted = new Promise((resolve) => {
    markHandlerStarted = resolve;
  });
  const worker = new JobWorker({
    jobs: platform.repositories.jobs,
    handlers: {
      "extract-text": async () => {
        markHandlerStarted();
        await new Promise((release) => {
          releaseHandler = release;
        });
      }
    }
  });
  const runPromise = worker.runNext();

  await handlerStarted;
  assert.equal((await service.getJob(job.id)).status, "running");

  releaseHandler();
  const completedJob = await runPromise;

  assert.equal(completedJob.status, "completed");
  assert.equal((await service.getJob(job.id)).status, "completed");
});

test("worker marks a job failed when its handler fails", async () => {
  const platform = createPlatform();
  const service = platform.services.documents;
  const workspace = await service.createWorkspace({ name: "Worker Workspace" });
  const document = await service.createDocument({
    workspaceId: workspace.id,
    title: "Worker Failure"
  });
  const job = await service.processDocument(document.id, "summarize");
  const worker = new JobWorker({
    jobs: platform.repositories.jobs,
    handlers: {
      summarize: async () => {
        throw new Error("summary failed");
      }
    }
  });

  const failedJob = await worker.runNext();

  assert.equal(failedJob.status, "failed");
  assert.equal((await service.getJob(job.id)).status, "failed");
});
