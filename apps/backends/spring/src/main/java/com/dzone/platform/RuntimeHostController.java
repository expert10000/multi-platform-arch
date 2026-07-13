package com.dzone.platform;

import com.dzone.platform.PlatformModels.RuntimeHostLaunchResult;
import com.dzone.platform.PlatformModels.RuntimeHostSetupResult;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class RuntimeHostController {
  private final RuntimeHostService runtimeHosts;

  public RuntimeHostController(RuntimeHostService runtimeHosts) {
    this.runtimeHosts = runtimeHosts;
  }

  @PostMapping("/runtime/hosts/electron/open")
  ResponseEntity<RuntimeHostLaunchResult> launchElectron(HttpServletRequest request) throws IOException {
    return accepted(runtimeHosts.launchElectron(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/hosts/electron/close")
  ResponseEntity<RuntimeHostLaunchResult> closeElectron(HttpServletRequest request) {
    return accepted(runtimeHosts.closeElectron(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/hosts/dotnet-desktop/open")
  ResponseEntity<RuntimeHostLaunchResult> launchDotnetDesktop(HttpServletRequest request) throws IOException {
    return accepted(runtimeHosts.launchDotnetDesktop(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/hosts/dotnet-desktop/close")
  ResponseEntity<RuntimeHostLaunchResult> closeDotnetDesktop(HttpServletRequest request) {
    return accepted(runtimeHosts.closeDotnetDesktop(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/hosts/maui/open")
  ResponseEntity<RuntimeHostLaunchResult> launchMaui(HttpServletRequest request) throws IOException {
    return accepted(runtimeHosts.launchMaui(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/hosts/maui/close")
  ResponseEntity<RuntimeHostLaunchResult> closeMaui(HttpServletRequest request) {
    return accepted(runtimeHosts.closeMaui(requestBaseUrl(request)));
  }

  @PostMapping("/runtime/backends/spring/open")
  ResponseEntity<RuntimeHostLaunchResult> launchSpringBackend(HttpServletRequest request) {
    return accepted(new RuntimeHostLaunchResult("spring-backend", "running", requestBaseUrl(request)));
  }

  @PostMapping("/runtime/backends/spring/close")
  ResponseEntity<RuntimeHostLaunchResult> closeSpringBackend() {
    return accepted(new RuntimeHostLaunchResult("spring-backend", "stopped", "http://localhost:3200"));
  }

  @PostMapping("/runtime/hosts/maui/setup")
  ResponseEntity<RuntimeHostSetupResult> setupMaui() throws IOException {
    return accepted(runtimeHosts.setupMaui());
  }

  @GetMapping("/runtime/hosts/maui/setup")
  RuntimeHostSetupResult getMauiSetupStatus() {
    return runtimeHosts.mauiSetupStatus();
  }

  @PostMapping("/runtime/backends/spring/setup")
  ResponseEntity<RuntimeHostSetupResult> setupSpringBackend() {
    return accepted(runtimeHosts.setupSpringBackendStatus());
  }

  @GetMapping("/runtime/backends/spring/setup")
  RuntimeHostSetupResult getSpringSetupStatus() {
    return runtimeHosts.setupSpringBackendStatus();
  }

  private static String requestBaseUrl(HttpServletRequest request) {
    String scheme = request.getScheme();
    String host = request.getHeader("host");
    return scheme + "://" + (host == null || host.isBlank() ? "localhost:3200" : host);
  }

  private static <T> ResponseEntity<T> accepted(T body) {
    return ResponseEntity.status(HttpStatus.ACCEPTED).body(body);
  }
}
