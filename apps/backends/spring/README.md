# DZONE Spring Boot Backend

Spring Boot implementation of the same public API contract used by the Node and Python backends.

## Run

Install a JDK 17+ and Maven, then run:

```bash
npm run start:backend:spring
```

The Spring backend listens on `http://localhost:3200` by default.

Use another port with:

```bash
SERVER_PORT=3200 npm run start:backend:spring
```

Uploaded files are stored under `data/spring-files/` by default. Set
`DZONE_FILE_STORAGE_PATH` to use another folder.

## Host Strategy

All hosts should keep using the OpenAPI contract and select a backend by URL.

- Use Spring Boot for shared/server deployments where JVM operations, observability, and enterprise integrations matter.
- Use Node for the local dashboard default and desktop launcher workflows.
- Keep both as options for desktop hosts by setting `DZONE_BACKEND_URL` to either backend.

