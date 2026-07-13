package com.dzone.platform;

import com.dzone.platform.PlatformModels.CreateDocumentInput;
import com.dzone.platform.PlatformModels.CreateWorkspaceInput;
import com.dzone.platform.PlatformModels.Document;
import com.dzone.platform.PlatformModels.ProcessingJob;
import com.dzone.platform.PlatformModels.UpdateDocumentInput;
import com.dzone.platform.PlatformModels.Workspace;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

@Service
public class PlatformStore {
  private static final List<String> STATUSES = List.of("draft", "review", "approved", "archived");
  private static final List<String> JOB_TYPES = List.of("extract-text", "thumbnail", "summarize", "index-search");

  private final Map<String, Workspace> workspaces = new ConcurrentHashMap<>();
  private final Map<String, Document> documents = new ConcurrentHashMap<>();
  private final Map<String, ProcessingJob> jobs = new ConcurrentHashMap<>();

  public List<Workspace> listWorkspaces() {
    return workspaces.values().stream()
      .sorted(Comparator.comparing(Workspace::createdAt))
      .toList();
  }

  public Workspace createWorkspace(CreateWorkspaceInput input) {
    String name = requireText(input == null ? null : input.name(), "Workspace name");
    Workspace workspace = new Workspace(createId("workspace"), name, optionalText(input.description()), Instant.now());
    workspaces.put(workspace.id(), workspace);
    return workspace;
  }

  public Workspace getWorkspace(String id) {
    Workspace workspace = workspaces.get(id);
    if (workspace == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Workspace '" + id + "' was not found.");
    }
    return workspace;
  }

  public List<Document> listDocuments(String workspaceId) {
    getWorkspace(requireText(workspaceId, "workspaceId"));
    return documents.values().stream()
      .filter(document -> document.workspaceId().equals(workspaceId))
      .sorted(Comparator.comparing(Document::updatedAt).reversed())
      .toList();
  }

  public Document createDocument(CreateDocumentInput input) {
    String workspaceId = requireText(input == null ? null : input.workspaceId(), "Workspace id");
    getWorkspace(workspaceId);
    String status = input.status() == null ? "draft" : input.status();
    validateStatus(status);
    Instant now = Instant.now();
    Document document = new Document(
      createId("document"),
      workspaceId,
      requireText(input.title(), "Document title"),
      status,
      normalizeTags(input.tags()),
      now,
      now,
      null,
      null,
      null,
      null
    );
    documents.put(document.id(), document);
    return document;
  }

  public Document getDocument(String id) {
    Document document = documents.get(id);
    if (document == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Document '" + id + "' was not found.");
    }
    return document;
  }

  public Document updateDocument(String id, UpdateDocumentInput input) {
    Document existing = getDocument(id);
    UpdateDocumentInput update = input == null ? new UpdateDocumentInput(null, null, null) : input;
    String status = update.status() == null ? existing.status() : update.status();
    validateStatus(status);
    Document updated = new Document(
      existing.id(),
      existing.workspaceId(),
      update.title() == null ? existing.title() : requireText(update.title(), "Document title"),
      status,
      update.tags() == null ? existing.tags() : normalizeTags(update.tags()),
      existing.createdAt(),
      Instant.now(),
      existing.fileName(),
      existing.mimeType(),
      existing.size(),
      existing.fileStoredAt()
    );
    documents.put(id, updated);
    return updated;
  }

  public void deleteDocument(String id) {
    getDocument(id);
    documents.remove(id);
    jobs.entrySet().removeIf(entry -> entry.getValue().documentId().equals(id));
  }

  public Document attachDocumentFile(String id, String fileName, String mimeType, long size) {
    Document existing = getDocument(id);
    Document updated = new Document(
      existing.id(),
      existing.workspaceId(),
      existing.title(),
      existing.status(),
      existing.tags(),
      existing.createdAt(),
      Instant.now(),
      requireText(fileName, "File name"),
      requireText(mimeType, "MIME type"),
      size,
      Instant.now()
    );
    documents.put(id, updated);
    return updated;
  }

  public ProcessingJob processDocument(String documentId, String type) {
    getDocument(documentId);
    String jobType = type == null || type.isBlank() ? "extract-text" : type;
    if (!JOB_TYPES.contains(jobType)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported processing job type '" + jobType + "'.");
    }
    ProcessingJob job = new ProcessingJob(createId("job"), documentId, jobType, "queued", Instant.now());
    jobs.put(job.id(), job);
    return job;
  }

  public List<ProcessingJob> listJobs(String documentId) {
    if (documentId != null && !documentId.isBlank()) {
      getDocument(documentId);
    }
    return jobs.values().stream()
      .filter(job -> documentId == null || documentId.isBlank() || job.documentId().equals(documentId))
      .sorted(Comparator.comparing(ProcessingJob::createdAt).reversed())
      .toList();
  }

  public ProcessingJob getJob(String id) {
    ProcessingJob job = jobs.get(id);
    if (job == null) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Job '" + id + "' was not found.");
    }
    return job;
  }

  public ProcessingJob nextQueuedJob() {
    return jobs.values().stream()
      .filter(job -> job.status().equals("queued"))
      .min(Comparator.comparing(ProcessingJob::createdAt))
      .orElse(null);
  }

  public void updateJobStatus(String id, String status) {
    jobs.computeIfPresent(id, (key, job) -> job.withStatus(status));
  }

  private static String createId(String prefix) {
    return prefix + "_" + UUID.randomUUID();
  }

  private static String requireText(String value, String label) {
    if (value == null || value.isBlank()) {
      throw new ApiException(HttpStatus.BAD_REQUEST, label + " is required.");
    }
    return value.trim();
  }

  private static String optionalText(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.trim();
  }

  private static List<String> normalizeTags(List<String> tags) {
    if (tags == null) {
      return List.of();
    }
    LinkedHashSet<String> normalized = new LinkedHashSet<>();
    for (String tag : tags) {
      normalized.add(requireText(tag, "Tag"));
    }
    return new ArrayList<>(normalized);
  }

  private static void validateStatus(String status) {
    if (!STATUSES.contains(status)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "Unsupported document status '" + status + "'.");
    }
  }
}
