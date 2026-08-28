using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;

// Shared multipart-form-data helpers for this project's two Worker
// submitters (SessionExportSubmit.cs, ScreenshotSubmit.cs) - factored out so
// the Content-Disposition-quoting fix below only has to be gotten right
// once. See CLAUDE.md "Architecture" gotcha: MultipartFormDataContent.Add
// doesn't quote the name parameter (produces name=sessionExport instead of
// the RFC 7578-standard name="sessionExport"), which Cloudflare Workers'
// request.formData() rejects as unparseable - surfaced only as a generic
// "Invalid submission" error indistinguishable from a deliberate rejection.
internal static class MultipartUtil
{
    public static StringContent MakeQuotedPart(string value, string name)
    {
        var part = new StringContent(value ?? "");
        part.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
        {
            Name = "\"" + name + "\"",
        };
        return part;
    }

    public static ByteArrayContent MakeQuotedFilePart(byte[] bytes, string name, string fileName, string mimeType)
    {
        var part = new ByteArrayContent(bytes ?? new byte[0]);
        part.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
        {
            Name = "\"" + name + "\"",
            FileName = "\"" + (fileName ?? "screenshot") + "\"",
        };
        if (!string.IsNullOrEmpty(mimeType))
        {
            part.Headers.ContentType = new MediaTypeHeaderValue(mimeType);
        }
        return part;
    }

    // .NET also wraps the boundary parameter in quotes, which most real-world
    // multipart parsers (this one included) expect unquoted - a separate,
    // smaller quirk from the name-quoting fix above, not the actual root
    // cause of the original bug, but still fixed alongside it.
    public static void StripBoundaryQuotes(MultipartFormDataContent content)
    {
        var boundaryParam = content.Headers.ContentType.Parameters.FirstOrDefault(p => p.Name == "boundary");
        if (boundaryParam != null && boundaryParam.Value != null)
        {
            boundaryParam.Value = boundaryParam.Value.Trim('"');
        }
    }
}
