using System;
using System.Net.Http;
using System.Threading.Tasks;

// Backlog #2: attach a screenshot of a monster or gathering node. Reuses the
// wiki's OWN existing "Submit a Screenshot" pipeline exactly as it already
// is - the same screenshot/notes/website fields the wiki's own form sends,
// committed to images/Inbox/ - rather than adding a new Worker code path the
// way session exports needed (see SessionExportSubmit.cs). No Worker change
// was required for this feature at all.
//
// The "Regarding: <kind> — <name>" / "Zone/Map: <zone>" lines folded onto
// the front of `notes` match the exact format the wiki's own script.js
// builds client-side before it ever reaches the Worker (see that repo's
// renderSubmitPage/its form submit handler) - the Worker itself never parses
// notes, so this only matters for a human reader of the resulting PR, but
// matching it means a submission from this app reads identically to one
// made on the wiki directly.
internal static class ScreenshotSubmitter
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };

    public sealed class Result
    {
        public bool Ok;
        public string Error;
    }

    // subject/kind describe what the picture is of ("monster"/"node" -
    // labeled "Monster"/"Gathering node" in the resulting notes text);
    // zone/note/imageBytes/fileName/mimeType are all optional individually,
    // but the Worker itself requires at least a screenshot OR a note.
    public static async Task<Result> SubmitAsync(string subject, string kind, string zone, string note, byte[] imageBytes, string fileName, string mimeType)
    {
        try
        {
            var notesParts = new System.Collections.Generic.List<string>();
            if (!string.IsNullOrEmpty(subject))
            {
                string kindLabel = kind == "node" ? "Gathering node" : "Monster";
                notesParts.Add("Regarding: " + kindLabel + " — " + subject);
            }
            if (!string.IsNullOrEmpty(zone)) notesParts.Add("Zone/Map: " + zone);
            if (!string.IsNullOrEmpty(note)) notesParts.Add(note);
            string notes = string.Join("\n", notesParts);

            using (var content = new MultipartFormDataContent())
            {
                if (imageBytes != null && imageBytes.Length > 0)
                {
                    content.Add(MultipartUtil.MakeQuotedFilePart(imageBytes, "screenshot", fileName, mimeType));
                }
                content.Add(MultipartUtil.MakeQuotedPart(notes, "notes"));
                content.Add(MultipartUtil.MakeQuotedPart("", "website"));
                MultipartUtil.StripBoundaryQuotes(content);

                var response = await Http.PostAsync(Config.SubmitWorkerUrl, content);
                string body = await response.Content.ReadAsStringAsync();
                var parsed = JsonUtil.DeserializeObjectMap(body);
                string error = parsed != null ? parsed.GetValueOrDefault("error") as string : null;
                if (!string.IsNullOrEmpty(error))
                {
                    return new Result { Ok = false, Error = error };
                }
                if (!response.IsSuccessStatusCode)
                {
                    return new Result { Ok = false, Error = "HTTP " + (int)response.StatusCode + ": " + response.ReasonPhrase };
                }
                return new Result { Ok = true, Error = null };
            }
        }
        catch (Exception ex)
        {
            return new Result { Ok = false, Error = ex.Message };
        }
    }
}
