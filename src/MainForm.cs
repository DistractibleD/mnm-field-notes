using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// Mirrors the host setup in the old MnMFieldNotes.ps1: form size/text,
// secondary-monitor placement, icon, WebView2 control creation with
// UserDataFolder set before first use, EnsureCoreWebView2Async on Shown,
// SetVirtualHostNameToFolderMapping. WebMessageReceived dispatches through
// WebMessageRouter, built out incrementally per the migration's staged plan.
internal sealed class MainForm : Form
{
    private readonly WebView2 _webView;
    private KeyHookController _keyHook;

    // The live current orientation - may come from a stored preference OR
    // (first run, nothing stored yet) from DetectDefaultOrientation, so this
    // is the one source of truth for "what is it right now" rather than
    // re-reading AppSettingsStore (which stays null until the user actually
    // toggles - see ApplyOrientation/SetOrientation below).
    public string CurrentOrientation { get; private set; }

    // Landscape is the new default (backlog: "should start in landscape mode
    // by default, with a portrait toggle"); portrait is the app's original
    // size, kept exactly as it was so a user who switches back gets the same
    // dimensions this app always used. Swapped W/H pair, not two unrelated
    // sizes, so toggling reads as a literal rotation.
    private const int LandscapeWidth = 1500;
    private const int LandscapeHeight = 900;
    private const int PortraitWidth = 900;
    private const int PortraitHeight = 1500;

    public MainForm()
    {
        Text = "MnM Field Notes";
        ApplyOrientation(AppSettingsStore.GetStoredOrientation() ?? DetectDefaultOrientation());

        if (File.Exists(AppPaths.IconPath))
        {
            try { Icon = new Icon(AppPaths.IconPath); }
            catch { /* fall back to the default WinForms icon */ }
        }

        _webView = new WebView2 { Dock = DockStyle.Fill };
        // UserDataFolder must be set on CreationProperties BEFORE the
        // control's first use, then just EnsureCoreWebView2Async(null) -
        // manually creating a CoreWebView2Environment and passing it in
        // hung indefinitely in an earlier attempt at this app (documented in
        // CLAUDE-HISTORY.md); this is the pattern that's actually proven to
        // work here, not a shortcut.
        _webView.CreationProperties = new CoreWebView2CreationProperties
        {
            UserDataFolder = Path.Combine(AppPaths.DataDir, "WebView2UserData"),
        };
        Controls.Add(_webView);

        FormClosing += (s, e) => { if (_keyHook != null) _keyHook.Stop(); };

        if (Autotest.Enabled) Autotest.ArmFailsafe(this);

        Shown += async (s, e) => { await _webView.EnsureCoreWebView2Async(null); };

        _webView.CoreWebView2InitializationCompleted += (s, e) =>
        {
            if (!e.IsSuccess)
            {
                MessageBox.Show(
                    "Could not start the embedded browser: " + e.InitializationException.Message,
                    "MnM Field Notes");
                Close();
                return;
            }

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "appassets.local", AppPaths.UiRoot, CoreWebView2HostResourceAccessKind.Allow);

            var ui = new UiBridge(_webView.CoreWebView2);
            _keyHook = new KeyHookController(ui);
            _webView.CoreWebView2.WebMessageReceived += async (s2, e2) =>
            {
                try
                {
                    await WebMessageRouter.HandleAsync(e2.WebMessageAsJson, ui, this, _keyHook);
                }
                catch (Exception ex)
                {
                    DebugLog.Write("WebMessageReceived", ex.ToString());
                }
            };

            if (Autotest.Enabled)
            {
                _webView.CoreWebView2.NavigationCompleted += (s3, e3) =>
                {
                    if (e3.IsSuccess) Autotest.RunDriverScript(_webView.CoreWebView2);
                };
            }

            _webView.CoreWebView2.Navigate("https://appassets.local/index.html");
        };
    }

    // First-run only (no Settings.json yet) - reads the secondary monitor's
    // own shape rather than guessing a fixed default, so the window starts
    // matching whatever's actually plugged in. Falls back to landscape (the
    // app's own new baseline default) when there's no secondary monitor to
    // check, its dimensions are exactly square, or the check itself fails
    // for any reason (Screen.AllScreens is a live OS/driver query, not
    // something to trust blindly) - landscape is the safer failure mode
    // here specifically: a portrait window that turns out too narrow/tall
    // for an unexpected setup has previously left real content cut off,
    // needing a manual resize to actually use the app.
    private static string DetectDefaultOrientation()
    {
        try
        {
            var secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
            if (secondary == null) return "landscape";
            var area = secondary.WorkingArea;
            return area.Height > area.Width ? "portrait" : "landscape";
        }
        catch
        {
            return "landscape";
        }
    }

    // Sets Width/Height for the given orientation and (re)centers on the
    // secondary monitor - shared by the constructor (first paint, before the
    // setting can be re-derived from anywhere else) and SetOrientation below
    // (a live toggle), so the two can never drift into different placement
    // logic. This app is designed to run on a second monitor while playing,
    // not share the primary one - open/re-center there automatically when
    // one exists.
    private void ApplyOrientation(string orientation)
    {
        CurrentOrientation = orientation == "portrait" ? "portrait" : "landscape";
        Width = orientation == "portrait" ? PortraitWidth : LandscapeWidth;
        Height = orientation == "portrait" ? PortraitHeight : LandscapeHeight;

        var secondary = Screen.AllScreens.FirstOrDefault(s => !s.Primary);
        if (secondary != null)
        {
            StartPosition = FormStartPosition.Manual;
            var area = secondary.WorkingArea;
            Location = new Point(
                area.X + Math.Max(0, (area.Width - Width) / 2),
                area.Y + Math.Max(0, (area.Height - Height) / 2));
        }
        else
        {
            StartPosition = FormStartPosition.CenterScreen;
        }
    }

    // Called from WebMessageRouter when the UI's orientation toggle is
    // clicked - resizes/re-centers immediately and persists the choice so
    // the next launch remembers it (backlog: "the app should remember the
    // users setting and load in the remembered mode the next time it is
    // opened").
    public void SetOrientation(string orientation)
    {
        ApplyOrientation(orientation);
        AppSettingsStore.SetOrientation(orientation);
    }
}
