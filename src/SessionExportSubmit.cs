using System;
using System.Net.Http;
using System.Threading.Tasks;

// Mirrors Submit-SessionExport - the one exception to "never write
// outward", see CLAUDE.md "Session export submission". POSTs to the wiki's
// own Cloudflare Worker (extended with a session-export path, this
// project's own copy at lib\cloudflare-worker\submit-worker.js); it
// commits the export to a new branch and opens a PR - nothing is live
// until the wiki owner merges it.
//
// PS 5.1 needed a hand-built multipart/form-data body since
// Invoke-RestMethod has no -Form parameter - HttpClient's
// MultipartFormDataContent does this natively, a real simplification the
// migration enables (kept in its own file, matching the old code's
// isolation of the one outbound-write path for auditability).
internal static class SessionExportSubmitter
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromSeconds(25) };

    public sealed class Result
    {
        public bool Ok;
        public string Error;
    }

    public static async Task<Result> SubmitAsync(string sessionText, string title)
    {
        try
        {
            using (var content = new MultipartFormDataContent())
            {
                content.Add(MultipartUtil.MakeQuotedPart(sessionText, "sessionExport"));
                content.Add(MultipartUtil.MakeQuotedPart(title, "title"));
                // Honeypot field the Worker checks on every submission (real
                // callers never fill it) - always sent empty, matching the
                // wiki's own form, even though this isn't a public-facing one.
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
