using System;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;

// Mirrors the SV_AUTOTEST harness in the old MnMFieldNotes.ps1 - gated
// entirely on the SV_AUTOTEST env var, never runs in normal use. The
// driver script is copied verbatim from the PS1 version (ui/ itself never
// changed in this migration, so the same DOM interactions are still
// valid) - this drives Combat, Fishing (including the native key hook via
// two simulated keypresses), and Gathering through one real session, then
// ends it. Result-writing and closing the form happen from
// WebMessageRouter's own 'endSession' handler once the driven session
// actually ends, not from here - this just injects the script and arms
// the two SendKeys timers.
internal static class Autotest
{
    public static bool Enabled
    {
        get { return Environment.GetEnvironmentVariable("SV_AUTOTEST") == "1"; }
    }

    public static string ResultPath
    {
        get { return Path.Combine(AppPaths.Root, "lib", "autotest-result.txt"); }
    }

    public static void ArmFailsafe(Form form)
    {
        var timer = new Timer { Interval = 20000 };
        timer.Tick += (s, e) =>
        {
            timer.Stop();
            if (!File.Exists(ResultPath))
            {
                File.WriteAllText(ResultPath, "FAILSAFE: test did not complete within 20s");
            }
            form.Close();
        };
        timer.Start();
    }

    public static void RunDriverScript(CoreWebView2 coreWebView2)
    {
        const string script = @"
(function() {
  function byId(id) { return document.getElementById(id); }
  function setVal(id, v) { byId(id).value = v; }
  setVal('profile-modal-input', 'AutoTestUser');
  byId('profile-modal-save').click();
  byId('btn-session-action').click(); // Combat has no prompt flow, so this starts immediately
  setTimeout(function() {
    setVal('new-mob', 'a test dummy');
    byId('add-mob').click();
    setTimeout(function() {
      setVal('f-zone', 'Test Zone');
      byId('f-silver').value = '7';
      setVal('f-item', 'Totally New Test Item');
      byId('add-item-btn').click();
      byId('log-kill-btn').click();
      setTimeout(function() {
        document.querySelector('.tab[data-tab=""fishing""]').click();
        byId('fish-listen-btn').click();
      }, 300);
    }, 300);
  }, 300);

  // Skill modal opens on ""Start fishing!"" now - fill it in and confirm.
  setTimeout(function() {
    byId('fish-start-btn').click();
    setVal('fish-skill-modal-input', '10');
    byId('fish-skill-modal-go').click();
  }, 3200);

  // Confirming the skill modal opens a zone modal next - pick a zone there
  // via its own searchable single-select checklist, then confirm.
  setTimeout(function() {
    byId('fish-zone-modal-toggle').click();
    var firstZoneModalOption = document.querySelector('#fish-zone-modal-grid input[type=radio]');
    if (firstZoneModalOption) firstZoneModalOption.click();
    byId('fish-zone-modal-go').click();
  }, 3600);

  // Active screen is up: pick a zone, bump skill, and add a custom fish so
  // a pick button exists even if the wiki fetch failed in this environment.
  setTimeout(function() {
    byId('fish-zone-toggle').click();
    var firstZoneOption = document.querySelector('#fish-zone-grid input[type=radio]');
    if (firstZoneOption) firstZoneOption.click();
    byId('fish-skill-plus').click();
    setVal('fish-new-name', 'Autotest Fish');
    byId('fish-add-btn').click();
  }, 4600);

  // Catch the fish we just added, then leave one attempt uncaught so the
  // end-of-session auto-flush has something to send.
  setTimeout(function() {
    setVal('fish-area', 'Test Cove');
    var fishBtn = document.querySelector('.fish-pick-btn[data-fish=""Autotest Fish""]');
    if (fishBtn) fishBtn.click();
    byId('fish-attempts-plus').click();
  }, 5800);

  // Edit the entry just logged - exercises the whole round trip:
  // client-side patch, 'editEntry' to the host, and the all-time log
  // actually getting rewritten in place.
  setTimeout(function() {
    var editBtn = document.querySelector('[data-edit-id]');
    if (editBtn) {
      editBtn.click();
      setVal('fish-edit-skill', '99');
      byId('fish-edit-save').click();
    }
  }, 6400);

  // Gathering - a session is already running by this point, so this
  // exercises the ""join the existing session"" branch.
  setTimeout(function() {
    document.querySelector('.tab[data-tab=""gathering""]').click();
    byId('gather-start-btn').click();
  }, 6900);

  setTimeout(function() {
    byId('gather-zone-modal-toggle').click();
    var firstZoneModalOption = document.querySelector('#gather-zone-modal-grid input[type=radio]');
    if (firstZoneModalOption) firstZoneModalOption.click();
    byId('gather-zone-modal-go').click();
  }, 7100);

  setTimeout(function() {
    byId('gather-tradeskill-mining').click();
  }, 7300);

  setTimeout(function() {
    setVal('gather-skill-modal-input', '5');
    byId('gather-skill-modal-go').click();
  }, 7500);

  // Two units in one go, exercising the multi-pick-with-quantity material
  // modal: a custom node, then a custom material clicked twice plus a
  // second custom material clicked once, confirmed with a single ""Log it"".
  setTimeout(function() {
    byId('gather-skill-plus').click();
    setVal('gather-new-node', 'Autotest Node');
    byId('gather-add-node-btn').click();
    var nodeBtn = document.querySelector('#gather-node-grid [data-node=""Autotest Node""]');
    if (nodeBtn) nodeBtn.click();
    setTimeout(function() {
      setVal('gather-material-new', 'Autotest Material');
      byId('gather-material-add-btn').click();
      var m1 = document.querySelector('#gather-material-grid [data-material=""Autotest Material""]');
      if (m1) m1.click();
      setVal('gather-material-new', 'Second Material');
      byId('gather-material-add-btn').click();
      byId('gather-material-log').click();
    }, 200);
  }, 7900);

  setTimeout(function() { byId('btn-session-action').click(); }, 8500); // session is running by now, so this ends it
})();";
        coreWebView2.ExecuteScriptAsync(script);

        // Simulate two real keypresses on the SAME configured key: the
        // first is consumed by capture (sets the key), the second should
        // be counted once fishing has actually started (counting only
        // begins after the skill modal is confirmed). Entirely
        // self-contained - never touches the game.
        var keyTimer1 = new Timer { Interval = 2500 };
        keyTimer1.Tick += (s, e) =>
        {
            keyTimer1.Stop();
            try { SendKeys.Send("{F15}"); }
            catch (Exception ex) { DebugLog.Write("keyTimer1", ex.ToString()); }
        };
        keyTimer1.Start();

        var keyTimer2 = new Timer { Interval = 4200 };
        keyTimer2.Tick += (s, e) =>
        {
            keyTimer2.Stop();
            try { SendKeys.Send("{F15}"); }
            catch (Exception ex) { DebugLog.Write("keyTimer2", ex.ToString()); }
        };
        keyTimer2.Start();
    }
}
