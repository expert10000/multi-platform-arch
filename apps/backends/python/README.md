# Python Backend

This backend is a dependency-free Python implementation of the shared OpenAPI contract. It is intentionally small so it can run anywhere Python 3.11+ is available.

It keeps metadata in memory and stores uploaded file bytes under `data/python-files/` by default.

The backend also runs a lightweight background worker thread. It processes the shared job types:

- `extract-text`
- `thumbnail`
- `summarize`
- `index-search`

This keeps Python as the preferred place for future OCR, AI, embedding, and search libraries while preserving the same API contract used by every backend.

Run:

```bash
python apps/backends/python/app.py
```

Set a custom port:

```bash
PORT=3100 python apps/backends/python/app.py
```
