import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { NotFoundError } from "../errors.js";

export function openSqliteDatabase(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  migrate(database);
  return database;
}

export function createSqliteRepositories(database) {
  return {
    workspaces: new SqliteWorkspaceRepository(database),
    documents: new SqliteDocumentRepository(database),
    jobs: new SqliteJobRepository(database)
  };
}

class SqliteWorkspaceRepository {
  constructor(database) {
    this.database = database;
  }

  async list() {
    return this.database
      .prepare(
        `SELECT id, name, description, created_at AS createdAt
         FROM workspaces
         ORDER BY created_at ASC`
      )
      .all();
  }

  async getById(id) {
    return (
      this.database
        .prepare(
          `SELECT id, name, description, created_at AS createdAt
           FROM workspaces
           WHERE id = ?`
        )
        .get(id) ?? null
    );
  }

  async create(workspace) {
    this.database
      .prepare(
        `INSERT INTO workspaces (id, name, description, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(
        workspace.id,
        workspace.name,
        workspace.description ?? null,
        workspace.createdAt
      );
    return workspace;
  }

  async update(workspace) {
    const result = this.database
      .prepare(
        `UPDATE workspaces
         SET name = ?, description = ?
         WHERE id = ?`
      )
      .run(workspace.name, workspace.description ?? null, workspace.id);

    if (result.changes === 0) {
      throw new NotFoundError(`Workspace '${workspace.id}' was not found.`);
    }
    return workspace;
  }

  async delete(id) {
    this.database.prepare("DELETE FROM workspaces WHERE id = ?").run(id);
  }
}

class SqliteDocumentRepository {
  constructor(database) {
    this.database = database;
  }

  async listByWorkspace(workspaceId) {
    return this.database
      .prepare(
        `SELECT id, workspace_id AS workspaceId, title, status, tags,
                created_at AS createdAt, updated_at AS updatedAt,
                file_name AS fileName, mime_type AS mimeType, size,
                file_stored_at AS fileStoredAt
         FROM documents
         WHERE workspace_id = ?
         ORDER BY updated_at DESC`
      )
      .all(workspaceId)
      .map(mapDocumentRow);
  }

  async getById(id) {
    const row = this.database
      .prepare(
        `SELECT id, workspace_id AS workspaceId, title, status, tags,
                created_at AS createdAt, updated_at AS updatedAt,
                file_name AS fileName, mime_type AS mimeType, size,
                file_stored_at AS fileStoredAt
         FROM documents
         WHERE id = ?`
      )
      .get(id);
    return row ? mapDocumentRow(row) : null;
  }

  async create(document) {
    this.database
      .prepare(
        `INSERT INTO documents
           (id, workspace_id, title, status, tags, created_at, updated_at,
            file_name, mime_type, size, file_stored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        document.id,
        document.workspaceId,
        document.title,
        document.status,
        JSON.stringify(document.tags),
        document.createdAt,
        document.updatedAt,
        document.fileName ?? null,
        document.mimeType ?? null,
        document.size ?? null,
        document.fileStoredAt ?? null
      );
    return document;
  }

  async update(document) {
    const result = this.database
      .prepare(
        `UPDATE documents
         SET title = ?, status = ?, tags = ?, updated_at = ?,
             file_name = ?, mime_type = ?, size = ?, file_stored_at = ?
         WHERE id = ?`
      )
      .run(
        document.title,
        document.status,
        JSON.stringify(document.tags),
        document.updatedAt,
        document.fileName ?? null,
        document.mimeType ?? null,
        document.size ?? null,
        document.fileStoredAt ?? null,
        document.id
      );

    if (result.changes === 0) {
      throw new NotFoundError(`Document '${document.id}' was not found.`);
    }
    return document;
  }

  async delete(id) {
    this.database.prepare("DELETE FROM documents WHERE id = ?").run(id);
  }

  async search(workspaceId, query) {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = await this.listByWorkspace(workspaceId);
    return rows.filter((document) => {
      const inTitle = document.title.toLowerCase().includes(normalizedQuery);
      const inTags = document.tags.some((tag) =>
        tag.toLowerCase().includes(normalizedQuery)
      );
      return inTitle || inTags;
    });
  }
}

class SqliteJobRepository {
  constructor(database) {
    this.database = database;
  }

  async enqueue(job) {
    this.database
      .prepare(
        `INSERT INTO jobs (id, document_id, type, status, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(job.id, job.documentId, job.type, job.status, job.createdAt);
    return job;
  }

  async list() {
    return this.database
      .prepare(
        `SELECT id, document_id AS documentId, type, status, created_at AS createdAt
         FROM jobs
         ORDER BY created_at DESC`
      )
      .all();
  }

  async listByDocument(documentId) {
    return this.database
      .prepare(
        `SELECT id, document_id AS documentId, type, status, created_at AS createdAt
         FROM jobs
         WHERE document_id = ?
         ORDER BY created_at DESC`
      )
      .all(documentId);
  }

  async listByStatus(status) {
    return this.database
      .prepare(
        `SELECT id, document_id AS documentId, type, status, created_at AS createdAt
         FROM jobs
         WHERE status = ?
         ORDER BY created_at ASC`
      )
      .all(status);
  }

  async getById(id) {
    return (
      this.database
        .prepare(
          `SELECT id, document_id AS documentId, type, status, created_at AS createdAt
           FROM jobs
           WHERE id = ?`
        )
        .get(id) ?? null
    );
  }

  async updateStatus(jobId, status) {
    const result = this.database
      .prepare("UPDATE jobs SET status = ? WHERE id = ?")
      .run(status, jobId);

    if (result.changes === 0) {
      throw new NotFoundError(`Job '${jobId}' was not found.`);
    }
  }
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_documents_workspace
      ON documents(workspace_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_document
      ON jobs(document_id);
  `);
  ensureColumn(database, "documents", "file_name", "TEXT");
  ensureColumn(database, "documents", "mime_type", "TEXT");
  ensureColumn(database, "documents", "size", "INTEGER");
  ensureColumn(database, "documents", "file_stored_at", "TEXT");
}

function mapDocumentRow(row) {
  const document = {
    ...row,
    tags: JSON.parse(row.tags)
  };
  for (const key of ["fileName", "mimeType", "size", "fileStoredAt"]) {
    if (document[key] === null) {
      delete document[key];
    }
  }
  return document;
}

function ensureColumn(database, tableName, columnName, definition) {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all()
    .map((column) => column.name);
  if (!columns.includes(columnName)) {
    database.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}
