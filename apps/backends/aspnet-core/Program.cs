using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http.Json;
using Microsoft.Net.Http.Headers;

var builder = WebApplication.CreateBuilder(args);

builder.Services.Configure<JsonOptions>(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
            .WithMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
            .WithHeaders("content-type", "x-file-name");
    });
});

builder.Services.AddSingleton<PlatformStore>();
builder.Services.AddHostedService<JobWorker>();

var app = builder.Build();
var repoRoot = FindRepoRoot();
var fileStorageRoot = Path.GetFullPath(
    Environment.GetEnvironmentVariable("DZONE_FILE_STORAGE_PATH") ?? Path.Combine(repoRoot, "data", "aspnet-files")
);

app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        var error = context.Features.Get<Microsoft.AspNetCore.Diagnostics.IExceptionHandlerFeature>()?.Error;
        var statusCode = error is ApiException apiError ? apiError.StatusCode : StatusCodes.Status500InternalServerError;
        var message = error is ApiException ? error.Message : "Internal server error.";
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json; charset=utf-8";
        await context.Response.WriteAsJsonAsync(new { error = message });
    });
});

app.UseCors();

app.MapMethods("/{*path}", new[] { "OPTIONS" }, (HttpContext context) =>
{
    context.Response.Headers.AccessControlAllowOrigin = "*";
    context.Response.Headers.AccessControlAllowMethods = "GET, POST, PUT, DELETE, OPTIONS";
    context.Response.Headers.AccessControlAllowHeaders = "content-type, x-file-name";
    return Results.NoContent();
});

app.MapGet("/health", () => new Health(true, "aspnet-core"));

app.MapGet("/workspaces", (PlatformStore store) => store.ListWorkspaces());
app.MapPost("/workspaces", (CreateWorkspaceInput input, PlatformStore store) =>
    Results.Created("/workspaces", store.CreateWorkspace(input)));
app.MapGet("/workspaces/{id}", (string id, PlatformStore store) => store.GetWorkspace(id));

app.MapGet("/documents", (string workspaceId, PlatformStore store) => store.ListDocuments(workspaceId));
app.MapPost("/documents", (CreateDocumentInput input, PlatformStore store) =>
    Results.Created("/documents", store.CreateDocument(input)));
app.MapGet("/documents/{id}", (string id, PlatformStore store) => store.GetDocument(id));
app.MapPut("/documents/{id}", (string id, UpdateDocumentInput input, PlatformStore store) =>
    store.UpdateDocument(id, input));
app.MapDelete("/documents/{id}", (string id, PlatformStore store) =>
{
    store.DeleteDocument(id);
    return Results.NoContent();
});

app.MapPost("/documents/{id}/file", async (string id, HttpRequest request, PlatformStore store) =>
{
    var document = store.GetDocument(id);
    using var memory = new MemoryStream();
    await request.Body.CopyToAsync(memory);
    var content = memory.ToArray();
    if (content.Length == 0)
    {
        throw new ApiException(StatusCodes.Status400BadRequest, "File content is required.");
    }

    var encodedFileName = request.Headers["x-file-name"].FirstOrDefault();
    if (string.IsNullOrWhiteSpace(encodedFileName))
    {
        throw new ApiException(StatusCodes.Status400BadRequest, "x-file-name header is required.");
    }

    var fileName = Uri.UnescapeDataString(encodedFileName);
    var mimeType = request.ContentType ?? "application/octet-stream";
    var directory = Path.Combine(fileStorageRoot, SafePathSegment(document.Id));
    Directory.CreateDirectory(directory);
    await File.WriteAllBytesAsync(Path.Combine(directory, SafeFileName(fileName)), content);

    var updated = store.AttachDocumentFile(id, fileName, mimeType, content.Length);
    var job = store.ProcessDocument(id, "extract-text");
    return Results.Accepted(value: new UploadDocumentFileResult(updated, job));
});

app.MapPost("/documents/{id}/process", (string id, ProcessDocumentInput? input, PlatformStore store) =>
    Results.Accepted(value: store.ProcessDocument(id, input?.Type)));

app.MapGet("/jobs", (string? documentId, PlatformStore store) => store.ListJobs(documentId));
app.MapGet("/jobs/{id}", (string id, PlatformStore store) => store.GetJob(id));

app.MapPost("/runtime/backends/aspnet-core/open", (HttpRequest request) =>
    Results.Accepted(value: new RuntimeHostLaunchResult("aspnet-core-backend", "running", RequestBaseUrl(request))));
app.MapPost("/runtime/backends/aspnet-core/close", () =>
    Results.Accepted(value: new RuntimeHostLaunchResult("aspnet-core-backend", "stopped", "http://localhost:3300")));

app.MapFallback(async (HttpContext context) =>
{
    if (!HttpMethods.IsGet(context.Request.Method))
    {
        throw new ApiException(StatusCodes.Status404NotFound, $"Route '{context.Request.Method} {context.Request.Path}' was not found.");
    }

    var target = StaticTargetFor(context.Request.Path.Value ?? "/", repoRoot);
    if (target is null || !File.Exists(target.FilePath))
    {
        throw new ApiException(StatusCodes.Status404NotFound, "Static asset was not found.");
    }

    context.Response.Headers.CacheControl = "no-store";
    context.Response.ContentType = ContentTypeFor(target.FilePath);
    await context.Response.SendFileAsync(target.FilePath);
});

app.Run();

static StaticTarget? StaticTargetFor(string path, string repoRoot)
{
    var adminRoot = Path.Combine(repoRoot, "apps", "hosts", "admin", "public");
    var webRoot = Path.Combine(repoRoot, "apps", "hosts", "web", "public");
    var sharedRoot = Path.Combine(repoRoot, "apps", "hosts", "shared", "public");

    return path switch
    {
        "/" or "/admin" or "/admin/" => ResolveStatic(adminRoot, "index.html"),
        "/web" or "/web/" => ResolveStatic(webRoot, "index.html"),
        "/node-admin" or "/node-admin/" => ResolveStatic(Path.Combine(adminRoot, "node-admin"), "index.html"),
        "/spring-admin" or "/spring-admin/" => ResolveStatic(Path.Combine(adminRoot, "spring-admin"), "index.html"),
        "/python-admin" or "/python-admin/" => ResolveStatic(Path.Combine(adminRoot, "python-admin"), "index.html"),
        "/aspnet-admin" or "/aspnet-admin/" => ResolveStatic(Path.Combine(adminRoot, "aspnet-admin"), "index.html"),
        _ when path.StartsWith("/admin/", StringComparison.Ordinal) => ResolveStatic(adminRoot, path["/admin/".Length..]),
        _ when path.StartsWith("/web/", StringComparison.Ordinal) => ResolveStatic(webRoot, path["/web/".Length..]),
        _ when path.StartsWith("/shared/", StringComparison.Ordinal) => ResolveStatic(sharedRoot, path["/shared/".Length..]),
        _ when path.StartsWith("/node-admin/", StringComparison.Ordinal) => ResolveStatic(Path.Combine(adminRoot, "node-admin"), path["/node-admin/".Length..]),
        _ when path.StartsWith("/spring-admin/", StringComparison.Ordinal) => ResolveStatic(Path.Combine(adminRoot, "spring-admin"), path["/spring-admin/".Length..]),
        _ when path.StartsWith("/python-admin/", StringComparison.Ordinal) => ResolveStatic(Path.Combine(adminRoot, "python-admin"), path["/python-admin/".Length..]),
        _ when path.StartsWith("/aspnet-admin/", StringComparison.Ordinal) => ResolveStatic(Path.Combine(adminRoot, "aspnet-admin"), path["/aspnet-admin/".Length..]),
        _ => null
    };
}

static StaticTarget? ResolveStatic(string root, string relativePath)
{
    var rootFullPath = Path.GetFullPath(root);
    var filePath = Path.GetFullPath(Path.Combine(rootFullPath, relativePath.Length == 0 ? "index.html" : relativePath));
    return filePath.StartsWith(rootFullPath, StringComparison.OrdinalIgnoreCase)
        ? new StaticTarget(filePath)
        : null;
}

static string ContentTypeFor(string filePath)
{
    return Path.GetExtension(filePath) switch
    {
        ".html" => "text/html; charset=utf-8",
        ".css" => "text/css; charset=utf-8",
        ".js" => "text/javascript; charset=utf-8",
        ".png" => "image/png",
        _ => "application/octet-stream"
    };
}

static string FindRepoRoot()
{
    var current = new DirectoryInfo(Directory.GetCurrentDirectory());
    while (current is not null)
    {
        if (File.Exists(Path.Combine(current.FullName, "contracts", "openapi.yaml"))
            && File.Exists(Path.Combine(current.FullName, "apps", "hosts", "admin", "public", "index.html")))
        {
            return current.FullName;
        }
        current = current.Parent;
    }
    return Directory.GetCurrentDirectory();
}

static string RequestBaseUrl(HttpRequest request)
{
    return $"{request.Scheme}://{request.Host}";
}

static string SafePathSegment(string value) => string.Concat(value.Select(character =>
    char.IsLetterOrDigit(character) || character is '_' or '.' or '-' ? character : '_'));

static string SafeFileName(string value)
{
    var invalid = Path.GetInvalidFileNameChars();
    var sanitized = string.Concat(value.Select(character => invalid.Contains(character) ? '_' : character)).Trim();
    return string.IsNullOrWhiteSpace(sanitized) ? "upload.bin" : sanitized;
}

sealed class PlatformStore
{
    private static readonly HashSet<string> Statuses = ["draft", "review", "approved", "archived"];
    private static readonly HashSet<string> JobTypes = ["extract-text", "thumbnail", "summarize", "index-search"];
    private readonly ConcurrentDictionary<string, Workspace> workspaces = new();
    private readonly ConcurrentDictionary<string, Document> documents = new();
    private readonly ConcurrentDictionary<string, ProcessingJob> jobs = new();

    public IEnumerable<Workspace> ListWorkspaces() => workspaces.Values.OrderBy(workspace => workspace.CreatedAt);

    public Workspace CreateWorkspace(CreateWorkspaceInput input)
    {
        var workspace = new Workspace(PlatformText.CreateId("workspace"), PlatformText.Require(input.Name, "Workspace name"), PlatformText.Optional(input.Description), DateTimeOffset.UtcNow);
        workspaces[workspace.Id] = workspace;
        return workspace;
    }

    public Workspace GetWorkspace(string id)
    {
        if (!workspaces.TryGetValue(id, out var workspace))
        {
            throw new ApiException(StatusCodes.Status404NotFound, $"Workspace '{id}' was not found.");
        }
        return workspace;
    }

    public IEnumerable<Document> ListDocuments(string workspaceId)
    {
        GetWorkspace(PlatformText.Require(workspaceId, "workspaceId"));
        return documents.Values
            .Where(document => document.WorkspaceId == workspaceId)
            .OrderByDescending(document => document.UpdatedAt);
    }

    public Document CreateDocument(CreateDocumentInput input)
    {
        var workspaceId = PlatformText.Require(input.WorkspaceId, "Workspace id");
        GetWorkspace(workspaceId);
        var status = string.IsNullOrWhiteSpace(input.Status) ? "draft" : input.Status;
        ValidateStatus(status);
        var now = DateTimeOffset.UtcNow;
        var document = new Document(
            PlatformText.CreateId("document"),
            workspaceId,
            PlatformText.Require(input.Title, "Document title"),
            status,
            NormalizeTags(input.Tags),
            now,
            now
        );
        documents[document.Id] = document;
        return document;
    }

    public Document GetDocument(string id)
    {
        if (!documents.TryGetValue(id, out var document))
        {
            throw new ApiException(StatusCodes.Status404NotFound, $"Document '{id}' was not found.");
        }
        return document;
    }

    public Document UpdateDocument(string id, UpdateDocumentInput input)
    {
        var existing = GetDocument(id);
        var status = string.IsNullOrWhiteSpace(input.Status) ? existing.Status : input.Status;
        ValidateStatus(status);
        var updated = existing with
        {
            Title = input.Title is null ? existing.Title : PlatformText.Require(input.Title, "Document title"),
            Status = status,
            Tags = input.Tags is null ? existing.Tags : NormalizeTags(input.Tags),
            UpdatedAt = DateTimeOffset.UtcNow
        };
        documents[id] = updated;
        return updated;
    }

    public void DeleteDocument(string id)
    {
        GetDocument(id);
        documents.TryRemove(id, out _);
        foreach (var job in jobs.Values.Where(job => job.DocumentId == id))
        {
            jobs.TryRemove(job.Id, out _);
        }
    }

    public Document AttachDocumentFile(string id, string fileName, string mimeType, long size)
    {
        var existing = GetDocument(id);
        var updated = existing with
        {
            FileName = PlatformText.Require(fileName, "File name"),
            MimeType = PlatformText.Require(mimeType, "MIME type"),
            Size = size,
            FileStoredAt = DateTimeOffset.UtcNow,
            UpdatedAt = DateTimeOffset.UtcNow
        };
        documents[id] = updated;
        return updated;
    }

    public ProcessingJob ProcessDocument(string documentId, string? type)
    {
        GetDocument(documentId);
        var jobType = string.IsNullOrWhiteSpace(type) ? "extract-text" : type;
        if (!JobTypes.Contains(jobType))
        {
            throw new ApiException(StatusCodes.Status400BadRequest, $"Unsupported processing job type '{jobType}'.");
        }
        var job = new ProcessingJob(PlatformText.CreateId("job"), documentId, jobType, "queued", DateTimeOffset.UtcNow);
        jobs[job.Id] = job;
        return job;
    }

    public IEnumerable<ProcessingJob> ListJobs(string? documentId)
    {
        if (!string.IsNullOrWhiteSpace(documentId))
        {
            GetDocument(documentId);
        }
        return jobs.Values
            .Where(job => string.IsNullOrWhiteSpace(documentId) || job.DocumentId == documentId)
            .OrderByDescending(job => job.CreatedAt);
    }

    public ProcessingJob GetJob(string id)
    {
        if (!jobs.TryGetValue(id, out var job))
        {
            throw new ApiException(StatusCodes.Status404NotFound, $"Job '{id}' was not found.");
        }
        return job;
    }

    public ProcessingJob? NextQueuedJob()
    {
        return jobs.Values
            .Where(job => job.Status == "queued")
            .OrderBy(job => job.CreatedAt)
            .FirstOrDefault();
    }

    public void UpdateJobStatus(string id, string status)
    {
        jobs.AddOrUpdate(id, key => throw new ApiException(StatusCodes.Status404NotFound, $"Job '{key}' was not found."), (_, job) => job with { Status = status });
    }

    private static IReadOnlyList<string> NormalizeTags(IReadOnlyList<string>? tags)
    {
        if (tags is null)
        {
            return [];
        }
        return tags.Select(tag => PlatformText.Require(tag, "Tag")).Distinct().ToList();
    }

    private static void ValidateStatus(string status)
    {
        if (!Statuses.Contains(status))
        {
            throw new ApiException(StatusCodes.Status400BadRequest, $"Unsupported document status '{status}'.");
        }
    }
}

sealed class JobWorker(PlatformStore store) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var job = store.NextQueuedJob();
            if (job is not null)
            {
                store.UpdateJobStatus(job.Id, "running");
                store.UpdateJobStatus(job.Id, "completed");
            }
            await Task.Delay(250, stoppingToken);
        }
    }
}

sealed class ApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

static class PlatformText
{
    public static string CreateId(string prefix) => $"{prefix}_{Guid.NewGuid()}";

    public static string Require(string? value, string label)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ApiException(StatusCodes.Status400BadRequest, $"{label} is required.");
        }
        return value.Trim();
    }

    public static string? Optional(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

record StaticTarget(string FilePath);
record Health(bool Ok, string Runtime);
record CreateWorkspaceInput(string Name, string? Description);
record Workspace(string Id, string Name, string? Description, DateTimeOffset CreatedAt);
record CreateDocumentInput(string WorkspaceId, string Title, string? Status, IReadOnlyList<string>? Tags);
record UpdateDocumentInput(string? Title, string? Status, IReadOnlyList<string>? Tags);
record Document(
    string Id,
    string WorkspaceId,
    string Title,
    string Status,
    IReadOnlyList<string> Tags,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt,
    string? FileName = null,
    string? MimeType = null,
    long? Size = null,
    DateTimeOffset? FileStoredAt = null
);
record ProcessingJob(string Id, string DocumentId, string Type, string Status, DateTimeOffset CreatedAt);
record ProcessDocumentInput(string? Type);
record UploadDocumentFileResult(Document Document, ProcessingJob Job);
record RuntimeHostLaunchResult(string Host, string Status, string BackendUrl);
