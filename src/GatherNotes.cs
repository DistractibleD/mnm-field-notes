using System.Collections.Generic;
using System.IO;

// Mirrors Get-GatherNotes/Save-GatherNote - a purely local, per-node-type
// "where can you find this" comment, keyed by node name. Never
// submitted/shared anywhere - a personal note, not wiki-bound data.
internal static class GatherNotesStore
{
    public static Dictionary<string, string> Get()
    {
        var result = new Dictionary<string, string>();
        if (!File.Exists(AppPaths.GatherNotesPath)) return result;
        try
        {
            var raw = JsonUtil.DeserializeObjectMap(File.ReadAllText(AppPaths.GatherNotesPath));
            if (raw != null)
            {
                foreach (var kv in raw) result[kv.Key] = kv.Value == null ? null : kv.Value.ToString();
            }
        }
        catch
        {
            // Corrupt/unreadable file - treat as empty, same as the PS version.
        }
        return result;
    }

    public static void Save(string node, string note)
    {
        var data = Get();
        if (string.IsNullOrWhiteSpace(note)) data.Remove(node);
        else data[node] = note;

        var outObj = new Dictionary<string, object>();
        foreach (var kv in data) outObj[kv.Key] = kv.Value;
        File.WriteAllText(AppPaths.GatherNotesPath, JsonUtil.Serialize(outObj));
    }
}
