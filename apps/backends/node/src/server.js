import { createServer as createHttpServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatform, NotFoundError, ValidationError } from "../../../../packages/platform/src/index.js";

const publicRoot = fileURLToPath(new URL("../../../hosts/web/public", import.meta.url));
const defaultFileStorageRoot = fileURLToPath(new URL("../../../../data/files/", import.meta.url));

export function createServer(platform = createPlatform(), { fileStorageRoot = defaultFileStorageRoot } = {}) {
  const service = platform.services.documents;

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const method = request.method ?? "GET";
      const path = url.pathname;

      if (method === "GET" && isStaticRequest(path)) {
        const served = await tryServeStatic(path, response);
        if (served) {
          return;
        }
      }

      if (method === "GET" && path === "/health") {
        return sendJson(response, 200, { ok: true, runtime: "node" });
      }

      if (method === "GET" && path === "/workspaces") {
        return sendJson(response, 200, await service.listWorkspaces());
      }

      if (method === "POST" && path === "/workspaces") {
        return sendJson(response, 201, await service.createWorkspace(await readJson(request)));
      }

      const workspaceMatch = path.match(/^\/workspaces\/([^/]+)$/);
      if (workspaceMatch && method === "GET") {
        return sendJson(response, 200, await service.getWorkspace(workspaceMatch[1]));
      }

      if (method === "GET" && path === "/documents") {
        const workspaceId = url.searchParams.get("workspaceId");
        return sendJson(response, 200, await service.listDocuments(workspaceId));
      }

      if (method === "POST" && path === "/documents") {
        return sendJson(response, 201, await service.createDocument(await readJson(request)));
      }

      const documentFileMatch = path.match(/^\/documents\/([^/]+)\/file$/);
      if (documentFileMatch && method === "POST") {
        const documentId = decodeURIComponent(documentFileMatch[1]);
        await service.getDocument(documentId);
        const content = await readBinary(request);
        const fileName = readFileNameHeader(request);
        const mimeType = request.headers["content-type"] ?? "application/octet-stream";
        await writeDocumentFile(fileStorageRoot, documentId, fileName, content);
        const document = await service.attachDocumentFile(documentId, {
          fileName,
          mimeType,
          size: content.length
        });
        const job = await service.processDocument(documentId, "extract-text");
        return sendJson(response, 202, { document, job });
      }

      const documentProcessMatch = path.match(/^\/documents\/([^/]+)\/process$/);
      if (documentProcessMatch && method === "POST") {
        const body = await readJson(request, {});
        const job = await service.processDocument(documentProcessMatch[1], body.type);
        return sendJson(response, 202, job);
      }

      const documentMatch = path.match(/^\/documents\/([^/]+)$/);
      if (documentMatch && method === "GET") {
        return sendJson(response, 200, await service.getDocument(documentMatch[1]));
      }

      if (documentMatch && method === "PUT") {
        return sendJson(
          response,
          200,
          await service.updateDocument(documentMatch[1], await readJson(request))
        );
      }

      if (documentMatch && method === "DELETE") {
        await service.deleteDocument(documentMatch[1]);
        response.writeHead(204);
        return response.end();
      }

      if (method === "GET" && path === "/jobs") {
        const documentId = url.searchParams.get("documentId");
        return sendJson(response, 200, await service.listJobs(documentId));
      }

      const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
      if (jobMatch && method === "GET") {
        return sendJson(response, 200, await service.getJob(jobMatch[1]));
      }

      throw new NotFoundError(`Route '${method} ${path}' was not found.`);
    } catch (error) {
      return sendError(response, error);
    }
  });
}

function isStaticRequest(path) {
  return path === "/" || path.startsWith("/assets/") || [".css", ".js", ".png", ".ico"].includes(extname(path));
}

async function tryServeStatic(path, response) {
  const relativePath = path === "/" ? "index.html" : path.slice(1);
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    throw new NotFoundError(`Route 'GET ${path}' was not found.`);
  }

  try {
    const filePath = join(publicRoot, normalizedPath);
    const content = await readFile(filePath);
    response.writeHead(200, {
      "content-type": contentTypeFor(filePath)
    });
    response.end(content);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readJson(request, fallback) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw && fallback !== undefined) {
    return fallback;
  }
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function readBinary(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const content = Buffer.concat(chunks);
  if (content.length === 0) {
    throw new ValidationError("File content is required.");
  }
  return content;
}

function readFileNameHeader(request) {
  const value = request.headers["x-file-name"];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError("x-file-name header is required.");
  }
  return decodeURIComponent(value).trim();
}

async function writeDocumentFile(fileStorageRoot, documentId, fileName, content) {
  const directory = join(fileStorageRoot, safePathSegment(documentId));
  const filePath = join(directory, safeFileName(fileName));
  await mkdir(directory, { recursive: true });
  await writeFile(filePath, content);
}

function safePathSegment(value) {
  return value.replace(/[^A-Za-z0-9_.-]/g, "_");
}

function safeFileName(value) {
  const sanitized = value.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_").trim();
  return sanitized || "upload.bin";
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const statusCode =
    error instanceof ValidationError || error instanceof NotFoundError
      ? error.statusCode
      : 500;
  const message = statusCode === 500 ? "Internal server error." : error.message;
  sendJson(response, statusCode, { error: message });
}

function contentTypeFor(filePath) {
  const extension = extname(filePath);
  if (extension === ".html") {
    return "text/html; charset=utf-8";
  }
  if (extension === ".css") {
    return "text/css; charset=utf-8";
  }
  if (extension === ".js") {
    return "text/javascript; charset=utf-8";
  }
  if (extension === ".png") {
    return "image/png";
  }
  return "application/octet-stream";
}
