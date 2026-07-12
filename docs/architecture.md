# Runtime-Independent Platform Implementation

The template has been translated into a small working platform starter. The implementation separates business behavior from runtime concerns:

- domain objects live in `packages/platform/src/domain.js`
- repository contracts are documented in `packages/platform/src/repositories/contracts.js`
- SQLite persistence lives in `packages/platform/src/repositories/sqliteRepositories.js`
- application workflow lives in `packages/platform/src/services/documentService.js`
- worker protocol lives in `packages/platform/src/workers/inMemoryWorkerQueue.js`
- job execution lives in `packages/platform/src/workers/jobWorker.js`
- HTTP transport lives in `apps/node-backend/src/server.js`
- the browser API client lives in `apps/web/public/apiClient.js`

## Shared Business Platform

The shared platform owns business concepts such as workspaces, documents, document status, tags, and processing jobs. It does not depend on Express, databases, file systems, browsers, or UI frameworks.

The `DocumentService` coordinates validation, repositories, and workers. It does not know whether the repository stores data in memory, SQLite, PostgreSQL, SQL Server, or a remote service.

## Contracts

The API boundary is described in `contracts/openapi.yaml`. Backends should implement that contract, and clients should consume it through generated DTOs or client SDKs in a larger production version.

The current browser client uses operation names that match the OpenAPI `operationId` values. Contract coverage tests compare those names against the OpenAPI document and exercise each route through the backend.

## Runtime Hosts

The included Node backend is intentionally small and dependency-free. It demonstrates how a backend runtime can expose the shared platform through HTTP without owning the business logic. In local mode it uses SQLite storage at `data/platform.sqlite`.

The backend starts a local job worker. The worker polls queued jobs from the repository, marks each job `running`, executes the handler for the job type, then marks the job `completed` or `failed`. Because queued jobs are read from the repository, jobs remain recoverable after a process restart.

Other hosts can follow the same pattern:

- React, Electron, React Native, MAUI, Uno, or Flutter clients consume the OpenAPI contract.
- ASP.NET Core, Spring Boot, FastAPI, or Go backends implement the same contract.
- SQLite, PostgreSQL, SQL Server, or in-memory stores implement the same repository behavior.
- Python, Node, AI, or search workers implement the same job protocol.

## Next Implementation Steps

Good follow-up increments would be:

- add generated TypeScript DTOs from the OpenAPI contract
- add a SQLite repository implementation for local desktop/offline use
- add a React or Electron host that consumes the API
- add contract tests that compare backend behavior against `contracts/openapi.yaml`
