package com.dzone.platform;

import java.time.Instant;
import java.util.List;

public final class PlatformModels {
  private PlatformModels() {
  }

  public record Health(boolean ok, String runtime) {
  }

  public record CreateWorkspaceInput(String name, String description) {
  }

  public record Workspace(String id, String name, String description, Instant createdAt) {
  }

  public record CreateDocumentInput(String workspaceId, String title, String status, List<String> tags) {
  }

  public record UpdateDocumentInput(String title, String status, List<String> tags) {
  }

  public record Document(
    String id,
    String workspaceId,
    String title,
    String status,
    List<String> tags,
    Instant createdAt,
    Instant updatedAt,
    String fileName,
    String mimeType,
    Long size,
    Instant fileStoredAt
  ) {
  }

  public record ProcessingJob(String id, String documentId, String type, String status, Instant createdAt) {
    public ProcessingJob withStatus(String nextStatus) {
      return new ProcessingJob(id, documentId, type, nextStatus, createdAt);
    }
  }

  public record ProcessDocumentInput(String type) {
  }

  public record UploadDocumentFileResult(Document document, ProcessingJob job) {
  }

  public record RuntimeHostLaunchResult(String host, String status, String backendUrl) {
  }

  public record RuntimeHostSetupResult(
    String host,
    String status,
    String command,
    String logPath,
    String startedAt,
    String finishedAt,
    Integer exitCode,
    String signal,
    String lastOutput,
    String java,
    String maven,
    String spring
  ) {
  }
}
