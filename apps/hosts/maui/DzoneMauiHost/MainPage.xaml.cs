using System.Net.Http.Json;
using System.Text.Json.Serialization;

namespace DzoneMauiHost;

public partial class MainPage : ContentPage
{
    private readonly HttpClient httpClient = new();
    private readonly string backendUrl = Environment.GetEnvironmentVariable("DZONE_BACKEND_URL") ?? "http://localhost:3000";

    public MainPage()
    {
        InitializeComponent();
        BackendUrlLabel.Text = $"Backend: {backendUrl}";
    }

    protected override async void OnAppearing()
    {
        base.OnAppearing();
        await RefreshPlatformAsync();
    }

    private async void OnRefreshClicked(object? sender, EventArgs e)
    {
        await RefreshPlatformAsync();
    }

    private async Task RefreshPlatformAsync()
    {
        try
        {
            RuntimeStatusLabel.Text = "Refreshing...";
            var health = await GetJsonAsync<Health>("/health");
            var workspaces = await GetJsonAsync<List<Workspace>>("/workspaces");
            var documentBatches = await Task.WhenAll(workspaces.Select(workspace =>
                GetJsonAsync<List<Document>>($"/documents?workspaceId={Uri.EscapeDataString(workspace.Id)}")));
            var documents = documentBatches.SelectMany(batch => batch).ToList();
            var jobs = await GetJsonAsync<List<ProcessingJob>>("/jobs");

            WorkspaceCountLabel.Text = workspaces.Count.ToString();
            DocumentCountLabel.Text = documents.Count.ToString();
            JobCountLabel.Text = jobs.Count.ToString();
            RuntimeStatusLabel.Text = health.Ok ? $"{health.Runtime} runtime online" : "Runtime unavailable";
            DetailLabel.Text = $"Loaded {workspaces.Count} workspaces, {documents.Count} documents, and {jobs.Count} jobs from the shared API.";
            DataLabel.Text = BuildDataSummary(workspaces, documents, jobs);
        }
        catch (Exception error)
        {
            RuntimeStatusLabel.Text = "Runtime unavailable";
            DetailLabel.Text = error.Message;
            DataLabel.Text = string.Empty;
        }
    }

    private async Task<T> GetJsonAsync<T>(string path)
    {
        return await httpClient.GetFromJsonAsync<T>($"{backendUrl}{path}") ??
            throw new InvalidOperationException($"Empty response from {path}.");
    }

    private static string BuildDataSummary(IReadOnlyCollection<Workspace> workspaces, IReadOnlyCollection<Document> documents, IReadOnlyCollection<ProcessingJob> jobs)
    {
        return string.Join(Environment.NewLine, new[]
        {
            $"Workspaces: {Preview(workspaces.Select(workspace => workspace.Name))}",
            $"Documents: {Preview(documents.Select(document => $"{document.Title} ({document.Status})"))}",
            $"Jobs: {Preview(jobs.Select(job => $"{job.Type} - {job.Status}"))}"
        });
    }

    private static string Preview(IEnumerable<string?> values)
    {
        var visibleValues = values
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Take(5)
            .ToArray();

        return visibleValues.Length > 0 ? string.Join(", ", visibleValues) : "none";
    }

    private sealed record Health(
        [property: JsonPropertyName("ok")] bool Ok,
        [property: JsonPropertyName("runtime")] string Runtime
    );

    private sealed record Workspace(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("name")] string Name
    );

    private sealed record Document(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("status")] string Status
    );

    private sealed record ProcessingJob(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("status")] string Status
    );
}
