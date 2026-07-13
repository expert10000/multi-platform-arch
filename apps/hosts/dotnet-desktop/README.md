# .NET Desktop Host

Desktop host for the shared platform contract.

This is the default lightweight .NET desktop host. It uses WPF on Windows and the same OpenAPI surface as the Web and Electron hosts.

It does not require the .NET MAUI workload.

Run locally:

```bash
dotnet run --project apps/hosts/dotnet-desktop/DzoneDotnetDesktopHost.csproj --no-launch-profile
```

Use a different backend:

```bash
DZONE_BACKEND_URL=http://localhost:3100 dotnet run --project apps/hosts/dotnet-desktop/DzoneDotnetDesktopHost.csproj --no-launch-profile
```
