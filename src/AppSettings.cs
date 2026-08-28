using System.Collections.Generic;
using System.IO;

// Small local settings store, same flat-JSON pattern as Profiles.cs/
// GatherNotes.cs. Currently just window orientation - remembered across
// launches once the user has ever toggled it; before that, MainForm derives
// a first-run default from the secondary monitor's own shape instead of a
// fixed guess (see MainForm.DetectDefaultOrientation).
internal static class AppSettingsStore
{
    // Null = never explicitly set - the caller (MainForm) decides the
    // first-run default; a real "landscape"/"portrait" here always wins
    // over that, since it means the user already made an explicit choice.
    public static string GetStoredOrientation()
    {
        if (!File.Exists(AppPaths.SettingsPath)) return null;
        try
        {
            var raw = JsonUtil.DeserializeObjectMap(File.ReadAllText(AppPaths.SettingsPath));
            string orientation = raw != null ? raw.GetValueOrDefault("orientation") as string : null;
            return (orientation == "portrait" || orientation == "landscape") ? orientation : null;
        }
        catch
        {
            return null;
        }
    }

    public static void SetOrientation(string orientation)
    {
        var data = new Dictionary<string, object>
        {
            { "orientation", orientation == "portrait" ? "portrait" : "landscape" },
        };
        File.WriteAllText(AppPaths.SettingsPath, JsonUtil.Serialize(data));
    }
}
