import { platformApi } from "/shared/apiClient.js";

const state = {
  workspaces: [],
  documents: [],
  jobs: [],
  runtimeName: "unknown",
  activeWorkspaceId: null,
  activeArchitectureSection: "models",
  activeImplementationSection: "hosts"
};

const architectureSections = {
  models: {
    title: "Domain Models",
    summary: "Stable business objects shared across runtimes.",
    items: ["Workspace", "Document", "Folder", "ProcessingJob"]
  },
  contracts: {
    title: "Contracts",
    summary: "Versioned boundaries that keep clients and servers aligned.",
    items: ["OpenAPI", "JSON DTOs", "Worker protocols", "Generated clients"]
  },
  services: {
    title: "Application Services",
    summary: "Use cases that coordinate validation, repositories, and workers.",
    items: ["Create document", "Attach file", "Queue processing", "Search documents"]
  },
  hosts: {
    title: "Application Hosts",
    summary: "User-facing shells that consume the same platform contract.",
    items: ["React Web", "Electron", "React Native", ".NET MAUI", "Uno", "Flutter"]
  },
  backends: {
    title: "Backend Implementations",
    summary: "Replaceable server runtimes that implement the same API contract.",
    items: ["Node.js", "ASP.NET Core", "Spring Boot", "FastAPI", "Go"]
  },
  workers: {
    title: "Workers",
    summary: "Background processors for document and search workflows.",
    items: ["Extract text", "Generate thumbnails", "Summarize", "Index search"]
  }
};

const elements = {
  runtimeStatus: document.querySelector("#runtimeStatus"),
  workspaceForm: document.querySelector("#workspaceForm"),
  workspaceName: document.querySelector("#workspaceName"),
  workspaceDescription: document.querySelector("#workspaceDescription"),
  workspaceCount: document.querySelector("#workspaceCount"),
  workspaceList: document.querySelector("#workspaceList"),
  activeWorkspaceLabel: document.querySelector("#activeWorkspaceLabel"),
  activeWorkspaceName: document.querySelector("#activeWorkspaceName"),
  documentCount: document.querySelector("#documentCount"),
  jobCount: document.querySelector("#jobCount"),
  documentForm: document.querySelector("#documentForm"),
  documentTitle: document.querySelector("#documentTitle"),
  documentStatus: document.querySelector("#documentStatus"),
  documentTags: document.querySelector("#documentTags"),
  documentRows: document.querySelector("#documentRows"),
  emptyState: document.querySelector("#emptyState"),
  jobList: document.querySelector("#jobList"),
  refreshButton: document.querySelector("#refreshButton"),
  platformTabs: document.querySelector("#platformTabs"),
  architectureDetail: document.querySelector("#architectureDetail"),
  implementationTabs: document.querySelector("#implementationTabs"),
  implementationDetail: document.querySelector("#implementationDetail"),
  toast: document.querySelector("#toast")
};

elements.workspaceForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(() => createWorkspace(new FormData(elements.workspaceForm)));
});

elements.documentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(() => createDocument(new FormData(elements.documentForm)));
});

elements.refreshButton.addEventListener("click", async () => {
  await runAction(async () => {
    await refreshActiveWorkspace();
    render();
    showToast("Workspace refreshed.");
  });
});

elements.platformTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-architecture-section]");
  if (!button) {
    return;
  }
  state.activeArchitectureSection = button.dataset.architectureSection;
  renderArchitecture();
});

elements.implementationTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-implementation-section]");
  if (!button) {
    return;
  }
  state.activeImplementationSection = button.dataset.implementationSection;
  renderImplementations();
});

await initialize();
window.setInterval(() => {
  if (state.activeWorkspaceId) {
    runAction(async () => {
      await refreshActiveWorkspace();
      render();
    });
  }
}, 2500);

async function initialize() {
  await loadHealth();
  await loadWorkspaces();
  setDocumentFormEnabled(false);
  render();
}

async function loadHealth() {
  try {
    const health = await platformApi.getHealth();
    state.runtimeName = health.runtime;
    elements.runtimeStatus.textContent = health.ok ? `${health.runtime} runtime online` : "Runtime unavailable";
  } catch {
    state.runtimeName = "unavailable";
    elements.runtimeStatus.textContent = "Runtime unavailable";
  }
}

async function loadWorkspaces() {
  state.workspaces = await platformApi.listWorkspaces();
  if (!state.activeWorkspaceId && state.workspaces.length > 0) {
    state.activeWorkspaceId = state.workspaces[0].id;
  }
  await refreshActiveWorkspace();
}

async function refreshActiveWorkspace() {
  if (!state.activeWorkspaceId) {
    state.documents = [];
    state.jobs = [];
    return;
  }
  const [documents, jobs] = await Promise.all([
    platformApi.listDocuments(state.activeWorkspaceId),
    platformApi.listJobs()
  ]);
  state.documents = documents;
  state.jobs = jobs.filter((job) =>
    documents.some((documentItem) => documentItem.id === job.documentId)
  );
  setDocumentFormEnabled(true);
}

async function createWorkspace(formData) {
  const workspace = await platformApi.createWorkspace({
    name: formData.get("name"),
    description: formData.get("description")
  });

  state.activeWorkspaceId = workspace.id;
  elements.workspaceForm.reset();
  await loadWorkspaces();
  render();
  showToast("Workspace added.");
}

async function createDocument(formData) {
  if (!state.activeWorkspaceId) {
    showToast("Select a workspace first.");
    return;
  }

  await platformApi.createDocument({
    workspaceId: state.activeWorkspaceId,
    title: formData.get("title"),
    status: formData.get("status"),
    tags: parseTags(formData.get("tags"))
  });

  elements.documentForm.reset();
  await refreshActiveWorkspace();
  render();
  showToast("Document added.");
}

async function processDocument(documentId) {
  await runAction(async () => {
    await platformApi.processDocument(documentId, { type: "extract-text" });
    await refreshActiveWorkspace();
    render();
    showToast("Processing job queued.");
  });
}

async function selectWorkspace(workspaceId) {
  state.activeWorkspaceId = workspaceId;
  await refreshActiveWorkspace();
  render();
}

function render() {
  const activeWorkspace = state.workspaces.find(
    (workspace) => workspace.id === state.activeWorkspaceId
  );

  elements.workspaceCount.textContent = String(state.workspaces.length);
  elements.documentCount.textContent = String(state.documents.length);
  elements.jobCount.textContent = String(state.jobs.length);
  elements.activeWorkspaceLabel.textContent = activeWorkspace ? "Active workspace" : "No workspace selected";
  elements.activeWorkspaceName.textContent = activeWorkspace?.name ?? "Documents";
  setDocumentFormEnabled(Boolean(activeWorkspace));

  renderWorkspaces();
  renderDocuments();
  renderJobs();
  renderArchitecture();
  renderImplementations();
}

function renderWorkspaces() {
  elements.workspaceList.replaceChildren(
    ...state.workspaces.map((workspace) => {
      const button = document.createElement("button");
      button.className = `workspace-item${workspace.id === state.activeWorkspaceId ? " active" : ""}`;
      button.type = "button";
      button.addEventListener("click", () => selectWorkspace(workspace.id));

      const name = document.createElement("strong");
      name.textContent = workspace.name;
      const description = document.createElement("small");
      description.textContent = workspace.description || formatDate(workspace.createdAt);

      button.append(name, description);
      return button;
    })
  );
}

function renderDocuments() {
  elements.documentRows.replaceChildren(
    ...state.documents.map((documentItem) => {
      const row = document.createElement("tr");

      row.append(
        tableCell(documentItem.title),
        tableCell(statusBadge(documentItem.status)),
        tableCell(tagList(documentItem.tags)),
        tableCell(fileDetails(documentItem)),
        tableCell(formatDate(documentItem.updatedAt)),
        tableCell(actionGroup(documentItem.id))
      );

      return row;
    })
  );

  const hasEmptyWorkspace = state.activeWorkspaceId && state.documents.length === 0;
  const hasNoWorkspace = !state.activeWorkspaceId;
  elements.emptyState.textContent = hasNoWorkspace
    ? "Create or select a workspace to begin."
    : "No documents in this workspace.";
  elements.emptyState.classList.toggle("visible", hasNoWorkspace || hasEmptyWorkspace);
}

function renderJobs() {
  if (state.jobs.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty visible";
    empty.textContent = "No processing jobs queued.";
    elements.jobList.replaceChildren(empty);
    return;
  }

  elements.jobList.replaceChildren(
    ...state.jobs.map((job) => {
      const item = document.createElement("div");
      item.className = "job";

      const text = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = job.type;
      const detail = document.createElement("small");
      detail.textContent = formatDate(job.createdAt);
      text.append(title, detail);

      const badge = document.createElement("span");
      badge.className = "job-badge";
      badge.textContent = job.status;

      item.append(text, badge);
      return item;
    })
  );
}

function renderArchitecture() {
  const section = architectureSections[state.activeArchitectureSection];

  for (const button of elements.platformTabs.querySelectorAll("[data-architecture-section]")) {
    const isActive = button.dataset.architectureSection === state.activeArchitectureSection;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  const title = document.createElement("h3");
  title.textContent = section.title;

  const summary = document.createElement("p");
  summary.textContent = section.summary;

  const list = document.createElement("div");
  list.className = "architecture-items";
  for (const item of section.items) {
    const chip = document.createElement("span");
    chip.textContent = item;
    list.append(chip);
  }

  elements.architectureDetail.replaceChildren(title, summary, list);
}

function renderImplementations() {
  const metrics = adminMetrics();
  const section = implementationSections(metrics)[state.activeImplementationSection];

  for (const button of elements.implementationTabs.querySelectorAll("[data-implementation-section]")) {
    const isActive = button.dataset.implementationSection === state.activeImplementationSection;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  elements.implementationDetail.replaceChildren(
    ...section.map((implementation) => implementationCard(implementation))
  );
}

function implementationSections(metrics) {
  return {
    hosts: [
      {
        name: "Web Host",
        status: "Running",
        summary: "Separate workspace portal for day-to-day document work, uploads, and job tracking.",
        href: "/web/",
        action: "Open Web Host",
        facts: [
          `${metrics.workspaces} workspaces visible`,
          `${metrics.documents} documents visible`,
          `${metrics.jobs} jobs monitored`
        ]
      },
      {
        name: ".NET MAUI Host",
        status: "Planned",
        summary: "Native desktop/mobile host for document review, workspace browsing, and job status.",
        facts: ["Consumes OpenAPI", "Uses same DTOs", "Can target Windows, macOS, Android, iOS"]
      },
      {
        name: "Electron Host",
        status: "Available",
        summary: "Desktop shell for local files, workspace browsing, uploads, jobs, and backend switching.",
        href: "https://github.com/expert10000/multi-platform-arch/tree/main/apps/hosts/electron",
        action: "View Desktop Source",
        facts: ["Same workspace workflow as Web Host", "Can call Node or Python backend", "Good fit for file-heavy workflows"]
      }
    ],
    backends: [
      {
        name: "Node Backend",
        status: state.runtimeName === "node" ? "Running" : "Available",
        summary: "Primary backend implementation with SQLite metadata, local file storage, and worker startup.",
        facts: [
          `${metrics.uploadedFiles} files ingested`,
          `${metrics.completedJobs} completed jobs`,
          `${metrics.failedJobs} failed jobs`
        ]
      },
      {
        name: "Python Backend",
        status: state.runtimeName === "python" ? "Running" : "Available",
        summary: "Interchangeable backend using the same contract with in-memory metadata and local file bytes.",
        facts: ["Implements workspaces", "Implements documents and uploads", "Implements jobs"]
      },
      {
        name: "Future Backends",
        status: "Planned",
        summary: "ASP.NET Core, Spring Boot, FastAPI, and Go can implement the same OpenAPI surface.",
        facts: ["Same contracts", "Own persistence choices", "No host rewrite required"]
      }
    ],
    workers: [
      {
        name: "Document Worker",
        status: "Running",
        summary: "Processes queued document jobs through the shared worker lifecycle.",
        facts: [
          `${metrics.queuedJobs} queued`,
          `${metrics.runningJobs} running`,
          `${metrics.completedJobs} completed`
        ]
      },
      {
        name: "Python Worker",
        status: "Planned",
        summary: "Specialized worker for text extraction, OCR, summaries, embeddings, and semantic search.",
        facts: ["Can consume same job protocol", "Good fit for AI/OCR libraries", "Can run out of process"]
      },
      {
        name: "Search Worker",
        status: "Planned",
        summary: "Indexes extracted document content and metadata for cross-host search.",
        facts: ["Indexes files", "Indexes tags", "Publishes job results"]
      }
    ]
  };
}

function implementationCard(implementation) {
  const article = document.createElement("article");
  article.className = "implementation-card";

  const header = document.createElement("div");
  header.className = "implementation-card-header";
  const title = document.createElement("h4");
  title.textContent = implementation.name;
  const status = document.createElement("span");
  status.className = `runtime-badge ${implementation.status.toLowerCase()}`;
  status.textContent = implementation.status;
  header.append(title, status);

  const summary = document.createElement("p");
  summary.textContent = implementation.summary;

  const facts = document.createElement("div");
  facts.className = "implementation-facts";
  for (const fact of implementation.facts) {
    const item = document.createElement("span");
    item.textContent = fact;
    facts.append(item);
  }

  article.append(header, summary);
  if (implementation.href) {
    const link = document.createElement("a");
    link.className = "implementation-link";
    link.href = implementation.href;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = implementation.action ?? "Open";
    article.append(link);
  }
  article.append(facts);
  return article;
}

function adminMetrics() {
  return {
    workspaces: state.workspaces.length,
    documents: state.documents.length,
    jobs: state.jobs.length,
    uploadedFiles: state.documents.filter((documentItem) => documentItem.fileName).length,
    queuedJobs: countJobsByStatus("queued"),
    runningJobs: countJobsByStatus("running"),
    completedJobs: countJobsByStatus("completed"),
    failedJobs: countJobsByStatus("failed")
  };
}

function countJobsByStatus(status) {
  return state.jobs.filter((job) => job.status === status).length;
}

function tableCell(content) {
  const cell = document.createElement("td");
  if (content instanceof Node) {
    cell.append(content);
  } else {
    cell.textContent = content;
  }
  return cell;
}

function statusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `status ${status}`;
  badge.textContent = status;
  return badge;
}

function tagList(tags) {
  const wrap = document.createElement("div");
  wrap.className = "tag-list";
  if (tags.length === 0) {
    wrap.textContent = "No tags";
    return wrap;
  }

  for (const tag of tags) {
    const item = document.createElement("span");
    item.className = "tag";
    item.textContent = tag;
    wrap.append(item);
  }
  return wrap;
}

function fileDetails(documentItem) {
  const wrap = document.createElement("div");
  wrap.className = "file-meta";
  if (!documentItem.fileName) {
    wrap.textContent = "No file";
    return wrap;
  }

  const name = document.createElement("strong");
  name.textContent = documentItem.fileName;
  const details = document.createElement("small");
  details.textContent = `${formatBytes(documentItem.size)} ${documentItem.mimeType}`;
  wrap.append(name, details);
  return wrap;
}

function actionGroup(documentId) {
  const wrap = document.createElement("div");
  wrap.className = "action-group";
  wrap.append(uploadButton(documentId), processButton(documentId));
  return wrap;
}

function uploadButton(documentId) {
  const label = document.createElement("label");
  label.className = "ghost file-upload";
  label.textContent = "Upload";

  const input = document.createElement("input");
  input.type = "file";
  input.addEventListener("change", () => {
    const [file] = input.files;
    if (!file) {
      return;
    }
    runAction(async () => {
      await platformApi.uploadDocumentFile(documentId, file);
      await refreshActiveWorkspace();
      render();
      showToast("File uploaded and processing queued.");
    });
    input.value = "";
  });

  label.append(input);
  return label;
}

function processButton(documentId) {
  const button = document.createElement("button");
  button.className = "ghost";
  button.type = "button";
  button.textContent = "Process";
  button.addEventListener("click", () => processDocument(documentId));
  return button;
}

function formatBytes(size) {
  if (!Number.isFinite(size)) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function setDocumentFormEnabled(enabled) {
  for (const field of elements.documentForm.elements) {
    field.disabled = !enabled;
  }
  elements.refreshButton.disabled = !enabled;
}

function parseTags(value) {
  return String(value ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    elements.toast.classList.remove("visible");
  }, 2200);
}

async function runAction(action) {
  try {
    await action();
  } catch (error) {
    showToast(error.message || "Action failed.");
  }
}
