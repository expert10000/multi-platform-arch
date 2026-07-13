import { createPlatformApi } from "/shared/apiClient.js";

const runtime = document.body.dataset.runtimeAdmin;
const runtimeName = document.body.dataset.runtimeName;
const backendUrl = document.body.dataset.backendUrl;
const api = createPlatformApi({ baseUrl: backendUrl });

const elements = {
  title: document.querySelector("#runtimeTitle"),
  badge: document.querySelector("#runtimeBadge"),
  grid: document.querySelector("#runtimeAdminGrid"),
  toast: document.querySelector("#toast")
};

const runtimeCatalog = {
  node: {
    expectedRuntime: "node",
    facts: [
      ["Port", "3000"],
      ["Storage", "SQLite metadata"],
      ["Files", "data/files"],
      ["Workers", "Local document worker"],
      ["Host controls", "Electron, .NET Desktop, MAUI, Spring"]
    ],
    functions: ["OpenAPI routes", "Static central/web hosts", "Desktop launch endpoints", "Spring installer and launcher", "SQLite persistence"]
  },
  spring: {
    expectedRuntime: "spring-boot",
    facts: [
      ["Port", "3200"],
      ["Storage", "In-memory metadata"],
      ["Files", "data/spring-files"],
      ["Workers", "Scheduled document worker"],
      ["Tooling", "Java 17 and Maven"]
    ],
    functions: ["OpenAPI routes", "Spring-served admin/web hosts", "Upload handling", "Job lifecycle", "JVM runtime surface"]
  },
  aspnet: {
    expectedRuntime: "aspnet-core",
    facts: [
      ["Port", "3300"],
      ["Storage", "In-memory metadata"],
      ["Files", "data/aspnet-files"],
      ["Workers", "Hosted background worker"],
      ["Tooling", ".NET SDK"]
    ],
    functions: ["OpenAPI routes", "ASP.NET-served admin/web hosts", "Upload handling", "Job lifecycle", ".NET runtime surface"]
  },
  python: {
    expectedRuntime: "python",
    facts: [
      ["Port", "3100"],
      ["Storage", "In-memory metadata"],
      ["Files", "data/python-files"],
      ["Workers", "Queued job API"],
      ["Tooling", "Python standard library"]
    ],
    functions: ["OpenAPI routes", "Dependency-free HTTP runtime", "Upload handling", "Document metadata", "Python worker extension point"]
  }
};

await refresh();

async function refresh() {
  const catalog = runtimeCatalog[runtime];
  elements.title.textContent = runtimeName;

  const health = await api.getHealth().catch(() => null);
  const [workspaces, jobs, setup] = health
    ? await Promise.all([
        api.listWorkspaces().catch(() => []),
        api.listJobs().catch(() => []),
        runtime === "spring" ? api.getSpringSetupStatus().catch(() => null) : Promise.resolve(null)
      ])
    : [[], [], null];

  const online = health?.ok && health.runtime === catalog.expectedRuntime;
  elements.badge.className = `runtime-badge ${online ? "running" : "stopped"}`;
  elements.badge.textContent = online ? "Running" : "Stopped";

  elements.grid.replaceChildren(
    statusCard(health, online),
    metricsCard(workspaces, jobs),
    factsCard(catalog.facts, setup),
    functionsCard(catalog.functions),
    actionsCard()
  );
}

function statusCard(health, online) {
  return card("Runtime", [
    line("Status", online ? "Online" : "Unavailable"),
    line("Runtime", health?.runtime ?? "No response"),
    line("Backend URL", backendUrl)
  ]);
}

function metricsCard(workspaces, jobs) {
  return card("Data", [
    line("Workspaces", String(workspaces.length)),
    line("Jobs", String(jobs.length)),
    line("Queued", String(jobs.filter((job) => job.status === "queued").length)),
    line("Completed", String(jobs.filter((job) => job.status === "completed").length))
  ]);
}

function factsCard(facts, setup) {
  const rows = facts.map(([label, value]) => line(label, value));
  if (setup) {
    rows.push(line("Java", setup.java ?? "unknown"));
    rows.push(line("Maven", setup.maven ?? "unknown"));
  }
  return card("Configuration", rows);
}

function functionsCard(functions) {
  return card("Functions", functions.map((item) => chip(item)));
}

function actionsCard() {
  const refreshButton = button("Refresh", refresh);
  const centralLink = link("Central Admin", "/");
  const webLink = link("Web Host", "/web/");
  return card("Actions", [refreshButton, centralLink, webLink]);
}

function card(title, children) {
  const section = document.createElement("article");
  section.className = "panel runtime-admin-card";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading, ...children);
  return section;
}

function line(label, value) {
  const row = document.createElement("div");
  row.className = "runtime-admin-row";
  const key = document.createElement("span");
  key.textContent = label;
  const val = document.createElement("strong");
  val.textContent = value;
  row.append(key, val);
  return row;
}

function chip(value) {
  const item = document.createElement("span");
  item.className = "runtime-admin-chip";
  item.textContent = value;
  return item;
}

function button(label, action) {
  const control = document.createElement("button");
  control.className = "implementation-link";
  control.type = "button";
  control.textContent = label;
  control.addEventListener("click", async () => {
    await action();
    showToast("Runtime refreshed.");
  });
  return control;
}

function link(label, href) {
  const control = document.createElement("a");
  control.className = "implementation-link";
  control.href = href;
  control.textContent = label;
  return control;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}
