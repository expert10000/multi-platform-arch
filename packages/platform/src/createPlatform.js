import {
  InMemoryDocumentRepository,
  InMemoryJobRepository,
  InMemoryWorkspaceRepository
} from "./repositories/inMemoryRepositories.js";
import {
  createSqliteRepositories,
  openSqliteDatabase
} from "./repositories/sqliteRepositories.js";
import { DocumentService } from "./services/documentService.js";
import { InMemoryWorkerQueue } from "./workers/inMemoryWorkerQueue.js";
import { JobWorker } from "./workers/jobWorker.js";

export function createPlatform() {
  const repositories = {
    workspaces: new InMemoryWorkspaceRepository(),
    documents: new InMemoryDocumentRepository(),
    jobs: new InMemoryJobRepository()
  };
  const workerQueue = new InMemoryWorkerQueue();

  return {
    repositories,
    workerQueue,
    workers: {
      jobs: new JobWorker({
        jobs: repositories.jobs
      })
    },
    services: {
      documents: new DocumentService({
        ...repositories,
        workerQueue
      })
    }
  };
}

export function createSqlitePlatform({ databasePath } = {}) {
  if (!databasePath) {
    throw new Error("databasePath is required for SQLite platform storage.");
  }

  const database = openSqliteDatabase(databasePath);
  const repositories = createSqliteRepositories(database);
  const workerQueue = new InMemoryWorkerQueue();

  return {
    database,
    repositories,
    workerQueue,
    workers: {
      jobs: new JobWorker({
        jobs: repositories.jobs
      })
    },
    close() {
      database.close();
    },
    services: {
      documents: new DocumentService({
        ...repositories,
        workerQueue
      })
    }
  };
}
