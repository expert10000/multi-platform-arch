import {
  createId,
  isDocumentStatus,
  isProcessingJobType,
  nowIso
} from "../domain.js";
import { NotFoundError, ValidationError } from "../errors.js";

export class DocumentService {
  constructor({ workspaces, documents, jobs, workerQueue }) {
    this.workspaces = workspaces;
    this.documents = documents;
    this.jobs = jobs;
    this.workerQueue = workerQueue;
  }

  async listWorkspaces() {
    return this.workspaces.list();
  }

  async getWorkspace(id) {
    const workspace = await this.workspaces.getById(id);
    if (!workspace) {
      throw new NotFoundError(`Workspace '${id}' was not found.`);
    }
    return workspace;
  }

  async createWorkspace(input) {
    const name = requireText(input?.name, "Workspace name");
    const workspace = {
      id: createId("workspace"),
      name,
      description: optionalText(input.description),
      createdAt: nowIso()
    };
    return this.workspaces.create(workspace);
  }

  async listDocuments(workspaceId) {
    await this.getWorkspace(workspaceId);
    return this.documents.listByWorkspace(workspaceId);
  }

  async getDocument(id) {
    const document = await this.documents.getById(id);
    if (!document) {
      throw new NotFoundError(`Document '${id}' was not found.`);
    }
    return document;
  }

  async createDocument(input) {
    const workspaceId = requireText(input?.workspaceId, "Workspace id");
    await this.getWorkspace(workspaceId);

    const title = requireText(input?.title, "Document title");
    const status = input.status ?? "draft";
    validateDocumentStatus(status);

    const timestamp = nowIso();
    const document = {
      id: createId("document"),
      workspaceId,
      title,
      status,
      tags: normalizeTags(input.tags),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    return this.documents.create(document);
  }

  async updateDocument(id, input) {
    const existing = await this.getDocument(id);
    const nextStatus = input.status ?? existing.status;
    validateDocumentStatus(nextStatus);

    const updatedAt = nextTimestampAfter(existing.updatedAt);
    const updated = {
      ...existing,
      title:
        input.title === undefined
          ? existing.title
          : requireText(input.title, "Document title"),
      status: nextStatus,
      tags: input.tags === undefined ? existing.tags : normalizeTags(input.tags),
      updatedAt
    };

    return this.documents.update(updated);
  }

  async deleteDocument(id) {
    await this.getDocument(id);
    await this.documents.delete(id);
  }

  async attachDocumentFile(id, input) {
    const existing = await this.getDocument(id);
    const size = validateFileSize(input?.size);
    const updated = {
      ...existing,
      fileName: requireText(input?.fileName, "File name"),
      mimeType: requireText(input?.mimeType, "MIME type"),
      size,
      fileStoredAt: nowIso(),
      updatedAt: nextTimestampAfter(existing.updatedAt)
    };

    return this.documents.update(updated);
  }

  async searchDocuments(workspaceId, query) {
    await this.getWorkspace(workspaceId);
    return this.documents.search(workspaceId, requireText(query, "Query"));
  }

  async processDocument(id, type = "extract-text") {
    const document = await this.getDocument(id);
    if (!isProcessingJobType(type)) {
      throw new ValidationError(`Unsupported processing job type '${type}'.`);
    }

    const job = await this.jobs.enqueue({
      id: createId("job"),
      documentId: document.id,
      type,
      status: "queued",
      createdAt: nowIso()
    });

    await this.workerQueue.enqueue(job);
    return job;
  }

  async listJobs(documentId) {
    if (documentId) {
      await this.getDocument(documentId);
      return this.jobs.listByDocument(documentId);
    }
    return this.jobs.list();
  }

  async getJob(id) {
    const job = await this.jobs.getById(id);
    if (!job) {
      throw new NotFoundError(`Job '${id}' was not found.`);
    }
    return job;
  }
}

function requireText(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${label} is required.`);
  }
  return value.trim();
}

function optionalText(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireText(value, "Description");
}

function normalizeTags(tags = []) {
  if (!Array.isArray(tags)) {
    throw new ValidationError("Tags must be an array.");
  }
  return [...new Set(tags.map((tag) => requireText(tag, "Tag")))];
}

function validateDocumentStatus(status) {
  if (!isDocumentStatus(status)) {
    throw new ValidationError(`Unsupported document status '${status}'.`);
  }
}

function validateFileSize(size) {
  if (!Number.isInteger(size) || size <= 0) {
    throw new ValidationError("File size must be a positive integer.");
  }
  return size;
}

function nextTimestampAfter(previousTimestamp) {
  const current = new Date(nowIso()).getTime();
  const previous = new Date(previousTimestamp).getTime();
  return new Date(Math.max(current, previous + 1)).toISOString();
}
