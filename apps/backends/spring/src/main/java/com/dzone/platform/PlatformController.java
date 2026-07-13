package com.dzone.platform;

import com.dzone.platform.PlatformModels.CreateDocumentInput;
import com.dzone.platform.PlatformModels.CreateWorkspaceInput;
import com.dzone.platform.PlatformModels.Document;
import com.dzone.platform.PlatformModels.Health;
import com.dzone.platform.PlatformModels.ProcessDocumentInput;
import com.dzone.platform.PlatformModels.ProcessingJob;
import com.dzone.platform.PlatformModels.UpdateDocumentInput;
import com.dzone.platform.PlatformModels.UploadDocumentFileResult;
import com.dzone.platform.PlatformModels.Workspace;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PlatformController {
  private final PlatformStore store;
  private final Path fileStorageRoot;

  public PlatformController(
    PlatformStore store,
    @Value("${DZONE_FILE_STORAGE_PATH:data/spring-files}") String fileStorageRoot
  ) {
    this.store = store;
    this.fileStorageRoot = Path.of(fileStorageRoot);
  }

  @GetMapping("/health")
  Health health() {
    return new Health(true, "spring-boot");
  }

  @GetMapping("/workspaces")
  List<Workspace> listWorkspaces() {
    return store.listWorkspaces();
  }

  @PostMapping("/workspaces")
  ResponseEntity<Workspace> createWorkspace(@RequestBody CreateWorkspaceInput input) {
    return ResponseEntity.status(HttpStatus.CREATED).body(store.createWorkspace(input));
  }

  @GetMapping("/workspaces/{id}")
  Workspace getWorkspace(@PathVariable String id) {
    return store.getWorkspace(id);
  }

  @GetMapping("/documents")
  List<Document> listDocuments(@RequestParam String workspaceId) {
    return store.listDocuments(workspaceId);
  }

  @PostMapping("/documents")
  ResponseEntity<Document> createDocument(@RequestBody CreateDocumentInput input) {
    return ResponseEntity.status(HttpStatus.CREATED).body(store.createDocument(input));
  }

  @GetMapping("/documents/{id}")
  Document getDocument(@PathVariable String id) {
    return store.getDocument(id);
  }

  @PutMapping("/documents/{id}")
  Document updateDocument(@PathVariable String id, @RequestBody UpdateDocumentInput input) {
    return store.updateDocument(id, input);
  }

  @DeleteMapping("/documents/{id}")
  ResponseEntity<Void> deleteDocument(@PathVariable String id) {
    store.deleteDocument(id);
    return ResponseEntity.noContent().build();
  }

  @PostMapping(value = "/documents/{id}/file", consumes = MediaType.ALL_VALUE)
  ResponseEntity<UploadDocumentFileResult> uploadDocumentFile(
    @PathVariable String id,
    @RequestHeader("x-file-name") String encodedFileName,
    @RequestHeader(value = "content-type", defaultValue = "application/octet-stream") String mimeType,
    HttpServletRequest request
  ) throws IOException {
    byte[] content = request.getInputStream().readAllBytes();
    if (content.length == 0) {
      throw new ApiException(HttpStatus.BAD_REQUEST, "File content is required.");
    }
    store.getDocument(id);
    String fileName = URLDecoder.decode(encodedFileName, StandardCharsets.UTF_8);
    writeDocumentFile(id, fileName, content);
    Document document = store.attachDocumentFile(id, fileName, mimeType, content.length);
    ProcessingJob job = store.processDocument(id, "extract-text");
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(new UploadDocumentFileResult(document, job));
  }

  @PostMapping("/documents/{id}/process")
  ResponseEntity<ProcessingJob> processDocument(
    @PathVariable String id,
    @RequestBody(required = false) ProcessDocumentInput input
  ) {
    String type = input == null ? null : input.type();
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(store.processDocument(id, type));
  }

  @GetMapping("/jobs")
  List<ProcessingJob> listJobs(@RequestParam(required = false) String documentId) {
    return store.listJobs(documentId);
  }

  @GetMapping("/jobs/{id}")
  ProcessingJob getJob(@PathVariable String id) {
    return store.getJob(id);
  }

  private void writeDocumentFile(String documentId, String fileName, byte[] content) throws IOException {
    Path directory = fileStorageRoot.resolve(safePathSegment(documentId));
    Files.createDirectories(directory);
    Files.write(directory.resolve(safeFileName(fileName)), content);
  }

  private static String safePathSegment(String value) {
    return value.replaceAll("[^A-Za-z0-9_.-]", "_");
  }

  private static String safeFileName(String value) {
    String sanitized = value.replaceAll("[<>:\"/\\\\|?*\\x00-\\x1F]", "_").trim();
    return sanitized.isBlank() ? "upload.bin" : sanitized;
  }
}
