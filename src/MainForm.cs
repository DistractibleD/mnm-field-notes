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

    public MainForm()
    {
        Text = "MnM Field Notes";
        Width = 900;
        Height = 1500;

        if (File.Exists(AppPaths.IconPath))
        {
            try { Icon = new Icon(AppPaths.IconPath); }
            catch { /* fall back to the default WinForms icon */ }
        }

        // This app is designed to run on a second monitor while playing, not
        // share the primary one - open there automatically when one exists.
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
}
