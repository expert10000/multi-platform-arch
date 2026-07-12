import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web app keeps HTTP calls inside the API client", async () => {
  const appSource = await readFile(new URL("../apps/web/public/app.js", import.meta.url), "utf8");
  const clientSource = await readFile(new URL("../apps/web/public/apiClient.js", import.meta.url), "utf8");

  assert.equal(appSource.includes("fetch("), false);
  assert.equal(clientSource.includes("fetch("), true);
});
