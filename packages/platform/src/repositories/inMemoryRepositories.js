import { NotFoundError } from "../errors.js";

export class InMemoryWorkspaceRepository {
  #workspaces = new Map();

  async list() {
    return [...this.#workspaces.values()];
  }

  async getById(id) {
    return this.#workspaces.get(id) ?? null;
  }

  async create(workspace) {
    this.#workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async update(workspace) {
    if (!this.#workspaces.has(workspace.id)) {
      throw new NotFoundError(`Workspace '${workspace.id}' was not found.`);
    }
    this.#workspaces.set(workspace.id, workspace);
    return workspace;
  }

  async delete(id) {
    this.#workspaces.delete(id);
  }
}

export class InMemoryDocumentRepository {
  #documents = new Map();

  async listByWorkspace(workspaceId) {
    return [...this.#documents.values()].filter(
      (document) => document.workspaceId === workspaceId
    );
  }

  async getById(id) {
    return this.#documents.get(id) ?? null;
  }

  async create(document) {
    this.#documents.set(document.id, document);
    return document;
  }

  async update(document) {
    if (!this.#documents.has(document.id)) {
      throw new NotFoundError(`Document '${document.id}' was not found.`);
    }
    this.#documents.set(document.id, document);
    return document;
  }

  async delete(id) {
    this.#documents.delete(id);
  }

  async search(workspaceId, query) {
    const normalizedQuery = query.trim().toLowerCase();
    return [...this.#documents.values()].filter((document) => {
      const inWorkspace = document.workspaceId === workspaceId;
      const inTitle = document.title.toLowerCase().includes(normalizedQuery);
      const inTags = document.tags.some((tag) =>
        tag.toLowerCase().includes(normalizedQuery)
      );
      return inWorkspace && (inTitle || inTags);
    });
  }
}

export class InMemoryJobRepository {
  #jobs = new Map();

  async enqueue(job) {
    this.#jobs.set(job.id, job);
    return job;
  }

  async list() {
    return [...this.#jobs.values()];
  }

  async listByDocument(documentId) {
    return [...this.#jobs.values()].filter(
      (job) => job.documentId === documentId
    );
  }

  async listByStatus(status) {
    return [...this.#jobs.values()].filter((job) => job.status === status);
  }

  async getById(id) {
    return this.#jobs.get(id) ?? null;
  }

  async updateStatus(jobId, status) {
    const job = this.#jobs.get(jobId);
    if (!job) {
      throw new NotFoundError(`Job '${jobId}' was not found.`);
    }
    this.#jobs.set(jobId, { ...job, status });
  }
}
