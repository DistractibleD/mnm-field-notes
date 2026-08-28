using System;
using System.IO;
using System.Reflection;

// Resolves every path this app touches from the exe's own location, so it
// stays fully portable - no installer, runs from wherever it's unzipped to.
// Mirrors $root/$uiRoot/etc at the top of the old MnMFieldNotes.ps1.
internal static class AppPaths
{
    public static readonly string Root =
        Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);

    public static readonly string UiRoot = Path.Combine(Root, "ui");
    public static readonly string WebView2Root = Path.Combine(Root, "lib", "webview2");
    public static readonly string DataDir = Path.Combine(Root, "Data");
    public static readonly string SessionsDir = Path.Combine(Root, "Sessions");
    public static readonly string IconPath = Path.Combine(Root, "app.ico");
    public static readonly string AllTimeLogPath = Path.Combine(DataDir, "AllTimeLog.jsonl");
    public static readonly string ProfilesPath = Path.Combine(DataDir, "Profiles.json");
    public static readonly string GatherNotesPath = Path.Combine(DataDir, "GatherNotes.json");
    public static readonly string SettingsPath = Path.Combine(DataDir, "Settings.json");
    public static readonly string ErrorLogPath = Path.Combine(DataDir, "error.log");

    public static void EnsureDataDirsExist()
    {
        Directory.CreateDirectory(DataDir);
        Directory.CreateDirectory(SessionsDir);
    }
}
