export const apiOperations = Object.freeze({
  getHealth: "GET /health",
  listWorkspaces: "GET /workspaces",
  createWorkspace: "POST /workspaces",
  getWorkspace: "GET /workspaces/{id}",
  listDocuments: "GET /documents",
  createDocument: "POST /documents",
  getDocument: "GET /documents/{id}",
  updateDocument: "PUT /documents/{id}",
  deleteDocument: "DELETE /documents/{id}",
  processDocument: "POST /documents/{id}/process",
  uploadDocumentFile: "POST /documents/{id}/file",
  listJobs: "GET /jobs",
  getJob: "GET /jobs/{id}",
  launchElectronHost: "POST /runtime/hosts/electron/open",
  closeElectronHost: "POST /runtime/hosts/electron/close",
  launchDotnetDesktopHost: "POST /runtime/hosts/dotnet-desktop/open",
  closeDotnetDesktopHost: "POST /runtime/hosts/dotnet-desktop/close"
});

export const platformApi = createPlatformApi();

export function createPlatformApi({ baseUrl = "" } = {}) {
  return {
    getHealth() {
      return request(baseUrl, "/health");
    },

    listWorkspaces() {
      return request(baseUrl, "/workspaces");
    },

    createWorkspace(input) {
      return request(baseUrl, "/workspaces", {
        method: "POST",
        body: input
      });
    },

    getWorkspace(id) {
      return request(baseUrl, `/workspaces/${encodeId(id)}`);
    },

    listDocuments(workspaceId) {
      return request(baseUrl, `/documents?workspaceId=${encodeId(workspaceId)}`);
    },

    createDocument(input) {
      return request(baseUrl, "/documents", {
        method: "POST",
        body: input
      });
    },

    getDocument(id) {
      return request(baseUrl, `/documents/${encodeId(id)}`);
    },

    updateDocument(id, input) {
      return request(baseUrl, `/documents/${encodeId(id)}`, {
        method: "PUT",
        body: input
      });
    },

    deleteDocument(id) {
      return request(baseUrl, `/documents/${encodeId(id)}`, {
        method: "DELETE"
      });
    },

    processDocument(id, input = {}) {
      return request(baseUrl, `/documents/${encodeId(id)}/process`, {
        method: "POST",
        body: input
      });
    },

    uploadDocumentFile(id, file) {
      return requestFile(baseUrl, `/documents/${encodeId(id)}/file`, file);
    },

    listJobs(documentId) {
      const query = documentId ? `?documentId=${encodeId(documentId)}` : "";
      return request(baseUrl, `/jobs${query}`);
    },

    getJob(id) {
      return request(baseUrl, `/jobs/${encodeId(id)}`);
    },

    launchElectronHost() {
      return request(baseUrl, "/runtime/hosts/electron/open", {
        method: "POST"
      });
    },

    closeElectronHost() {
      return request(baseUrl, "/runtime/hosts/electron/close", {
        method: "POST"
      });
    },

    launchDotnetDesktopHost() {
      return request(baseUrl, "/runtime/hosts/dotnet-desktop/open", {
        method: "POST"
      });
    },

    closeDotnetDesktopHost() {
      return request(baseUrl, "/runtime/hosts/dotnet-desktop/close", {
        method: "POST"
      });
    }
  };
}

async function request(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(error.error);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function requestFile(baseUrl, path, file) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name || "upload.bin")
    },
    body: file
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed." }));
    throw new Error(error.error);
  }

  return response.json();
}

function encodeId(id) {
  return encodeURIComponent(id);
}
