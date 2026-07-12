import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("web app keeps HTTP calls inside the API client", async () => {
  const appSource = await readFile(new URL("../apps/hosts/web/public/app.js", import.meta.url), "utf8");
  const clientSource = await readFile(new URL("../apps/hosts/web/public/apiClient.js", import.meta.url), "utf8");

  assert.equal(appSource.includes("fetch("), false);
  assert.equal(clientSource.includes("fetch("), true);
});

test("platform architecture panel exposes clickable sections", async () => {
  const html = await readFile(new URL("../apps/hosts/web/public/index.html", import.meta.url), "utf8");
  const appSource = await readFile(new URL("../apps/hosts/web/public/app.js", import.meta.url), "utf8");
  const expectedSections = ["models", "contracts", "services", "hosts", "backends", "workers"];

  for (const section of expectedSections) {
    assert.match(html, new RegExp(`data-architecture-section="${section}"`));
    assert.match(appSource, new RegExp(`${section}:`));
  }

  assert.match(appSource, /renderArchitecture/);
});
