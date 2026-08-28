using System.Collections.Generic;
using System.IO;

// Mirrors Get-Profiles/Add-OrSetLastProfile in the old MnMFieldNotes.ps1 -
// a small persisted Data\Profiles.json so the name doesn't need retyping
// every launch. Not sensitive data, plain JSON is fine.
internal static class ProfileStore
{
    public sealed class Result
    {
        public List<string> Profiles = new List<string>();
        public string LastUsed;
    }

    public static Result Get()
    {
        if (!File.Exists(AppPaths.ProfilesPath))
        {
            return new Result();
        }
        try
        {
            var raw = JsonUtil.DeserializeObjectMap(File.ReadAllText(AppPaths.ProfilesPath));
            var result = new Result();
            if (raw != null)
            {
                if (raw.ContainsKey("profiles"))
                {
                    foreach (var item in JsonUtil.AsObjectList(raw["profiles"]))
                    {
                        result.Profiles.Add(item == null ? null : item.ToString());
                    }
                }
                if (raw.ContainsKey("lastUsed")) result.LastUsed = raw["lastUsed"] as string;
            }
            return result;
        }
        catch
        {
            return new Result();
        }
    }

    public static void AddOrSetLast(string name)
    {
        var data = Get();
        if (!data.Profiles.Contains(name)) data.Profiles.Add(name);
        data.LastUsed = name;

        var outObj = new Dictionary<string, object>
        {
            { "profiles", data.Profiles },
            { "lastUsed", data.LastUsed },
        };
        File.WriteAllText(AppPaths.ProfilesPath, JsonUtil.Serialize(outObj));
    }
}
