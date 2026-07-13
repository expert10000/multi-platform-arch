# Electron Host

Desktop host for the shared platform contract.

It uses its own renderer and the shared browser API client. It exposes the same core workflow as the Web Host:

- browse and create workspaces
- create documents
- upload local files
- queue document processing
- monitor jobs
- switch between compatible backends
- open the Admin and Web Host surfaces in the system browser

By default it talks to the local Node backend at `http://localhost:3000`. The desktop UI also includes a backend field and remembers the last connected backend on that machine.

Run after installing this host's dependencies:

```bash
npm install
npm start
```

Use a different backend:

```bash
DZONE_BACKEND_URL=http://localhost:3100 npm start
```
