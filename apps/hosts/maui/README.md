# .NET MAUI Host

Desktop host for the shared platform contract.

The current checked-in project is a Windows desktop shell that uses the same OpenAPI surface as the Web and Electron hosts. It is placed behind the `.NET MAUI Host` runtime boundary so the UI can be moved to a full MAUI project once the MAUI workload is installed.

Run locally:

```bash
dotnet run --project apps/hosts/maui/DzoneMauiHost.csproj --no-launch-profile
```

Use a different backend:

```bash
DZONE_BACKEND_URL=http://localhost:3100 dotnet run --project apps/hosts/maui/DzoneMauiHost.csproj --no-launch-profile
```
