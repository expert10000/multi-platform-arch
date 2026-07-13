# Electron Host

Desktop host for the shared platform contract.

It uses its own renderer and the shared browser API client. By default it talks to the local Node backend at `http://localhost:3000`.

Run after installing this host's dependencies:

```bash
npm install
npm start
```

Use a different backend:

```bash
DZONE_BACKEND_URL=http://localhost:3100 npm start
```
