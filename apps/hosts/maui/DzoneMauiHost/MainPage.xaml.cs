using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Maui.Storage;

namespace DzoneMauiHost;

public partial class MainPage : ContentPage
{
    private const string BackendPreferenceKey = "dzoneMauiBackendUrl";
    private readonly HttpClient httpClient = new();
    private readonly SemaphoreSlim refreshGate = new(1, 1);
    private CancellationTokenSource? refreshCancellation;
    private IReadOnlyList<DocumentView> displayedDocuments = [];
    private string backendUrl = (Environment.GetEnvironmentVariable("DZONE_BACKEND_URL") ??
        Preferences.Default.Get(BackendPreferenceKey, "http://localhost:3000")).TrimEnd('/');

    public MainPage()
    {
        InitializeComponent();
        BackendUrlEntry.Text = backendUrl;
    }

    protected override void OnAppearing()
    {
        base.OnAppearing();
        StartRefresh();
    }

    protected override void OnDisappearing()
    {
        StopRefresh();
        base.OnDisappearing();
    }

    private void OnConnectClicked(object? sender, EventArgs e)
    {
        var candidate = BackendUrlEntry.Text?.Trim().TrimEnd('/') ?? string.Empty;
        if (!Uri.TryCreate(candidate, UriKind.Absolute, out var uri) ||
            (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) ||
            !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
        {
            DetailLabel.Text = "Enter a valid HTTP or HTTPS backend URL.";
            return;
        }

        StopRefresh();
        backendUrl = candidate;
        BackendUrlEntry.Text = backendUrl;
        Preferences.Default.Set(BackendPreferenceKey, backendUrl);
        displayedDocuments = [];
        BindableLayout.SetItemsSource(DocumentList, displayedDocuments);
        NoDocumentsLabel.IsVisible = true;
        WorkspaceCountLabel.Text = "-";
        DocumentCountLabel.Text = "-";
        JobCountLabel.Text = "-";
        DataLabel.Text = string.Empty;
        RuntimeStatusLabel.Text = "Connecting...";
        DetailLabel.Text = string.Empty;
        StartRefresh();
    }

    private async void OnRefreshClicked(object? sender, EventArgs e)
    {
        await RefreshPlatformAsync(refreshCancellation?.Token ?? CancellationToken.None);
    }

    private void StartRefresh()
    {
        if (refreshCancellation != null)
        {
            return;
        }

        refreshCancellation = new CancellationTokenSource();
        _ = RefreshLoopAsync(refreshCancellation);
    }

    private void StopRefresh()
    {
        refreshCancellation?.Cancel();
        refreshCancellation = null;
    }

    private async Task RefreshLoopAsync(CancellationTokenSource source)
    {
        var cancellationToken = source.Token;
        try
        {
            await RefreshPlatformAsync(cancellationToken);
            using var timer = new PeriodicTimer(TimeSpan.FromSeconds(3.5));
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                await RefreshPlatformAsync(cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        finally
        {
            source.Dispose();
        }
    }

    private async Task RefreshPlatformAsync(CancellationToken cancellationToken)
    {
        try
        {
            await refreshGate.WaitAsync(cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return;
        }

        try
        {
            var targetUrl = backendUrl;
            var health = await GetJsonAsync<Health>(targetUrl, "/health", cancellationToken);
            var workspaces = await GetJsonAsync<List<Workspace>>(targetUrl, "/workspaces", cancellationToken);
            var documentBatches = await Task.WhenAll(workspaces.Select(workspace =>
                GetJsonAsync<List<Document>>(targetUrl, $"/documents?workspaceId={Uri.EscapeDataString(workspace.Id)}", cancellationToken)));
            var documents = documentBatches.SelectMany(batch => batch).OrderByDescending(document => document.UpdatedAt).ToList();
            var jobs = await GetJsonAsync<List<ProcessingJob>>(targetUrl, "/jobs", cancellationToken);
            cancellationToken.ThrowIfCancellationRequested();

            var workspaceNames = workspaces.ToDictionary(workspace => workspace.Id, workspace => workspace.Name);
            var documentViews = documents.Select(document => new DocumentView(
                document.Title,
                document.Status,
                workspaceNames.GetValueOrDefault(document.WorkspaceId, "Unknown workspace"),
                $"Updated {document.UpdatedAt.ToLocalTime():g}"
            )).ToArray();

            if (!documentViews.SequenceEqual(displayedDocuments))
            {
                BindableLayout.SetItemsSource(DocumentList, documentViews);
                displayedDocuments = documentViews;
            }

            NoDocumentsLabel.IsVisible = documentViews.Length == 0;
            WorkspaceCountLabel.Text = workspaces.Count.ToString();
            DocumentCountLabel.Text = documents.Count.ToString();
            JobCountLabel.Text = jobs.Count.ToString();
            RuntimeStatusLabel.Text = health.Ok ? $"{health.Runtime} runtime online" : "Runtime unavailable";
            DetailLabel.Text = $"Last synced {DateTime.Now:t} from {targetUrl}";
            DataLabel.Text = BuildDataSummary(workspaces, jobs);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (Exception error)
        {
            RuntimeStatusLabel.Text = "Runtime unavailable";
            DetailLabel.Text = error.Message;
        }
        finally
        {
            refreshGate.Release();
        }
    }

    private async Task<T> GetJsonAsync<T>(string targetUrl, string path, CancellationToken cancellationToken)
    {
        return await httpClient.GetFromJsonAsync<T>($"{targetUrl}{path}", cancellationToken) ??
            throw new InvalidOperationException($"Empty response from {path}.");
    }

    private static string BuildDataSummary(IReadOnlyCollection<Workspace> workspaces, IReadOnlyCollection<ProcessingJob> jobs)
    {
        return string.Join(Environment.NewLine, new[]
        {
            $"Workspaces: {Preview(workspaces.Select(workspace => workspace.Name))}",
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

    public sealed record DocumentView(string Title, string Status, string WorkspaceName, string UpdatedText);

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
        [property: JsonPropertyName("workspaceId")] string WorkspaceId,
        [property: JsonPropertyName("title")] string Title,
        [property: JsonPropertyName("status")] string Status,
        [property: JsonPropertyName("updatedAt")] DateTimeOffset UpdatedAt
    );

    private sealed record ProcessingJob(
        [property: JsonPropertyName("id")] string Id,
        [property: JsonPropertyName("type")] string Type,
        [property: JsonPropertyName("status")] string Status
    );
}
