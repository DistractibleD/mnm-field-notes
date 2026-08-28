using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

// Mirrors the WebMessageReceived switch in the old MnMFieldNotes.ps1 -
// dispatches each incoming message's "type" to the relevant service class.
// Built incrementally per the migration's staged plan; message types not
// listed here yet are simply ignored (same as an absent switch case would
// be) until a later stage wires them up.
internal static class WebMessageRouter
{
    // Cached from the most recent 'ready' fetch - only used for the
    // SV_AUTOTEST report on 'endSession', mirroring $script:wikiData in the
    // old PS1 host (same dev-only diagnostic purpose, never read otherwise).
    private static WikiService.WikiDataResult _lastWikiData;

    public static async Task HandleAsync(string json, UiBridge ui, System.Windows.Forms.Form form, KeyHookController keyHook)
    {
        var msg = JsonUtil.DeserializeObjectMap(json);
        if (msg == null) return;
        string type = msg.GetValueOrDefault("type") as string;

        switch (type)
        {
            case "ready":
                await HandleReadyAsync(ui, form as MainForm);
                break;
            case "checkForUpdates":
                await HandleCheckForUpdatesAsync(ui);
                break;
            case "openUrl":
                HandleOpenUrl(msg);
                break;
            case "setProfile":
                ProfileStore.AddOrSetLast(msg.GetValueOrDefault("name") as string);
                break;
            case "saveGatherNote":
                GatherNotesStore.Save(msg.GetValueOrDefault("node") as string, msg.GetValueOrDefault("note") as string);
                break;
            case "startSession":
                HandleStartSession(msg, ui);
                break;
            case "logEntry":
                HandleLogEntry(msg, ui);
                break;
            case "endSession":
                HandleEndSession(msg, ui, form);
                break;
            case "fishingStarted":
                SetSessionField(msg, "fishingStartSkill");
                break;
            case "fishingEnded":
                SetSessionField(msg, "fishingEndSkill");
                break;
            case "gatheringStarted":
                SetSessionField(msg, "gatheringStartSkill");
                break;
            case "gatheringEnded":
                SetSessionField(msg, "gatheringEndSkill");
                break;
            case "editEntry":
                HandleEditEntry(msg);
                break;
            case "submitExport":
                await HandleSubmitExportAsync(msg, ui);
                break;
            case "submitScreenshot":
                await HandleSubmitScreenshotAsync(msg, ui);
                break;
            case "startKeyCapture":
                keyHook.Start("capture", null);
                break;
            case "startKeyCounting":
                keyHook.Start("count", new KeyHookTarget
                {
                    VkCode = ToInt(msg.GetValueOrDefault("vkCode")),
                    Ctrl = GetBool(msg, "ctrl"),
                    Alt = GetBool(msg, "alt"),
                    Shift = GetBool(msg, "shift"),
                });
                break;
            case "stopKeyCounting":
                keyHook.Stop();
                break;
            case "setOrientation":
                var mainForm = form as MainForm;
                if (mainForm != null) mainForm.SetOrientation(msg.GetValueOrDefault("orientation") as string);
                break;
            case "applyUpdate":
                await HandleApplyUpdateAsync(msg, ui, form);
                break;
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

    private static bool GetBool(Dictionary<string, object> d, string key)
    {
        object v = d.GetValueOrDefault(key);
        return v is bool && (bool)v;
    }

    private static async Task HandleSubmitExportAsync(Dictionary<string, object> msg, UiBridge ui)
    {
        string fileName = msg.GetValueOrDefault("fileName") as string;
        string exportPath = Path.Combine(AppPaths.SessionsDir, fileName);
        if (!File.Exists(exportPath))
        {
            ui.Send(new Dictionary<string, object>
            {
                { "type", "submitExportResult" }, { "ok", false },
                { "error", "Export file not found - was it moved or deleted?" }, { "fileName", fileName },
            });
            return;
        }

        string text = File.ReadAllText(exportPath);
        string title = SessionExportWriter.GetExportTitle(text, fileName);
        var result = await SessionExportSubmitter.SubmitAsync(text, title);
        ui.Send(new Dictionary<string, object>
        {
            { "type", "submitExportResult" }, { "ok", result.Ok }, { "error", result.Error }, { "fileName", fileName },
        });
    }

    // imageBase64 is optional - the wiki's own Worker accepts a notes-only
    // submission with no screenshot attached (see ScreenshotSubmit.cs).
    private static async Task HandleSubmitScreenshotAsync(Dictionary<string, object> msg, UiBridge ui)
    {
        string subject = msg.GetValueOrDefault("subject") as string;
        string kind = msg.GetValueOrDefault("kind") as string;
        string zone = msg.GetValueOrDefault("zone") as string;
        string note = msg.GetValueOrDefault("note") as string;
        string fileName = msg.GetValueOrDefault("fileName") as string;
        string mimeType = msg.GetValueOrDefault("mimeType") as string;
        string imageBase64 = msg.GetValueOrDefault("imageBase64") as string;

        byte[] imageBytes = null;
        if (!string.IsNullOrEmpty(imageBase64))
        {
            try { imageBytes = Convert.FromBase64String(imageBase64); }
            catch (FormatException)
            {
                ui.Send(new Dictionary<string, object>
                {
                    { "type", "screenshotSubmitted" }, { "ok", false },
                    { "error", "Could not read that image - try a different file." },
                });
                return;
            }
        }

        var result = await ScreenshotSubmitter.SubmitAsync(subject, kind, zone, note, imageBytes, fileName, mimeType);
        ui.Send(new Dictionary<string, object> { { "type", "screenshotSubmitted" }, { "ok", result.Ok }, { "error", result.Error } });
    }

    // AppUpdater.ApplyUpdateAsync already launched the new exe on success -
    // this just has to close the current (old) process cleanly so the two
    // don't both end up running. A short delay isn't needed for the launch
    // itself (already done), just gives the outgoing 'updateApplied'
    // message a moment to actually reach the page before the window closes,
    // same reasoning as HandleEndSession's own autotest close-timer.
    private static async Task HandleApplyUpdateAsync(Dictionary<string, object> msg, UiBridge ui, System.Windows.Forms.Form form)
    {
        string zipUrl = msg.GetValueOrDefault("zipUrl") as string;
        var result = await AppUpdater.ApplyUpdateAsync(zipUrl);
        ui.Send(new Dictionary<string, object> { { "type", "updateApplied" }, { "ok", result.Ok }, { "error", result.Error } });

        if (result.Ok)
        {
            var closeTimer = new System.Windows.Forms.Timer { Interval = 400 };
            closeTimer.Tick += (s, e) => { closeTimer.Stop(); form.Close(); };
            closeTimer.Start();
        }
    }

    private static void HandleStartSession(Dictionary<string, object> msg, UiBridge ui)
    {
        string sessionId = DateTime.Now.ToString("yyyyMMdd-HHmmss") + "-" + Guid.NewGuid().ToString("N").Substring(0, 6);
        var info = new Dictionary<string, object>
        {
            { "type", msg.GetValueOrDefault("sessionType") },
            { "loggedBy", msg.GetValueOrDefault("loggedBy") },
            { "startedAt", DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") },
        };
        SessionState.Start(sessionId, info);
        ui.Send(new Dictionary<string, object> { { "type", "sessionStarted" }, { "sessionId", sessionId } });
    }

    // Deliberately generic: whatever fields the UI sent in msg.entry are
    // stored as-is, plus session metadata. Adding/removing a field for any
    // session type never needs a change here - see CLAUDE.md "Session types
    // and fields" / the data-model note on keeping this flexible.
    private static void HandleLogEntry(Dictionary<string, object> msg, UiBridge ui)
    {
        string sessionId = msg.GetValueOrDefault("sessionId") as string;
        var info = SessionState.Get(sessionId);
        if (info == null) { ui.Send(new Dictionary<string, object> { { "type", "error" }, { "message", "Unknown session" } }); return; }

        var entry = msg.GetValueOrDefault("entry") as Dictionary<string, object> ?? new Dictionary<string, object>();
        entry["sessionId"] = sessionId;
        entry["sessionType"] = msg.GetValueOrDefault("sessionType");
        entry["loggedBy"] = info.GetValueOrDefault("loggedBy");
        AllTimeLog.AddEntry(entry);
    }

    private static void HandleEndSession(Dictionary<string, object> msg, UiBridge ui, System.Windows.Forms.Form form)
    {
        string sessionId = msg.GetValueOrDefault("sessionId") as string;
        var info = SessionState.Get(sessionId);
        if (info == null) { ui.Send(new Dictionary<string, object> { { "type", "error" }, { "message", "Unknown session" } }); return; }

        var result = SessionExportWriter.Write(sessionId, info);
        SessionState.End(sessionId);
        ui.Send(new Dictionary<string, object> { { "type", "sessionEnded" }, { "exportFileName", result.FileName }, { "entryCount", result.Count } });

        if (Autotest.Enabled)
        {
            bool wikiOk = _lastWikiData != null
                && (_lastWikiData.Monsters.Count > 0 || _lastWikiData.Items.Count > 0)
                && string.IsNullOrEmpty(_lastWikiData.Error);
            var allEntries = AllTimeLog.GetSessionEntries(sessionId);
            var harvestEntry = allEntries.FirstOrDefault(e => (e.GetValueOrDefault("sessionType") as string) == "harvesting");
            var report = new List<string>
            {
                "wikiFetchOk=" + wikiOk + " (monsters=" + (_lastWikiData != null ? _lastWikiData.Monsters.Count : 0)
                    + " items=" + (_lastWikiData != null ? _lastWikiData.Items.Count : 0) + " error=" + (_lastWikiData != null ? _lastWikiData.Error : ""),
                "sessionId=" + sessionId,
                "exportPath=" + result.Path,
                "exportEntryCount=" + result.Count,
                "exportFileExists=" + File.Exists(result.Path),
                "allTimeLogHasEntry=" + (allEntries.Count > 0),
                "harvestEntryFound=" + (harvestEntry != null),
                "harvestAttempts=" + (harvestEntry != null ? harvestEntry.GetValueOrDefault("attempts") : null),
                "harvestNode=" + (harvestEntry != null ? harvestEntry.GetValueOrDefault("target") : null),
            };
            File.WriteAllLines(Autotest.ResultPath, report);
            var closeTimer = new System.Windows.Forms.Timer { Interval = 500 };
            closeTimer.Tick += (s, e) => { closeTimer.Stop(); form.Close(); };
            closeTimer.Start();
        }
    }

    private static void SetSessionField(Dictionary<string, object> msg, string field)
    {
        string sessionId = msg.GetValueOrDefault("sessionId") as string;
        var info = SessionState.Get(sessionId);
        if (info != null) info[field] = msg.GetValueOrDefault("skill");
    }

    // Only entries in a still-running session are editable - once a
    // session's ended and exported, the export file is already written and
    // editing the all-time log alone would leave it silently out of sync
    // with what got exported.
    private static void HandleEditEntry(Dictionary<string, object> msg)
    {
        string sessionId = msg.GetValueOrDefault("sessionId") as string;
        if (!SessionState.Exists(sessionId)) return;
        string entryId = msg.GetValueOrDefault("entryId") as string;
        var patch = msg.GetValueOrDefault("patch") as Dictionary<string, object> ?? new Dictionary<string, object>();
        AllTimeLog.EditEntry(entryId, patch);
    }

    private static async Task HandleReadyAsync(UiBridge ui, MainForm form)
    {
        var wikiData = await WikiService.FetchWikiDataAsync();
        _lastWikiData = wikiData;
        ui.Send(new Dictionary<string, object>
        {
            { "type", "wikiData" },
            { "monsters", wikiData.Monsters },
            { "items", wikiData.Items },
            { "nodes", wikiData.Nodes },
            { "recipes", wikiData.Recipes },
            { "factions", wikiData.Factions },
            { "zones", wikiData.Zones },
            { "maps", wikiData.Maps },
            { "pageUrl", wikiData.PageUrl },
            { "error", wikiData.Error },
        });

        var profiles = ProfileStore.Get();
        ui.Send(new Dictionary<string, object>
        {
            { "type", "profiles" },
            { "profiles", profiles.Profiles },
            { "lastUsed", profiles.LastUsed },
        });

        var update = await WikiService.GetUpdateInfoAsync();
        ui.Send(BuildUpdateInfoMessage(update, false));

        ui.Send(new Dictionary<string, object> { { "type", "fishRarity" }, { "data", AllTimeLog.GetFishRarity() } });
        ui.Send(new Dictionary<string, object> { { "type", "sharedFishRarity" }, { "data", await WikiService.GetSharedFishRarityAsync() } });
        ui.Send(new Dictionary<string, object> { { "type", "combatLevelRange" }, { "data", AllTimeLog.GetCombatZoneLevelRange() } });
        ui.Send(new Dictionary<string, object> { { "type", "gatherNotes" }, { "data", GatherNotesStore.Get() } });
        ui.Send(new Dictionary<string, object> { { "type", "localActivityStats" }, { "data", AllTimeLog.GetLocalActivityStats() } });
        ui.Send(new Dictionary<string, object> { { "type", "orientation" }, { "value", form != null ? form.CurrentOrientation : "landscape" } });
    }

    private static async Task HandleCheckForUpdatesAsync(UiBridge ui)
    {
        var update = await WikiService.GetUpdateInfoAsync();
        ui.Send(BuildUpdateInfoMessage(update, true));
    }

    private static Dictionary<string, object> BuildUpdateInfoMessage(WikiService.UpdateInfoResult update, bool manual)
    {
        var msg = new Dictionary<string, object>
        {
            { "type", "updateInfo" },
            { "currentVersion", update.CurrentVersion },
            { "buildDate", update.BuildDate },
            { "latestVersion", update.LatestVersion },
            { "url", update.Url },
            { "zipUrl", update.ZipUrl },
            { "available", update.Available },
            { "error", update.Error },
        };
        if (manual) msg["manual"] = true;
        return msg;
    }

    private static void HandleOpenUrl(Dictionary<string, object> msg)
    {
        string url = msg.GetValueOrDefault("url") as string;
        if (url != null && Regex.IsMatch(url, "^https?://"))
        {
            Process.Start(url);
        }
    }
}
