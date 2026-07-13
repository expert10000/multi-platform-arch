# .NET MAUI Desktop Host

Optional MAUI desktop host for the shared platform contract.

The repository works by default without MAUI through `apps/hosts/dotnet-desktop`.
This folder contains the optional MAUI Windows desktop host.

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

Run the MAUI Windows desktop host:

```bash
npm run start:host:maui
```

By default it talks to `http://localhost:3000`. Set `DZONE_BACKEND_URL` to point
it at another compatible backend.
