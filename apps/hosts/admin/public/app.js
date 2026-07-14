import { createPlatformApi, platformApi } from "/shared/apiClient.js";

const state = {
  workspaces: [],
  documents: [],
  jobs: [],
  mauiSetup: null,
  springSetup: null,
  localSetup: {
    python: null,
    dotnet: null,
    electronDependencies: null
  },
  nodeHealth: null,
  aspNetCoreHealth: null,
  pythonHealth: null,
  runtimeName: "unknown",
  activeWorkspaceId: null,
  activeCentralSection: "runtime",
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
    items: ["React Web", "Electron", ".NET Desktop", ".NET MAUI", "React Native", "Flutter"]
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

const nodeApi = createPlatformApi({ baseUrl: "http://localhost:3000" });
const aspNetCoreApi = createPlatformApi({ baseUrl: "http://localhost:3300" });
const pythonApi = createPlatformApi({ baseUrl: "http://localhost:3100" });

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
  localSetupDetail: document.querySelector("#localSetupDetail"),
  centralTabs: document.querySelector("#centralTabs"),
  centralViews: document.querySelectorAll("[data-central-view]"),
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

elements.centralTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-central-section]");
  if (!button) {
    return;
  }
  state.activeCentralSection = button.dataset.centralSection;
  renderCentralView();
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
  runAction(async () => {
    if (isMauiSetupActive()) {
      await loadMauiSetupStatus();
    }
    if (isSpringSetupActive()) {
      await loadSpringSetupStatus();
    }
    if (isLocalSetupActive() || state.activeCentralSection === "setup") {
      await loadLocalSetupStatus();
    }
    await loadRuntimeHealth();
    if (state.activeWorkspaceId) {
      await refreshActiveWorkspace();
    }
    render();
  });
}, 2500);

async function initialize() {
  await loadHealth();
  await loadRuntimeHealth();
  await loadMauiSetupStatus();
  await loadSpringSetupStatus();
  await loadLocalSetupStatus();
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

async function loadMauiSetupStatus() {
  state.mauiSetup = await platformApi.getMauiSetupStatus().catch(() => null);
}

async function loadSpringSetupStatus() {
  state.springSetup = await platformApi.getSpringSetupStatus().catch(() => null);
}

async function loadLocalSetupStatus() {
  const [python, dotnet, electronDependencies] = await Promise.all([
    platformApi.getPythonToolingStatus().catch(() => null),
    platformApi.getDotnetToolingStatus().catch(() => null),
    platformApi.getElectronDependenciesStatus().catch(() => null)
  ]);
  state.localSetup = {
    python,
    dotnet,
    electronDependencies
  };
}

async function loadRuntimeHealth() {
  const [nodeHealth, aspNetCoreHealth, pythonHealth] = await Promise.all([
    nodeApi.getHealth().catch(() => null),
    aspNetCoreApi.getHealth().catch(() => null),
    pythonApi.getHealth().catch(() => null)
  ]);
  state.nodeHealth = nodeHealth;
  state.aspNetCoreHealth = aspNetCoreHealth;
  state.pythonHealth = pythonHealth;
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
  renderCentralView();
  renderArchitecture();
  renderImplementations();
  renderLocalSetup();
}

function renderCentralView() {
  for (const button of elements.centralTabs.querySelectorAll("[data-central-section]")) {
    const isActive = button.dataset.centralSection === state.activeCentralSection;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  }

  for (const view of elements.centralViews) {
    const isActive = view.dataset.centralView === state.activeCentralSection;
    view.classList.toggle("active", isActive);
    view.hidden = !isActive;
  }
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

function renderLocalSetup() {
  if (!elements.localSetupDetail) {
    return;
  }

  elements.localSetupDetail.replaceChildren(
    ...localSetupSections().map((setup) => localSetupCard(setup))
  );
}

function localSetupSections() {
  return [
    {
      key: "node",
      name: "Node.js",
      status: nodeBackendStatus() === "Running" ? "Running" : "Manual",
      summary: "Node starts the central dashboard, so a fresh user installs Node before opening this UI.",
      commandText: "Install Node.js LTS, then run npm install and npm run dev",
      facts: ["Required before this UI can run", `Runtime: ${state.runtimeName}`, "Manual first step"]
    },
    {
      key: "python",
      name: "Python Tooling",
      status: setupCardStatus(localSetupState("python"), "python"),
      summary: "Installs Python 3.11 for the Python backend and Python workers.",
      setupCommand: "setupPythonTooling",
      statusCommand: "getPythonToolingStatus",
      setupAction: "Install / Repair Python",
      commandText: "winget install Python.Python.3.11",
      facts: [
        `Python: ${localSetupState("python")?.python ?? "unknown"}`,
        "Python backend",
        "Python workers"
      ]
    },
    {
      key: "dotnet",
      name: ".NET SDK",
      status: setupCardStatus(localSetupState("dotnet"), "dotnet"),
      summary: "Installs the .NET SDK used by ASP.NET Core, .NET Desktop, and MAUI.",
      setupCommand: "setupDotnetTooling",
      statusCommand: "getDotnetToolingStatus",
      setupAction: "Install / Repair .NET SDK",
      commandText: "winget install Microsoft.DotNet.SDK.10",
      facts: [
        `.NET: ${localSetupState("dotnet")?.dotnet ?? "unknown"}`,
        "ASP.NET Core",
        ".NET Desktop"
      ]
    },
    {
      key: "electronDependencies",
      name: "Electron Dependencies",
      status: setupCardStatus(localSetupState("electronDependencies"), "electronDependencies"),
      summary: "Installs the desktop host dependencies after Node packages are restored.",
      setupCommand: "setupElectronDependencies",
      statusCommand: "getElectronDependenciesStatus",
      setupAction: "Install Electron Dependencies",
      commandText: "npm --prefix apps/hosts/electron install",
      facts: [
        `Electron: ${localSetupState("electronDependencies")?.electronDependencies ?? "unknown"}`,
        "Desktop shell",
        "Local files"
      ]
    },
    {
      key: "spring",
      name: "Spring Boot Tooling",
      status: setupCardStatus(state.springSetup, "spring"),
      summary: "Installs Java 17 and Maven for the Spring Boot backend/admin.",
      setupCommand: "setupSpringBackend",
      statusCommand: "getSpringSetupStatus",
      setupAction: "Install Java / Maven",
      commandText: "winget install Microsoft.OpenJDK.17 and Apache.Maven",
      facts: springBackendFacts()
    },
    {
      key: "maui",
      name: ".NET MAUI Workload",
      status: setupCardStatus(state.mauiSetup, "maui"),
      summary: "Installs the optional MAUI workload for the MAUI desktop host.",
      setupCommand: "setupMauiHost",
      statusCommand: "getMauiSetupStatus",
      setupAction: "Install / Repair MAUI",
      commandText: "dotnet workload install maui",
      facts: [
        `MAUI: ${state.mauiSetup?.mauiWorkload ?? state.mauiSetup?.status ?? "unknown"}`,
        "Optional host",
        "Shared API"
      ]
    }
  ];
}

function localSetupCard(setup) {
  const article = document.createElement("article");
  article.className = "implementation-card";

  const header = document.createElement("div");
  header.className = "implementation-card-header";
  const title = document.createElement("h4");
  title.textContent = setup.name;
  const status = document.createElement("span");
  status.className = `runtime-badge ${setup.status.toLowerCase()}`;
  status.textContent = setup.status;
  header.append(title, status);

  const summary = document.createElement("p");
  summary.textContent = setup.summary;
  article.append(header, summary);

  if (setup.setupCommand) {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = setup.setupAction;
    button.addEventListener("click", () => setupLocalTool(setup));
    article.append(button);
  }

  if (setup.statusCommand) {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = "Check Status";
    button.addEventListener("click", () => refreshLocalSetupStatus(setup));
    article.append(button);
  }

  article.append(localSetupStatusPanel(setup));

  const facts = document.createElement("div");
  facts.className = "implementation-facts";
  for (const fact of setup.facts) {
    const item = document.createElement("span");
    item.textContent = fact;
    facts.append(item);
  }
  article.append(facts);

  return article;
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
        name: ".NET Desktop Host",
        status: "Available",
        summary: "Lightweight Windows desktop host for workspace review, documents, jobs, and the shared platform contract.",
        command: "launchDotnetDesktopHost",
        stopCommand: "closeDotnetDesktopHost",
        action: "Launch .NET Desktop",
        facts: ["Works without MAUI workload", "Consumes OpenAPI", "Uses same DTOs"]
      },
      {
        name: ".NET MAUI Desktop",
        status: "Available",
        summary: "Optional MAUI desktop host for teams that want a cross-device UI path on the same shared contract.",
        command: "launchMauiHost",
        stopCommand: "closeMauiHost",
        setupCommand: "setupMauiHost",
        statusCommand: "getMauiSetupStatus",
        statusView: "mauiSetup",
        infoCommand: "showMauiInstallMessage",
        action: "Launch MAUI Desktop",
        setupAction: "Install / Repair MAUI",
        facts: ["Runs MAUI Windows desktop", "Consumes the shared API", "Default host still works without MAUI"]
      },
      {
        name: "Electron Host",
        status: "Available",
        summary: "Desktop shell for local files, workspace browsing, uploads, jobs, and backend switching.",
        command: "launchElectronHost",
        stopCommand: "closeElectronHost",
        action: "Launch Desktop",
        facts: ["Same workspace workflow as Web Host", "Can call Node or Python backend", "Good fit for file-heavy workflows"]
      }
    ],
    backends: [
      {
        name: "Node Backend",
        status: nodeBackendStatus(),
        summary: "Default local backend for the dashboard, SQLite metadata, local file storage, worker startup, and desktop launcher control.",
        href: "/node-admin/",
        hrefAction: "Open Node Admin",
        facts: [
          `${metrics.uploadedFiles} files ingested`,
          `${metrics.completedJobs} completed jobs`,
          `${metrics.failedJobs} failed jobs`
        ]
      },
      {
        name: "Spring Boot Backend",
        status: springBackendStatus(),
        summary: "Enterprise/server backend option that implements the same OpenAPI routes and serves the same hosts.",
        href: springAdminHref(),
        command: "launchSpringBackend",
        stopCommand: "closeSpringBackend",
        setupCommand: "setupSpringBackend",
        statusCommand: "getSpringSetupStatus",
        statusView: "springSetup",
        infoCommand: "showSpringInstallMessage",
        action: "Start Spring Admin",
        stopAction: "Stop Spring",
        setupAction: "Install Java / Maven",
        hrefAction: "Open Spring Admin",
        facts: springBackendFacts()
      },
      {
        name: "ASP.NET Core Backend",
        status: aspNetCoreBackendStatus(),
        summary: "Microsoft server backend option that implements the same OpenAPI routes and can serve the shared admin/web hosts.",
        href: aspNetCoreAdminHref(),
        command: "launchAspNetCoreBackend",
        stopCommand: "closeAspNetCoreBackend",
        action: "Start ASP.NET Admin",
        stopAction: "Stop ASP.NET Core",
        hrefAction: "Open ASP.NET Admin",
        facts: [
          ".NET SDK runtime",
          "Hosted worker",
          `Runtime: ${state.aspNetCoreHealth?.runtime ?? "stopped"}`
        ]
      },
      {
        name: "Python Backend",
        status: pythonBackendStatus(),
        summary: "Interchangeable backend using the same contract with in-memory metadata and local file bytes.",
        href: "/python-admin/",
        hrefAction: "Open Python Admin",
        facts: ["Implements workspaces", "Implements documents and uploads", `Runtime: ${state.pythonHealth?.runtime ?? "stopped"}`]
      },
      {
        name: "Future Backends",
        status: "Planned",
        summary: "FastAPI and Go can implement the same OpenAPI surface without host rewrites.",
        facts: ["Same contracts", "Own persistence choices", "No host rewrite required"]
      }
    ],
    workers: [
      {
        name: "Document Worker",
        status: "Running",
        summary: "Processes queued document jobs through the shared worker lifecycle across the active backend.",
        href: "/document-worker-admin/",
        hrefAction: "Open Worker Admin",
        facts: [
          `${metrics.queuedJobs} queued`,
          `${metrics.runningJobs} running`,
          `${metrics.completedJobs} completed`
        ]
      },
      {
        name: "Python Worker",
        status: pythonBackendStatus() === "Running" ? "Running" : "Available",
        summary: "Python backend now runs a background worker for extract-text, thumbnail, summarize, and index-search jobs.",
        href: "/python-worker-admin/",
        hrefAction: "Open Python Worker",
        facts: ["Python-first for AI/OCR libraries", "Runs queued jobs", `Backend: ${pythonBackendStatus().toLowerCase()}`]
      },
      {
        name: "Search Worker",
        status: "Available",
        summary: "Uses the shared index-search job type so search indexing stays portable across runtimes.",
        href: "/search-worker-admin/",
        hrefAction: "Open Search Worker",
        facts: [`${metrics.searchJobs} search jobs`, "Indexes metadata", "Ready for vector/keyword backends"]
      }
    ]
  };
}

function implementationCard(implementation) {
  const article = document.createElement("article");
  article.className = "implementation-card";
  if (shouldExpandImplementationCard(implementation)) {
    article.classList.add("wide");
  }

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
    link.textContent = implementation.hrefAction ?? implementation.action ?? "Open";
    article.append(link);
  }
  if (implementation.command && shouldShowLaunchCommand(implementation)) {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = implementation.action ?? "Launch";
    button.addEventListener("click", () => launchHost(implementation.command));
    article.append(button);
  }
  if (implementation.stopCommand && shouldShowStopCommand(implementation)) {
    const button = document.createElement("button");
    button.className = "implementation-link stop";
    button.type = "button";
    button.textContent = implementation.stopAction ?? stopLabelFor(implementation.command);
    button.addEventListener("click", () => closeHost(implementation.stopCommand));
    article.append(button);
  }
  if (implementation.setupCommand && shouldShowSetupCommand(implementation)) {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = implementation.setupAction ?? "Setup";
    button.addEventListener("click", () => setupHost(implementation.setupCommand));
    article.append(button);
  }
  if (implementation.statusCommand) {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = "Setup Status";
    button.addEventListener("click", () => refreshSetupStatus(implementation.statusCommand));
    article.append(button);
  }
  if (implementation.infoCommand === "showMauiInstallMessage") {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = "Setup Command";
    button.addEventListener("click", showMauiInstallMessage);
    article.append(button);
  }
  if (implementation.infoCommand === "showSpringInstallMessage") {
    const button = document.createElement("button");
    button.className = "implementation-link";
    button.type = "button";
    button.textContent = "Setup Command";
    button.addEventListener("click", showSpringInstallMessage);
    article.append(button);
  }
  if (implementation.statusView === "mauiSetup") {
    article.append(setupStatusPanel("mauiSetup"));
  }
  if (implementation.statusView === "springSetup") {
    article.append(setupStatusPanel("springSetup"));
  }
  article.append(facts);
  return article;
}

function shouldExpandImplementationCard(implementation) {
  return false;
}

function isMauiSetupActive() {
  return state.mauiSetup?.status === "starting" || state.mauiSetup?.status === "running";
}

function isSpringSetupActive() {
  return state.springSetup?.status === "starting" ||
    state.springSetup?.status === "running" ||
    state.springSetup?.spring === "starting";
}

function isLocalSetupActive() {
  return Object.values(state.localSetup).some((setup) =>
    setup?.status === "starting" || setup?.status === "running"
  );
}

async function launchHost(command) {
  await runAction(async () => {
    const result = await platformApi[command]();
    if (result.host === "spring-backend") {
      await loadSpringSetupStatus();
      if (result.status === "starting") {
        state.springSetup = {
          ...(state.springSetup ?? {}),
          host: "spring",
          status: "completed",
          spring: "starting"
        };
      }
      renderImplementations();
    }
    showToast(result.status === "running" ? `${hostLabel(result.host)} is already running.` : `${hostLabel(result.host)} is launching.`);
  });
}

async function closeHost(command) {
  await runAction(async () => {
    const result = await platformApi[command]();
    if (result.host === "spring-backend") {
      await loadSpringSetupStatus();
      renderImplementations();
    }
    showToast(result.status === "stopped" ? `${hostLabel(result.host)} is not running.` : `${hostLabel(result.host)} is closing.`);
  });
}

async function setupHost(command) {
  await runAction(async () => {
    const result = await platformApi[command]();
    setSetupState(result);
    renderImplementations();
    renderLocalSetup();
    showToast(result.status === "running" ? `${hostLabel(result.host)} is already running.` : `${hostLabel(result.host)} installer started.`);
  });
}

async function refreshSetupStatus(command) {
  await runAction(async () => {
    setSetupState(await platformApi[command]());
    renderImplementations();
    renderLocalSetup();
    const setup = setupStateForHost(command.includes("Spring") ? "spring" : "maui");
    showToast(`${hostLabel(setup.host)} setup is ${setup.status}.`);
  });
}

async function setupLocalTool(setup) {
  await runAction(async () => {
    const result = await platformApi[setup.setupCommand]();
    setSetupState(result);
    renderLocalSetup();
    renderImplementations();
    showToast(result.status === "running" ? `${hostLabel(result.host)} installer is already running.` : `${hostLabel(result.host)} installer started.`);
  });
}

async function refreshLocalSetupStatus(setup) {
  await runAction(async () => {
    const result = await platformApi[setup.statusCommand]();
    setSetupState(result);
    renderLocalSetup();
    renderImplementations();
    showToast(`${hostLabel(result.host)} setup is ${result.status}.`);
  });
}

function setSetupState(result) {
  if (result.host === "spring") {
    state.springSetup = result;
    return;
  }
  if (result.host === "python") {
    state.localSetup.python = result;
    return;
  }
  if (result.host === "dotnet") {
    state.localSetup.dotnet = result;
    return;
  }
  if (result.host === "electron-deps") {
    state.localSetup.electronDependencies = result;
    return;
  }
  state.mauiSetup = result;
}

function hostLabel(host) {
  if (host === "python") {
    return "Python";
  }
  if (host === "dotnet") {
    return ".NET SDK";
  }
  if (host === "electron-deps") {
    return "Electron dependencies";
  }
  if (host === "dotnet-desktop") {
    return ".NET desktop";
  }
  if (host === "maui-desktop") {
    return ".NET MAUI desktop";
  }
  if (host === "maui") {
    return ".NET MAUI";
  }
  if (host === "spring") {
    return "Spring Boot";
  }
  if (host === "spring-backend") {
    return "Spring Boot";
  }
  if (host === "aspnet-core-backend") {
    return "ASP.NET Core";
  }
  return "Desktop";
}

function stopLabelFor(command) {
  if (command === "launchDotnetDesktopHost") {
    return "Stop .NET Desktop";
  }
  if (command === "launchMauiHost") {
    return "Stop MAUI Desktop";
  }
  return "Stop Desktop";
}

function showMauiInstallMessage() {
  showToast("Optional setup runs: dotnet workload install maui");
}

function showSpringInstallMessage() {
  showToast("Spring setup installs Java 17 and Maven with winget when missing.");
}

function shouldShowSetupCommand(implementation) {
  if (implementation.statusView !== "springSetup") {
    return true;
  }
  return !springPrerequisitesInstalled();
}

function shouldShowLaunchCommand(implementation) {
  if (implementation.statusView !== "springSetup") {
    return true;
  }
  return springPrerequisitesInstalled() && state.springSetup?.spring !== "running";
}

function shouldShowStopCommand(implementation) {
  if (implementation.statusView !== "springSetup") {
    return true;
  }
  return state.springSetup?.spring === "running";
}

function setupStatusPanel(statusView) {
  const setup = setupStateForView(statusView);
  const panel = document.createElement("div");
  panel.className = "setup-status";

  const status = document.createElement("span");
  status.className = "setup-status-label";
  status.textContent = `Setup: ${setup?.status ?? "unknown"}`;

  const command = document.createElement("span");
  command.textContent = `Command: ${setup?.command ?? defaultSetupCommand(statusView)}`;

  panel.append(status, command, ...setupDetails(setup));

  if (setup?.logPath || setup?.lastOutput) {
    const details = document.createElement("details");
    details.className = "setup-log";
    const summary = document.createElement("summary");
    summary.textContent = "Show installer log";
    details.append(summary);
    if (setup.logPath) {
      const logPath = document.createElement("span");
      logPath.className = "setup-log-path";
      logPath.textContent = `Path: ${setup.logPath}`;
      details.append(logPath);
    }
    if (setup.lastOutput) {
      const output = document.createElement("pre");
      output.textContent = setup.lastOutput;
      details.append(output);
    }
    panel.append(details);
  }

  return panel;
}

function localSetupStatusPanel(setupDefinition) {
  const setup = localSetupState(setupDefinition.key);
  const panel = document.createElement("div");
  panel.className = "setup-status";

  const status = document.createElement("span");
  status.className = "setup-status-label";
  status.textContent = `Setup: ${setup?.status ?? setupDefinition.status.toLowerCase()}`;

  const command = document.createElement("span");
  command.textContent = `Command: ${setup?.command ?? setupDefinition.commandText}`;

  panel.append(status, command, ...setupDetails(setup));

  if (setup?.logPath || setup?.lastOutput) {
    const details = document.createElement("details");
    details.className = "setup-log";
    const summary = document.createElement("summary");
    summary.textContent = "Show installer log";
    details.append(summary);
    if (setup.logPath) {
      const logPath = document.createElement("span");
      logPath.className = "setup-log-path";
      logPath.textContent = `Path: ${setup.logPath}`;
      details.append(logPath);
    }
    if (setup.lastOutput) {
      const output = document.createElement("pre");
      output.textContent = setup.lastOutput;
      details.append(output);
    }
    panel.append(details);
  }

  return panel;
}

function setupDetails(setup) {
  if (!setup) {
    return [];
  }

  const details = [
    ["Python", setup.python],
    [".NET", setup.dotnet],
    ["Electron", setup.electronDependencies],
    ["Java", setup.java],
    ["Maven", setup.maven],
    ["Spring", setup.spring],
    ["MAUI", setup.mauiWorkload],
    ["Started", setup.startedAt],
    ["Finished", setup.finishedAt],
    ["Exit", setup.exitCode === null || setup.exitCode === undefined ? null : String(setup.exitCode)]
  ];

  return details
    .filter(([, value]) => value)
    .map(([label, value]) => {
      const item = document.createElement("span");
      item.textContent = `${label}: ${value}`;
      return item;
    });
}

function setupStateForView(statusView) {
  return statusView === "springSetup" ? state.springSetup : state.mauiSetup;
}

function setupStateForHost(host) {
  return host === "spring" ? state.springSetup : state.mauiSetup;
}

function localSetupState(key) {
  if (key === "spring") {
    return state.springSetup;
  }
  if (key === "maui") {
    return state.mauiSetup;
  }
  if (key === "electronDependencies") {
    return state.localSetup.electronDependencies;
  }
  return state.localSetup[key];
}

function setupCardStatus(setup, key) {
  if (!setup) {
    return "Unknown";
  }
  if (setup.status === "starting" || setup.status === "running") {
    return "Installing";
  }
  if (setup.status === "failed") {
    return "Failed";
  }
  if (key === "spring") {
    return setup.java === "installed" && setup.maven === "installed" ? "Available" : "Missing";
  }
  if (key === "maui") {
    return setup.status === "completed" ? "Available" : "Available";
  }
  const value = setup[key];
  if (value === "installed") {
    return "Available";
  }
  if (value === "missing") {
    return "Missing";
  }
  return setup.status === "completed" ? "Available" : "Unknown";
}

function defaultSetupCommand(statusView) {
  return statusView === "springSetup"
    ? "winget install Microsoft.OpenJDK.17 and Apache.Maven"
    : "dotnet workload install maui";
}

function springBackendStatus() {
  if (state.runtimeName === "spring-boot" || state.springSetup?.spring === "running") {
    return "Running";
  }
  if (state.springSetup?.spring === "starting") {
    return "Starting";
  }
  if (isSpringSetupActive()) {
    return "Installing";
  }
  if (state.springSetup?.java === "installed" && state.springSetup?.maven === "installed") {
    return "Available";
  }
  return "Missing";
}

function springPrerequisitesInstalled() {
  return state.springSetup?.java === "installed" && state.springSetup?.maven === "installed";
}

function springAdminHref() {
  return state.springSetup?.spring === "running" || state.runtimeName === "spring-boot"
    ? "http://localhost:3200/spring-admin/"
    : null;
}

function springBackendFacts() {
  const java = state.springSetup?.java ?? "unknown";
  const maven = state.springSetup?.maven ?? "unknown";
  const spring = state.springSetup?.spring ?? "unknown";
  return [
    `Java: ${java}`,
    `Maven: ${maven}`,
    `Spring: ${spring}`,
    spring === "running" ? "Admin: http://localhost:3200" : "Admin: stopped"
  ];
}

function nodeBackendStatus() {
  return state.nodeHealth?.runtime === "node" || state.runtimeName === "node"
    ? "Running"
    : "Stopped";
}

function aspNetCoreBackendStatus() {
  return state.aspNetCoreHealth?.runtime === "aspnet-core" || state.runtimeName === "aspnet-core"
    ? "Running"
    : "Stopped";
}

function aspNetCoreAdminHref() {
  return aspNetCoreBackendStatus() === "Running"
    ? "http://localhost:3300/aspnet-admin/"
    : null;
}

function pythonBackendStatus() {
  return state.pythonHealth?.runtime === "python" || state.runtimeName === "python"
    ? "Running"
    : "Stopped";
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
    failedJobs: countJobsByStatus("failed"),
    searchJobs: state.jobs.filter((job) => job.type === "index-search").length
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
