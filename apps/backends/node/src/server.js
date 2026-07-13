import { createServer as createHttpServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createPlatform, NotFoundError, ValidationError } from "../../../../packages/platform/src/index.js";

const adminPublicRoot = fileURLToPath(new URL("../../../hosts/admin/public", import.meta.url));
const webPublicRoot = fileURLToPath(new URL("../../../hosts/web/public", import.meta.url));
const sharedPublicRoot = fileURLToPath(new URL("../../../hosts/shared/public", import.meta.url));
const electronHostRoot = fileURLToPath(new URL("../../../hosts/electron/", import.meta.url));
const defaultFileStorageRoot = fileURLToPath(new URL("../../../../data/files/", import.meta.url));

export function createServer(
  platform = createPlatform(),
  {
    fileStorageRoot = defaultFileStorageRoot,
    launchElectronHost = createElectronHostLauncher()
  } = {}
) {
  const service = platform.services.documents;

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const method = request.method ?? "GET";
      const path = url.pathname;

      if (method === "OPTIONS") {
        return sendNoContent(response);
      }

      if (method === "GET" && isStaticRequest(path)) {
        const served = await tryServeStatic(path, response);
        if (served) {
          return;
        }
      }

      if (method === "GET" && path === "/health") {
        return sendJson(response, 200, { ok: true, runtime: "node" });
      }

      if (method === "POST" && path === "/runtime/hosts/electron/open") {
        return sendJson(response, 202, await launchElectronHost({ backendUrl: requestBaseUrl(request) }));
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
        return sendNoContent(response);
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

export function createElectronHostLauncher({
  hostRoot = electronHostRoot,
  fileExists = existsSync,
  spawnProcess = spawn
} = {}) {
  let hostProcess = null;

  return async function launchElectronHost({ backendUrl }) {
    if (hostProcess && hostProcess.exitCode === null && hostProcess.signalCode === null) {
      return { host: "electron", status: "running", backendUrl };
    }

    const command = electronLaunchCommand(hostRoot, fileExists);
    hostProcess = spawnProcess(command.file, command.args, {
      cwd: hostRoot,
      detached: true,
      env: { ...process.env, DZONE_BACKEND_URL: backendUrl },
      shell: false,
      stdio: "ignore",
      windowsHide: true
    });
    hostProcess.unref();

    return { host: "electron", status: "starting", backendUrl };
  };
}

function electronLaunchCommand(hostRoot, fileExists) {
  const executablePath =
    process.platform === "win32"
      ? join(hostRoot, "node_modules", "electron", "dist", "electron.exe")
      : join(hostRoot, "node_modules", "electron", "dist", "electron");

  if (fileExists(executablePath)) {
    return { file: executablePath, args: [hostRoot] };
  }

  return process.platform === "win32"
    ? { file: "cmd.exe", args: ["/d", "/s", "/c", "npm start"] }
    : { file: "npm", args: ["start"] };
}

function isStaticRequest(path) {
  return path === "/" || path === "/admin" || path === "/web" || path.startsWith("/admin/") || path.startsWith("/web/") || path.startsWith("/shared/");
}

async function tryServeStatic(path, response) {
  const staticTarget = staticTargetFor(path);
  if (!staticTarget) {
    return false;
  }

  const { root, relativePath } = staticTarget;
  const normalizedPath = normalize(relativePath);

  if (normalizedPath.startsWith("..")) {
    throw new NotFoundError(`Route 'GET ${path}' was not found.`);
  }

  try {
    const filePath = join(root, normalizedPath);
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

function staticTargetFor(path) {
  if (path === "/" || path === "/admin" || path === "/admin/") {
    return { root: adminPublicRoot, relativePath: "index.html" };
  }
  if (path === "/web" || path === "/web/") {
    return { root: webPublicRoot, relativePath: "index.html" };
  }
  if (path.startsWith("/admin/")) {
    return { root: adminPublicRoot, relativePath: path.slice("/admin/".length) };
  }
  if (path.startsWith("/web/")) {
    return { root: webPublicRoot, relativePath: path.slice("/web/".length) };
  }
  if (path.startsWith("/shared/")) {
    return { root: sharedPublicRoot, relativePath: path.slice("/shared/".length) };
  }
  return null;
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
    "content-type": "application/json; charset=utf-8",
    ...corsHeaders()
  });
  response.end(JSON.stringify(payload));
}

function sendNoContent(response) {
  response.writeHead(204, corsHeaders());
  response.end();
}

function sendError(response, error) {
  const statusCode =
    error instanceof ValidationError || error instanceof NotFoundError
      ? error.statusCode
      : 500;
  const message = statusCode === 500 ? "Internal server error." : error.message;
  sendJson(response, statusCode, { error: message });
}

function requestBaseUrl(request) {
  const host = request.headers.host || "localhost:3000";
  return `http://${host}`;
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

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, x-file-name"
  };
}
