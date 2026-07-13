using System.Collections.ObjectModel;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using System.Windows;

namespace DzoneMauiHost;

public partial class MainWindow : Window
{
    private readonly HttpClient http = new();
    private readonly ObservableCollection<WorkspaceItem> workspaces = new();
    private readonly ObservableCollection<DocumentItem> documents = new();
    private readonly ObservableCollection<JobItem> jobs = new();
    private string backendUrl = Environment.GetEnvironmentVariable("DZONE_BACKEND_URL") ?? "http://localhost:3000";

    public MainWindow()
    {
        InitializeComponent();
        BackendUrlBox.Text = backendUrl;
        WorkspaceList.ItemsSource = workspaces;
        DocumentList.ItemsSource = documents;
        JobList.ItemsSource = jobs;
        Loaded += async (_, _) => await RefreshAllAsync();
    }

    private async void ConnectClicked(object sender, RoutedEventArgs e)
    {
        backendUrl = BackendUrlBox.Text.Trim().TrimEnd('/');
        if (string.IsNullOrWhiteSpace(backendUrl))
        {
            backendUrl = "http://localhost:3000";
            BackendUrlBox.Text = backendUrl;
        }
        await RefreshAllAsync();
    }

    private async void RefreshClicked(object sender, RoutedEventArgs e)
    {
        await RefreshAllAsync();
    }

    private async void CreateWorkspaceClicked(object sender, RoutedEventArgs e)
    {
        var name = WorkspaceNameBox.Text.Trim();
        if (name.Length == 0)
        {
            return;
        }

        var workspace = await PostJsonAsync<WorkspaceItem>("/workspaces", new { name });
        WorkspaceNameBox.Text = "";
        await RefreshAllAsync();
        WorkspaceList.SelectedItem = workspaces.FirstOrDefault(item => item.Id == workspace.Id);
    }

    private async void CreateDocumentClicked(object sender, RoutedEventArgs e)
    {
        if (WorkspaceList.SelectedItem is not WorkspaceItem workspace)
        {
            return;
        }

        var title = DocumentTitleBox.Text.Trim();
        if (title.Length == 0)
        {
            return;
        }

        await PostJsonAsync<DocumentItem>("/documents", new
        {
            workspaceId = workspace.Id,
            title,
            tags = DocumentTagsBox.Text.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
        });
        DocumentTitleBox.Text = "";
        DocumentTagsBox.Text = "";
        await RefreshWorkspaceAsync(workspace);
    }

    private async void WorkspaceSelectionChanged(object sender, System.Windows.Controls.SelectionChangedEventArgs e)
    {
        if (WorkspaceList.SelectedItem is WorkspaceItem workspace)
        {
            await RefreshWorkspaceAsync(workspace);
        }
    }

    private async Task RefreshAllAsync()
    {
        try
        {
            var health = await GetJsonAsync<HealthResult>("/health");
            RuntimeStatus.Text = $"{health.Runtime} backend";
            var loadedWorkspaces = await GetJsonAsync<List<WorkspaceItem>>("/workspaces");
            workspaces.Clear();
            foreach (var workspace in loadedWorkspaces)
            {
                workspaces.Add(workspace);
            }
            WorkspaceCount.Text = workspaces.Count.ToString();
            WorkspaceList.SelectedItem ??= workspaces.FirstOrDefault();
            if (WorkspaceList.SelectedItem is WorkspaceItem active)
            {
                await RefreshWorkspaceAsync(active);
            }
        }
        catch (Exception error)
        {
            RuntimeStatus.Text = "backend offline";
            MessageBox.Show(error.Message, "DZONE .NET Host", MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    private async Task RefreshWorkspaceAsync(WorkspaceItem workspace)
    {
        ActiveWorkspaceLabel.Text = "Active workspace";
        ActiveWorkspaceName.Text = workspace.Name;

        var loadedDocuments = await GetJsonAsync<List<DocumentItem>>($"/documents?workspaceId={Uri.EscapeDataString(workspace.Id)}");
        var loadedJobs = await GetJsonAsync<List<JobItem>>("/jobs");

        documents.Clear();
        foreach (var document in loadedDocuments)
        {
            documents.Add(document);
        }

        jobs.Clear();
        var documentIds = loadedDocuments.Select(item => item.Id).ToHashSet();
        foreach (var job in loadedJobs.Where(item => documentIds.Contains(item.DocumentId)))
        {
            jobs.Add(job);
        }

        DocumentCount.Text = $"{documents.Count} documents";
        JobCount.Text = $"{jobs.Count} jobs";
    }

    private async Task<T> GetJsonAsync<T>(string path)
    {
        return await http.GetFromJsonAsync<T>($"{backendUrl}{path}") ?? throw new InvalidOperationException("Request failed.");
    }

    private async Task<T> PostJsonAsync<T>(string path, object body)
    {
        var response = await http.PostAsJsonAsync($"{backendUrl}{path}", body);
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<T>() ?? throw new InvalidOperationException("Request failed.");
    }
}

public sealed record HealthResult([property: JsonPropertyName("runtime")] string Runtime);

public sealed record WorkspaceItem(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name);

public sealed record DocumentItem(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("tags")] string[] Tags,
    [property: JsonPropertyName("fileName")] string? FileName)
{
    public string Summary => $"{Title}  |  {Status}  |  {(FileName ?? "No file")}";
}

public sealed record JobItem(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("documentId")] string DocumentId,
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("status")] string Status)
{
    public string Summary => $"{Type}  |  {Status}";
}
