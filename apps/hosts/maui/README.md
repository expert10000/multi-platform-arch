# .NET MAUI Desktop Host

Optional MAUI desktop host for the shared platform contract.

The repository works by default without MAUI through `apps/hosts/dotnet-desktop`. Use this folder when you want a real MAUI implementation.

Install the MAUI workload before creating or running this host:

```bash
dotnet workload install maui
```

or restore workloads from a future MAUI project:

```bash
dotnet workload restore
```

Suggested project command once the workload is installed:

```bash
dotnet new maui -n DzoneMauiHost
```
