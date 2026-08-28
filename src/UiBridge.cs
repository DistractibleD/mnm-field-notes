using Microsoft.Web.WebView2.Core;

// Mirrors Send-ToUI in the old MnMFieldNotes.ps1 - serializes a payload and
// posts it to the page via PostWebMessageAsJson. Instance-based (not
// static) since it needs a live CoreWebView2 reference, created once
// initialization succeeds and handed to whatever needs to talk back to the UI.
internal sealed class UiBridge
{
    private readonly CoreWebView2 _coreWebView2;

    public UiBridge(CoreWebView2 coreWebView2)
    {
        _coreWebView2 = coreWebView2;
    }

    public void Send(object payload)
    {
        _coreWebView2.PostWebMessageAsJson(JsonUtil.Serialize(payload));
    }
}
