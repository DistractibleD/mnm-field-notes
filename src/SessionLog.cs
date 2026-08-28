using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

// Mirrors Add-AllTimeLogEntry/Get-SessionEntries/Get-FishRarity/
// Get-CombatZoneLevelRange/Edit-AllTimeLogEntry - all operate on the
// append-only Data\AllTimeLog.jsonl. Edit-AllTimeLogEntry is the one
// deliberate exception (in-place rewrite by client-generated id, scoped to
// a still-running session's own entries).
internal static class AllTimeLog
{
    private static readonly object FileLock = new object();

    public static void AddEntry(Dictionary<string, object> entry)
    {
        lock (FileLock)
        {
            File.AppendAllText(AppPaths.AllTimeLogPath, JsonUtil.Serialize(entry) + Environment.NewLine);
        }
    }

    public static List<Dictionary<string, object>> GetSessionEntries(string sessionId)
    {
        return ReadAllEntries().Where(o => (o.GetValueOrDefault("sessionId") as string) == sessionId).ToList();
    }

    // {zone: {totalAttempts, fish: {name: catches}}} - all-time, all
    // sessions, not just the current one. Feeds the rarity bars.
    public static Dictionary<string, object> GetFishRarity()
    {
        var result = new Dictionary<string, object>();
        foreach (var o in ReadAllEntries())
        {
            if ((o.GetValueOrDefault("tradeskill") as string) != "Fishing") continue;
            string zone = o.GetValueOrDefault("zone") as string;
            if (string.IsNullOrEmpty(zone)) continue;

            if (!result.ContainsKey(zone))
            {
                result[zone] = new Dictionary<string, object> { { "totalAttempts", 0 }, { "fish", new Dictionary<string, object>() } };
            }
            var zoneEntry = (Dictionary<string, object>)result[zone];
            int attempts = ToInt(o.GetValueOrDefault("attempts"));
            zoneEntry["totalAttempts"] = ToInt(zoneEntry["totalAttempts"]) + attempts;

            bool success = ToBool(o.GetValueOrDefault("success"));
            string resultItem = o.GetValueOrDefault("resultItem") as string;
            if (success && !string.IsNullOrEmpty(resultItem))
            {
                var fish = (Dictionary<string, object>)zoneEntry["fish"];
                fish[resultItem] = ToInt(fish.ContainsKey(resultItem) ? fish[resultItem] : 0) + 1;
            }
        }
        return result;
    }

    // {zone: {min, max, count}} - empirical level-range guess from Combat's
    // own logged playerLevel per kill. Entries with no playerLevel (the
    // field is optional per-kill) are skipped rather than counted as 0,
    // which would silently drag every zone's minimum down.
    public static Dictionary<string, object> GetCombatZoneLevelRange()
    {
        var result = new Dictionary<string, object>();
        foreach (var o in ReadAllEntries())
        {
            if ((o.GetValueOrDefault("sessionType") as string) != "combat") continue;
            string zone = o.GetValueOrDefault("zone") as string;
            object levelObj = o.GetValueOrDefault("playerLevel");
            if (string.IsNullOrEmpty(zone) || levelObj == null) continue;
            int level = ToInt(levelObj);

            if (!result.ContainsKey(zone))
            {
                result[zone] = new Dictionary<string, object> { { "min", level }, { "max", level }, { "count", 0 } };
            }
            var zoneEntry = (Dictionary<string, object>)result[zone];
            if (level < ToInt(zoneEntry["min"])) zoneEntry["min"] = level;
            if (level > ToInt(zoneEntry["max"])) zoneEntry["max"] = level;
            zoneEntry["count"] = ToInt(zoneEntry["count"]) + 1;
        }
        return result;
    }

    // Rewrites the one matching line in place (by the entry's
    // client-generated id) rather than appending a correction - the log
    // stays append-only for new entries, this is the one deliberate
    // exception, scoped by the caller to a still-running session's entries.
    public static void EditEntry(string entryId, Dictionary<string, object> patch)
    {
        if (!File.Exists(AppPaths.AllTimeLogPath)) return;
        lock (FileLock)
        {
            string[] lines = File.ReadAllLines(AppPaths.AllTimeLogPath);
            for (int i = 0; i < lines.Length; i++)
            {
                if (string.IsNullOrWhiteSpace(lines[i])) continue;
                Dictionary<string, object> o;
                try { o = JsonUtil.DeserializeObjectMap(lines[i]); }
                catch { continue; }
                if (o == null || (o.GetValueOrDefault("id") as string) != entryId) continue;

                foreach (var kv in patch) o[kv.Key] = kv.Value;
                lines[i] = JsonUtil.Serialize(o);
            }
            File.WriteAllLines(AppPaths.AllTimeLogPath, lines);
        }
    }

    private static IEnumerable<Dictionary<string, object>> ReadAllEntries()
    {
        if (!File.Exists(AppPaths.AllTimeLogPath)) yield break;
        foreach (string line in File.ReadAllLines(AppPaths.AllTimeLogPath))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            Dictionary<string, object> o = null;
            try { o = JsonUtil.DeserializeObjectMap(line); }
            catch { /* skip malformed lines */ }
            if (o != null) yield return o;
        }
    }

    private static int ToInt(object o)
    {
        if (o == null) return 0;
        if (o is int) return (int)o;
        if (o is double) return (int)(double)o;
        int parsed;
        return int.TryParse(o.ToString(), out parsed) ? parsed : 0;
    }

    private static bool ToBool(object o)
    {
        return o is bool && (bool)o;
    }
}
