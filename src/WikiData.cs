using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

// Mirrors Get-WikiData/Get-UpdateInfo/Compare-AppVersion/Get-SharedFishRarity
// in the old MnMFieldNotes.ps1 - all read-only wiki fetches (see CLAUDE.md
// "Wiki data - read-only reference"). Reshapes the wiki's raw JSON into the
// flatter shape the UI expects, same as the PS version did.
internal static class WikiService
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

    public sealed class WikiDataResult
    {
        public List<object> Monsters = new List<object>();
        public List<object> Items = new List<object>();
        public List<object> Nodes = new List<object>();
        public List<object> Recipes = new List<object>();
        public List<string> Factions = new List<string>();
        public List<string> Zones = new List<string>();
        public List<object> Maps = new List<object>();
        public List<object> Camps = new List<object>();
        public string PageUrl = Config.WikiBaseUrl;
        public string Error;
    }

    public static async Task<WikiDataResult> FetchWikiDataAsync()
    {
        var result = new WikiDataResult();
        try
        {
            var monsters = await GetJsonArrayAsync(Config.WikiBaseUrl + "monsters.json");
            var items = await GetJsonArrayAsync(Config.WikiBaseUrl + "items.json");
            var nodes = await GetJsonArrayAsync(Config.WikiBaseUrl + "gathering-nodes.json");
            var crafting = await GetJsonArrayAsync(Config.WikiBaseUrl + "crafting.json");
            var maps = await GetJsonArrayAsync(Config.WikiBaseUrl + "maps.json");

            result.Monsters = monsters.Select(m =>
            {
                var d = AsMap(m);
                var flatDrops = AsList(d.GetValueOrDefault("drops"))
                    .Select(x => AsMap(x).GetValueOrDefault("item"))
                    .ToList();
                return (object)new Dictionary<string, object>
                {
                    { "name", d.GetValueOrDefault("name") },
                    { "named", ToBool(d.GetValueOrDefault("named")) },
                    { "locations", AsList(d.GetValueOrDefault("maps")) },
                    { "areas", AsList(d.GetValueOrDefault("areas")) },
                    { "drops", flatDrops },
                };
            }).ToList();

            result.Items = items.Select(i => (object)new Dictionary<string, object>
            {
                { "name", AsMap(i).GetValueOrDefault("name") },
            }).ToList();

            result.Nodes = nodes.Select(n =>
            {
                var d = AsMap(n);
                var flatResults = AsList(d.GetValueOrDefault("results")).Select(r =>
                {
                    var rMap = r as Dictionary<string, object>;
                    return rMap != null && rMap.ContainsKey("label") ? rMap["label"] : r;
                }).ToList();
                return (object)new Dictionary<string, object>
                {
                    { "name", d.GetValueOrDefault("name") },
                    { "tradeskill", d.GetValueOrDefault("tradeskill") },
                    { "locations", AsList(d.GetValueOrDefault("locations")) },
                    { "note", d.GetValueOrDefault("note") },
                    { "results", flatResults },
                    { "minSkill", d.GetValueOrDefault("minSkill") },
                    { "trivialSkill", d.GetValueOrDefault("trivialSkill") },
                };
            }).ToList();

            result.Recipes = crafting.Select(c => (object)new Dictionary<string, object>
            {
                { "name", AsMap(c).GetValueOrDefault("name") },
                { "tradeskill", AsMap(c).GetValueOrDefault("tradeskill") },
            }).ToList();

            result.Factions = monsters
                .Select(AsMap)
                .Where(d => d.ContainsKey("factionEffects") && d["factionEffects"] != null)
                .SelectMany(d => AsList(d["factionEffects"]))
                .Select(fe => AsMap(fe).GetValueOrDefault("faction") as string)
                .Where(f => f != null)
                .Distinct()
                .OrderBy(f => f, StringComparer.Ordinal)
                .ToList();

            // Strip a trailing " (...)" the same way the wiki's own
            // groupMapsByArea does, so alternate renderings of one zone
            // (e.g. "Vale of Zintar" / "Vale of Zintar (Numbered)") collapse
            // to a single dropdown entry.
            result.Zones = maps
                .Select(m => Regex.Replace((AsMap(m).GetValueOrDefault("name") as string) ?? "", @"\s*\([^)]*\)\s*$", ""))
                .Where(z => z.Length > 0)
                .Distinct()
                .OrderBy(z => z, StringComparer.Ordinal)
                .ToList();

            // Full name (with any "(Variant)" suffix intact - the client
            // groups by base name itself, same as the wiki's own
            // groupMapsByArea) + absolute image URLs, so ui/app.js can just
            // point an <img> straight at the published site - the image
            // itself is a plain browser-native fetch, never routed through
            // this exe's own HttpClient (unlike the JSON data above), since
            // there's no processing benefit and it would mean re-inventing
            // browser caching for tens-of-MB map images.
            result.Maps = maps.Select(m =>
            {
                var d = AsMap(m);
                string image = d.GetValueOrDefault("image") as string;
                string thumbnail = d.GetValueOrDefault("thumbnail") as string;
                return (object)new Dictionary<string, object>
                {
                    { "name", d.GetValueOrDefault("name") },
                    { "image", string.IsNullOrEmpty(image) ? null : Config.WikiBaseUrl + image },
                    { "thumbnail", string.IsNullOrEmpty(thumbnail) ? null : Config.WikiBaseUrl + thumbnail },
                };
            }).ToList();
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }

        // Fetched separately, own try/catch - camps.json is a brand-new file
        // (2026-08-29, see CLAUDE.md "Cross-session agreement with
        // wiki-claude") that may not be deployed to the published site yet.
        // A missing/failed fetch here must never break the rest of wikiData
        // (monsters/items/etc. above already succeeded by this point) - same
        // soft-fail-to-empty pattern as GetSharedFishRarityAsync.
        try
        {
            var camps = await GetJsonArrayAsync(Config.WikiBaseUrl + "camps.json");
            result.Camps = camps.Select(c =>
            {
                var d = AsMap(c);
                return (object)new Dictionary<string, object>
                {
                    { "name", d.GetValueOrDefault("name") },
                    { "zone", d.GetValueOrDefault("zone") },
                    { "area", d.GetValueOrDefault("area") },
                    { "monsters", AsList(d.GetValueOrDefault("monsters")) },
                    { "minLevel", d.GetValueOrDefault("minLevel") },
                    { "maxLevel", d.GetValueOrDefault("maxLevel") },
                    { "raid", ToBool(d.GetValueOrDefault("raid")) },
                };
            }).ToList();
        }
        catch
        {
            // Leave result.Camps as the default empty list - not a real
            // error worth surfacing (see the toast this app already shows
            // for result.Error elsewhere), just "no camps yet."
        }

        return result;
    }

    public sealed class UpdateInfoResult
    {
        public string CurrentVersion = Config.AppVersion;
        public string BuildDate = Config.AppBuildDate;
        public string LatestVersion;
        public string Url;
        public string ZipUrl;
        public bool Available;
        public string Error;
    }

    public static async Task<UpdateInfoResult> GetUpdateInfoAsync()
    {
        var result = new UpdateInfoResult();
        try
        {
            string json = await Http.GetStringAsync(Config.UpdateCheckUrl);
            var latest = JsonUtil.DeserializeObjectMap(json);
            result.LatestVersion = latest.GetValueOrDefault("version") as string;
            result.Url = latest.GetValueOrDefault("url") as string;
            result.ZipUrl = latest.GetValueOrDefault("zipUrl") as string;
            result.Available = CompareAppVersion(result.LatestVersion, Config.AppVersion) > 0;
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
        }
        return result;
    }

    // Splits "major.minor" on '.' and compares each segment as a real int -
    // never a single numeric cast (can't parse a dotted string) or a plain
    // string comparison ("0.10" < "0.9" lexicographically, wrong both ways).
    public static int CompareAppVersion(string a, string b)
    {
        int[] aParts = (a ?? "0").Split('.').Select(ParseIntOrZero).ToArray();
        int[] bParts = (b ?? "0").Split('.').Select(ParseIntOrZero).ToArray();
        int len = Math.Max(aParts.Length, bParts.Length);
        for (int i = 0; i < len; i++)
        {
            int av = i < aParts.Length ? aParts[i] : 0;
            int bv = i < bParts.Length ? bParts[i] : 0;
            if (av != bv) return av - bv;
        }
        return 0;
    }

    private static int ParseIntOrZero(string s)
    {
        int v;
        return int.TryParse(s, out v) ? v : 0;
    }

    // Pooled Fishing rarity from the wiki's own published fishing-rarity.json
    // (built there by a GitHub Action on every merged session-export PR).
    // Soft-fails to an empty object on any error - never blocks the app.
    public static async Task<Dictionary<string, object>> GetSharedFishRarityAsync()
    {
        try
        {
            string json = await Http.GetStringAsync(Config.WikiBaseUrl + "fishing-rarity.json");
            return JsonUtil.DeserializeObjectMap(json) ?? new Dictionary<string, object>();
        }
        catch
        {
            return new Dictionary<string, object>();
        }
    }

    private static async Task<List<object>> GetJsonArrayAsync(string url)
    {
        string json = await Http.GetStringAsync(url);
        return JsonUtil.AsObjectList(JsonUtil.Deserialize(json));
    }

    internal static Dictionary<string, object> AsMap(object o)
    {
        return o as Dictionary<string, object> ?? new Dictionary<string, object>();
    }

    internal static List<object> AsList(object o)
    {
        return JsonUtil.AsObjectList(o);
    }

    private static bool ToBool(object o)
    {
        return o is bool && (bool)o;
    }
}

// GetValueOrDefault doesn't exist on Dictionary in .NET Framework 4.x -
// small extension to match the .NET Core/5+ API this code is written against.
internal static class DictionaryExtensions
{
    public static object GetValueOrDefault(this Dictionary<string, object> dict, string key)
    {
        object value;
        return dict.TryGetValue(key, out value) ? value : null;
    }
}
