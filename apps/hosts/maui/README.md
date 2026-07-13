# .NET MAUI Desktop Host

Optional MAUI desktop host for the shared platform contract.

The repository works by default without MAUI through `apps/hosts/dotnet-desktop`. Use this folder when you want a real MAUI implementation.

Install the MAUI workload before creating or running this host:

```bash
dotnet workload install maui
```

Or use the repository helper:

```bash
npm run setup:host:maui
```

You can also start the same optional setup from the Admin console with the
`Install MAUI` action on the .NET MAUI Desktop card. The `Setup Status` action
shows the last captured installer output from `data/runtime/maui-setup.log`.

Check whether the workload is already installed:

```bash
npm run check:host:maui
```

or restore workloads from a future MAUI project:

```bash
dotnet workload restore
```

Suggested project command once the workload is installed:

```bash
dotnet new maui -n DzoneMauiHost
```
