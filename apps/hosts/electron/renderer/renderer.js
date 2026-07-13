import { createPlatformApi } from "../../shared/public/apiClient.js";

const backendStorageKey = "dzoneElectronBackendUrl";
const query = new URLSearchParams(window.location.search);
let backendUrl = localStorage.getItem(backendStorageKey) || query.get("backendUrl") || "http://localhost:3000";
let platformApi = createPlatformApi({ baseUrl: backendUrl });

const state = {
  workspaces: [],
  documents: [],
  jobs: [],
  activeWorkspaceId: null
};

const elements = {
  backendStatus: document.querySelector("#backendStatus"),
  backendForm: document.querySelector("#backendForm"),
  backendUrlInput: document.querySelector("#backendUrlInput"),
  workspaceForm: document.querySelector("#workspaceForm"),
  workspaceName: document.querySelector("#workspaceName"),
  workspaceCount: document.querySelector("#workspaceCount"),
  workspaceList: document.querySelector("#workspaceList"),
  activeWorkspaceLabel: document.querySelector("#activeWorkspaceLabel"),
  activeWorkspaceName: document.querySelector("#activeWorkspaceName"),
  documentCount: document.querySelector("#documentCount"),
  jobCount: document.querySelector("#jobCount"),
  fileCount: document.querySelector("#fileCount"),
  documentForm: document.querySelector("#documentForm"),
  documentTitle: document.querySelector("#documentTitle"),
  documentTags: document.querySelector("#documentTags"),
  documentList: document.querySelector("#documentList"),
  documentEmpty: document.querySelector("#documentEmpty"),
  jobList: document.querySelector("#jobList"),
  refreshButton: document.querySelector("#refreshButton"),
  toast: document.querySelector("#toast")
};

elements.backendUrlInput.value = backendUrl;

elements.backendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runAction(() => connectBackend(new FormData(elements.backendForm)));
});

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
}, 3500);

async function initialize() {
  await loadHealth();
  await loadWorkspaces();
  render();
}

async function connectBackend(formData) {
  backendUrl = normalizeBackendUrl(formData.get("backendUrl"));
  localStorage.setItem(backendStorageKey, backendUrl);
  elements.backendUrlInput.value = backendUrl;
  platformApi = createPlatformApi({ baseUrl: backendUrl });
  state.workspaces = [];
  state.documents = [];
  state.jobs = [];
  state.activeWorkspaceId = null;
  await initialize();
  showToast("Desktop host connected.");
}

async function loadHealth() {
  try {
    const health = await platformApi.getHealth();
    elements.backendStatus.textContent = `${health.runtime} backend`;
    elements.backendStatus.classList.remove("offline");
  } catch {
    elements.backendStatus.textContent = "backend offline";
    elements.backendStatus.classList.add("offline");
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
}

async function createWorkspace(formData) {
  const workspace = await platformApi.createWorkspace({
    name: formData.get("name")
  });
  state.activeWorkspaceId = workspace.id;
  elements.workspaceForm.reset();
  await loadWorkspaces();
  render();
  showToast("Workspace created.");
}

async function createDocument(formData) {
  if (!state.activeWorkspaceId) {
    showToast("Select a workspace first.");
    return;
  }

  await platformApi.createDocument({
    workspaceId: state.activeWorkspaceId,
    title: formData.get("title"),
    tags: parseTags(formData.get("tags"))
  });

  elements.documentForm.reset();
  await refreshActiveWorkspace();
  render();
  showToast("Document added.");
}

async function selectWorkspace(workspaceId) {
  state.activeWorkspaceId = workspaceId;
  await refreshActiveWorkspace();
  render();
}

async function uploadDocumentFile(documentId, file) {
  await platformApi.uploadDocumentFile(documentId, file);
  await refreshActiveWorkspace();
  render();
  showToast("File uploaded.");
}

async function processDocument(documentId) {
  await platformApi.processDocument(documentId, { type: "extract-text" });
  await refreshActiveWorkspace();
  render();
  showToast("Processing queued.");
}

function render() {
  const activeWorkspace = state.workspaces.find(
    (workspace) => workspace.id === state.activeWorkspaceId
  );

  elements.workspaceCount.textContent = String(state.workspaces.length);
  elements.documentCount.textContent = String(state.documents.length);
  elements.jobCount.textContent = String(state.jobs.length);
  elements.fileCount.textContent = String(state.documents.filter((documentItem) => documentItem.fileName).length);
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
      button.type = "button";
      button.className = `workspace-item${workspace.id === state.activeWorkspaceId ? " active" : ""}`;
      button.addEventListener("click", () => selectWorkspace(workspace.id));
      button.append(textElement("strong", workspace.name), textElement("small", formatDate(workspace.createdAt)));
      return button;
    })
  );
}

function renderDocuments() {
  if (state.documents.length === 0) {
    elements.documentList.replaceChildren();
    elements.documentEmpty.classList.add("visible");
    elements.documentEmpty.textContent = state.activeWorkspaceId
      ? "No documents in this workspace."
      : "Create or select a workspace to begin.";
    return;
  }

  elements.documentEmpty.classList.remove("visible");
  elements.documentList.replaceChildren(
    ...state.documents.map((documentItem) => documentRow(documentItem))
  );
}

function documentRow(documentItem) {
  const row = document.createElement("article");
  row.className = "document-row";

  const main = document.createElement("div");
  main.className = "document-main";
  main.append(
    textElement("h3", documentItem.title),
    textElement("p", documentItem.fileName ? `${documentItem.fileName} - ${formatBytes(documentItem.size)}` : "No file uploaded")
  );

  const tags = document.createElement("div");
  tags.className = "tag-row";
  for (const tag of documentItem.tags.length ? documentItem.tags : ["No tags"]) {
    tags.append(textElement("span", tag));
  }

  const actions = document.createElement("div");
  actions.className = "row-actions";
  actions.append(uploadLabel(documentItem.id), processButton(documentItem.id));

  row.append(main, tags, statusBadge(documentItem.status), actions);
  return row;
}

function renderJobs() {
  if (state.jobs.length === 0) {
    elements.jobList.replaceChildren(textElement("div", "No jobs for this workspace.", "empty visible"));
    return;
  }

  elements.jobList.replaceChildren(
    ...state.jobs.map((job) => {
      const row = document.createElement("div");
      row.className = "job-row";
      row.append(textElement("strong", job.type), textElement("span", job.status, `job-status ${job.status}`));
      return row;
    })
  );
}

function uploadLabel(documentId) {
  const label = document.createElement("label");
  label.className = "secondary upload-action";
  label.textContent = "Upload";
  const input = document.createElement("input");
  input.type = "file";
  input.addEventListener("change", () => {
    const [file] = input.files;
    if (file) {
      runAction(() => uploadDocumentFile(documentId, file));
    }
    input.value = "";
  });
  label.append(input);
  return label;
}

function processButton(documentId) {
  const button = document.createElement("button");
  button.className = "secondary";
  button.type = "button";
  button.textContent = "Process";
  button.addEventListener("click", () => runAction(() => processDocument(documentId)));
  return button;
}

function statusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `status ${status}`;
  badge.textContent = status;
  return badge;
}

function textElement(tagName, text, className) {
  const element = document.createElement(tagName);
  element.textContent = text;
  if (className) {
    element.className = className;
  }
  return element;
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

function normalizeBackendUrl(value) {
  const url = String(value ?? "").trim();
  if (!url) {
    return "http://localhost:3000";
  }
  return url.replace(/\/+$/, "");
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
