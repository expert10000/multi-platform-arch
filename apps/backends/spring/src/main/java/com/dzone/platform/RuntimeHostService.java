package com.dzone.platform;

import com.dzone.platform.PlatformModels.RuntimeHostLaunchResult;
import com.dzone.platform.PlatformModels.RuntimeHostSetupResult;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class RuntimeHostService {
  private final Path repoRoot = findRepoRoot();
  private final Map<String, Process> hostProcesses = new HashMap<>();
  private Process mauiSetupProcess;
  private RuntimeHostSetupResult mauiSetupState = new RuntimeHostSetupResult(
    "maui",
    "idle",
    "dotnet workload install maui",
    repoRoot.resolve("data/runtime/maui-setup-spring.log").toString(),
    null,
    null,
    null,
    null,
    "",
    null,
    null,
    null
  );

  public synchronized RuntimeHostLaunchResult launchElectron(String backendUrl) throws IOException {
    return launchHost(
      "electron",
      backendUrl,
      repoRoot.resolve("apps/hosts/electron"),
      electronCommand()
    );
  }

  public synchronized RuntimeHostLaunchResult closeElectron(String backendUrl) {
    return closeHost("electron", backendUrl);
  }

  public synchronized RuntimeHostLaunchResult launchDotnetDesktop(String backendUrl) throws IOException {
    return launchHost(
      "dotnet-desktop",
      backendUrl,
      repoRoot.resolve("apps/hosts/dotnet-desktop"),
      List.of("dotnet", "run", "--project", "DzoneDotnetDesktopHost.csproj", "--no-launch-profile")
    );
  }

  public synchronized RuntimeHostLaunchResult closeDotnetDesktop(String backendUrl) {
    return closeHost("dotnet-desktop", backendUrl);
  }

  public synchronized RuntimeHostLaunchResult launchMaui(String backendUrl) throws IOException {
    return launchHost(
      "maui-desktop",
      backendUrl,
      repoRoot.resolve("apps/hosts/maui/DzoneMauiHost"),
      List.of("dotnet", "run", "--project", "DzoneMauiHost.csproj", "-f", "net10.0-windows10.0.19041.0", "--no-launch-profile")
    );
  }

  public synchronized RuntimeHostLaunchResult closeMaui(String backendUrl) {
    return closeHost("maui-desktop", backendUrl);
  }

  public synchronized RuntimeHostSetupResult setupMaui() throws IOException {
    if (isRunning(mauiSetupProcess)) {
      return mauiSetupStateWithStatus("running");
    }

    Path logPath = Path.of(mauiSetupState.logPath());
    Files.createDirectories(logPath.getParent());
    appendLog(logPath, "\n[maui] Setup requested at " + Instant.now() + "\n");
    mauiSetupState = new RuntimeHostSetupResult(
      "maui",
      "starting",
      "dotnet workload install maui",
      logPath.toString(),
      Instant.now().toString(),
      null,
      null,
      null,
      readLogTail(logPath),
      null,
      null,
      null
    );

    ProcessBuilder builder = new ProcessBuilder(mauiSetupCommand());
    builder.directory(repoRoot.toFile());
    builder.redirectErrorStream(true);
    builder.redirectOutput(ProcessBuilder.Redirect.appendTo(logPath.toFile()));
    mauiSetupProcess = builder.start();
    Process setupProcess = mauiSetupProcess;
    Thread watcher = new Thread(() -> watchSetupProcess(setupProcess, logPath), "dzone-maui-setup-watch");
    watcher.setDaemon(true);
    watcher.start();
    return mauiSetupState;
  }

  public synchronized RuntimeHostSetupResult mauiSetupStatus() {
    return mauiSetupStateWithStatus(isRunning(mauiSetupProcess) ? "running" : mauiSetupState.status());
  }

  @PreDestroy
  public synchronized void close() {
    for (Process process : hostProcesses.values()) {
      process.destroy();
    }
    if (mauiSetupProcess != null) {
      mauiSetupProcess.destroy();
    }
  }

  private RuntimeHostLaunchResult launchHost(String host, String backendUrl, Path workingDirectory, List<String> command) throws IOException {
    Process current = hostProcesses.get(host);
    if (isRunning(current)) {
      return new RuntimeHostLaunchResult(host, "running", backendUrl);
    }

    ProcessBuilder builder = new ProcessBuilder(command);
    builder.directory(workingDirectory.toFile());
    builder.environment().put("DZONE_BACKEND_URL", backendUrl);
    builder.redirectOutput(ProcessBuilder.Redirect.DISCARD);
    builder.redirectError(ProcessBuilder.Redirect.DISCARD);
    Process process = builder.start();
    hostProcesses.put(host, process);
    return new RuntimeHostLaunchResult(host, "starting", backendUrl);
  }

  private RuntimeHostLaunchResult closeHost(String host, String backendUrl) {
    Process process = hostProcesses.remove(host);
    if (!isRunning(process)) {
      return new RuntimeHostLaunchResult(host, "stopped", backendUrl);
    }
    process.destroy();
    return new RuntimeHostLaunchResult(host, "stopping", backendUrl);
  }

  private List<String> electronCommand() {
    Path electronExe = repoRoot.resolve("apps/hosts/electron/node_modules/electron/dist/electron.exe");
    if (Files.exists(electronExe)) {
      return List.of(electronExe.toString(), ".");
    }
    if (isWindows()) {
      return List.of("cmd.exe", "/d", "/s", "/c", "npm start");
    }
    return List.of("npm", "start");
  }

  private List<String> mauiSetupCommand() {
    Path script = repoRoot.resolve("scripts/install-maui-workload.ps1");
    return isWindows()
      ? List.of("powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script.toString())
      : List.of("pwsh", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script.toString());
  }

  private void watchSetupProcess(Process setupProcess, Path logPath) {
    try {
      int exitCode = setupProcess.waitFor();
      synchronized (this) {
        mauiSetupState = new RuntimeHostSetupResult(
          "maui",
          exitCode == 0 ? "completed" : "failed",
          mauiSetupState.command(),
          mauiSetupState.logPath(),
          mauiSetupState.startedAt(),
          Instant.now().toString(),
          exitCode,
          null,
          readLogTail(logPath),
          null,
          null,
          null
        );
        if (mauiSetupProcess == setupProcess) {
          mauiSetupProcess = null;
        }
      }
    } catch (InterruptedException error) {
      Thread.currentThread().interrupt();
    }
  }

  private RuntimeHostSetupResult mauiSetupStateWithStatus(String status) {
    Path logPath = Path.of(mauiSetupState.logPath());
    return new RuntimeHostSetupResult(
      mauiSetupState.host(),
      status,
      mauiSetupState.command(),
      mauiSetupState.logPath(),
      mauiSetupState.startedAt(),
      mauiSetupState.finishedAt(),
      mauiSetupState.exitCode(),
      mauiSetupState.signal(),
      readLogTail(logPath),
      null,
      null,
      null
    );
  }

  public RuntimeHostSetupResult setupSpringBackendStatus() {
    return new RuntimeHostSetupResult(
      "spring",
      "completed",
      "winget install Microsoft.OpenJDK.17 and Apache.Maven",
      null,
      null,
      null,
      null,
      null,
      "",
      "installed",
      "installed",
      "running"
    );
  }

  private static boolean isRunning(Process process) {
    return process != null && process.isAlive();
  }

  private static void appendLog(Path path, String value) throws IOException {
    Files.writeString(path, value, java.nio.file.StandardOpenOption.CREATE, java.nio.file.StandardOpenOption.APPEND);
  }

  private static String readLogTail(Path path) {
    try {
      String content = Files.exists(path) ? Files.readString(path) : "";
      return content.length() <= 4000 ? content.trim() : content.substring(content.length() - 4000).trim();
    } catch (IOException error) {
      return "";
    }
  }

  private static boolean isWindows() {
    return System.getProperty("os.name").toLowerCase().contains("win");
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
