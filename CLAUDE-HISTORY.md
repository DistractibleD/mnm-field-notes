# CLAUDE-HISTORY.md

Narrative history of design decisions and superseded attempts for this project. Current
rules live in `CLAUDE.md` — this file is background/"why," not something a session needs
to read every time.

## Harvesting/Fishing keypress counter, and a real PowerShell closure bug (2026-08-24)

Built the Harvesting tab (roster + detail, same pattern as Combat) plus a passive keypress
counter for Fishing specifically: fishing in-game is one repeated keypress-and-wait, so
letting the app count real keypresses (never simulate them) gives much better attempt-count
data than manual clicking. Confirmed EULA-safe the same way manual entry is - it observes
the user's own physical input, never reads anything the game generates/stores.

**Mechanism**: `SetWindowsHookEx(WH_KEYBOARD_LL, ...)`, always `CallNextHookEx` so the game
never loses a keystroke. Verified in isolation first (`lib/keyhook-spike.ps1`,
`keyhook-spike2.ps1`) before integrating - a real simulated keypress (`SendKeys`, entirely
self-contained, never reaching the game) confirmed the callback fires and reads the correct
vkCode.

**The hook callback itself must do nothing but flip a flag / bump a counter.** An early
version called `Send-ToUI` (WebView2 IPC) directly from inside the hook callback and crashed
with real ".NET Framework - unhandled exception" dialogs on the user's screen (twice, during
live testing) - "You cannot call a method on a null-valued expression," coming from deep
inside a reentrant call stack (hook callback → Send-ToUI → WebView2 → JS → another message
back into PowerShell, several scriptblocks nested on one call stack across native callback
boundaries). Fixed by making the hook callback trivial (just `$script:KeyHookCapturedPending`/
`$script:KeyHookCountPending`) and adding a separate, fast-polling (50ms) `System.Windows.
Forms.Timer` on the normal message loop to do the actual `Send-ToUI` work - never inside the
hook's own call stack. This is also just correct hook hygiene independent of the crash:
Windows can silently uninstall a low-level hook whose callback is slow, so keeping it trivial
matters regardless.

**Real bug, not a red herring: `$timer.Add_Tick({ $timer.Stop(); ... })` doesn't reliably
resolve `$timer` when the Timer itself was created inside another event handler's own
scriptblock** (e.g. inside `Add_Shown`, or inside a deeply nested `WebMessageReceived` case) -
`$timer` inside its own Tick closure would evaluate to `$null`, so `.Stop()` threw the exact
"cannot call a method on a null-valued expression" error, over and over, every tick, forever
(since the throwing call was `.Stop()` itself, the timer never actually stopped). This is
what caused the *second* round of crashes, after the first (reentrancy) fix already worked -
confirmed by reproducing it in total isolation (`lib/keyhook-spike3.ps1`, an invisible
off-screen test window, zero WebView2/COM involved at all) and then fixing it by giving every
such Timer `$script:` scope instead of a plain local variable. **Any future WinForms Timer
(or similar `$x.Add_Event({ ... $x ... })` self-referencing pattern) created inside a nested
event-handler scriptblock in this codebase must use `$script:` scope** - a Timer created at
true top-level script scope (one level of nesting only, e.g. `$script:KeyHookPollTimer`) does
not have this problem, only ones nested two or more scriptblocks deep.

**Also fixed as part of the same investigation**: `renderNodeDetail()` (the whole Harvesting
detail panel) was being fully re-rendered on every single counted keypress, silently wiping
whatever the user had typed into Zone/Skill/Item mid-session - a real UX bug a live fishing
session would have hit constantly, not just a test artifact. Fixed by isolating the counter
widget into its own `#h-counter-box` and giving it a dedicated `updateCounterBox()` that only
ever touches that one element - `renderNodeDetail()` stays reserved for switching/adding a
node or after a batch is logged, where a full reset is actually correct.

**Also added, unrelated to the above but discovered while fixing it**: a global
`Application.ThreadException` handler (`SetUnhandledExceptionMode` must be called before any
Controls are created, or WinForms throws) so a future bug fails safely - logged to
`Data\error.log` and one plain message box - rather than ever showing the raw, alarming
".NET Framework" dialog to a non-technical user again. Skipped entirely when
`SV_AUTOTEST=1`, so it doesn't block headless test runs on a modal dialog.

## Original design: reading the game's own Ledger log files (superseded 2026-08-24)

The app originally worked by reading `Monsters and Memories`' own per-character Ledger log
files (`%USERPROFILE%\AppData\LocalLow\Niche Worlds Cult\Monsters and Memories\beta1\
<Character>\Ledger\*.json`) and displaying a live loot tally. Built as PowerShell 5.1 +
WinForms (`LootTracker.ps1`), strictly read-only toward every game file, no process memory
access, no injection, no network — the "Hard security rules" in the current `CLAUDE.md`
trace back to this original design.

**Ledger schema, for reference** (not currently used by anything — the app no longer reads
these files, but this is accurate if a future feature ever revisits it): one
`_Character_<date>.json` and one `_Social_<date>.json` file per character per day, each
holding a flat `c01` array of event objects (`{f01: act type, f03: JSON-string payload,
f04: timestamp, f05: zone, f07: acting character, ...}`). `act_13` = a loot event; payload
(`f03`, parse twice) has `d01` = quantity, `d02` = monster/NPC name, `d04` =
`"<id>|ItemName"`, `d05` = the item's stable 24-hex-char template GUID (same identifier
space as the game's own chat item-link code — every item name maps to exactly one such
GUID across 1,300+ sampled events). Several string fields (`d02`, `f05`, `name_`/`zone_`-
prefixed values) are base64-encoded, sometimes with a literal `<word>_` prefix. Confirmed
**not** available in any file the game writes, checked exhaustively: monster coin drops,
monster level, character world position. `act_14` events exist but only tag
`npc_corpse`/`party_split`, never fire on live encounters.

### Naming genericization (2026-08-24, superseded by the redesign below)

Window title, dialog titles, script filename, and launcher were renamed from "MnM Loot
Tracker"/`LootTracker.ps1`/`Launch Loot Tracker.vbs` to generic "Session Viewer"/
`SessionViewer.ps1`/`Start.vbs`. Reasoning at the time: the user confirmed the game runs no
kernel-level anti-cheat, which ruled out the one channel that could see past the app's
read-only design regardless of naming; the residual (much weaker) surface was ordinary
user-mode window-title/command-line enumeration, which the generic naming closed off as
cheap defense-in-depth against a possibility, not a known threat.

**This reasoning is now moot for the current design** (see below) since the current app
never reads any game file at all — there's nothing left to detect. The generic names were
kept anyway as a mild personal-privacy preference, not because they're load-bearing for
account safety anymore.

### The EULA discovery that ended this design (2026-08-24)

The user's actual worry was "losing my game account because the devs think I am
datamining or breaking the ToS" — a different, more fundamental question than technical
detectability. Researching Monsters & Memories' actual Master User Agreement
(`account2.monstersandmemories.com/policy/mau`) found a real conflict:

> **Section 1.C.6 (Data Mining):** "Use any unauthorized process or software that
> intercepts, collects, reads, or 'mines' information generated or stored by the Platform;
> provided, however, that NWC may, at its sole and absolute discretion, allow the use of
> certain third-party user interfaces."
>
> **Section 3 (Consent to Monitor):** the Platform "may monitor your computer... memory for
> unauthorized third party programs running either concurrently with the game or out of
> process" — defined as anything prohibited by Section 1.C.
>
> **Section 9.B.2 (Termination):** NWC can terminate "at any time for any reason, or for no
> reason, with or without notice."

Reading the Ledger files fit the literal text of 1.C.6 regardless of how safely the app was
built — read-only/offline/non-injecting made it *safe and inert*, not *permitted*. No
official public statement was found either way (the FAQ doesn't address third-party tools).
One data point, not proof of anything: a public GitHub project
([MNM-Combat-ParserARCH](https://github.com/shirunei/MNM-Combat-ParserARCH)) does far more
invasive live packet-based combat/loot parsing and exists publicly — weak evidence this
category of tool is tolerated in practice, not evidence it's sanctioned.

Project was paused pending a decision. The user chose the cleanest option: redesign around
manual entry so the conflict doesn't exist in the first place, rather than asking NWC for
an exception or accepting the risk.

## Current design: manual-entry data-collection companion (2026-08-24 onward)

Complete rebuild, not an iteration on the Ledger-reading version. The app never reads
anything the game writes — every field is typed by the user after observing it on screen,
same as jotting notes in a notebook. This sidesteps 1.C.6 entirely: the clause only
prohibits software that reads information "generated or stored by the Platform," and this
app touches none of that. Network calls (to the sibling wiki repo's data, not to NWC's
service) are also fine under the same reasoning — 1.C's prohibitions are scoped to "the
Platform."

Scope, per the user's own brainstorm: "my data collecting dream-tool," covering (a) fast
live logging during play across Combat/Harvesting/Crafting/Multi session types, tracking
several different monsters/nodes/recipes within one session via a roster-and-active-detail
pattern (mirrors the wiki's own `conObservations` model — same species, multiple kill
instances, different levels/cons each time), (b) live session stats, (c) a search/lookup
tool over the wiki's already-gathered data, (d) a persistent all-time local log distinct
from the curated per-session export handed to Claude for wiki updates.

### Architecture decision (2026-08-24)

Considered three options for the UI layer once "must stay readable as a plain script" was
confirmed not to be a real constraint (the user will only ever interact with this app
through Claude, never open the source themselves):

1. PowerShell + WinForms — zero install, but master-detail layouts and search-as-you-type
   are much more work to build well than in HTML/CSS.
2. PowerShell + a local HTTP server + the user's own browser tab — full web UI, zero
   install, but presents as an ordinary browser tab.
3. PowerShell + WinForms hosting a WebView2 control — full web UI in a dedicated native
   window, no browser chrome.

User chose **option 3**. Verified feasible same day: WebView2 Runtime was already present
on this machine (v151.0.4129.101, ships with Edge on Windows 11) — no dependency on the
user installing anything there. The WebView2 *control* assemblies (`Microsoft.Web.
WebView2.Core.dll`, `Microsoft.Web.WebView2.WinForms.dll`, `WebView2Loader.dll`) were
pulled directly from NuGet's flat-container API (`api.nuget.org/v3-flatcontainer/
microsoft.web.webview2/...`) — a raw package download, no NuGet client/SDK/Node needed —
and a minimal smoke test (`lib/webview2-smoketest.ps1`) confirmed a WinForms form hosting a
WebView2 control, navigating to inline HTML, works end to end on this machine. Pattern that
worked: set `CoreWebView2CreationProperties.UserDataFolder` on the control *before* first
use, then call `EnsureCoreWebView2Async($null)` — simpler and more reliable than manually
orchestrating `CoreWebView2Environment.CreateAsync` via `.ContinueWith()`, which hung
indefinitely in an earlier attempt (never diagnosed further once the simpler pattern
worked).

`lib/webview2/*.dll` are gitignored (fetched redistributable binaries, not source) — if
ever missing, re-fetch via the NuGet flat-container URL above (version `1.0.4129.50` was
used, but any recent 1.0.x should work) rather than treating their absence as broken state.

### Field design

Session types map directly onto existing wiki schema, so a session's export needs no
translation step:

- **Combat** → monster name, zone, con color + player level (`conObservations`), coin
  drop, items looted, faction changes, named y/n.
- **Harvesting** → tradeskill, node name, zone, player skill, success/fail, result item.
- **Crafting** → tradeskill, recipe name, player skill, difficulty color, components used.
- **Multi** → freely mixes all three in one roster.

A UI mockup (roster + active-detail panel, live stats bar, item chips flagging "not yet in
the wiki," and a working Lookup-tab search demo) was built and approved before any real
implementation started — see the artifact published 2026-08-24 for the approved layout
if the working app's UI ever needs to be checked against what was agreed.
