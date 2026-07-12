# DZONE Shared Platform

This workspace implements the runtime-independent platform described in the template:

- shared domain models and business services
- repository abstractions with an in-memory implementation
- SQLite persistence for the local backend runtime
- worker protocol with an in-memory queue
- OpenAPI contract as the public boundary
- Node HTTP backend as one replaceable runtime host
- local web host for workspaces, documents, and processing jobs
- background worker lifecycle for queued jobs
- local file ingestion with document metadata stored in SQLite

The key idea is that hosts, backends, databases, and workers can change while the domain workflow and public contract stay stable.

## Project Layout

```text
contracts/
  openapi.yaml                 Public API contract
packages/
  platform/src/                Runtime-independent domain, repositories, services, workers
apps/
  backends/node/src/           Node HTTP implementation of the contract
  backends/python/             Python HTTP implementation of the same contract
  hosts/web/public/            Browser workspace and contract-named API client
tests/
  platform.test.js             Service-level verification
  jobWorker.test.js            Worker lifecycle verification
docs/
  architecture.md              Implementation notes
```

## Run

```bash
npm test
npm start
```

The backend listens on `http://localhost:3000` by default.
Open `http://localhost:3000` for the central admin console.
Data is stored locally in `data/platform.sqlite`.
Uploaded files are stored locally under `data/files/`.

The browser host is the central admin console. It calls the backend through `apps/hosts/web/public/apiClient.js`, whose
operation names match `contracts/openapi.yaml`.
Processing jobs are picked up by the local worker and move from `queued` to
`running` to `completed`.

## Backends

Run the Node backend and bundled web host:

```bash
npm run start:backend:node
```

Run the dependency-free Python backend:

```bash
npm run start:backend:python
```

Both backends expose the same OpenAPI route surface. The Python backend keeps
metadata in memory and stores uploaded bytes under `data/python-files/`.
Both backends allow cross-origin requests so hosts can be served separately and
point their API client at either backend URL.

Example:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/workspaces
```

To use a different database file:

```bash
DZONE_DATABASE_PATH=/path/to/platform.sqlite npm start
```

## Architecture

```text
Application Host
      |
      v
OpenAPI Contract
      |
      v
Backend Runtime
      |
      v
Application Services
      |
      v
Repository Abstractions + Worker Protocols
```

The current backend uses in-memory repositories so the system is easy to run and test. A SQLite, PostgreSQL, SQL Server, FastAPI, ASP.NET Core, Spring Boot, or Go implementation can be added by implementing the same repository and service contracts.
