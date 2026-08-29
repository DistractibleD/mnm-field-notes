# CLAUDE.md

Rules below = non-negotiable. History/postmortems → `CLAUDE-HISTORY.md` (on-demand, not
autoloaded). This file = current rules/architecture only. Written compact for Claude's own
parsing, not prose for human reading — user won't read/edit this file.

## What this is

Personal 2nd-monitor manual-entry companion for *Monsters and Memories* ("MnM Field Notes").
User types everything after observing on screen — app never reads game files/process/memory,
never interacts with the game. = notebook, not a reader. Two jobs: (1) fast live logging
(Combat/Gathering/Crafting/Fishing/Cooking), (2) searchable lookup over sibling wiki data.
Session data → plain-text export → user hands to Claude to update the wiki.

Exists because the prior design (reading the game's own Ledger log files) violated the
game's EULA. See CLAUDE-HISTORY "EULA discovery." Door closed, not deprioritized.

## Hard rules

1. **Zero interaction with the game, ever.** No reading game files/install/save dirs/config,
   no process memory access, no injection/hooking. This is the whole basis for the app's
   EULA-safety — even read-only reopens the conflict. Stop and say so if a request would
   need this rather than finding a narrower workaround. Never soften this rule regardless of
   how anything else in this file evolves — tampering risks a real account ban.
2. **Writes stay inside the project folder only** (see File layout).
3. **Outbound network writes only via the wiki's own reviewed submission Worker.** The only
   data this app ever sends anywhere is a session export POSTed to the wiki's existing
   Cloudflare Worker (see "Session export submission"), which commits to a NEW branch and
   opens a PR — never `main`, never auto-merged, a human always decides. No other outbound
   write path exists or should be added without the same explicit confirm-first treatment
   this one got (checked the Worker's actual mechanism, confirmed reuse vs. new
   infrastructure, confirmed the hard-rule update itself — all with the user, all before any
   code existed).

## Naming

"MnM Field Notes" — renamed from generic "Session Viewer"/`SessionViewer.ps1`. Old
genericness = hiding from NWC devs specifically; moot now (user told NWC they can see the
code). Current: window title (`$form.Text`), script file `MnMFieldNotes.ps1`, `<title>`/`<h1>`
in `index.html`. Keep new UI naming consistent with this, don't revert to generic. `Start.vbs`
keeps its own name (functional label, never part of the old generic-from-devs surface).

## Visual style

`ui/style.css` `:root` palette/fonts (Sora headings, Inter body) copied from the wiki's own
`style.css` `:root` — same var names, same hex values. `--accent-craft` (wiki's teal) =
"different session type" marker, used for Gathering/Fishing/Crafting/Cooking active-tab state
instead of gold. If the wiki's palette/fonts change, pull from there, don't invent new ones.

Responsive — originally tuned for a portrait 2nd monitor (1080×1920) but works fine in
landscape too, which is now the actual default (see "Window orientation toggle"). `.layout`
stacks <900px width. `.stats`/`.field-grid` use `repeat(auto-fit,minmax(...))`. Window size
is resizable either way and depends on orientation — 1500×900 landscape (default) or
900×1500 portrait, see `MainForm.cs`.

## Architecture

Compiled C# (`src/*.cs`) + WinForms hosting a WebView2 control (no browser chrome),
HTML/CSS/JS UI — built to `MnMFieldNotes.exe` via `src/build.ps1`, which invokes `csc.exe`
(`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`, the .NET Framework compiler
already on every Windows install — same one PS's own `Add-Type -TypeDefinition` always used)
directly: no MSBuild, no `.csproj`, no NuGet client, no SDK install. `/target:winexe`
(no console) `/platform:x64` (required — `lib\webview2\WebView2Loader.dll` is a native x64
PE) `/win32icon:app.ico` (embeds the icon in the exe's own PE resources — this is what
actually fixed taskbar pinning, see "Taskbar-pinnable icon" below). End users need nothing
beyond what every Windows 10/11 machine already has (.NET Framework + WebView2 Runtime,
both core OS components) — the `csc.exe` requirement is a *build-time* concern only,
irrelevant to anyone just running the released zip.

- exe owns ALL file I/O + networking (wiki fetch, all-time log, session export).
  WebView2 page = UI only, round-trips via `WebMessageReceived`/`PostWebMessageAsJson`.
- `lib/webview2/*.dll` — gitignored redistributables. Re-fetch from NuGet's flat-container
  API if missing (URL pattern + init sequence: CLAUDE-HISTORY).
- Migrated 2026-08-28 from a PS 5.1 + `Add-Type` host (`legacy/MnMFieldNotes.ps1`) — see
  CLAUDE-HISTORY for why. Kept only as an unmaintained fallback, not shipped in releases.

### Gotcha: JIT resolves a method's types before running any of its statements

Registering `AppDomain.AssemblyResolve` (needed so `lib/webview2`'s managed DLLs get found —
a compiled exe doesn't auto-probe that folder the way `Add-Type -Path` did) and touching a
WebView2 type in the SAME method silently fails to load, even with the registration written
first — the JIT resolves every type a method body references before executing any of that
method's statements, so "textually first" doesn't mean "in effect first." Fix: `Main()` has
ZERO WebView2 type references (just registers the resolver + calls `LaunchApp()`);
`LaunchApp()` (marked `[MethodImpl(MethodImplOptions.NoInlining)]`, so the optimizer can't
merge it back into `Main()`) is where all WebView2-touching code actually lives.
`CoreWebView2Environment.SetLoaderDllFolderPath` handles the separate native
`WebView2Loader.dll` (native DLL loading doesn't go through `AssemblyResolve` at all).

### Gotcha: `Assembly.LoadFrom` refuses a file carrying the "Mark of the Web" (2026-08-28)

Windows stamps a `Zone.Identifier` alternate data stream on any file downloaded via a
browser — the whole released zip included, so every DLL inside it, including
`lib\webview2\*.dll`, carries this tag after a real recipient downloads and extracts it.
.NET Framework's legacy CAS (Code Access Security) policy refuses to `Assembly.LoadFrom` a
zone-tagged file, throwing `FileLoadException`/`NotSupportedException` (HRESULT
`0x80131515`) even though the file itself is completely intact — this is exactly what
`ResolveWebView2Assembly` in `Program.cs` used before this fix. **Never hit in dev/testing
here**, because a locally-built exe's own sibling DLLs were never themselves downloaded, so
never carried the tag — this shipped broken in every release through v0.8 and was only
caught when a real recipient's own `crash.txt` (the app's own startup crash-reporting,
working exactly as designed) showed the exact error. Fixed by reading the DLL's bytes into
memory and calling `Assembly.Load(byte[])` instead of `Assembly.LoadFrom(path)` — loading
from a byte array never touches the file's originating zone, bypassing the CAS check
entirely; this is the standard, well-documented workaround for this specific .NET Framework
gotcha. **Verified two ways**: a focused throwaway test reproduced the exact same HRESULT
against a DLL manually tagged with `Set-Content path:Zone.Identifier` (matching a real
browser download's tag) using the old code, and confirmed the new code loads the same
tagged file cleanly. **Lesson for future local-DLL-loading code in this codebase**: any
`Assembly.LoadFrom`/`LoadFile` call on a file that ships inside the release zip needs this
same treatment — a locally-built dev copy can never catch this class of bug, since MOTW is
applied at download time, not build time. If a similar load is added later, default to
`Assembly.Load(File.ReadAllBytes(path))` from the start rather than waiting for a
real-world crash report to reveal it again.

### Gotcha: `JavaScriptSerializer.DeserializeObject` returns `object[]`, not `ArrayList`, for JSON arrays

Checking only `ArrayList` (the commonly-documented return type) silently produced empty
lists — monsters/zones/items all `Count=0` — with **no exception anywhere**, for every
nested array value too (a monster's `drops`/`areas`, `Profiles.json`'s `"profiles"` array,
not just top-level responses). Fixed with one centralized `JsonUtil.AsObjectList(value)`
checking `ArrayList`/`object[]`/`List<object>` in order — use it everywhere a JSON array is
read, never an ad-hoc `as ArrayList` cast.

### Gotcha: `MultipartFormDataContent` doesn't quote the `name` param

`.Add(content, name)` produces `Content-Disposition: form-data; name=sessionExport`
(unquoted) instead of the RFC 7578-standard `name="sessionExport"` — Cloudflare Workers'
`request.formData()` throws on the unquoted form, surfaced as a generic
`"Invalid submission — please try again."` that looks like a deliberate rejection but is
actually just a parse failure. Fixed in `SessionExportSubmit.cs`'s `MakeQuotedPart` by
manually building `ContentDispositionHeaderValue` with `Name = "\"" + name + "\""`. **Lesson
that cost real debugging time**: an earlier "verification" during the migration had hit this
same bug on an oversized payload and misread it as the size-safety check working — never
trust a generic error as proof a specific check fired; verify you're hitting the SPECIFIC
message that code path actually produces.

### Gotcha: native hook callbacks must be minimal

`SetWindowsHookEx` callback = flag/counter only, nothing else, still true in C#. NEVER call
`UiBridge.Send`/`.Stop()`/anything that re-enters WinForms/COM from inside the native
callback (`KeyHookController.HookCallback`) — use a separate `Timer` (`PollTick`, on the
normal UI thread) to actually react. Why: (1) caused 2 real crashes in the PS1 era
(CLAUDE-HISTORY "Harvesting/Fishing keypress counter"), (2) Windows silently uninstalls slow
hooks. The delegate (`_delegate` in `KeyHook.cs`) must be a live instance field, not a local
— the GC can collect it while the native hook still holds a pointer to its thunk. This is a
P/Invoke fundamental, not PS-specific — carried over unchanged. (The PS1-era
`$script:`-scoped-Timer gotcha this callback rule used to be paired with was PowerShell-only
and doesn't apply in C#; retired to CLAUDE-HISTORY.)

### Profiles

Persisted (`Data\Profiles.json`, `Get-Profiles`/`Add-OrSetLastProfile`). First run (0
profiles) → `#profile-modal` auto-opens. Returning user → last-used pre-selected
(`#profile-select`). "+ Add new profile…" entry reuses the modal. Dropdown disabled during a
session (switch takes effect next session; `loggedBy` already locked server-side).
`sessionType`/export attribution = active profile name.

### Tooltips: `data-tip="..."`

Any element + `data-tip="text"` → themed hover/focus popup, no per-element wiring.
`setupTooltips()` in `app.js` delegates on `document` (mouseover/out, focusin/out via
`closest('[data-tip]')`) → survives `innerHTML` rebuilds. `checklistDropdownHTML` takes an
optional `config.tip` → puts it on the toggle button.

Used sparingly — skip where adjacent text already explains (e.g. Fishing's "Listen for key,"
which has its own paragraph). Current coverage: session-bar's start/end button, profile
dropdown, Combat's 2 faction dropdowns, Fishing's Area field.

### Checklist dropdown — standard "pick any number, searchably" pattern

`checklistDropdownHTML`/`setupChecklistDropdown` = app-wide answer for multi-pick lists.
Toggle button → 2-col checkbox panel + live search, auto-focused. **Use this for ANY future
multi-pick control**, not a plain `<select>`/hand-rolled list — explicit standing request
("running theme... find what we're looking for as fast as possible").

Filtering hides non-matching `.checklist-option` (`filtered-out` class), doesn't remove —
checked state lives on the `<input>` DOM nodes, removing would lose it. Verify: check while
filtered, clear search, check survives.

### "I am old" Win98 theme toggle (2026-08-27) — easter egg, not a real theme system

Small flag icon in the masthead's `version-row` (next to "Check for updates"), not a
labeled button — deliberately tucked in rather than prominent, per the user
("not too obvious but fairly easy to find"). Click toggles `data-theme="win98"` on
`<html>` (`setupThemeToggle()` in `app.js`), persisted via `localStorage` (WebView2's own
private store under `appassets.local`, no host round trip). `style.css` redefines the same
CSS custom properties the rest of the app already uses under `:root[data-theme="win98"]`,
plus flattens radius/shadows and adds beveled 3D borders on the main surfaces — doesn't
chase down every hardcoded-hex element (tier/badge colors etc.), this is a joke button, not
a full port. One real bug hit building this: a code comment containing the literal substring
`*/` (mid-word, e.g. "tier-*/badge") silently closes a CSS comment early — everything after
it parses as garbage until the next recoverable boundary, which silently ate the actual
`:root[data-theme="win98"] { ... }` variable-definition rule (visible via
`document.styleSheets[n].cssRules` inspection: the rule was just missing, no console error).
**Never put `*/` inside a CSS comment's text, even mid-word.** Wiki may get its own matching
version later, built separately there — this project never touches that repo either way.

### Landing info — every tab usable without a session (2026-08-27)

Explicit standing goal, the user's own words: "i want every tab to display valuable
information even if there is no session running - This will inspire users to open the app
even if they don't want to start a session." Combat/Fishing/Gathering each have a
zone-scoped "browse" area that works with zero session/profile/anything else required —
picking a zone is the only input. Empty-zone state is always the same one-liner:
`<p class="landing-info-empty">Select a zone to see more.</p>` (or a zone+tradeskill variant
for Gathering) — keep this wording consistent if more tabs get a landing section.

- **Fishing**: the pre-start screen's zone picker (`fish-landing-zone`) writes straight into
  `fishingSession.zone` — the SAME field the active screen and start-flow modals already
  read/pre-fill from, so picking a zone while browsing carries into the real session with no
  extra plumbing. Below it, `renderFishRarityPanel()` — already built for the active
  screen — is called as-is; it doesn't care whether a session exists, just needs the zone.
- **Gathering**: `gather-landing-zone` writes to `gatheringSession.zone`, same carry-over
  as Fishing. Tradeskill is a 3-button row (`data-landing-tradeskill`, styled via
  `.mini-btn.active`) but writes to its OWN `gatherLandingTradeskills` array, NOT
  `gatheringSession.tradeskill` — deliberately separate, and **multi-select** (click again to
  untoggle, any number can be on at once, e.g. Lumberjacking + Herbalism together) since
  browsing isn't a session and a real session is always exactly one tradeskill, so there's no
  sensible single value to carry into the start-flow's own single-select tradeskill modal
  anyway (that modal stays un-prefilled). Below: `renderGatherLandingInfo()`, a DELIBERATELY
  separate, simpler function from `renderGatherNodeGrid()` — read-only (no click-to-log
  handlers, nothing to log against yet), no difficulty-tier color (skill isn't known
  pre-session, so guessing would just paint everything the hardest color, actively
  misleading, not just unavailable), and each node tagged with its own tradeskill via
  `data-tip` since several can show at once now.
- **Combat**: has no pre-start screen at all (roster's always live regardless of session
  state), so this is new UI, not a repurposed existing one — `combat-landing-zone` is its own
  state (`combatLandingZone`, unrelated to the per-kill zone field in the roster detail form).
  Shows "N named monsters known here" (`wikiData.monsters` filtered `named && locations`
  matches) collapsed by default, expands to a compact list with `data-tip` showing wiki
  `areas`/`drops` per monster — same tooltip pattern used everywhere else, not a new one.
  `Get-WikiData` forwards `named`/`locations` (was `maps`)/`areas`/`drops` per monster now —
  used to only send `name`. **No monster in the wiki has a numeric `level` field (checked:
  0/660)** — Combat already logs `playerLevel`+`con` per kill (this app's own data, not the
  wiki's), which feeds an empirical level-range guess the same way Fishing's rarity bars work
  (2026-08-27, `Get-CombatZoneLevelRange` in `MnMFieldNotes.ps1`, sent as `combatLevelRange`
  alongside `fishRarity` at `ready`) — `MIN_LEVEL_RANGE_KILLS = 5` gates it per zone, same
  reasoning as Fishing's `MIN_RARITY_ATTEMPTS`. Entries with no `playerLevel` (the field is
  optional per-kill) are skipped rather than counted as 0, which would silently drag every
  zone's minimum down.
  - **Regular (non-named) monsters** (2026-08-27, `renderCombatRegularInfo()`) — same
    collapsible/searchable/wiki-linked pattern as the named-monster list below, just
    `named: false` and the wiki's parallel `#monsters-regular/<zone>` hash instead of
    `#monsters-named/<zone>` (confirmed against the wiki's real routing, not assumed).
  - **Search + wiki link** (2026-08-27, expanded state only, keeps the collapsed toggle
    compact): search filters the already-rendered `.fish-pick-btn` items by toggling the
    SAME `.filtered-out` class the checklist dropdown uses (generalized from
    `.checklist-option.filtered-out` to a bare `.filtered-out` rule so both can share it) —
    NOT a full re-render on every keystroke, which would steal focus out of the search box
    after each character (same reasoning as the checklist dropdown's own filtering).
    "View on wiki ↗" opens `wikiData.pageUrl + '#monsters-named/' + encodeURIComponent(zone)`
    via the existing `openUrl` round trip — deep-links straight to that zone's named-monster
    list on the live wiki (confirmed against the wiki's own `goToMonster()` hash scheme in
    `script.js`; there's no single-monster URL, the wiki itself only deep-links to a
    zone-scoped list + a JS-only highlight). `Get-WikiData`/`wikiData` message now carry
    `pageUrl` (`= $WikiBaseUrl`) so the client has this without a second hardcoded copy of
    the wiki's base URL.
- **Gotcha, hit once already**: `renderFishingPanel()`/`renderGatheringPanel()`'s landing
  branches build their zone picker's options from `wikiData.zones` inline, at whatever point
  they're called — including the very first render, in Init, which happens BEFORE the
  `wikiData` message has arrived (`wikiData.zones` is still `[]` then). The `wikiData`
  message handler has to fully re-render the whole panel (not just call the narrower
  rarity/info sub-functions) when no session is active, or the zone picker stays stuck empty
  until something else happens to trigger a full re-render. Combat's own landing zone picker
  never had this bug — `renderCombatLandingInfo()` was written to always rebuild the picker's
  HTML from `wikiData.zones` fresh on every call, not just render it once as part of a bigger
  template.
- Leave `fishZoneCtrl`/`gatherZoneCtrl` reset to `null` at the top of each render function's
  landing branch — they're set by the ACTIVE screen's own zone dropdown, and left stale
  they'd make `renderFishRarityPanel()`'s "`fishZoneCtrl` ? ... : `fishingSession.zone`"
  fallback read a detached DOM node's frozen `.checked` state instead of the landing picker's
  real live selection.
- **"This session" UI only shows once a session exists** (2026-08-27, explicit follow-up
  ask): all-zero stats before anything's logged is noise competing with the landing info
  for space. `updateStatsBarVisibility()` gates all 4 stats bars on `session.id` (not just
  which tab is active, the pre-existing check) — called from the tab-click handler AND
  `sessionStarted`/`sessionEnded` (switching tabs isn't the only way this needs to update).
  Combat has the same problem in a different shape — no active/inactive split of its own, so
  `updateCombatSessionVisibility()` toggles `#combat-session-layout` (the roster+detail,
  `display:none` until `session.id`) against a plain `#combat-no-session-msg` placeholder,
  called from the same 3 places. Fishing/Gathering didn't need equivalent new code — their
  existing pre-start/active split already only renders roster/log-type elements once
  `fishingSession.active`/`gatheringSession.active`, which was already gated on a session
  existing.

**Deliberately out of scope for this pass** (see `To-Do/planned-features.md` for the fuller
version): a whole "add info" contribution tab (dropdown-driven named-monster/camp/item
authoring, camp+named sharing one form), zone-level min/max/avg level tracking. Both are
real, separate features the user wants, not forgotten — they need their own design pass, not
a bolt-on to this one.

### Starting a session — one button, state-dependent (2026-08-27)

`#btn-session-action` (`btnSession` in app.js) is the ONLY session start/end control — used to
be two separate buttons (`btnStart`/`btnEnd`), collapsed into one because the plain "Start
session" button could bypass Fishing/Gathering's own prompt flow entirely: clicking it while
on either tab started a session with no zone/skill/tradeskill ever collected, leaving that
tab's own active-screen state out of sync with a session that technically existed underneath.
Label/tooltip/click-behavior all just follow `session.id` (`setSessionButtonState(running)`
sets both label+tooltip together, called from the `sessionStarted`/`sessionEnded` handlers
and once at init):

- **No session running** → "Start new session". Click checks `profileState.active` first
  (toasts + bails if missing, same message `startNewSession()` itself would show — checked
  here too so a tab with its own prompt flow doesn't walk the user through 3 modals only to
  fail on the last one, and so this button doesn't sit disabled forever with nothing left to
  re-enable it, since the entry-point functions below don't report back whether they ever
  reach that call). Then reads `.tab.active` FRESH at click time (not cached — same reasoning
  as the export-label bug below) and looks it up in `TAB_START_ENTRY` = `{fishing:
  openFishSkillModal, gathering: openGatherZoneModal}` — tabs with their own prompt flow hand
  off to that flow's entry point instead of starting a plain session immediately, same
  pattern those tabs' own pre-start screens already use. Tabs without an entry yet
  (Combat/Crafting/Cooking/Multi) fall through to `startNewSession()` directly, unchanged
  from before. **Extend `TAB_START_ENTRY` as more tabs get their own prompt flow** — the plan
  is for every tab to eventually work this way, per the user.
- **Session running** → "End session & export". Unchanged from the old `btnEnd` handler
  (flush pending fish attempts, report skill-at-end for Fishing/Gathering, `endSession`).

### Session types and fields

Combat/Crafting = roster + active-detail pattern (sidebar of things encountered this session;
click → active; quick-entry fields apply to it). Multi = mixes them in one roster. Mirrors
the wiki's `conObservations` model (same species, multiple kills, each own con/level).
Gathering/Fishing are NOT this pattern — see their own sections below.

- **Combat**: monster, zone, con+level, coin (total off corpse), items, named y/n,
  `factionChanges` (2 checklist dropdowns pos/neg, from `monsters.json` `factionEffects`,
  60+ entries). Logged as `[{faction,effect}]` — same shape as the wiki's own. Session-level
  zone/level/camp collected via its own start-flow, con is a button grid, items are added via
  a tap-grid modal, roster entries are renameable — see "Combat: start-flow, con grid, level
  counter, loot picker, roster edit" for the full mechanism.
- **Crafting**: tradeskill, recipe, skill, difficultyColor, components. Still a stub
  (`#panel-craft`) for everything except Cooking (own tab, see below). When this gets built
  for real, `difficultyColor` should use the wiki's own real crafting-difficulty hex palette
  (confirmed directly with wiki-claude, 2026-08-29 — sampled there from real crafting-window
  screenshots, lives in that repo's own `CLAUDE.md`): Green/Trivial `#45FC00`, Light Blue
  `#00FCDF`, Dark Blue `#326EFF`, White `#FFFFFF`, Yellow `#FCE800`, Orange `#E35300`, Red
  `#FF1C1C`. This is a DIFFERENT 7-tier system from Combat's con colors below — crafting
  merges Trivial+Green into one color and has an Orange that con doesn't use, so don't reuse
  Combat's `CON_CLASS`/`.con-*` CSS classes for this, build Crafting's own difficulty-badge
  classes off this palette instead.

**Session-level export label** (`session.type` in `app.js`, export header/filename) derives
from the active tab at click time (`TAB_SESSION_TYPE` map — fishing/gathering kept as
distinct labels even though both log `sessionType:'harvesting'`; the label is display-only).
Past bug: the session-start button used to hardcode `session.type='combat'`, silently
overriding the tab. Now reads `.tab.active` at click time. If this breaks again, check BOTH
assignment sites (tab-click handler AND `startNewSession()`).

### Fishing — own tab, NOT the roster pattern

No discrete "node" concept + high-repetition use (cast/catch/repeat) → designed for minimum
taps. 2 states in `renderFishingPanel()`:

- **Pre-start**: "Listen for key" (`#fish-key-modal`, `startKeyCapture`) + explainer
  paragraph + "Start fishing!". Nothing else — deliberate, don't add fields without checking.
- **"Start fishing!"** → skill modal → zone modal → auto-starts session if none running
  (reuses `startNewSession()`). Zone optional. **Race note**: `startSession`'s reply is
  ASYNC — `startFishing()` deferred via `pendingFishingStart` flag until `sessionStarted`
  confirms `session.id`. Calling immediately reproducibly sent `sessionId:null` in testing.
- **Active**: single-select zone (`checklistDropdownHTML` `multi:false`/radio, not
  checkbox), attempts counter + skill counter (`#fish-counter-box`/`#fish-skill-box`,
  self-re-rendering only, never the full form). Skill = real `<input type=number>`. Fish-pick
  grid = one-tap buttons, click = instant log, no confirm step.
- **Area field** (optional, free-text `#fish-area` + datalist from session history) — no
  wiki data for sub-zone granularity exists. Read fresh from DOM at log time (zone-staleness
  lesson, CLAUDE-HISTORY). Exports as `Area: X` when present.
- **Fish-pick grid** sorts/highlights by zone+area relevance, flags junk. `Get-WikiData`
  forwards `locations`+`note` per node.
  - Junk = `/junk/i` match on `note` (no structured field exists). Will miss non-"junk"-worded
    notes — accepted tradeoff.
  - "Expected in zone" = wiki `locations` ∪ session catches in same zone+area. Session-catch
    half is area-scoped; wiki half is zone-only (no area data exists). Sorts to top under a
    label; junk styling is independent, applies wherever the item lands.
  - Per-button `×N` catch count (session), separate from "new" badge (not in wiki yet).
  - **Location matching is lenient, not exact** (2026-08-27, `locationMatchesZone()` in
    app.js, shared with Gathering's node grid): wiki `locations` entries aren't always the
    bare zone name — "Night Harbor (West Gate, North Gate)", "Shaded Dunes, on the way to
    Tel'Ekir" — so a straight `.includes(zone)` silently missed those. Matches on the zone
    name being a genuine prefix followed by a word boundary (space/comma/paren/dash), not
    just any substring. `extractLocationDetail()` pulls the sub-area part back out for the
    tooltip (below) rather than just discarding it now that the match doesn't need it exact.
  - **Tooltip** (`data-tip`, only when there's something to say): wiki `note` text (often a
    skill-threshold caveat, e.g. "First encountered at fishing skill 77") + the sub-area
    detail from whichever matched location pulled this fish into "expected".
- **No "No catch" button** (removed) — implied by the attempts counter rising without a
  catch. `flushPendingFishAttempts()` sends the remainder as `success:false` at session end.
  MUST fire before `endSession` (session no longer exists server-side after).
- **Own stats bar** (`#stats-fishing`): Catches/Unique fish/Attempts/Skill/New-for-wiki.
- **Skill recorded at session start** (`fishingStarted`, once, guarded by `startSkillSent`)
  **and end** (`fishingEnded`, same guard) — both fire before `endSession`. Catches
  skill-ups with no catch following.
- **Key-spam guard**: 3+ `keyCounted` messages within 5 seconds → `checkKeySpam()` pauses
  listening, toast + "Resume listening" banner. Entirely client-side — do NOT touch the
  native hook/poll timer for this (must stay minimal, see gotcha above).
- **Rarity bars** (2026-08-27, expanded by default — collapsible via a "Hide rarity estimate"
  toggle, `fishRarityPanelExpanded` starts `true` since this is exactly the kind of feature
  meant to be found, not hidden behind a toggle most users never click — see
  `#fish-rarity-panel`/`renderFishRarityPanel()`) — an EMPIRICAL guess from this app's own
  logged data, not the wiki's Common/Uncommon/Rare/Very Rare label (may switch to that
  instead later per the user — this was the first cut). `Get-FishRarity` in
  MnMFieldNotes.ps1 reads the WHOLE `AllTimeLog.jsonl` (all sessions, all time, not just the
  current one), sums `attempts` and counts catches per fish, grouped by `zone` — sent once
  as `fishRarity` on `ready`, alongside `wikiData`. Client combines that snapshot with the
  CURRENT session's own entries + not-yet-flushed `liveAttempts` in `computeZoneRarity()`
  (the snapshot predates anything caught this session, so this avoids double-counting
  without a host round trip per catch). Horizontal bars, not vertical — this app's layout is
  tuned for a narrow portrait 2nd monitor, side-by-side vertical bars run out of width fast.
  Bar width is normalized to the zone's own highest rate, not an absolute percentage scale.
  `MIN_RARITY_ATTEMPTS = 20` gates the whole zone (not per-fish) — below it, shows a
  "not enough data yet, logged N so far" message instead of bars, since a tiny sample makes
  every fish's ratio equally meaningless, not just a specific one's.
  - **Pooled across the guild** (2026-08-27, closes backlog #20/#21) — `Get-SharedFishRarity`
    in `MnMFieldNotes.ps1` fetches the wiki's own published `fishing-rarity.json` (built there
    by a GitHub Action, every time a session-export PR merges to `main` — see that repo's
    `CLAUDE.md` "Session exports & pooled Fishing rarity"), sent as `sharedFishRarity`
    alongside `fishRarity` at `ready`. Same shape as `Get-FishRarity` by design, so
    `computeZoneRarity()` just sums local + shared + this session's own live entries, no
    translation needed. The rarity caption calls out the pooled count when present ("pooled
    with N attempts from the guild's submitted sessions"), falling back to the original
    wording when a zone has no shared data yet. **Known accepted double-count**: a session
    this install both logged locally AND already had submitted/merged shows up in both the
    local and shared totals — there's no cheap way from here to know which of an install's
    own past sessions were ever submitted, and this is already framed as an estimate, not the
    wiki's own figure, so the imprecision is tolerated rather than solved.

### Gathering — own tab, node→material(s) two-tier pick (redesigned 2026-08-26)

Mining/Lumberjacking/Herbalism only — Foraging excluded (barely implemented in the wiki).
Follows Fishing's pre-start/active + modal-chain pattern, NOT roster+detail, but a node type
can yield several different materials per the wiki's `gathering-nodes.json` `results` (and
more than one of the same material per gather), so logging one catch is a 2-tap-plus-confirm
flow (node type, then each material tapped once per unit, then "Log it") instead of Fishing's
single tap. Deliberately did NOT port: attempts counter (only meaningful for measuring
rarity/dropchance off high-repetition casts, which gathering isn't), the native
key-listener/hook (a gathering node is a deliberate discrete interaction, not spammed), the
Area field (no wiki data supports sub-zone granularity for gathering the way it might for
fishing spots), junk detection (no wiki concept of "junk" for gathering materials).

- **Pre-start**: explainer + "Let's start gathering!" → 3-step modal chain, in this exact
  order — `#gather-zone-modal` → `#gather-tradeskill-modal` (Mining/Lumberjacking/Herbalism)
  → `#gather-skill-modal`. Skill is deliberately LAST, asked fresh every time right before
  the session starts — forgetting to set it and logging finds at skill 0 was a real problem
  that motivated this ordering; don't reorder without checking that reasoning still holds.
  Confirming the skill modal auto-starts the session if none running (reuses
  `startNewSession()`, same `pendingGatheringStart`-deferred-until-`sessionStarted`
  async-race pattern as Fishing's `pendingFishingStart` — don't call `startGathering()`
  synchronously after `startNewSession()`).
- **Active**: single-select zone dropdown (same `checklistDropdownHTML`/`multi:false`
  pattern as Fishing) + skill-only counter box (`renderGatherSkillCounterHTML`/
  `bindGatherSkillEvents`, no attempts counter) + node-type grid (`renderGatherNodeGrid`,
  same expected/new/×N-count sort+badge logic as Fishing's fish-pick grid, `+Add` for a
  custom node type).
- **Difficulty guess** (2026-08-26): each node button gets a background/text color from
  `gatherDifficultyTier(node, skill)` — an ESTIMATE, not measured data. The wiki's
  `gathering-nodes.json` gives only two points per node (`minSkill`/`trivialSkill`, ~28% of
  nodes have neither — those get no tier, no data in means no color guessed out); the range
  between is split into 7 even bands using the wiki's own `.badge-difficulty-*` hex pairs
  (`style.css` `.tier-green` through `.tier-red` — same colors the wiki uses for recipe
  trivial ranges, copied over so a node reads the same way it does there). Green = at/above
  `trivialSkill` (no more skill gain), Red = at/near `minSkill` (hardest, freshest skill
  gain) — opposite direction from Combat's Con scale, don't mix the two up. Re-renders live
  on every skill change (`bindGatherSkillEvents` calls `renderGatherNodeGrid()` on all three
  skill inputs) since the guess is skill-relative.
  - Freed up a channel to do this: "expected in this zone" isn't a per-button marker any
    more (went through text/border color, then a `box-shadow` ring — neither read clearly
    enough at a glance per user feedback), it's a bordered/tinted **group container**
    (`.fish-pick-expected-box`/`.fish-pick-expected-label` in style.css, `--accent-craft`
    border) that the expected buttons render INSIDE — see `renderGatherNodeGrid`. Individual
    buttons carry zero "expected" styling now, so there's no channel competition with the
    difficulty color at all. Shared CSS with Fishing's fish-pick grid, so this changed
    Fishing's "expected" styling too — deliberate, not a Gathering-only tweak.
  - `Get-WikiData` forwards `minSkill`/`trivialSkill` per node (added alongside `results`).
  - **Tooltip** (`data-tip`, one combined string, only when there's something to say):
    difficulty guess text + the wiki's own `note` if the node has one (2026-08-27) + the
    sub-area location detail (below) if that's what made this node "expected". The `note`
    turned out more load-bearing than expected here — a lot of them are caveats specifically
    about how sure `minSkill`/`trivialSkill` actually are (e.g. "Trivial skill is at least
    225, exact value unknown"), which should soften trust in the color above it.
  - **Location matching is lenient, not exact** — same `locationMatchesZone()`/
    `extractLocationDetail()` fix as Fishing's fish-pick grid above; wiki `locations` aren't
    always the bare zone name, and a straight `.includes(zone)` silently missed those.
- **Tapping a node type** opens `#gather-material-modal` (`openGatherMaterialModal`) — a
  second `.fish-pick-grid` scoped to that one node's materials: wiki `results` (flattened by
  `Get-WikiData`, which mixes plain strings and `{family,label}` objects — display label
  only) ∪ session-observed materials for that same node. NOT single-tap-and-close: each tap
  bumps a local `pendingMaterialCounts[material]` (shown as a `+N` badge, `.picked` CSS
  class) — nothing is actually logged until "Log it", which fires one `logEntry` per unit
  across every material tapped (2 Copper Ore + 1 Brittle Stone → 3 entries, all
  `success:true`). "Reset" zeroes the pending counts without closing the modal. No "No
  result" option (removed 2026-08-26 — not interesting for these node types). `+Add` a
  custom material once, then tap its new grid button for additional units of it.
- **Editable entries** (`openGatherEditModal`/`gather-edit-save`) — same generic
  `editEntry`/`Edit-AllTimeLogEntry` mechanism as Fishing, scoped to the still-running
  session. Editing the node type must also patch `target` (export grouping field, same
  zone-staleness-style lesson as Fishing's zone edit). The edit modal's Result field can
  still be blanked to mark a correction as no-result — that's a correction tool for an
  already-logged entry, unrelated to the material modal no longer offering it going forward.
- **Per-node "where can you find this" note** (2026-08-27, backlog #8) — purely local,
  never submitted/shared anywhere (unlike session exports). `Get-GatherNotes`/
  `Save-GatherNote` in `MnMFieldNotes.ps1` persist a small flat `Data\GatherNotes.json`
  keyed by node name, same pattern as `Profiles.json`. Surfaced in the material modal via a
  toggle collapsed by default — that modal opens on every single gather (a fast, repetitive
  action), so an always-visible note field would clutter the common case. Auto-saves on
  blur, no separate save button. The saved note gets appended to the node grid's existing
  combined tooltip (alongside the wiki note/difficulty guess/location detail), and
  `gatherNotesData` is updated optimistically the moment it's saved so the tooltip reflects
  an edit immediately, without waiting on a host round trip.
- **Skill recorded at session start** (`gatheringStarted`, guarded by `startSkillSent`) **and
  end** (`gatheringEnded`, same guard) — mirrors Fishing exactly, both fire before
  `endSession`.
- **Own stats bar** (`#stats-gathering`): Gathers logged/Unique node types/Successes/
  New-for-wiki. Successes will now track ≈1:1 with Gathers logged going forward (every
  material-modal entry is `success:true`) — kept anyway since a post-hoc edit can still
  produce `success:false`.
- Entries log `sessionType:'harvesting'` (unchanged bucket name, `Write-HarvestingBlock`
  groups by `target` = node type name, same as the old Harvesting tab it replaced) via
  `logGatherAttempt`. Session-level label = `'gathering'` (`TAB_SESSION_TYPE.gathering`) —
  independent of entry `sessionType`, same split as Fishing/Cooking.

### Cooking — own tab, roster+detail (like the old Harvesting tab, not Fishing)

Split from the Crafting stub because dishes carry stat/resist/haste buffs (`items.json` Food
entries already use this shape — verified against real data, not assumed). Roster+detail
(cooking attempt = discrete multi-field event, not high-repetition). Own state (`dishRoster`
Map, `ck-*`/`dish-*` DOM ids) — nothing shared with Fishing/Combat beyond generic helpers +
wiki data.

- `wikiData.recipes` — `Get-WikiData` fetches `crafting.json` too, `{name,tradeskill}`. Feeds
  the dish datalist + new-for-wiki flag.
- Stats/resists/haste live on the DISH (`dishRoster.get(name)={entries,stats:{},resists:{},
  haste:0}`), not per-attempt — same buff every cook. `STAT_NAMES`/`RESIST_NAMES` = exact
  keys from `items.json` (STR/DEX/AGI/STA/WIS/INT/CHA/HP/MANA; POISON/FIRE/COLD/CORRUPTION/
  DISEASE/MAGIC/ELECTRIC/HOLY). Haste = single scalar, not multi-select (matches gear).
- Checklist picks WHICH stat; a per-checked value `<input type=number>` captures HOW MUCH
  (`syncStatSelection()` syncs check state ↔ object keys; `renderStatValueInputs()` renders
  the inputs). Unchecking deletes the value (no undo elsewhere in this app either).
- Difficulty color = same vocab as Combat's Con dropdown (Trivial/Green/Light Blue/Dark
  Blue/White/Yellow/Red).
- Entries log `sessionType:'crafting'` (wiki bucket shared with future non-Cooking Crafting
  entries) via `Write-CraftingBlock`. Session-level label = `'cooking'`
  (`TAB_SESSION_TYPE.cooking`) — independent of entry `sessionType`, same split as Fishing.
- Own stats bar (`#stats-cooking`): Attempts/Unique dishes/Successes/New-for-wiki.

Lookup tab = read-only wiki search, independent of session logging.

### Data model — 3 stores, don't collapse

1. **All-time log** — append-only, ONE exception: still-running-session Fishing/Gathering/
   Combat entries are editable via a client-generated `id` (`genId()`) + `editEntry` →
   `AllTimeLog.EditEntry` rewrites that JSONL line in place. Scoped to the active session only
   (export already written once ended). Editing the grouping field (`zone` for Fishing,
   node-type `target` for Gathering) must also patch `target` (the export's grouping field)
   or the corrected entry stays under the old header — Combat has no such grouping field to
   worry about (kills aren't re-grouped by zone the way Harvesting/Fishing are). Combat's edit
   modal (2026-08-29, `openCombatEditModal` in `app.js`) is deliberately scoped to the
   "simple" fields only (zone/con/level/named/coin), matching Fishing/Gathering's own edit
   modals — items and faction changes aren't re-editable, log a corrected kill instead if
   those were wrong. Kill entries logged before this shipped (or from an in-progress session
   that started on an older build) have no `id` and simply show no Edit button, rather than
   erroring. Crafting still has no edit UI — mechanism is generic, just needs UI, same as
   Combat did until now.
2. **Per-session export** — 1 txt file/session, wiki-relevant fields only (no
   elapsed-time/click-count metrics).
3. **Live session state** — in-memory, becomes #1+#2 at session end.

## Guild data trust model

Guild exports = trusted by default, same as the user's own, no confirmation gate. Exception:
conflicts with existing data → flag for the user, don't silently pick a side (note the
conflict, suggest in-game retest). Every export records who logged it (plain text field) —
needed to identify conflicts later.

Also flag unnaturally-high Fishing click counts during review (soft judgment call, separate
from the app's own client-side spam guard) — no fixed threshold, judge against the stated
session duration.

## To-Do folder

`To-Do/planned-features.md` = future features, not current spec. Check before unscoped
"keep building." Named requests override the list. Each item still needs its own scoping
pass when picked up.

## File layout

- `src/*.cs` — the app itself, one file per concern (`Program.cs` entry point,
  `MainForm.cs` window/WebView2 setup, `WebMessageRouter.cs` the message-type switch,
  `WikiData.cs`/`Profiles.cs`/`SessionLog.cs`/`SessionExport.cs`/`SessionExportSubmit.cs`/
  `GatherNotes.cs` data + networking, `KeyHook.cs`+`Native/` the low-level hook,
  `JsonUtil.cs`/`UiBridge.cs`/`AppPaths.cs`/`Config.cs`/`DebugLog.cs` shared plumbing,
  `Autotest.cs` the SV_AUTOTEST harness). `src/build.ps1` compiles all of it via `csc.exe`
  into `MnMFieldNotes.exe` at the repo root (gitignored build output, rebuild before every
  release).
- `app.ico` — the app's icon, committed (not gitignored, unlike `lib/webview2/`'s DLLs) —
  small and hand-authored, not a fetched redistributable. Embedded directly into the exe's
  PE resources at build time via `/win32icon` — **whoever builds a release must run
  `src/build.ps1` with `app.ico` present**, not just zip up a stale exe.
- `ui/` — `index.html`+`style.css`+`app.js`, served via `SetVirtualHostNameToFolderMapping`
  (origin `appassets.local`, not `file://`). `hasHost` check + dev mock (`mockHostRespond`)
  for browser preview via `lib/serve-ui.ps1` (mock never runs in the real app). Unchanged by
  the C# migration — same DOM/JS bridge either host speaks.
- `legacy/` — `MnMFieldNotes.ps1` + `Start.vbs`, the original PS 5.1 host, kept only as an
  unmaintained fallback (see CLAUDE-HISTORY for why it was replaced). Not shipped in release
  zips, not touched for new features.
- `lib/webview2/` — gitignored DLLs.
- `lib/serve-ui.ps1` — dev-only preview server, not shipped.
- `lib/webview2-smoketest.ps1`, `lib/keyhook-spike*.ps1` — isolated diagnostic scripts,
  reference only.
- `README.txt` — what the app does/how to use it, keep in sync.
- `INSTALL.txt` — setup/uninstall/update guide for someone who just received a copy. Written
  entirely as "you" addressed to that recipient, never to the project owner — no "it's fine
  to share this" framing, that's not their concern to read about.
- `Data\` (gitignored): `AllTimeLog.jsonl`, `Profiles.json`, `GatherNotes.json`,
  `WebView2UserData\`, `error.log` (ThreadException handler).
- `Sessions\` (gitignored): per-session export txts.

## Taskbar-pinnable icon (2026-08-28, backlog #16 — done)

User asked whether the app could be pinned to the taskbar — it couldn't, for three
compounding reasons (see backlog #16 for the full original diagnosis): `Start.vbs` is a
script (Windows won't offer "Pin to taskbar" on it directly), it launches `powershell.exe`
hidden to host the window (so any pin would group under PowerShell's own identity, not a
distinct app one), and the window never had its own icon.

**First attempt (PS1 era, insufficient)**: `$form.Icon` set at runtime +
`SetCurrentProcessExplicitAppUserModelID` called early in the script. This looked right in
reasoning but **failed real-world testing** — user confirmed pinning still showed the plain
PowerShell icon. Root cause: Windows resolves a pin's icon/identity from the **launch
executable's own PE resources/path**, not anything set at runtime inside the process —
`powershell.exe` is still what gets pinned no matter what the hosted window does to itself
after launch. This is exactly why the exe migration happened (see CLAUDE-HISTORY) — no
runtime trick can fix this for a script-launched process.

**Actual fix**: `app.ico` (multi-resolution — 16/32/48/256px, PNG-compressed entries per
the Vista+ ICO format; artwork = user-supplied ChatGPT-generated flat two-tone
gold-on-`--bg-page`-dark icon combining a sword/hammer/pick/book) is embedded directly into
`MnMFieldNotes.exe`'s own PE resources at build time via `csc.exe /win32icon:app.ico` (see
`src/build.ps1`). Because the icon lives in the exe's own file data rather than being set
after the process starts, Explorer can show the correct icon on `MnMFieldNotes.exe` even
before it's ever been run, and pinning it — from the file directly, or from its running
taskbar icon — resolves to that same identity every time. `SetCurrentProcessExplicitAppUserModelID`
(now `Native/AppIdentity.cs`, called from `Program.cs`, still fixed string
`DistractibleD.MnMFieldNotes`, still wrapped in try/catch so it can never block startup) is
still set for good measure (keeps grouping correct across window instances) but is no longer
carrying the whole fix by itself the way the PS1-era attempt assumed. **Confirmed on a real
machine** — user tested pinning after the exe migration and confirmed the app's own icon
now shows correctly, not PowerShell's.

**Known accepted tradeoff**: four distinct objects is a lot of detail for a 16-32px taskbar
icon specifically — verified via scaled-down previews that it reads clearly at 256px/48px
but blurs into a less distinct shape at 32px and especially 16px. Kept anyway, user's own
call ("use as is"), since it still reads fine at every OTHER size the icon appears at (title
bar, Alt-Tab, desktop/Start).

## Update checking

Version = `major.minor` string (`$script:AppVersion` in `MnMFieldNotes.ps1`), starting at
`0.1` — 0.x means alpha, `1.0` is reserved for an actual finished product, not just "the
next release." Compared via `Compare-AppVersion` (splits on `.`, compares each segment as a
real `[int]`), never as a single numeric cast (can't parse a dotted string) or a plain
string comparison (`"0.10" < "0.9"` lexicographically, wrong both ways). A plain incrementing
integer was tried first and dropped once the alpha/1.0 framing came up; a date-based scheme
before that was dropped too: same day = same version string = second same-day release never
triggers a prompt for anyone already on the first. `$script:AppBuildDate` (separate constant,
`yyyy-MM-dd`) is shown alongside the
version in the masthead purely for human "how stale is this" context — not used in the
comparison at all. Checked against
`https://raw.githubusercontent.com/DistractibleD/mnm-field-notes/main/latest.json`
(`{version,url}`) via `Get-UpdateInfo`, called automatically on `ready` and manually via
`checkForUpdates` msg (the "Check for updates" link in the masthead). Never blocks, never
auto-applies — result rendered as a dismissible `#update-banner` (only when a newer version
exists) or a toast (manual check only, so silent background checks don't nag). "View
release" sends `openUrl` to the host (`Start-Process`, `http(s)://` validated first) rather
than a plain `<a target=_blank>` — avoids WebView2 popup-window quirks, always opens the
system browser. GitHub repo = `mnm-field-notes` (public, git identity = GitHub noreply
email) — this repo, holding both app source and `latest.json`/release zips. Until
2026-08-26 this repo had no GitHub remote at all, and a separate `mnm-field-notes-releases`
repo held only `latest.json` + release zips — split existed to keep source off a public
repo from the project's earlier secrecy phase. Once that phase ended (see "Naming"), the
split no longer served a purpose, so `mnm-field-notes-releases` was renamed to
`mnm-field-notes` (GitHub repo rename preserves existing tags/release zips/download URLs
automatically) and this repo's own history was merged into it (`git merge
--allow-unrelated-histories`, preserving both commit histories). `$UpdateCheckUrl` and
`latest.json`'s own `url` field were both repointed to the new name anyway even though
`raw.githubusercontent.com` turned out to redirect the old one fine — don't lean on that
redirect for a future rename, repoint both by hand and verify. **Self-update now exists** —
see "Self-update" below — `latest.json` also carries a `zipUrl` field alongside `version`/
`url` for this, pointing at that specific version's own release asset directly (not a
"latest" pattern URL, since GitHub doesn't offer a stable one for an asset whose filename
changes per version) — **update this by hand alongside `version`/`url` on every release**, or
the update banner's "Update now" button silently points at stale bytes.

## Self-update (2026-08-28) — a real trust-boundary jump, confirmed with the user first

Until now this app only ever downloaded DATA (JSON) or opened a browser tab (`openUrl`) —
self-update is the first time it downloads and **executes** code fetched from the internet,
exactly the risk this file used to cite as the reason self-update wasn't built. Built only
after explicitly walking the user through that tradeoff and getting a clear go-ahead
(2026-08-28) — same confirm-first treatment as session export submission's own hard-rule
update.

- **What it does**: the existing `#update-banner` (see "Update checking" above) gets an
  "Update now" link alongside "View release"/"Dismiss", shown whenever `latest.json`'s
  `zipUrl` field is present. Clicking it (after a client-side + host-side "no session
  running" check, see below) downloads that version's release zip, extracts it, replaces
  only the release-shipped files, and relaunches — no separate confirmation dialog beyond the
  banner itself, matching how "Submit" on the export banner already treats one click as
  sufficient confirmation for an additive, recoverable action.
- **`Data\`/`Sessions\` survive by construction, not by a preserve-list** — `AppUpdater.
  ApplyUpdateAsync` (`src/AppUpdater.cs`) only ever touches `MnMFieldNotes.exe`, `ui\`,
  `lib\webview2\`, `README.txt`, `INSTALL.txt` — the exact set of files the release zip
  itself contains (see "File layout"). `Data\`/`Sessions\` are gitignored and created fresh
  on first run, so they were never part of the zip to begin with; the update logic simply
  never has a reason to mention them, which is a stronger guarantee than an explicit
  "don't delete these" exception would be.
- **No separate helper program** — verified directly (a disposable throwaway test, not
  assumed) that Windows allows renaming a currently-**executing** exe to a new name, writing
  a brand new file at the vacated original path, and the still-running (renamed) process
  carries on completely unaffected. So `MnMFieldNotes.exe` can replace its own file in-place:
  rename the running exe to `MnMFieldNotes.exe.old`, copy the new one into the vacated path,
  `Process.Start` it, then the OLD (still-running-as-`.old`) process closes itself shortly
  after (`WebMessageRouter.HandleApplyUpdateAsync`'s short delayed `form.Close()`, mirroring
  `HandleEndSession`'s own autotest close-timer). `ui\`/`lib\webview2\` files can be
  overwritten directly, even while the app is running — nothing holds a lock on them
  (WebView2 serves `ui\` per-request rather than keeping files open, and since the MOTW fix
  above, the WebView2 managed DLLs load via `Assembly.Load(byte[])`, which never keeps a file
  handle open either, unlike the `LoadFrom` it replaced).
- **A stale `.old` file** (left over if a previous update's cleanup never got the chance to
  run) is cleaned up best-effort on the NEXT launch (`AppUpdater.CleanUpOldExe`, called from
  `Program.cs`'s `LaunchApp`) — by then the process that owned it has had time to fully exit
  and release the file. Never allowed to block or fail loudly either way.
- **Validated before anything live gets touched**: the extracted staging folder is checked
  for a real `MnMFieldNotes.exe` before any rename/copy begins — a bad download or unexpected
  zip structure fails cleanly with the current install completely untouched, not discovered
  mid-swap. The zip's own top-level folder name is discovered generically (`Directory.
  GetDirectories(stagingDir).FirstOrDefault()`), not hardcoded, so a future rename of that
  folder inside the release zip doesn't silently break this.
- **Refuses to run during an active session, both client- and host-side** — a session's own
  metadata/unflushed UI state only becomes durable at "End session & export" (already-logged
  entries are safe either way, written to `AllTimeLog.jsonl` in real time), so restarting the
  app mid-session would lose more than just what's already on disk. `ui/app.js` checks
  `session.id` before ever sending `applyUpdate`; `SessionState.AnyActive()` checks again
  host-side for defense in depth, since the client and host are both "this app," not an
  adversarial boundary, but a cheap double-check costs nothing here.
- **Verified two ways before considering this done**: (1) the core OS assumption itself — a
  disposable test proved a running exe really can be renamed-then-replaced without
  interrupting the running process; (2) a full end-to-end run of the REAL `AppUpdater.cs`
  against the actual live v0.10 GitHub release, in a fully sandboxed fake install (never the
  real project folder) seeded with canary `Data\Profiles.json`/`AllTimeLog.jsonl` content —
  confirmed the canary files came out byte-identical, `MnMFieldNotes.exe`/`ui\`/
  `lib\webview2\`/`README.txt`/`INSTALL.txt` all came out matching the real release exactly,
  the old exe's content survived under `.old`, and the relaunch genuinely started a new
  process from the updated files. Real-machine confirmation of the actual in-app "click
  Update now" click-through (not just the underlying mechanism) is still worth doing, the
  same way taskbar pinning and the native key hook needed it — this sandbox has no
  interactive desktop to drive that specific click through a real WebView2 session.

## Error handling & reporting

Three distinct paths, all funneling into one of two files — no telemetry, nothing ever sent
anywhere automatically, matching this app's own "nothing is sent automatically" promise
(README.txt):

1. **`crash.txt`** (repo root, next to the exe) — catches a failure during **startup**,
   before the app's own window/message loop is even running (`Program.cs` `Main()`'s
   try/catch around `LaunchApp()`). This is what caught the real MOTW bug from a real
   recipient (see the `Assembly.LoadFrom` gotcha above) — the one file worth asking for when
   the app won't even open.
2. **`Data\error.log`** (`DebugLog.Write`) — catches everything **after** the app is running,
   from two native C# paths (`Application.ThreadException` for a UI-action failure, shows a
   MessageBox too; `WebMessageReceived`'s own try/catch for a bug in a `WebMessageRouter`
   case, logged silently, no popup — a backend logic slip shouldn't interrupt the user the
   same way a UI-thread crash should) — **plus, as of 2026-08-28, a `jsError` case** closing
   the one real gap that used to exist: nothing previously caught an error thrown in
   `ui/app.js` outside its own explicit `{ok, error}` message paths (submitExport/
   submitScreenshot/applyUpdate/etc.) — it would just vanish into the WebView2 devtools
   console with nothing surfaced or logged anywhere. `window.addEventListener('error', ...)`
   and `window.addEventListener('unhandledrejection', ...)` in `app.js` now forward every
   such error to the host via `sendToHost({type:'jsError', message, source, stack})`, logged
   into the SAME `error.log` `DebugLog.Write` already uses — one unified log, not a second
   one. Deliberately silent (no toast/popup) here too, same reasoning as the
   `WebMessageReceived` path — a JS error could be a real problem or a minor rendering
   glitch, and popping a dialog for every one would be noisy relative to how rarely this
   should actually fire. Verified in the browser preview: both a thrown error and a rejected
   promise correctly produced a `jsError` message with message/source/stack all populated.
3. **Per-feature inline errors** — session export submission, screenshot submission, and
   self-update all report their own `{ok, error}` result straight to the page, rendered as
   specific inline text (a banner or modal), rather than routing through either file above —
   these are the "did the thing I just clicked work" case, not the "something broke
   unexpectedly" case the two files above exist for.

**Pointing a user at Discord** (2026-08-28, user's own ask) — the `ThreadException` MessageBox
and `INSTALL.txt`'s "If something goes wrong" section both now say: if you'd like to help fix
it, message `Sw4nki#1044` on Discord with what's in `error.log`/`crash.txt`. **Both messages
explicitly warn that these files contain the user's full Windows file path** (visible
directly in the friend's own real crash.txt earlier — `C:\Users\jozzd\Downloads\...`), so
sending one reveals their Windows username — the user's own explicit call: tell people this
plainly and let them decide, rather than silently including it or building any kind of
automatic upload. This is deliberately NOT a new outbound-network capability — no code sends
anything anywhere; it's just clearer in-app/doc text pointing at an already-manual channel
(a person copy-pasting a file into a DM), so it doesn't touch Hard Rule #3 at all.

## Wiki data — read-only reference

Wiki JSON files: items/monsters/crafting/gathering-nodes/vendors/trainers/maps/companions/
spells/tradeskills/gemstones `.json`. Two channels, don't conflate:

1. **Claude (dev-time)**: reads the local repo directly
   (`D:\Claude files\MonstersAndMemories-Wiki\`), ordinary file access.
2. **Running app (runtime)**: ALWAYS fetches the published site
   (`https://distractibled.github.io/DistractibleD-MonstersAndMemories-Wiki/<file>.json`)
   over HTTPS, never a local path — same for every user including the owner, keeps behavior
   identical across machines. Tradeoff: unpushed wiki edits are invisible until deployed —
   accepted, no local fallback.

**Read-only for DATA, both channels, always** — never create/edit/delete a file in the wiki
repo, never let this project's git history touch it or its remote (see "Session export
submission" below for the one narrow exception — a network POST to a Worker the wiki repo
already hosts source-for, not a git write, and this project's own copy of that Worker's code
lives here, not there — the wiki repo's copy stays untouched). Published site = `GET` only,
never written to.

### Cross-session agreement with wiki-claude (2026-08-29)

The wiki repo's own Claude session is reachable directly (`ListAgents`/`SendMessage`, both
sessions running locally on the user's machine) — user's own request, so information doesn't
have to be relayed by hand every time. **Confirmed mutually with wiki-claude**: information
shared freely in both directions (answer each other's questions about our own project's
data/design/state), but **neither session ever edits/creates/deletes files in the other's
repo, or touches the other's git history/remote** — this is the existing read-only-wiki rule
above, just now also explicitly held on the wiki side about this repo. `SendMessage` is a
text channel only, not filesystem access — wiki-claude doesn't get read access to this repo's
files by virtue of this agreement, it only knows what gets said in a given exchange (and vice
versa). Scoped to purposeful exchanges when actually relevant to work underway (e.g.
confirming a data shape before building against it), not standing background chatter — same
"ask a specific question, get a specific answer" shape as any other information-gathering
step, just skipping the user as the manual relay.

**Explicitly does NOT extend to design/build decisions that cross both repos** — e.g. a new
submission mechanism for camp data (see backlog #5/#7) needs the three of us (this session,
wiki-claude, the user) settling it together, not either Claude session assuming or building
against an unconfirmed guess. Matches Hard Rule #3's own "no new outbound-write path without
the same explicit confirm-first treatment" reasoning — a cross-repo channel being open doesn't
relax that, if anything it raises the bar, since now two sessions could each be wrong in a
way that looks locally consistent.

## Combat: log a camp (2026-08-29, backlog #5's Camp half)

A camp = a spot where a group of monsters spawns to fight — Combat-only, explicitly NOT
fishing spots or gathering nodes (those already have their own wiki data/pages, confirmed
directly with wiki-claude and the user before scoping this). `#log-camp-btn` ("+ Log a camp",
full-width row at the top of `#combat-session-layout`'s grid) opens `#log-camp-modal` —
camp name, zone (free text + datalist from `wikiData.zones`), area (optional), min/max level
(optional, independent numbers), a monsters checklist (known wiki monster names + a "+ Add"
custom-name fallback, same pattern as Gathering's node/material grids), a raid checkbox, and
an optional note.

**Deliberately rides the EXISTING session-export pipeline — no new submission mechanism, no
Worker changes.** This was a real design fork: this session and wiki-claude had already
converged on a dedicated new `campSubmission` Worker field landing in its own
`camp-submissions/` folder, before the user picked the simpler path instead ("my plan was to
use session.txt for all the tabs in the app that gathers information") — see "Cross-session
agreement with wiki-claude" above for the fuller back-and-forth. A camp is just a
`sessionType:'camp'` `logEntry` like anything else this app logs; `AllTimeLog`/
`WebMessageRouter.HandleLogEntry` needed zero changes (already fully generic, per "Data
model"). `SessionExportWriter.WriteCampBlock` (new, `src/SessionExport.cs`) prints each
logged camp as its own `== <name> ==` block when the session gets exported — deliberately no
`(<tradeskill>)`-style parenthetical in the header (unlike Combat's own `== <mob> (N kills)
==` or Harvesting's `== <target> (<tradeskill>) ==`), confirmed directly with wiki-claude that
its Fishing-rarity parser only acts on that exact shape, so Camps structurally can't collide
with it even though "Camp" would never literally match "Fishing" either way. Only prints
fields that are actually filled in (no "Level range" line when both are empty, no "Note" line
when blank, "Monsters: none listed" as the explicit empty state) — verified by running the
real `SessionExportWriter.Write` against seeded test data and sharing the exact output with
wiki-claude before any real submission could happen.

**Still entirely manual on the receiving end, by design** — nothing here parses the export
text or touches `camps.json`. Wiki-claude reads a submitted export's Camps section the same
way it already reads a session export today, and makes the new-camp-vs-update-existing-camp
call by hand — matches this app's own "Guild data trust model" and wiki-claude's own
explicit recommendation (every other submission channel that repo has already works this
way; nothing auto-merges into curated data sight-unseen).

## Combat: start-flow, con grid, level counter, loot picker, roster edit (2026-08-29)

User's own consolidated ask, built in one pass (see backlog — none of this needed deferring,
all buildable off patterns/data already in the codebase):

- **Start-flow, mirrors Fishing/Gathering's own pre-start chains**: `combatSession = {zone,
  level, camp}` (new session-level object, alongside the existing per-tab ones). Reachable
  ONLY via `TAB_START_ENTRY.combat = openCombatZoneModal` (the top "Start new session"
  button when no session is running — see "Starting a session"), chain is zone (optional,
  checklist dropdown) → level (`#combat-level-modal`, "Before you start") → camp (optional,
  `wikiData.camps` filtered by the picked zone; explicit "Not at a camp" skip when the list
  is non-empty, plain "No known camps in `<zone>` yet" text + skip when it's empty) →
  `finishCombatStart(camp)` auto-starts the session (reuses `startNewSession()`). Simpler
  than Gathering's equivalent chain in one respect: Combat's start-flow is only ever reached
  from the one top button (no session already running), so there's no "join an
  already-running session from another tab" branch to handle.
- **`camps.json` fetch** (`src/WikiData.cs`, `WikiService.FetchWikiDataAsync`) — its own
  isolated try/catch, deliberately NOT sharing the main monsters/items/nodes/crafting/maps
  try block, same soft-fail-to-empty-list pattern as `GetSharedFishRarityAsync` — camps.json
  may not be deployed to the published site yet (see "Cross-session agreement with
  wiki-claude"), and a missing/failed fetch here must never break the rest of `wikiData`.
  Forwarded to the client as `wikiData.camps`.
- **Con button grid** — replaces the old `<select>`. `CON_LEVELS` (array) + `CON_CLASS`
  (name→CSS-class map, `ui/app.js`) are the one source of truth now; `conButtonGridHTML(id
  Prefix, selected)` renders the 7 small pill buttons (`.con-btn-grid`/`.con-btn`, `ui/
  style.css`), `setupConButtonGrid(idPrefix, initial)` wires clicks and returns `{getValue,
  setValue}`. Used in both the main kill-log form and the edit-kill modal (`combatEditConCtrl`)
  — one shared implementation, not two. **Found and fixed a real pre-existing bug while
  building this**: `renderKillLog()`'s old con-pill class computation (`'con-' +
  e.con.toLowerCase().replace(' ','')`) produced `"con-lightblue"`/`"con-darkblue"` for the
  "Light Blue"/"Dark Blue" con values, but the actual CSS classes are `"con-lblue"`/
  `"con-dblue"` — those two cons were silently rendering with zero color, unnoticed until
  now. Fixed by routing the kill-log pill through the same `CON_CLASS` lookup.
  **Colors themselves updated (2026-08-29)** — the `.con-*` classes' actual hex values used to
  be guessed pastels; asked wiki-claude for the wiki's real con colors first, and there aren't
  any (con tiers only ever render as plain text there). What the wiki DOES have is a real hex
  palette for a different 7-tier system, crafting recipe difficulty (see the Crafting bullet
  under "Session types and fields" above for the full list) — the user explicitly OK'd reusing
  it for con anyway, tier mismatch and all: Trivial uses Green's own color (crafting already
  treats them as one tier), Light Blue/Dark Blue/White/Yellow/Red map straight across, crafting's
  Orange is unused here (con has no matching tier — reserved for Crafting's own difficulty UI
  whenever that gets built for real, don't repurpose it for anything con-related). Backgrounds
  are the real saturated hex as given, not lightened — text color picked per swatch for
  contrast (dark text on the light swatches, white text on Dark Blue/Red).
- **Level counter** (`#combat-level-box`, `renderCombatLevelBox()`/`bindCombatLevelEvents()`)
  — session-level `+`/`-`/type-in box mirroring Fishing/Gathering's skill counters, replacing
  the old per-kill level field. Explicit ask: the user updates this as they level, so `con`
  stays meaningful relative to a level that's actually current. Shown only while a session is
  running (`updateCombatSessionVisibility()`).
- **Faction pickers relabeled** "Add faction" / "Lose faction" (`checklistDropdownHTML`,
  unchanged mechanism — see "Checklist dropdown") — was already a 2-dropdown pos/neg pattern,
  just relabeled to read as an action rather than a bare noun.
- **Roster entries fully editable**: `.roster-item-edit` (✎, `renderRoster()`) opens
  `#combat-rename-modal` (`openRosterRenameModal`) — validates non-empty + no name collision
  with a different roster entry, moves the roster `Map` entry, patches `activeTarget` if the
  renamed monster was the active one, and sends one `editEntry`/`{patch:{target:newName}}`
  **per already-logged kill of that monster** (not just one — unlike Fishing/Gathering's
  zone-edit, a Combat roster entry can have many kills, all needing the same patch). Existing
  per-kill edit (✎ on each kill-log row, `openCombatEditModal`) now also edits `con` through
  the same button-grid component as the main form.
- **"+ Add loot" modal** (`#loot-modal`, `openLootModal()`/`renderLootGrid()`) — mirrors
  Gathering's material-modal pattern exactly: tap-to-increment pending counts
  (`lootPendingCounts`, `+N` badge), a "Not listed? Type its name…" + "+ Add" custom-item
  fallback (`lootCustomItems`), "Done" flattens the pending counts into repeated pushes onto
  the EXISTING `pendingItems` array (the chip display/removal via `renderChips()` was
  untouched — this only changed how items get ADDED to that array, not how they're stored or
  shown). Grid source = `findMonster(activeTarget).drops` ∪ already-picked names, "new"-badge
  logic shared with Fishing/Gathering's own grids.

Verified end-to-end in the browser preview (mock host): full start-flow (zone → level → camp,
including the zone-filtered camp list and the empty-camp-list text path), con grid click
→active-state in both the main form and edit modal, roster rename correctly patching every
logged kill's `target` (confirmed via the actual outgoing `editEntry` payloads, not just the
UI), and a full kill log/edit round-trip confirming the `logEntry`/`editEntry` payloads carry
the right `con`/`playerLevel`/`zone`/`items` fields.

## Coin-drop entry (2026-08-29, backlog #25)

Combat's coin-drop fields (total plat/gold/silver/copper off a corpse) used to be 4 full-width
`<input>`s (one per row in a `.field-grid`) with placeholder text (`"platinum"`, `"gold"`,
etc.) as the only way to tell them apart — took up real vertical space for what's usually a
1-2 digit number. User's own ask: make it more compact, and give each currency a colored icon
like the game's own in-inventory Currency row (a reference screenshot was provided) instead of
relying on placeholder text alone.

**Recreated, not cropped** — user's own explicit call: a cropped screenshot asset would look
visually inconsistent against the rest of the app's own hand-authored, flat CSS/SVG look (no
photographic/screenshot-sourced imagery anywhere else in the UI, see "Visual style"), whereas
small CSS circles with a radial-gradient reads as an intentional in-app element. `.coin-icon`
(`ui/style.css`) is a 15px circle, `.coin-plat`/`.coin-gold`/`.coin-silver`/`.coin-copper` each
apply a `radial-gradient(circle at 35% 30%, <light>, <mid> 55%, <dark> 100%)` (light highlight
upper-left, darker toward the rim — enough to read as a coin without a real embossed asset),
colors matched to the reference screenshot's own platinum(blue-gray)/gold(yellow)/
silver(light gray)/copper(orange).

**Combat-only, not a shared cross-tab component** — user's own words: "only combat yields
coin and only from humanoid monsters (usually) so the other tabs will not need any coin drop
input." No Gathering/Crafting/Cooking coin fields exist today or are planned.

`coinDropGridHTML(idPrefix, coin)` (`ui/app.js`, right after the con button grid helpers,
same file location/style) renders all 4 as one `.coin-drop-grid` flex row — icon + a narrow
(56px) number input per currency, `data-tip` naming the currency on hover/focus (existing
tooltip delegation, no extra wiring). IDs are `${idPrefix}-plat`/`-gold`/`-silver`/`-copper` —
unchanged from the old inputs' own ids, so `logKill`'s entry-construction and
`openCombatEditModal`'s load/`combat-edit-save`'s read were untouched, only the markup
generation changed. Used in both the main kill-log form (`renderDetail()`, empty on open) and
the edit-kill modal (`openCombatEditModal`, prefilled from `entry.coin`) via a `#combat-edit-
coin-wrap` placeholder div in the static `index.html`, same pattern as `#combat-edit-con-wrap`.
Wraps to 2 rows in the edit modal's narrower width — expected, not a bug, `flex-wrap: wrap`.

Verified in the browser preview: renders compactly in both places, hover tooltip names each
currency, and a real `logEntry` payload was captured confirming `coin.platinum` (and the rest)
come through correctly with the new markup.

## Maps tab (2026-08-28, backlog #13) — pan/zoom viewer, ported from the wiki

New top-level tab (`#panel-maps`, `renderMapsPanel()` in `app.js`). Grid of map cards
grouped by base name (`Shaded Dunes` / `Shaded Dunes (Numbered)` collapse into one card with
a variant link) → click opens a full-size pan/zoom overlay (`#map-viewer`). Deliberately
ported near-verbatim from the wiki's own `#map-viewer`/`.maps-grid` (`script.js`/`style.css`
there) rather than built fresh — same fit-to-view scale computation, same scroll-to-zoom/
click-drag-to-pan mechanics, same thumbnail-then-full-swap loading (full maps can be tens of
MB), same prev/next blink-once animation when a multi-variant area first opens. CSS ported
with this app's own variable names substituted for the wiki's (`--bg`/`--bg-panel`/
`--text-dim`/`--accent-dim` → `--bg-surface`/`--bg-raised`/`--text-muted`/`--border-strong`).
No "featured maps" curation panel (the wiki pins "Aethoril"/"Calafrey & Szurr Regions" above
the alphabetical grid) — that's wiki homepage curation, not needed for a lookup tool tab here.

- **`WikiService.FetchWikiDataAsync()` already fetched `maps.json`** (only used it for
  `Zones` before) — now also forwards `{name, image, thumbnail}` as `wikiData.Maps`, with
  `image`/`thumbnail` turned into absolute URLs (`Config.WikiBaseUrl + relative path`) host-side.
- **The image bytes never touch the exe** — unlike every other wiki fetch (JSON, all
  `HttpClient`-routed per "exe owns ALL file I/O + networking"), a map image is loaded by a
  plain `<img src="https://...">` tag directly in the WebView2 page, the same way the wiki
  itself displays it. This is a deliberate, reasoned exception, not an oversight: there's no
  processing benefit to routing image bytes through the host (unlike JSON, which gets
  reshaped/combined with local data), and doing so would mean base64 bloat (~33%), blocking
  the postMessage channel on tens-of-MB payloads, and reinventing browser caching that a
  native `<img>` tag already gets for free. Still `GET`-only, still HTTPS, still the published
  site — doesn't touch the "read-only for DATA" rule above, that rule is about writes.
  Incidentally resolves backlog #13's one open loose end (`aethoril.webp` failing a .NET
  image-format check) without any special-casing — nothing here ever decodes the bytes in
  C#, only passes the URL through as a string; Chromium's own `<img>` handles WebP natively.
- **No pins/annotations** (backlog #14) — explicitly deferred, user's own call (2026-08-28):
  "wait until we have better maps." Not attempted in this pass.

## Window orientation toggle (2026-08-28) — landscape by default, remembered

The app originally always opened at a fixed 900×1500 (portrait-shaped, tuned for a portrait
2nd monitor — see "Visual style"). User's own ask: landscape by default instead, a toggle to
switch to portrait, and the choice remembered across launches. Landscape/portrait are a
literal swapped W/H pair (`LandscapeWidth/Height = 1500/900`, `PortraitWidth/Height =
900/1500` in `MainForm.cs`) — portrait kept at the app's original size unchanged, so a user
who switches back gets exactly what this app always used, not a new size.

- **First run (nothing stored yet)**: `MainForm.DetectDefaultOrientation()` reads the
  *secondary* monitor's own `WorkingArea` shape (`Screen.AllScreens.FirstOrDefault(s =>
  !s.Primary)`) rather than assuming — a portrait-mounted 2nd monitor gets a portrait
  default, a normal landscape one gets landscape, matching whatever's actually plugged in.
  Falls back to landscape when there's no secondary monitor, dimensions are exactly square,
  **or the check itself throws for any reason** — wrapped in try/catch, since `Screen.
  AllScreens` is a live OS/driver query, not something to trust blindly. Landscape is
  deliberately the failure-mode default, not just the "no signal" default: a portrait window
  that turns out too narrow/tall for an unexpected setup has previously left real content
  cut off, needing a manual resize just to use the app — better to default to the wider,
  safer shape than risk that again.
- **After the user ever toggles**: `AppSettingsStore` (`Data\Settings.json`, same flat-JSON
  pattern as `Profiles.json`/`GatherNotes.json`) remembers the explicit choice, which always
  wins over re-detecting from the monitor from then on — `GetStoredOrientation()` returns
  `null` until an explicit choice exists, and `MainForm`'s constructor only falls back to
  `DetectDefaultOrientation()` when that's `null`. Nothing is written to `Settings.json`
  before the user's first toggle — the detected first-run default is deliberately NOT
  persisted, so a still-untouched install keeps re-detecting fresh from whatever monitor is
  actually connected at each launch, rather than locking in whatever happened to be plugged
  in the very first time.
- **UI**: a small icon button in the masthead (`#orientation-toggle-btn`, next to the Win98
  theme toggle, same `.theme-toggle-icon` styling) — a single `<rect>` whose `x`/`y`/`width`/
  `height` get swapped between a wide and a tall shape on toggle, so the icon itself visually
  mirrors the current/target orientation rather than relying on the tooltip alone. Unlike the
  Win98 toggle (purely client-side CSS, no host involvement needed), this genuinely resizes
  the native window, so the host has to own the real state — `MainForm.CurrentOrientation`
  (a live property, not re-read from `AppSettingsStore` each time, since first-run's detected
  value isn't persisted) is what `ready`'s `orientation` message actually reports, so the
  toggle's initial icon/tooltip always reflects the window's true current shape. Clicking
  sends `setOrientation` to the host (`WebMessageRouter` → `MainForm.SetOrientation`, which
  resizes/re-centers immediately via the same `ApplyOrientation` helper the constructor uses,
  then persists) and updates its own icon optimistically — a local resize has no real failure
  mode worth a round-trip confirmation for.

## Home tab (2026-08-28, backlog #23) — permanent, not a first-run modal

Now the FIRST tab, active by default on launch (`#panel-home`, `.tab[data-tab="home"]` first
in the tab bar) — plain static HTML in `index.html` (no dynamic wiki data needed, so no JS
render function): a welcome blurb, a short "How it works" bulleted list (landing info without
a session, starting a session, one-tap logging, export/submit), and a short "Your data"
paragraph (local-by-default, submissions go through review, the profile name isn't an
account). Initially built with a `renderHomePage`-style nav-card grid mirroring the wiki's
own Home page, one card per tab — **removed** (2026-08-28, user's own call): "we don't need
the button... as the tabs are easily accessible and not too many. Use the space for general
information instead." The tab bar itself already does what the cards were duplicating; the
freed-up space went to the fuller "How it works"/"Your data" text instead. No changelog
section either way (wiki-only concept, nothing analogous here).

**Explicitly a permanent tab, not a one-time/dismissible first-launch panel** — asked the
user directly given this was a real fork in how the feature works (adds a permanent 8th tab
vs. a lighter "shown once" experience); they confirmed the permanent-tab reading, matching
the wiki's own Home page being a normal, always-reachable nav destination rather than a
first-visit-only interstitial.

**Bug found and fixed while wiring this up**: `#tooltip-hint`'s visibility was ONLY ever set
by the tab-click handler (`TABS_WITH_TOOLTIPS.has(...)`) — never initialized at page load.
This was invisible before because Combat (which DOES have tooltips) was both the default
tab AND in `TABS_WITH_TOOLTIPS`, so the hint's un-set default state happened to already be
correct by coincidence. Making Home (which has none) the new default tab surfaced it — the
hint incorrectly showed on first paint until any tab was clicked. Fixed by defaulting
`#tooltip-hint` to `style="display:none;"` in `index.html` itself, same pattern already used
for `#update-banner`/`#submit-export-banner`, rather than adding an extra init-time call.

**Local activity stats — done (2026-08-28)**: "Your contribution so far" section, below
"Your data" — one `.stat` tile per real category (Monsters killed/Fish caught/Mining nodes
mined/Trees chopped/Herbs picked/Dishes cooked, matching the user's own named examples plus
Cooking for completeness), reusing the exact `.stats`/`.stat` component the session stats
bars already use rather than inventing new CSS. `AllTimeLog.GetLocalActivityStats()`
(`SessionLog.cs`) reads `AllTimeLog.jsonl` fresh (same "no new persistence" pattern as
`GetFishRarity`/`GetCombatZoneLevelRange`), keyed off each entry's `sessionType`/`tradeskill`/
`success` — Combat entries count as 1 kill each, Fishing/Gathering/Cooking only count
`success:true` entries, split by `tradeskill`. Sent once as `localActivityStats` alongside
the other `ready`-time baselines (`WebMessageRouter.HandleReadyAsync`) — a snapshot, not
live-updating per log entry, since Home isn't an active logging surface. **Hidden entirely
when every category is 0** (a fresh install with nothing logged yet) — same "all-zero stats
are noise" reasoning as the session stats bars' own visibility gating. Verified in the
browser preview both ways: renders correctly with real values, hides itself when all-zero.

**Still open, not built in this pass**: the GLOBAL/guild-wide half of the same idea (shown
alongside the local numbers above, not instead of them) — needs the same shape as the
"Rarity bars" pooled-data mechanism (Fishing rarity: a GitHub Action on the wiki side
aggregates merged submission PRs into a published JSON file,
`WikiService.GetSharedFishRarityAsync()` fetches it), generalized from "Fishing catch-rate"
to "every category's raw activity count" — genuinely bigger scope than the existing
mechanism covers today, not something built entirely in this repo. See
`To-Do/planned-features.md` #23 for the still-open scoping questions.

## Session export submission (2026-08-27) — the one outbound-write exception

Until now this app only ever READ the wiki (JSON fetch) or opened it in a browser (`openUrl`)
— this is the first capability where the running app sends data OUT. Confirmed with the user
before any code existed: reuse-vs-new-infrastructure, and this hard-rule update itself.

- **What it does**: POSTs a session export to the wiki's OWN existing Cloudflare Worker
  (`SUBMIT_WORKER_URL` in the wiki's `script.js`) — the same one behind the wiki's "Submit a
  Screenshot" form. The Worker commits the export as a new file on a NEW branch and opens a
  pull request; it never commits to `main` directly. **A human (the wiki owner) merges to
  accept or closes to deny — the app never merges its own PRs, and has no credentials that
  could.** This PR-review step IS the check the user asked for ("for now i have to check
  each submission"), not a separate approval gate bolted on top of it.
- **Extended, not replaced**: the deployed Worker already handles the wiki's own
  screenshot/notes submissions (commits to `images/Inbox/`/`community-notes/`). Session
  exports get their own code path — a `sessionExport` field, its own `session-exports/`
  folder, no length cap (the existing `notes` field is capped at 2200 chars server-side,
  fine for a short note, not for a whole session's worth of entries) — the existing
  screenshot/notes path is untouched, still works exactly as before.
- **This project's own copy of the Worker lives in `lib/cloudflare-worker/submit-worker.js`**
  — NOT the wiki repo's own copy (`cloudflare-worker/submit-worker.js` there), which stays
  untouched per the read-only rule above. Cloudflare Workers aren't deployable from a git
  push — the user pastes this file's contents into the Worker's editor in the Cloudflare
  dashboard and clicks Deploy by hand, the same manual process the wiki repo's own copy
  already documents for itself in its own header comment. If the two copies drift, that's
  expected until the user chooses to sync the wiki repo's reference copy themselves — Claude
  does not do that sync (would mean editing the wiki repo, see the rule above).
- **No new secrets in this project** — the Worker's `GITHUB_TOKEN` lives only in Cloudflare's
  own secret storage, never in this repo, never sent to or through this app.
- **PS 5.1 era**: PS 5.1 has no `-Form` parameter on `Invoke-WebRequest`/`Invoke-RestMethod`
  (that's PS 6+ only) — the multipart/form-data body was built by hand in `Submit-SessionExport`.
- **C# era (2026-08-28, after the exe migration)**: `SessionExportSubmitter` in
  `src/SessionExportSubmit.cs` uses `HttpClient`'s `MultipartFormDataContent` — a real
  simplification over hand-building the body. **Real bug hit and fixed while porting**:
  `MultipartFormDataContent.Add(content, name)` does NOT quote the name in the resulting
  header (produces `Content-Disposition: form-data; name=sessionExport`, not the RFC
  7578-standard `name="sessionExport"`), and Cloudflare Workers' own `request.formData()`
  parser can't handle the unquoted form — it throws, and the Worker reports a generic
  `"Invalid submission — please try again."` that looks like a deliberate rejection but is
  actually just a parse failure. This is what made it dangerously easy to "verify" incorrectly
  — an early oversized-payload test during the migration got this exact same generic error
  and was misread as the size-safety check working, when it was really hitting the same parse
  bug regardless of payload size. Fixed by manually constructing each part's
  `ContentDispositionHeaderValue` with an explicitly quoted `Name`, rather than relying on the
  convenience overload. Confirmed against the real live Worker two ways, both side-effect-free:
  the honeypot field filled in (`{"ok":true}` immediately, proving parsing now succeeds) and a
  genuinely oversized payload (the *specific* `"That session export is too large."` message,
  not the generic parse-failure one, proving the real business logic is now reached) — then
  confirmed for real by the user, whose actual submission went through and opened a real PR.
  **Takeaway for future multipart work in this codebase**: never trust a generic "invalid
  submission"-style error as proof a safety check fired — verify you're hitting the SPECIFIC
  rejection message the code path in question actually produces.
- **The export includes computed Fishing rarity stats, not just raw entries** (2026-08-27,
  `Write-FishRarityBlock`) — explicit user ask: whoever reviews a submitted export (wiki-side
  Claude, most likely) should see this app's own rarity math already done, not have to
  re-derive it from a list of raw catch/no-catch lines. Prints two tiers per zone fished this
  session: **this session's own** catch-rate (from the entries in this one export) and **the
  submitter's all-time-on-this-install** rate (via `Get-FishRarity` — the exact same function
  that powers the live in-app rarity bars, one source of truth for the math, not two). The
  all-time figure is read at export time, which is AFTER this session's own entries were
  already appended to `AllTimeLog.jsonl` in real time (`logEntry` writes immediately, not just
  at session end) — so it already includes this session, labeled as such rather than awkwardly
  subtracted back out. Only fires for Fishing entries (`tradeskill -eq 'Fishing'`) — Gathering
  has no rarity concept at all (see "Gathering" above: attempts/rarity was deliberately not
  ported there). This is still just ONE submitter's local numbers, not a cross-user pooled
  stat — see planned-features.md #21 for the still-open "aggregate across everyone's merged
  submissions" piece, which needs its own design pass on the wiki repo's side.

## Screenshot submissions (2026-08-28, backlog #2) — reuses the wiki's existing pipeline as-is

Attach a screenshot and/or a note to a named monster (Combat) or a gathering node
(Gathering) — a second, independent use of the same outbound-write exception as session
export submission above, but this one needed **zero Worker changes**: the wiki's Worker
already has a complete `screenshot`/`notes`/`website` code path (`handleWikiSubmission` in
`lib/cloudflare-worker/submit-worker.js`) behind the wiki's own "Submit a Screenshot" form —
this app just POSTs to those exact same fields, so a submission from the app is
indistinguishable from one made on the wiki directly once it reaches the Worker.

- **`notes` folding matches the wiki's own client exactly**: `Regarding: Monster — <name>` /
  `Regarding: Gathering node — <name>`, then `Zone/Map: <zone>` if known, then the user's own
  note — same labeled-line format the wiki repo's `script.js` (`renderSubmitPage`'s form
  handler) already builds before POSTing, confirmed by reading that file rather than
  guessing. The Worker never parses `notes` either way (by design, keeps it domain-agnostic)
  — matching the format only matters for a human reading the resulting PR.
- **Only named/boss monsters get the trigger** — the wiki's own submission guide (`script.js`
  `renderSubmitPage`) states plainly "Only named/boss monsters need a picture — regular
  monsters don't," so `renderCombatRegularInfo()`'s monster list deliberately has no
  screenshot button, only `renderCombatNamedInfo()` does. Checked the actual guidance instead
  of adding it everywhere by default.
- **UI**: one shared modal (`#screenshot-modal` in `ui/index.html`, `openScreenshotModal()`
  in `app.js`) reused from two entry points — a small icon-only `.icon-btn` next to each
  named monster in Combat's landing list, and a `.mini-btn`-styled trigger next to
  Gathering's per-node note toggle (`renderGatherNodeNoteSection()`) in the material modal,
  since the node grid's own tiles are already a click-to-log target and can't also host a
  second click target without ambiguity. `.screenshot-trigger-btn` is a bare marker class
  with no styling of its own (`.icon-btn`/`.mini-btn` carry the actual look) so the SAME
  delegated `document`-level click handler (matching the tooltip/checklist delegation
  pattern already used elsewhere) works for both, regardless of which list rebuilt it most
  recently via `innerHTML`.
- **The image never touches the exe's filesystem** — same "webview = UI only" split as
  everywhere else: `ui/app.js` reads the chosen file via the standard `FileReader`/
  `readAsDataURL` browser API, sends it to the host as base64 in a `submitScreenshot`
  message, and `WebMessageRouter.HandleSubmitScreenshotAsync` decodes + POSTs it — the exe
  still owns 100% of the actual networking, matching Hard Rule #3 and the existing
  `logEntry`/`submitExport` pattern.
- **`src/MultipartUtil.cs`** — the `MakeQuotedPart`/boundary-quote-stripping fix from
  `SessionExportSubmit.cs`'s hard-won `Content-Disposition` gotcha (see "Architecture" above)
  was factored out into a shared helper the moment a second submitter needed it, plus a new
  `MakeQuotedFilePart` for a binary part with a quoted `FileName` and a `Content-Type` header
  — same underlying `ContentDispositionHeaderValue` mechanism as the text-part fix, so the
  same quoting requirement was assumed (correctly) to generalize to it.
  `SessionExportSubmitter` was refactored to use the shared helper too, so the fix only has
  to be right in one place.
- **Verified against the real live Worker before considering this done**, per the project's
  own "never trust a generic error" lesson from the session-export bug — two side-effect-free
  requests via a disposable standalone test program (compiled and run once, then deleted, not
  part of the shipped app): an unsupported mimetype (`text/plain`) got back the *specific*
  `"Please attach an image file (PNG, JPG, WEBP, or GIF)."` message, and a 9MB `image/png`
  payload got back the *specific* `"That screenshot is too large (8MB max)."` message — both
  prove the binary file part parses correctly through Cloudflare's `request.formData()` and
  reaches real business logic, and both reject *before* the Worker's `commitAndOpenPr` step,
  so neither created a real PR or branch.
