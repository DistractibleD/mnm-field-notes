using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

// Mirrors Format-CoinString/Write-CombatBlock/Write-HarvestingBlock/
// Write-CraftingBlock/Write-FishRarityBlock/Write-SessionExport/
// Get-SessionExportTitle - the plain-text Sessions\*.txt writer.
internal static class SessionExportWriter
{
    public sealed class Result
    {
        public string Path;
        public string FileName;
        public int Count;
    }

    public static Result Write(string sessionId, Dictionary<string, object> sessionInfo)
    {
        var entries = AllTimeLog.GetSessionEntries(sessionId);
        var sb = new StringBuilder();
        sb.AppendLine("Session export - " + sessionInfo.GetValueOrDefault("type"));
        sb.AppendLine("Logged by: " + sessionInfo.GetValueOrDefault("loggedBy"));
        sb.AppendLine("Started: " + sessionInfo.GetValueOrDefault("startedAt"));
        sb.AppendLine("Ended: " + DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss"));
        sb.AppendLine("Entries: " + entries.Count);
        if (sessionInfo.ContainsKey("fishingStartSkill")) sb.AppendLine("Fishing skill at session start: " + sessionInfo["fishingStartSkill"]);
        if (sessionInfo.ContainsKey("fishingEndSkill")) sb.AppendLine("Fishing skill at session end: " + sessionInfo["fishingEndSkill"]);
        if (sessionInfo.ContainsKey("gatheringStartSkill")) sb.AppendLine("Gathering skill at session start: " + sessionInfo["gatheringStartSkill"]);
        if (sessionInfo.ContainsKey("gatheringEndSkill")) sb.AppendLine("Gathering skill at session end: " + sessionInfo["gatheringEndSkill"]);
        sb.AppendLine("");

        var byType = entries.GroupBy(e => GetString(e, "sessionType")).ToList();
        foreach (var typeGroup in byType)
        {
            if (byType.Count > 1) { sb.AppendLine("--- " + typeGroup.Key + " ---"); sb.AppendLine(""); }
            var groupList = typeGroup.ToList();
            if (typeGroup.Key == "harvesting") WriteHarvestingBlock(sb, groupList);
            else if (typeGroup.Key == "crafting") WriteCraftingBlock(sb, groupList);
            else if (typeGroup.Key == "camp") WriteCampBlock(sb, groupList);
            else WriteCombatBlock(sb, groupList);
        }

        WriteFishRarityBlock(sb, entries);

        string fileName = Regex.Replace(GetString(sessionInfo, "startedAt"), "[: ]", "-")
            + "_" + GetString(sessionInfo, "loggedBy") + "_" + GetString(sessionInfo, "type") + ".txt";
        fileName = Regex.Replace(fileName, "[\\\\/:*?\"<>|]", "_");
        string path = Path.Combine(AppPaths.SessionsDir, fileName);
        File.WriteAllText(path, sb.ToString());
        return new Result { Path = path, FileName = fileName, Count = entries.Count };
    }

    private static void WriteCombatBlock(StringBuilder sb, List<Dictionary<string, object>> entries)
    {
        foreach (var g in GroupByTarget(entries))
        {
            bool named = g.Value.Any(e => GetBool(e, "named"));
            string tag = named ? " - NAMED" : "";
            string plural = g.Value.Count != 1 ? "s" : "";
            sb.AppendLine("== " + g.Key + " (" + g.Value.Count + " kill" + plural + ")" + tag + " ==");
            foreach (var e in g.Value)
            {
                var items = GetStringList(e, "items");
                string itemsPart = items.Count > 0 ? string.Join(", ", items) : "none";
                object level = e.GetValueOrDefault("playerLevel");
                string levelPart = IsTruthy(level) ? " | Level: " + level : "";
                sb.AppendLine("- Zone: " + GetString(e, "zone") + " | Con: " + GetString(e, "con") + levelPart
                    + " | Coin: " + FormatCoin(e.GetValueOrDefault("coin")) + " | Items: " + itemsPart);

                var factionChanges = JsonUtil.AsObjectList(e.GetValueOrDefault("factionChanges"))
                    .Select(fc => fc as Dictionary<string, object>).Where(fc => fc != null).ToList();
                if (factionChanges.Count > 0)
                {
                    var pos = factionChanges.Where(fc => GetString(fc, "effect") == "positive").Select(fc => GetString(fc, "faction")).ToList();
                    var neg = factionChanges.Where(fc => GetString(fc, "effect") == "negative").Select(fc => GetString(fc, "faction")).ToList();
                    if (pos.Count > 0) sb.AppendLine("  Faction +: " + string.Join(", ", pos));
                    if (neg.Count > 0) sb.AppendLine("  Faction -: " + string.Join(", ", neg));
                }
            }
            sb.AppendLine("");
        }
    }

    private static void WriteHarvestingBlock(StringBuilder sb, List<Dictionary<string, object>> entries)
    {
        foreach (var g in GroupByTarget(entries))
        {
            string tradeskill = GetString(g.Value[0], "tradeskill");
            sb.AppendLine("== " + g.Key + " (" + tradeskill + ") ==");
            foreach (var e in g.Value)
            {
                string areaPart = string.IsNullOrEmpty(GetString(e, "area")) ? "" : " | Area: " + GetString(e, "area");
                object skill = e.GetValueOrDefault("skill");
                string skillPart = skill != null ? "Skill: " + skill + " | " : "";
                bool success = GetBool(e, "success");
                string resultItem = GetString(e, "resultItem");
                string outcome = success ? "Result: " + (string.IsNullOrEmpty(resultItem) ? "success" : resultItem) : "No catch/result";
                object attempts = e.GetValueOrDefault("attempts");
                string attemptsPart = attempts != null ? " | Attempts: " + attempts : "";
                sb.AppendLine("- Zone: " + GetString(e, "zone") + areaPart + " | " + skillPart + outcome + attemptsPart);
            }
            sb.AppendLine("");
        }
    }

    private static void WriteCraftingBlock(StringBuilder sb, List<Dictionary<string, object>> entries)
    {
        foreach (var g in GroupByTarget(entries))
        {
            string tradeskill = GetString(g.Value[0], "tradeskill");
            sb.AppendLine("== " + g.Key + " (" + tradeskill + ") ==");

            // Stats/resists/haste live on the dish itself, not per-attempt (a
            // recipe always grants the same buff), so print them once from
            // the first attempt rather than repeating on every line.
            var first = g.Value[0];
            var stats = first.GetValueOrDefault("stats") as Dictionary<string, object>;
            var resists = first.GetValueOrDefault("resists") as Dictionary<string, object>;
            var statsParts = stats != null ? stats.Select(kv => kv.Key + " +" + kv.Value).ToList() : new List<string>();
            var resistParts = resists != null ? resists.Select(kv => kv.Key + " +" + kv.Value).ToList() : new List<string>();
            object haste = first.GetValueOrDefault("haste");
            if (statsParts.Count > 0 || resistParts.Count > 0 || IsTruthy(haste))
            {
                string statsLine = statsParts.Count > 0 ? string.Join(", ", statsParts) : "none";
                string resistLine = resistParts.Count > 0 ? string.Join(", ", resistParts) : "none";
                string hasteLine = IsTruthy(haste) ? "+" + haste + "%" : "none";
                sb.AppendLine("Grants: " + statsLine + " | Resists: " + resistLine + " | Haste: " + hasteLine);
            }

            foreach (var e in g.Value)
            {
                object skill = e.GetValueOrDefault("skill");
                string skillPart = skill != null ? "Skill: " + skill + " | " : "";
                string outcome = GetBool(e, "success") ? "Success" : "Fail";
                var components = GetStringList(e, "components");
                string componentsPart = components.Count > 0 ? " | Components: " + string.Join(", ", components) : "";
                sb.AppendLine("- " + skillPart + "Difficulty: " + GetString(e, "difficultyColor") + " | Result: " + outcome + componentsPart);
            }
            sb.AppendLine("");
        }
    }

    // Combat camps only (a spot where a group of monsters spawns to fight,
    // NOT a fishing spot or gathering node - those already have their own
    // data). One block per logged camp, not grouped by name the way
    // kills/harvests are - a camp submission already captures its full
    // monster list in one go, so there's nothing to accumulate across
    // multiple entries the way repeated kills of the same mob would.
    // Header deliberately has no "(...)" tradeskill-shaped suffix (unlike
    // Combat/Harvesting's own "== Name (N kills) =="/"== Name (Tradeskill) =="
    // headers) - confirmed with wiki-claude directly that its Fishing-rarity
    // parser only ever acts on a "(<tradeskill>)" match, so this format was
    // chosen to structurally not resemble one, on top of "Camp" never
    // literally matching "Fishing" either way.
    private static void WriteCampBlock(StringBuilder sb, List<Dictionary<string, object>> entries)
    {
        foreach (var e in entries)
        {
            sb.AppendLine("== " + GetString(e, "name") + " ==");
            string areaPart = string.IsNullOrEmpty(GetString(e, "area")) ? "" : " | Area: " + GetString(e, "area");
            sb.AppendLine("Zone: " + GetString(e, "zone") + areaPart);

            object minLevel = e.GetValueOrDefault("minLevel");
            object maxLevel = e.GetValueOrDefault("maxLevel");
            if (minLevel != null || maxLevel != null)
            {
                sb.AppendLine("Level range: " + (minLevel ?? "?") + "-" + (maxLevel ?? "?"));
            }
            if (GetBool(e, "raid")) sb.AppendLine("Raid camp");

            var monsters = GetStringList(e, "monsters");
            sb.AppendLine("Monsters: " + (monsters.Count > 0 ? string.Join(", ", monsters) : "none listed"));

            string note = GetString(e, "note");
            if (!string.IsNullOrEmpty(note)) sb.AppendLine("Note: " + note);
            sb.AppendLine("");
        }
    }

    // Computed rarity stats for the export - the wiki-side reviewer only
    // ever sees ONE submission's raw entries otherwise, not the fuller
    // statistical picture this app already builds for its own rarity bars.
    // Reuses AllTimeLog.GetFishRarity() (same function powering the live
    // in-app bars) for the all-time half - one source of truth for the math.
    private static void WriteFishRarityBlock(StringBuilder sb, List<Dictionary<string, object>> entries)
    {
        var fishEntries = entries.Where(e => GetString(e, "tradeskill") == "Fishing").ToList();
        if (fishEntries.Count == 0) return;

        var allTimeRarity = AllTimeLog.GetFishRarity();
        sb.AppendLine("--- Fishing rarity data (this app's own logged data, not the wiki's rarity label) ---");
        sb.AppendLine("");

        var byZone = fishEntries.GroupBy(e => GetString(e, "zone"));
        foreach (var zg in byZone)
        {
            string zone = zg.Key;
            if (string.IsNullOrEmpty(zone)) continue;
            var group = zg.ToList();

            int sessionAttempts = group.Sum(e => ToInt(e.GetValueOrDefault("attempts")));
            var sessionCatches = new List<KeyValuePair<string, int>>();
            var counts = new Dictionary<string, int>();
            var order = new List<string>();
            foreach (var e in group)
            {
                if (GetBool(e, "success") && !string.IsNullOrEmpty(GetString(e, "resultItem")))
                {
                    string name = GetString(e, "resultItem");
                    if (!counts.ContainsKey(name)) { counts[name] = 0; order.Add(name); }
                    counts[name]++;
                }
            }

            sb.AppendLine("== " + zone + " ==");
            sb.AppendLine("This session - " + sessionAttempts + " attempt" + (sessionAttempts != 1 ? "s" : "") + ":");
            if (counts.Count == 0)
            {
                sb.AppendLine("  (no catches this session)");
            }
            else
            {
                foreach (string fishName in counts.Keys.OrderBy(k => k, StringComparer.Ordinal))
                {
                    int count = counts[fishName];
                    double pct = sessionAttempts > 0 ? Math.Round((double)count / sessionAttempts * 100, 1) : 0;
                    sb.AppendLine("  - " + fishName + ": " + count + " / " + sessionAttempts + " (" + pct.ToString("0.0") + "%)");
                }
            }

            if (allTimeRarity.ContainsKey(zone))
            {
                var allTime = (Dictionary<string, object>)allTimeRarity[zone];
                int allTimeAttempts = ToInt(allTime.GetValueOrDefault("totalAttempts"));
                var allTimeFish = allTime.GetValueOrDefault("fish") as Dictionary<string, object>;
                sb.AppendLine("All-time on this install, includes this session - " + allTimeAttempts + " attempts:");
                if (allTimeFish != null)
                {
                    foreach (string fishName in allTimeFish.Keys.OrderBy(k => k, StringComparer.Ordinal))
                    {
                        int count = ToInt(allTimeFish[fishName]);
                        double pct = allTimeAttempts > 0 ? Math.Round((double)count / allTimeAttempts * 100, 1) : 0;
                        sb.AppendLine("  - " + fishName + ": " + count + " / " + allTimeAttempts + " (" + pct.ToString("0.0") + "%)");
                    }
                }
            }
            sb.AppendLine("");
        }
    }

    public static string GetExportTitle(string text, string fileName)
    {
        var typeMatch = Regex.Match(text, "Session export - (.+)");
        var byMatch = Regex.Match(text, "Logged by: (.+)");
        var countMatch = Regex.Match(text, "Entries: (\\d+)");
        if (typeMatch.Success && byMatch.Success)
        {
            string title = typeMatch.Groups[1].Value.Trim() + " session by " + byMatch.Groups[1].Value.Trim();
            if (countMatch.Success) title += " (" + countMatch.Groups[1].Value + " entries)";
            return title;
        }
        return "Session export (" + fileName + ")";
    }

    private static List<KeyValuePair<string, List<Dictionary<string, object>>>> GroupByTarget(List<Dictionary<string, object>> entries)
    {
        var result = new List<KeyValuePair<string, List<Dictionary<string, object>>>>();
        var index = new Dictionary<string, List<Dictionary<string, object>>>();
        foreach (var e in entries)
        {
            string target = GetString(e, "target");
            List<Dictionary<string, object>> list;
            if (!index.TryGetValue(target, out list))
            {
                list = new List<Dictionary<string, object>>();
                index[target] = list;
                result.Add(new KeyValuePair<string, List<Dictionary<string, object>>>(target, list));
            }
            list.Add(e);
        }
        return result;
    }

    private static string FormatCoin(object coinObj)
    {
        var coin = coinObj as Dictionary<string, object>;
        if (coin == null) return "0c";
        var parts = new List<string>();
        if (IsTruthy(coin.GetValueOrDefault("platinum"))) parts.Add(coin["platinum"] + "p");
        if (IsTruthy(coin.GetValueOrDefault("gold"))) parts.Add(coin["gold"] + "g");
        if (IsTruthy(coin.GetValueOrDefault("silver"))) parts.Add(coin["silver"] + "s");
        if (IsTruthy(coin.GetValueOrDefault("copper"))) parts.Add(coin["copper"] + "c");
        return parts.Count == 0 ? "0c" : string.Join(" ", parts);
    }

    private static string GetString(Dictionary<string, object> d, string key)
    {
        object v = d.GetValueOrDefault(key);
        return v == null ? "" : v.ToString();
    }

    private static bool GetBool(Dictionary<string, object> d, string key)
    {
        object v = d.GetValueOrDefault(key);
        return v is bool && (bool)v;
    }

    private static List<string> GetStringList(Dictionary<string, object> d, string key)
    {
        return JsonUtil.AsObjectList(d.GetValueOrDefault(key)).Select(x => x == null ? "" : x.ToString()).ToList();
    }

    private static bool IsTruthy(object o)
    {
        if (o == null) return false;
        if (o is bool) return (bool)o;
        if (o is int) return (int)o != 0;
        if (o is double) return (double)o != 0;
        return !string.IsNullOrEmpty(o.ToString());
    }

    private static int ToInt(object o)
    {
        if (o == null) return 0;
        if (o is int) return (int)o;
        if (o is double) return (int)(double)o;
        int parsed;
        return int.TryParse(o.ToString(), out parsed) ? parsed : 0;
    }
}
