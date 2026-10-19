import { createPlatformApi } from "/shared/apiClient.js";

const worker = document.body.dataset.workerAdmin;
const workerName = document.body.dataset.workerName;
const backendUrl = document.body.dataset.backendUrl;
const api = createPlatformApi({ baseUrl: backendUrl });

const elements = {
  title: document.querySelector("#workerTitle"),
  badge: document.querySelector("#workerBadge"),
  grid: document.querySelector("#workerAdminGrid"),
  toast: document.querySelector("#toast")
};

const workerCatalog = {
  document: {
    jobTypes: ["extract-text", "thumbnail", "summarize"],
    facts: [
      ["Role", "Document processing"],
      ["Queue", "Shared ProcessingJob contract"],
      ["Default backend", "Node"],
      ["Status source", "Job lifecycle"]
    ],
    functions: ["Extract text", "Generate thumbnails", "Summarize documents", "Mark jobs completed or failed"]
  },
  python: {
    jobTypes: ["extract-text", "thumbnail", "summarize", "index-search"],
    facts: [
      ["Role", "AI/OCR/search extension point"],
      ["Queue", "Python in-process worker"],
      ["Default backend", "Python"],
      ["Libraries", "Ready for OCR, embeddings, NLP"]
    ],
    functions: ["Run queued Python jobs", "Handle future OCR libraries", "Handle future AI summaries", "Process search jobs"]
  },
  search: {
    jobTypes: ["index-search"],
    facts: [
      ["Role", "Search indexing"],
      ["Queue", "index-search jobs"],
      ["Default backend", "Python"],
      ["Index mode", "Portable job contract"]
    ],
    functions: ["Index document metadata", "Prepare keyword search", "Prepare vector search", "Publish searchable results"]
  }
};

await refresh();

async function refresh() {
  const catalog = workerCatalog[worker];
  elements.title.textContent = workerName;

  const health = await api.getHealth().catch(() => null);
  const jobs = health ? await api.listJobs().catch(() => []) : [];
  const workerJobs = jobs.filter((job) => catalog.jobTypes.includes(job.type));
  const online = Boolean(health?.ok);

  elements.badge.className = `runtime-badge ${online ? "running" : "stopped"}`;
  elements.badge.textContent = online ? "Running" : "Stopped";

  elements.grid.replaceChildren(
    statusCard(health, online),
    metricsCard(workerJobs),
    factsCard(catalog.facts),
    functionsCard(catalog.functions),
    recentJobsCard(workerJobs),
    actionsCard()
  );
}

function statusCard(health, online) {
  return card("Worker", [
    line("Status", online ? "Online" : "Unavailable"),
    line("Backend", health?.runtime ?? "No response"),
    line("Backend URL", backendUrl)
  ]);
}

function metricsCard(jobs) {
  return card("Queue", [
    line("Jobs", String(jobs.length)),
    line("Queued", String(countByStatus(jobs, "queued"))),
    line("Running", String(countByStatus(jobs, "running"))),
    line("Completed", String(countByStatus(jobs, "completed"))),
    line("Failed", String(countByStatus(jobs, "failed")))
  ]);
}

function factsCard(facts) {
  return card("Configuration", facts.map(([label, value]) => line(label, value)));
}

function functionsCard(functions) {
  return card("Functions", functions.map((item) => chip(item)));
}

function recentJobsCard(jobs) {
  const rows = jobs.slice(0, 5).map((job) => line(job.type, job.status));
  return card("Recent Jobs", rows.length ? rows : [chip("No matching jobs yet")]);
}

function actionsCard() {
  return card("Actions", [
    button("Refresh", refresh),
    link("Central Admin", "/"),
    link("Workspace Data", "/")
  ]);
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
    showToast("Worker refreshed.");
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

function countByStatus(jobs, status) {
  return jobs.filter((job) => job.status === status).length;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}
