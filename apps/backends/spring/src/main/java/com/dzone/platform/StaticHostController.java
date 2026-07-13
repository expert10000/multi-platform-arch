package com.dzone.platform;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class StaticHostController {
  private final Path repoRoot = findRepoRoot();
  private final Path adminRoot = repoRoot.resolve("apps/hosts/admin/public");
  private final Path webRoot = repoRoot.resolve("apps/hosts/web/public");
  private final Path sharedRoot = repoRoot.resolve("apps/hosts/shared/public");

  @GetMapping({"/", "/admin", "/admin/"})
  ResponseEntity<byte[]> adminIndex() throws IOException {
    return serve(adminRoot, "index.html");
  }

  @GetMapping({"/node-admin", "/node-admin/"})
  ResponseEntity<byte[]> nodeAdminIndex() throws IOException {
    return serve(adminRoot.resolve("node-admin"), "index.html");
  }

  @GetMapping("/node-admin/{*assetPath}")
  ResponseEntity<byte[]> nodeAdminAsset(@PathVariable String assetPath) throws IOException {
    return serve(adminRoot.resolve("node-admin"), cleanAssetPath(assetPath));
  }

  @GetMapping({"/spring-admin", "/spring-admin/"})
  ResponseEntity<byte[]> springAdminIndex() throws IOException {
    return serve(adminRoot.resolve("spring-admin"), "index.html");
  }

  @GetMapping("/spring-admin/{*assetPath}")
  ResponseEntity<byte[]> springAdminAsset(@PathVariable String assetPath) throws IOException {
    return serve(adminRoot.resolve("spring-admin"), cleanAssetPath(assetPath));
  }

  @GetMapping({"/python-admin", "/python-admin/"})
  ResponseEntity<byte[]> pythonAdminIndex() throws IOException {
    return serve(adminRoot.resolve("python-admin"), "index.html");
  }

  @GetMapping("/python-admin/{*assetPath}")
  ResponseEntity<byte[]> pythonAdminAsset(@PathVariable String assetPath) throws IOException {
    return serve(adminRoot.resolve("python-admin"), cleanAssetPath(assetPath));
  }

  @GetMapping({"/aspnet-admin", "/aspnet-admin/"})
  ResponseEntity<byte[]> aspNetAdminIndex() throws IOException {
    return serve(adminRoot.resolve("aspnet-admin"), "index.html");
  }

  @GetMapping("/aspnet-admin/{*assetPath}")
  ResponseEntity<byte[]> aspNetAdminAsset(@PathVariable String assetPath) throws IOException {
    return serve(adminRoot.resolve("aspnet-admin"), cleanAssetPath(assetPath));
  }

  @GetMapping("/admin/{*assetPath}")
  ResponseEntity<byte[]> adminAsset(@PathVariable String assetPath) throws IOException {
    return serve(adminRoot, cleanAssetPath(assetPath));
  }

  @GetMapping({"/web", "/web/"})
  ResponseEntity<byte[]> webIndex() throws IOException {
    return serve(webRoot, "index.html");
  }

  @GetMapping("/web/{*assetPath}")
  ResponseEntity<byte[]> webAsset(@PathVariable String assetPath) throws IOException {
    return serve(webRoot, cleanAssetPath(assetPath));
  }

  @GetMapping("/shared/{*assetPath}")
  ResponseEntity<byte[]> sharedAsset(@PathVariable String assetPath) throws IOException {
    return serve(sharedRoot, cleanAssetPath(assetPath));
  }

  private ResponseEntity<byte[]> serve(Path root, String relativePath) throws IOException {
    Path target = root.resolve(relativePath).normalize();
    if (!target.startsWith(root.normalize()) || !Files.exists(target) || Files.isDirectory(target)) {
      throw new ApiException(HttpStatus.NOT_FOUND, "Static asset was not found.");
    }
    return ResponseEntity.ok()
      .cacheControl(CacheControl.noStore())
      .header(HttpHeaders.CONTENT_TYPE, contentTypeFor(target))
      .body(Files.readAllBytes(target));
  }

  private static String cleanAssetPath(String assetPath) {
    if (assetPath == null || assetPath.isBlank() || assetPath.equals("/")) {
      return "index.html";
    }
    return assetPath.startsWith("/") ? assetPath.substring(1) : assetPath;
  }

  private static String contentTypeFor(Path filePath) {
    String name = filePath.getFileName().toString();
    if (name.endsWith(".html")) {
      return MediaType.TEXT_HTML_VALUE + "; charset=utf-8";
    }
    if (name.endsWith(".css")) {
      return "text/css; charset=utf-8";
    }
    if (name.endsWith(".js")) {
      return "text/javascript; charset=utf-8";
    }
    if (name.endsWith(".png")) {
      return MediaType.IMAGE_PNG_VALUE;
    }
    return MediaType.APPLICATION_OCTET_STREAM_VALUE;
  }

  private static Path findRepoRoot() {
    Path current = Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
    while (current != null) {
      if (Files.exists(current.resolve("contracts/openapi.yaml"))
        && Files.exists(current.resolve("apps/hosts/admin/public/index.html"))) {
        return current;
      }
      current = current.getParent();
    }
    return Path.of(System.getProperty("user.dir")).toAbsolutePath().normalize();
  }
}
