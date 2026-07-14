import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const hasPowershell = await commandExists("powershell");

test("fresh clone setup scripts are exposed and documented", async () => {
  const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  const setupScript = await readFile(new URL("../scripts/setup-local.ps1", import.meta.url), "utf8");
  const checkScript = await readFile(new URL("../scripts/check-local-prerequisites.ps1", import.meta.url), "utf8");
  const pythonInstaller = await readFile(new URL("../scripts/install-python-tooling.ps1", import.meta.url), "utf8");
  const dotnetInstaller = await readFile(new URL("../scripts/install-dotnet-tooling.ps1", import.meta.url), "utf8");
  const electronInstaller = await readFile(new URL("../scripts/install-electron-deps.ps1", import.meta.url), "utf8");

  assert.match(packageSource, /check:local/);
  assert.match(packageSource, /setup:local/);
  assert.match(packageSource, /setup:tool:python/);
  assert.match(packageSource, /setup:tool:dotnet/);
  assert.match(packageSource, /setup:host:electron/);
  assert.match(readme, /Fresh Clone Setup/);
  assert.match(readme, /Node\.js LTS through `winget`/);
  assert.match(readme, /Maven through `winget`, with an official Apache Maven archive fallback/);
  assert.match(setupScript, /OpenJS\.NodeJS\.LTS/);
  assert.match(setupScript, /Python\.Python\.3\.11/);
  assert.match(setupScript, /Microsoft\.DotNet\.SDK\.10/);
  assert.match(setupScript, /install-spring-tooling\.ps1/);
  assert.match(setupScript, /install-maui-workload\.ps1/);
  assert.match(checkScript, /electronDependencies/);
  assert.match(checkScript, /mauiWorkload/);
  assert.match(pythonInstaller, /Python\.Python\.3\.11/);
  assert.match(pythonInstaller, /CheckOnly/);
  assert.match(dotnetInstaller, /Microsoft\.DotNet\.SDK\.10/);
  assert.match(dotnetInstaller, /CheckOnly/);
  assert.match(electronInstaller, /npm --prefix/);
  assert.match(electronInstaller, /ElectronDependencies/);
  assert.match(electronInstaller, /CheckOnly/);
});

test("local prerequisite checker reports every installer surface", { skip: !hasPowershell }, async () => {
  const output = await runPowershellScript("scripts/check-local-prerequisites.ps1");

  for (const key of [
    "winget",
    "node",
    "npm",
    "python",
    "dotnet",
    "java",
    "maven",
    "electronDependencies",
    "mauiWorkload"
  ]) {
    assert.match(output, new RegExp(`^${key}: `, "m"));
  }
});

function commandExists(command) {
  return new Promise((resolve) => {
    const child = spawn(process.platform === "win32" ? "where.exe" : "sh", process.platform === "win32" ? [command] : ["-lc", `command -v ${command}`], {
      stdio: "ignore"
    });
    child.once("error", () => resolve(false));
    child.once("exit", (code) => resolve(code === 0));
  });
}

function runPowershellScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      cwd: new URL("..", import.meta.url),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(stderr || stdout));
    });
  });
}
