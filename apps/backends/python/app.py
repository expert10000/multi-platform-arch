from __future__ import annotations

import argparse
import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


DOCUMENT_STATUSES = {"draft", "review", "approved", "archived"}
JOB_TYPES = {"extract-text", "thumbnail", "summarize", "index-search"}


class ApiError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


@dataclass
class Store:
    file_root: Path
    workspaces: dict[str, dict] = field(default_factory=dict)
    documents: dict[str, dict] = field(default_factory=dict)
    jobs: dict[str, dict] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def create_workspace(self, payload: dict) -> dict:
        name = require_text(payload.get("name"), "Workspace name")
        workspace = {
            "id": create_id("workspace"),
            "name": name,
            "createdAt": now_iso(),
        }
        description = payload.get("description")
        if description:
            workspace["description"] = require_text(description, "Description")
        with self.lock:
            self.workspaces[workspace["id"]] = workspace
        return workspace

    def list_workspaces(self) -> list[dict]:
        with self.lock:
            return list(self.workspaces.values())

    def get_workspace(self, workspace_id: str) -> dict:
        with self.lock:
            workspace = self.workspaces.get(workspace_id)
        if not workspace:
            raise ApiError(404, f"Workspace '{workspace_id}' was not found.")
        return workspace

    def create_document(self, payload: dict) -> dict:
        workspace_id = require_text(payload.get("workspaceId"), "Workspace id")
        self.get_workspace(workspace_id)
        title = require_text(payload.get("title"), "Document title")
        status = payload.get("status", "draft")
        validate_status(status)
        timestamp = now_iso()
        document = {
            "id": create_id("document"),
            "workspaceId": workspace_id,
            "title": title,
            "status": status,
            "tags": normalize_tags(payload.get("tags", [])),
            "createdAt": timestamp,
            "updatedAt": timestamp,
        }
        with self.lock:
            self.documents[document["id"]] = document
        return document

    def list_documents(self, workspace_id: str) -> list[dict]:
        self.get_workspace(require_text(workspace_id, "Workspace id"))
        with self.lock:
            documents = [
                document
                for document in self.documents.values()
                if document["workspaceId"] == workspace_id
            ]
        return sorted(documents, key=lambda item: item["updatedAt"], reverse=True)

    def get_document(self, document_id: str) -> dict:
        with self.lock:
            document = self.documents.get(document_id)
        if not document:
            raise ApiError(404, f"Document '{document_id}' was not found.")
        return document

    def update_document(self, document_id: str, payload: dict) -> dict:
        existing = dict(self.get_document(document_id))
        status = payload.get("status", existing["status"])
        validate_status(status)
        if "title" in payload:
            existing["title"] = require_text(payload["title"], "Document title")
        if "tags" in payload:
            existing["tags"] = normalize_tags(payload["tags"])
        existing["status"] = status
        existing["updatedAt"] = next_timestamp_after(existing["updatedAt"])
        with self.lock:
            self.documents[document_id] = existing
        return existing

    def delete_document(self, document_id: str) -> None:
        self.get_document(document_id)
        with self.lock:
            self.documents.pop(document_id, None)
            self.jobs = {
                job_id: job
                for job_id, job in self.jobs.items()
                if job["documentId"] != document_id
            }

    def attach_file(self, document_id: str, file_name: str, mime_type: str, content: bytes) -> dict:
        if not content:
            raise ApiError(400, "File content is required.")
        existing = dict(self.get_document(document_id))
        document_dir = self.file_root / safe_segment(document_id)
        document_dir.mkdir(parents=True, exist_ok=True)
        (document_dir / safe_file_name(file_name)).write_bytes(content)
        existing.update(
            {
                "fileName": require_text(file_name, "File name"),
                "mimeType": require_text(mime_type, "MIME type"),
                "size": len(content),
                "fileStoredAt": now_iso(),
                "updatedAt": next_timestamp_after(existing["updatedAt"]),
            }
        )
        with self.lock:
            self.documents[document_id] = existing
        return existing

    def enqueue_job(self, document_id: str, job_type: str = "extract-text") -> dict:
        self.get_document(document_id)
        if job_type not in JOB_TYPES:
            raise ApiError(400, f"Unsupported processing job type '{job_type}'.")
        job = {
            "id": create_id("job"),
            "documentId": document_id,
            "type": job_type,
            "status": "queued",
            "createdAt": now_iso(),
        }
        with self.lock:
            self.jobs[job["id"]] = job
        return job

    def list_jobs(self, document_id: str | None = None) -> list[dict]:
        if document_id:
            self.get_document(document_id)
        with self.lock:
            jobs = [
                job
                for job in self.jobs.values()
                if not document_id or job["documentId"] == document_id
            ]
        return sorted(jobs, key=lambda item: item["createdAt"], reverse=True)

    def get_job(self, job_id: str) -> dict:
        with self.lock:
            job = self.jobs.get(job_id)
        if not job:
            raise ApiError(404, f"Job '{job_id}' was not found.")
        return job


class RequestHandler(BaseHTTPRequestHandler):
    store: Store

    def do_GET(self) -> None:
        self.handle_request("GET")

    def do_POST(self) -> None:
        self.handle_request("POST")

    def do_PUT(self) -> None:
        self.handle_request("PUT")

    def do_DELETE(self) -> None:
        self.handle_request("DELETE")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def handle_request(self, method: str) -> None:
        try:
            parsed = urlparse(self.path)
            path = parsed.path
            query = parse_qs(parsed.query)

            if method == "GET" and path == "/health":
                return self.send_json(200, {"ok": True, "runtime": "python"})

            if method == "GET" and path == "/workspaces":
                return self.send_json(200, self.store.list_workspaces())

            if method == "POST" and path == "/workspaces":
                return self.send_json(201, self.store.create_workspace(self.read_json()))

            workspace_match = re.fullmatch(r"/workspaces/([^/]+)", path)
            if method == "GET" and workspace_match:
                return self.send_json(200, self.store.get_workspace(unquote(workspace_match.group(1))))

            if method == "GET" and path == "/documents":
                workspace_id = first_query_value(query, "workspaceId")
                return self.send_json(200, self.store.list_documents(workspace_id))

            if method == "POST" and path == "/documents":
                return self.send_json(201, self.store.create_document(self.read_json()))

            file_match = re.fullmatch(r"/documents/([^/]+)/file", path)
            if method == "POST" and file_match:
                document_id = unquote(file_match.group(1))
                file_name = unquote(require_text(self.headers.get("x-file-name"), "x-file-name header"))
                mime_type = self.headers.get("content-type", "application/octet-stream")
                document = self.store.attach_file(document_id, file_name, mime_type, self.read_body())
                job = self.store.enqueue_job(document_id, "extract-text")
                return self.send_json(202, {"document": document, "job": job})

            process_match = re.fullmatch(r"/documents/([^/]+)/process", path)
            if method == "POST" and process_match:
                payload = self.read_json(default={})
                job = self.store.enqueue_job(
                    unquote(process_match.group(1)),
                    payload.get("type", "extract-text"),
                )
                return self.send_json(202, job)

            document_match = re.fullmatch(r"/documents/([^/]+)", path)
            if document_match:
                document_id = unquote(document_match.group(1))
                if method == "GET":
                    return self.send_json(200, self.store.get_document(document_id))
                if method == "PUT":
                    return self.send_json(200, self.store.update_document(document_id, self.read_json()))
                if method == "DELETE":
                    self.store.delete_document(document_id)
                    self.send_response(204)
                    self.send_cors_headers()
                    self.end_headers()
                    return

            if method == "GET" and path == "/jobs":
                return self.send_json(200, self.store.list_jobs(first_query_value(query, "documentId", required=False)))

            job_match = re.fullmatch(r"/jobs/([^/]+)", path)
            if method == "GET" and job_match:
                return self.send_json(200, self.store.get_job(unquote(job_match.group(1))))

            raise ApiError(404, f"Route '{method} {path}' was not found.")
        except ApiError as error:
            self.send_json(error.status_code, {"error": error.message})
        except json.JSONDecodeError:
            self.send_json(400, {"error": "Invalid JSON body."})
        except Exception:
            self.send_json(500, {"error": "Internal server error."})

    def read_body(self) -> bytes:
        content_length = int(self.headers.get("content-length", "0"))
        return self.rfile.read(content_length)

    def read_json(self, default: dict | None = None) -> dict:
        body = self.read_body()
        if not body and default is not None:
            return default
        if not body:
            return {}
        return json.loads(body.decode("utf-8"))

    def send_json(self, status_code: int, payload) -> None:
        content = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(content)))
        self.send_cors_headers()
        self.end_headers()
        self.wfile.write(content)

    def send_cors_headers(self) -> None:
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type, x-file-name")

    def log_message(self, format: str, *args) -> None:
        return


def create_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4()}"


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int(time.time_ns() / 1_000_000) % 1000:03d}Z"


def next_timestamp_after(previous_timestamp: str) -> str:
    current_ms = int(time.time() * 1000)
    previous_ms = parse_iso_ms(previous_timestamp)
    value = max(current_ms, previous_ms + 1)
    seconds, milliseconds = divmod(value, 1000)
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(seconds)) + f".{milliseconds:03d}Z"


def parse_iso_ms(value: str) -> int:
    normalized = value.replace("Z", "+00:00")
    from datetime import datetime

    return int(datetime.fromisoformat(normalized).timestamp() * 1000)


def require_text(value, label: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ApiError(400, f"{label} is required.")
    return value.strip()


def normalize_tags(tags) -> list[str]:
    if not isinstance(tags, list):
        raise ApiError(400, "Tags must be an array.")
    normalized = []
    for tag in tags:
        text = require_text(tag, "Tag")
        if text not in normalized:
            normalized.append(text)
    return normalized


def validate_status(status: str) -> None:
    if status not in DOCUMENT_STATUSES:
        raise ApiError(400, f"Unsupported document status '{status}'.")


def first_query_value(query: dict, key: str, required: bool = True) -> str | None:
    values = query.get(key)
    if not values:
        if required:
            raise ApiError(400, f"{key} is required.")
        return None
    return values[0]


def safe_segment(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", value)


def safe_file_name(value: str) -> str:
    sanitized = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", value).strip()
    return sanitized or "upload.bin"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "3100")))
    parser.add_argument(
        "--file-root",
        default=os.environ.get("DZONE_FILE_STORAGE_PATH", "data/python-files"),
    )
    args = parser.parse_args()

    handler = type("DzonePythonHandler", (RequestHandler,), {})
    handler.store = Store(Path(args.file_root))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(json.dumps({"url": f"http://127.0.0.1:{server.server_port}", "runtime": "python"}), flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
