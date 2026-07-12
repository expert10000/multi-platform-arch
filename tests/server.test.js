import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "../apps/node-backend/src/server.js";

test("serves the local web host from the backend root", async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await fetch(baseUrl);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(html, /Workspace Operations/);
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

async function startServer() {
  const server = createServer();
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
