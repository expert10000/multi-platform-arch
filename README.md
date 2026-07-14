# DZONE Shared Platform

This workspace implements the runtime-independent platform described in the template:

- shared domain models and business services
- repository abstractions with an in-memory implementation
- SQLite persistence for the local backend runtime
- worker protocol with an in-memory queue
- OpenAPI contract as the public boundary
- Node HTTP backend as one replaceable runtime host
- Spring Boot backend as a JVM/server runtime option
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
  backends/spring/             Spring Boot implementation of the same contract
  hosts/admin/public/          Central admin console
  hosts/web/public/            Separate web workspace host
  hosts/electron/              Desktop host scaffold
  hosts/dotnet-desktop/        Lightweight .NET desktop host
  hosts/maui/                  Optional .NET MAUI desktop host notes
  hosts/shared/public/         Contract-named browser API client
tests/
  platform.test.js             Service-level verification
  jobWorker.test.js            Worker lifecycle verification
docs/
  architecture.md              Implementation notes
```

## Run

```bash
npm run check:local
npm test
npm start
```

The backend listens on `http://localhost:3000` by default.
Open `http://localhost:3000` for the central admin console.
Open `http://localhost:3000/web/` for the separate web host.
Data is stored locally in `data/platform.sqlite`.
Uploaded files are stored locally under `data/files/`.

The browser hosts call the backend through `apps/hosts/shared/public/apiClient.js`, whose
operation names match `contracts/openapi.yaml`.
Processing jobs are picked up by the local worker and move from `queued` to
`running` to `completed`.

## Fresh Clone Setup

On Windows, check the local machine:

```powershell
npm run check:local
```

If prerequisites are missing, bootstrap the local developer machine:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-local.ps1
```

That script installs or repairs:

- Node.js LTS through `winget`
- Python 3.11 through `winget`
- .NET SDK 10 through `winget`
- Java 17 through `winget`
- Maven through `winget`, with an official Apache Maven archive fallback
- Electron host dependencies through `npm --prefix apps/hosts/electron install`

The optional MAUI workload is intentionally not installed by default because it is large.
Install it only when needed:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-local.ps1 -IncludeMaui
```

Important bootstrap boundary: Node.js must exist before the dashboard can start.
After Node is installed, the Central Admin console can launch local runtimes.
Its Local Setup tab can install or repair Python, .NET SDK, Electron host
dependencies, Spring Java/Maven tooling, and the optional MAUI workload from the
web UI.

### Fresh Computer Smoke Test

Expected first run on another Windows computer:

```powershell
git clone https://github.com/expert10000/multi-platform-arch.git
cd multi-platform-arch
npm install
npm run start:backend:node
```

Then open `http://localhost:3000/` and use the Central Admin **Local Setup** tab.
From there, install or repair Python, .NET SDK, Electron dependencies,
Spring Java/Maven tooling, and MAUI as needed.

Requirements and caveats:

- Node.js must be installed before this dashboard can run.
- Internet access is required for `winget`, Maven fallback downloads, and npm installs.
- `winget` should be available for automatic Windows tool installs.
- PowerShell script execution must be allowed for the setup scripts.
- Some installers may ask for administrator or UAC approval.
- If an installer changes `PATH`, restart the terminal before retrying a runtime.

## Backends

Run the Node backend and bundled web host:

```bash
npm run start:backend:node
```

Run the dependency-free Python backend:

```bash
npm run start:backend:python
```

Run the Spring Boot backend after installing JDK 17+ and Maven:

```bash
npm run start:backend:spring
```

The Spring Boot backend listens on `http://localhost:3200` by default.

Run the ASP.NET Core backend after installing the .NET SDK:

```bash
npm run start:backend:aspnet
```

The ASP.NET Core backend listens on `http://localhost:3300` by default.

All backends expose the same OpenAPI route surface. The Python backend keeps
metadata in memory and stores uploaded bytes under `data/python-files/`. The
Spring Boot backend keeps metadata in memory, stores uploaded bytes under
`data/spring-files/`, serves the same admin and web hosts, and implements the
same desktop host control endpoints. Backends allow cross-origin requests so
hosts can be served separately and point their API client at any compatible
backend URL.

## Backend Choice

Use Node as the local/default dashboard backend, especially for desktop launcher
workflows and quick local development. Use Spring Boot for shared/server
deployments where JVM operations, enterprise integrations, and Java ecosystem
tooling are preferred. Desktop hosts should not be hardwired to one backend:
keep `DZONE_BACKEND_URL` as the switch so a desktop can use Node locally or
Spring Boot when connected to a shared service.

## Hosts

Run the default lightweight .NET desktop host:

```bash
npm run start:host:dotnet-desktop
```

Run the Electron desktop host after installing its local dependencies:

```bash
cd apps/hosts/electron
npm install
npm start
```

By default the Electron host talks to `http://localhost:3000`. Set
`DZONE_BACKEND_URL` to point it at another compatible backend.

The optional .NET MAUI host is not required for a default clone. Install it only
when you want to build the MAUI desktop/mobile path:

```bash
npm run setup:host:maui
```

The Admin console also exposes this as an explicit `Install MAUI` setup action.
It runs the same helper script and does not install anything until clicked. Use
`Setup Status` on the same card to see the last installer output.

Check the optional workload without installing:

```bash
npm run check:host:maui
```

Run the optional MAUI desktop host after the workload is installed:

```bash
npm run start:host:maui
```

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
