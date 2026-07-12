import { platformApi } from "./apiClient.js";

const state = {
  workspaces: [],
  documents: [],
  jobs: [],
  activeWorkspaceId: null
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
    elements.runtimeStatus.textContent = health.ok ? `${health.runtime} runtime online` : "Runtime unavailable";
  } catch {
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
        tableCell(formatDate(documentItem.updatedAt)),
        tableCell(processButton(documentItem.id))
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

function processButton(documentId) {
  const button = document.createElement("button");
  button.className = "ghost";
  button.type = "button";
  button.textContent = "Process";
  button.addEventListener("click", () => processDocument(documentId));
  return button;
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
