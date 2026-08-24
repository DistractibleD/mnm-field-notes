# CLAUDE.md

Guidance for Claude Code working in this project. Read this in full before making any
change here — the rules below are non-negotiable, not defaults to weigh against
convenience. Design-decision history/superseded-attempt post-mortems live in
`CLAUDE-HISTORY.md` instead (not auto-loaded — read on demand); this file is current
rules/architecture only.

## What this is

A personal, offline, second-monitor data-collection companion for *Monsters and
Memories* ("MnM Field Notes" — see "Naming" below). Every field is typed by the user after
observing it on screen, during or after play — the app never reads any file the game
writes, never touches its process/memory, and never interacts with the game in any way.
It's the equivalent of jotting notes in a notebook while playing, structured for two
purposes: (1) fast live logging across Combat/Harvesting/Crafting sessions, and (2) a
searchable lookup over data already gathered in the sibling wiki project. Session data
gets curated into a plain-text summary the user hands to Claude to update that wiki.

**This design exists because the previous one (reading the game's own Ledger log files)
conflicted with the game's actual Master User Agreement** — see "The EULA discovery" in
`CLAUDE-HISTORY.md` before ever suggesting the app read anything the game itself writes.
That door is closed, not just deprioritized.

## Hard rules — never violate these

1. **Zero interaction with the game, ever.** Never read any file `Monsters and Memories`
   writes (its install folder, its save-data folder, log files, config, anything), never
   access its process memory, never inject code or hook it in any way. This is the whole
   basis for this app being EULA-safe — reintroducing any game-file read, even read-only,
   reopens the exact conflict that ended the previous design. If a future request would
   require this, stop and say so rather than finding a narrower workaround.
2. **Writes stay inside this project's own folder.** Session data, the all-time log, and
   session-export text files all live under this folder (see "File layout"). Never write
   anywhere else.
3. **Network calls only ever reach the published wiki site
   (`https://distractibled.github.io/DistractibleD-MonstersAndMemories-Wiki/`) or, if ever
   added, services unrelated to Niche Worlds Cult/Monsters and Memories.** Never add any
   call to an NWC-operated endpoint, and never add telemetry/analytics/crash-reporting of
   any kind. **No machine-to-machine networking of any kind between copies of this app** —
   every copy (the user's own or a guild member's) only ever talks to that one public URL,
   never to another user's computer. There is no server, listener, or open port anywhere in
   this app.

## Secrecy — private from the wiki/public, shareable with the user's guild

**Motivation update (2026-08-24):** the original strict secrecy ("nothing about this app
should ever be shared, I don't want anyone to know about or detect it") was driven by
uncertainty over whether the app's existence conflicted with the game's ToS/EULA — resolved
now, see `CLAUDE-HISTORY.md`. With that risk gone, the user cares much less about who knows
what. Current actual scope: not fully public, but guild members are explicitly fine — see
below. Don't read the older, stricter wording anywhere in memory as still fully in force;
this section is the current, correct scope.

- **Never mention this project anywhere in the separate Monsters and Memories Wiki
  project** (`D:\Claude files\MonstersAndMemories-Wiki\`) — not in its `changelog.json`
  ("Latest Changes" feed), not in a commit message, not in any file in that repo, not in
  passing conversation while doing unrelated wiki work in that repo's session. Still
  absolute, unaffected by the guild-sharing note below.
- **Local-only, no remote.** This folder has its own local git repository
  (`git init`, no `git remote`) — deliberately never connected to GitHub or any other
  host. Do not add a remote, do not push, do not create an account or repo on any
  hosting service for this project unless the user explicitly asks for that in this
  project's own session, in the future, in clear terms.
- **Guild sharing is confirmed in-scope (2026-08-24), distribution method = manual file
  share** — the user intends to hand copies of this app to guild members so they can log
  data too. This is a deliberate, confirmed exception to "nothing about this project
  should be shared" — not a contradiction to flag again. Chosen specifically to avoid
  needing a remote: the user zips/sends the folder directly (Discord, etc.), no hosting,
  no accounts. If a private GitHub repo is ever wanted instead (e.g. the guild outgrows
  manual sharing), that still needs the user's explicit ask per the no-remote rule above
  — don't assume guild-sharing approval extends to that.
- Beyond the guild, nothing about this project should be uploaded, synced, or shared
  anywhere without the user explicitly asking for that specific action.

## Naming — "MnM Field Notes"

**Renamed 2026-08-24** from the deliberately-generic "Session Viewer"/`SessionViewer.ps1`.
The old genericness was a holdover from the pre-redesign era when the user wanted to stay
hidden/anonymous from the *Monsters and Memories* developers specifically — that reasoning
is gone: the user has told NWC they're welcome to see all the code, so there's no one left
to stay generic *from*. "MnM Field Notes" is the current window title (`$form.Text`), the
script filename (`MnMFieldNotes.ps1`), and the `<title>`/`<h1>` in `ui/index.html`. Keep new
naming (error dialogs, future windows, etc.) consistent with this rather than reverting to
generic phrasing — that instinct is exactly what's being deliberately undone here. See
"Naming un-genericized" in `CLAUDE-HISTORY.md` for the full reasoning if this ever needs
revisiting.

**This does not change the Secrecy scope above** — the guild-only distribution, the
no-remote rule, and "never mention this project in the wiki repo" are about a different
audience (the public/the wiki) and a different concern (no hosting, no accounts) than the
game-developer-specific hiding this naming change undoes. Don't read this as a signal that
the project has gone more broadly public.

`Start.vbs` (the launcher) keeps its own name — it was always a plain functional label, not
part of the generic-from-developers surface, so there's nothing to rename there.

## Visual style — matches the wiki, on purpose

`ui/style.css`'s `:root` palette and fonts (Sora for headings, Inter for body) are lifted
directly from the wiki project's own `style.css` `:root` block (`--bg`/`--bg-panel`/
`--accent` etc., confirmed 2026-08-24) — same variable names in this app map to the wiki's
exact hex values, so the two apps feel like one family rather than reskinning from scratch.
`--accent-craft` (the wiki's teal, used there for recipe cards vs. gold item cards) carries
the same "different session type" meaning here — Harvesting/Crafting's active tab state
uses it instead of the default gold accent. **If the wiki's own palette or fonts ever
change, pull the new values from there rather than picking new ones independently** — the
whole point is staying visually paired with it.

**Layout is responsive, tuned for a tall/narrow second monitor** (confirmed use case:
1080×1920 portrait) while staying comfortable on a wide landscape one — `.layout` (roster +
detail) stacks to one column below 900px width, `.stats`/`.field-grid` use
`repeat(auto-fit, minmax(...))` so they reflow at any width without extra breakpoints, and
`$form.Width`/`Height` in `MnMFieldNotes.ps1` (900×1500) default to a portrait-friendly
shape — still freely resizable, this is just the out-of-box size.

## Architecture

**PowerShell 5.1 + WinForms hosting a WebView2 control** — a dedicated native app window
(no browser chrome) whose UI is plain HTML/CSS/JS, verified working on this machine with
no Node/npm/.NET SDK install (see `CLAUDE-HISTORY.md` for how — the short version:
WebView2 Runtime already ships with Windows 11/Edge, and the three control assemblies were
pulled straight from NuGet as a raw package, no SDK involved).

- The WinForms host (PowerShell) owns all file I/O: reading the wiki's JSON data, saving
  the all-time log, writing the per-session export. The WebView2-hosted page is UI only —
  a browser page can't write files on its own, so every save/log/export action round-trips
  through the PowerShell host (via `WebMessageReceived`/`PostWebMessageAsString` or
  equivalent — pick a message contract when implementing and keep it consistent).
- `lib/webview2/*.dll` — gitignored, fetched redistributables, not source. Re-fetch from
  NuGet's flat-container API if ever missing (see `CLAUDE-HISTORY.md` for the exact URL
  pattern and the working `CreationProperties`/`EnsureCoreWebView2Async` initialization
  pattern — don't reinvent the environment-setup sequence from scratch).

### PowerShell/WinForms gotcha — always `$script:`-scope a Timer created inside a nested handler

**A `System.Windows.Forms.Timer` created *inside* another event handler's own scriptblock
(e.g. inside `Add_Shown`, or inside a `WebMessageReceived` case) must be assigned with
`$script:` scope, never a plain local variable** — `$timer.Add_Tick({ $timer.Stop(); ... })`
silently resolves `$timer` to `$null` inside its own Tick closure when `$timer` itself was
declared in a scriptblock nested two or more levels deep, throwing "cannot call a method on a
null-valued expression" on every single tick (so it never actually stops, repeating forever).
Caused two real crashes during development — see `CLAUDE-HISTORY.md` "Harvesting/Fishing
keypress counter" for the full story and how it was isolated. A Timer created at true
top-level script scope (one level of nesting) doesn't have this problem. When in doubt,
`$script:` it — costs nothing, and the alternative is a silent, repeating failure that's hard
to diagnose from the symptom alone.

**Any low-level Windows hook callback (`SetWindowsHookEx`) must do the absolute minimum** —
flip a flag / bump a counter, nothing else. Never call `Send-ToUI` or anything else that
could re-enter PowerShell/WebView2/COM code from inside the native callback itself; use a
separate polling `Timer` (on the normal message loop, `$script:`-scoped per the rule above)
to actually react to what the hook observed. Two independent reasons: it's what caused the
first of the two crashes above, and Windows can silently uninstall a hook whose callback is
slow regardless.

### Profiles

Who's logging is a persisted concept (`Data\Profiles.json`, `Get-Profiles`/
`Add-OrSetLastProfile` in `MnMFieldNotes.ps1`), not retyped every launch. First run (zero
saved profiles) opens `#profile-modal` automatically; returning users get their last-used
profile pre-selected in the session-bar dropdown (`#profile-select`). Adding another
profile is available any time via that dropdown's "+ Add new profile…" entry, reusing the
same modal. The dropdown is disabled while a session is running, same as every other
session-scoped control — switching only takes effect for the *next* session, matching how
`loggedBy` is already locked in server-side once a session starts. `sessionType`/export
attribution ties directly to the active profile name.

### Checklist dropdown — the standard pattern for "pick any number, searchably"

`checklistDropdownHTML`/`setupChecklistDropdown` (generalized 2026-08-24 from what started
as a faction-only component) is the app-wide answer to "select any number of items from a
list" — a toggle button opening a small-font 2-column checkbox panel with a live search box
at the top, auto-focused on open. **Use this, not a plain `<select>` or a hand-rolled
checkbox list, for any future multi-pick control** — this was an explicit, general request
("this should be a running theme for the app... find what we're looking for as fast as
possible"), not scoped to just the faction dropdowns it started on.

Filtering hides non-matching `.checklist-option` labels (`filtered-out` class) rather than
removing/regenerating them — this is deliberate: checked state lives on the actual
`<input>` DOM nodes, so a filtered-out (hidden) option must stay in the DOM or a checked
box would silently lose its state the moment the search text changed. Verified this holds
(check while filtered, clear the search, the check survives) before considering this
component done.

### Session types and fields

Combat/Harvesting/Crafting sessions use a **roster + active-detail** pattern: a session can
involve several different monsters/nodes/recipes, each tracked separately (a sidebar list
of what's been encountered this session; clicking one makes it "active" and quick-entry
fields apply to it). A Multi session mixes all three kinds in one roster. This mirrors the
wiki's own `conObservations` model directly — same species, multiple kill instances, each
with its own con/level.

- **Combat** → monster name, zone, con color + player level, coin drop (total off the
  corpse, not a party split), items looted, named y/n, and faction changes — two
  independent multi-select dropdowns (positive/negative), each a small-font 2-column
  checkbox panel populated from every distinct faction name across `monsters.json`'s
  `factionEffects` (60+ as of 2026-08-24, so the panel scrolls). Logged as `factionChanges:
  [{faction, effect: 'positive'|'negative'}, ...]` — deliberately the same shape as the
  wiki's own `factionEffects`, so no translation is needed later. This dropdown uses the
  general-purpose `checklistDropdownHTML`/`setupChecklistDropdown` component (see "Checklist
  dropdown" above), not a faction-specific one — the naming there covers why.
- **Harvesting** → tradeskill (Mining/Lumberjacking/Herbalism/Foraging — Fishing has its own
  tab, see below), node name, zone, player skill, success/fail, result item.
- **Crafting** → tradeskill, recipe name, player skill, difficulty color, components used.

**The session-level export label (`session.type` in `app.js`, the "Session export - X" header
and the export filename suffix) is derived from whichever tab is active at the moment "Start
session" is clicked** — `TAB_SESSION_TYPE` maps each tab to a label (`fishing`/`harvesting`
kept distinct here even though both log entries with `sessionType: 'harvesting'`, since this
label is purely a human-facing export title, not what `Write-SessionExport` groups entries
by). **Bug fixed 2026-08-24**: `btnStart`'s click handler used to hard-code
`session.type = 'combat'` unconditionally, silently overriding whatever tab was actually
active — every export said "Session export - combat" regardless of session content. Now
reads `document.querySelector('.tab.active')` at click time instead of trusting a value that
could've drifted from an earlier, since-superseded fix attempt in the tab-click handler
itself. If this ever breaks again, check both places `session.type` gets assigned, not just
one.

### Fishing — its own tab, deliberately not the roster pattern

Fishing doesn't share Harvesting's roster UI — there's no discrete "node" the way an ore
vein has one, and real use is high-repetition (cast, catch-or-not, repeat), so the whole
tab is designed around minimum taps per action (redesigned 2026-08-24 around this goal
explicitly). Two states in `renderFishingPanel()` (`ui/app.js`):

- **Pre-start**: "Listen for key" (opens `#fish-key-modal`, sends `startKeyCapture`, same
  passive-observation hook as before, see "PowerShell/WinForms gotcha" above), a short
  description paragraph explaining what the key listener does (added 2026-08-24 — first-time
  users had no way to know what "Listen for key" meant before clicking it), and "Start
  fishing!". Nothing else renders here on purpose — don't add fields to this screen without
  checking first, it's an explicit design choice, not an oversight.
- **"Start fishing!" opens two modals in sequence, then auto-starts the session** (skill
  modal 2026-08-24, zone modal + auto-start 2026-08-24) — `#fish-skill-modal` asks for
  current skill first (its "Next" button sets `fishingSession.skill`, then opens
  `#fish-zone-modal`, whose own `#fish-zone-modal-picker` is a searchable single-select
  checklist built fresh each open from `wikiData.zones`, same component as the in-screen
  zone dropdown). Zone was always optional here too — picking nothing doesn't block
  proceeding. **Confirming the zone modal auto-starts the overall session if one isn't
  already running**, reusing the same `startNewSession()` the top "Start session" button
  calls, rather than joining a session started from another tab. This exists because
  forgetting to press the separate top "Start session" button meant every fishing catch
  silently failed to log (`logFishCatch()`'s `if (!session.id)` guard rejected it with an
  easy-to-miss toast) — the user hit this for real once. **`startSession`'s reply is a real
  async WebView2 round trip, not synchronous** — `startFishing()` is deliberately not called
  right after `startNewSession()`; instead a `pendingFishingStart` flag defers it until the
  `sessionStarted` message actually confirms `session.id`. Skipping that and calling
  `startFishing()` immediately was tried and reproducibly sent `fishingStarted`/first-catch
  messages with `sessionId: null` in testing — the race is real even though a human's actual
  click-through speed makes it very unlikely to hit in practice.
- **Active** (after both modals are confirmed and the session is running): a **single-select** zone control — the
  general `checklistDropdownHTML`/`setupChecklistDropdown` component in `multi:false` (radio)
  mode, not the multi-select checkbox mode the faction dropdowns use, since a player can only
  be in one zone at a time (2026-08-24: was a plain `<select>` originally, converted to this
  searchable component for consistency with the "running theme" pattern, and single-select
  mode was generalized into the component specifically for this) — an attempts counter and a
  skill counter (`#fish-counter-box`/`#fish-skill-box`, two *separate* small boxes, each
  re-rendering only itself via `updateCounterBox()`/direct DOM mutation in `bindSkillEvents()`,
  never the surrounding form — same lesson as before about a keypress landing
  mid-interaction). The skill counter's value is a real `<input type="number">`
  (`#fish-skill-input`) the user can type into directly, not just +/- buttons. A grid of
  one-tap fish buttons (`renderFishPickGrid()`, sourced from `wikiData.nodes` filtered to
  Fishing, plus any typed in via "+ Add" this session) — **clicking a fish logs immediately**,
  no confirm step, no form to fill.
- **An optional free-text Area field sits next to Zone** (2026-08-24) — a specific lake,
  pond, or dock within a zone, since different bodies of water in the same zone can give
  different results. Unlike Zone this has no wiki-sourced fixed list (the wiki data has no
  sub-zone granularity for Fishing at all), so it's a plain `<input>` (`#fish-area`) with a
  `<datalist>` autocompleting from areas typed/logged this session
  (`refreshFishAreaDatalist()`). Deliberately not part of the pre-fishing modal flow — only
  Zone was asked for explicitly, Area stays an in-screen-only convenience. `logFishCatch()`
  and `flushPendingFishAttempts()` both read it fresh from the DOM at logging time, same
  reasoning as the zone-staleness lesson (see `CLAUDE-HISTORY.md`). Exported as `Area: X` on
  the entry line in `Write-HarvestingBlock` (`MnMFieldNotes.ps1`) when present, entirely
  generic/optional — non-Fishing harvesting entries never send it and the line is unaffected.
- **The fish-pick grid sorts/highlights by zone (and area) relevance and flags junk**
  (2026-08-24). `Get-WikiData` in `MnMFieldNotes.ps1` forwards each Fishing node's
  `locations` and `note` fields (previously only `name`/`tradeskill` were sent) so the client
  has what it needs:
  - **Junk has no structured field in the wiki data** — it only ever shows up as free text in
    a node's `note` (e.g. "A junk drop."), so `renderFishPickGrid()` matches `/junk/i` against
    it. Confirmed with the user 2026-08-24 as the intended approach over a hardcoded name list
    or a manual per-catch toggle — accept that it'll miss junk items whose note doesn't use
    that word (e.g. a "not a fish species" phrasing) until the wiki data gains a real field.
  - **"Expected in this zone"** is the union of the wiki's own `locations` for the selected
    zone *and* anything actually caught in that zone (and Area, see below - 2026-08-24) this
    session (`fishingSession.entries` filtered to `success && zone === selectedZone && area
    === selectedArea`) — a catch not yet reflected in the wiki's `locations` still surfaces
    as expected from that point on, re-rendered immediately (`logFishCatch()` calls
    `renderFishPickGrid()` after logging, and the zone dropdown's `onChange`/the area input's
    `input` listener both re-render it too). The wiki-sourced half of "expected" stays
    zone-only regardless of area, since the wiki data has no area granularity to filter by -
    only the session-observed half is area-scoped. Expected fish sort to the top under a
    "Expected in this zone" label; everything else sorts alphabetically below. Junk styling
    (dashed border, muted color) is independent of this and applies wherever the item lands,
    including inside the expected group.
  - Each button also shows a running `×N` catch count for this session (from
    `fishingSession.entries`), separate from the "new" badge (which means "not in the wiki's
    node list yet", still tracked independently).
- **No separate "No catch" button** (removed 2026-08-24) — a zero-catch cast is implied by
  the attempts counter going up without a fish click following it. `flushPendingFishAttempts()`
  sends whatever's accumulated in `fishingSession.liveAttempts` as a single `success:false`
  entry when the session ends. **Must fire before `endSession` is sent, not in the
  `sessionEnded` response handler** — the session no longer exists host-side by the time that
  response arrives, so a late-arriving flush would be silently rejected. See the `btnEnd`
  click handler in `ui/app.js`.
- **Fishing gets its own stats bar** (`#stats-fishing`, swapped in for `#stats-combat` by the
  tab-click handler) — kills/coin don't mean anything for a fishing session, so the tiles are
  Catches logged / Unique fish / Total attempts / Current skill / New for wiki instead,
  updated via `updateFishStats()` at every state change (catch, attempt, skill change, session
  end).
- **Skill is recorded once at session start and once at session end** (2026-08-24) —
  `startFishing()` sends a `fishingStarted` message the first time it runs each session
  (`fishingSession.startSkillSent` guards against repeats if the skill modal is reopened),
  and the `btnEnd` click handler sends `fishingEnded` with the current skill (gated on
  `fishingSession.startSkillSent`, so it's only sent if fishing was actually used this
  session) — both fire before `endSession`, same ordering requirement as
  `flushPendingFishAttempts()`, since the session must still exist host-side to accept them.
  Stored as `fishingStartSkill`/`fishingEndSkill` on that session's info in
  `$script:Sessions`. `Write-SessionExport` prints both as "Fishing skill at session
  start"/"...end" lines in the export header, separate from the per-catch `skill` value
  already on each harvesting entry. The end value exists specifically to catch skill-ups
  that happened without a catch following them (e.g. skilled up right before ending the
  session) — without it, that skill-up wouldn't show up anywhere in the export.

A **Lookup** tab searches the wiki's already-gathered data (read-only, live from its JSON
— see "Wiki data as a read-only reference" below), independent of session logging.

### Data model

Three distinct stores, not one — don't collapse them:

1. **All-time local log** — everything ever logged, own file(s) under this project,
   grows forever, is what the app's own Lookup/history features query. Not curated.
2. **Per-session export** — one plain-text file per session (confirmed with the user
   2026-08-24: one file per session, not an accumulating inbox-style file), containing
   only wiki-relevant fields — no session metrics like elapsed time or click counts.
   Grouped in a way that's easy for Claude to read and act on directly.
3. **Live session state** — in-memory while a session is running (the roster, stats bar,
   active-detail panel); becomes (1) and (2) when the session ends.

## Guild data trust model

Once shared, other guild members' exports are a second kind of input alongside the user's
own. Confirmed 2026-08-24: **trust guild-submitted data by default** — write it in the same
as the user's own, don't gate every entry behind a confirmation step. **Exception: if a
guild member's entry conflicts with something already recorded** (an existing wiki value,
or a different guild member's own report), **flag it for the user rather than silently
picking a side** — note the conflict and suggest further in-game testing to resolve it,
same spirit as the wiki's own "flag rather than guess" convention for ambiguous data.

To make conflicts identifiable at all, **every export should record who logged it** (a
name/tag the guild member enters once, not per-entry) — lost provenance is what would make
"this conflicts with what Alice reported" impossible to say later. This is a per-session
export concern, not a UI feature to build elaborate identity/accounts around — a plain text
field is enough.

## The To-Do folder

`To-Do/` (repo root) = user-requested future features not being built yet — mirrors the
wiki project's own `To-Do/` convention. Read `To-Do/planned-features.md` before starting
unscoped "keep building" work, so a half-formed idea from a past session doesn't get
silently skipped; when the user names something specific, build that instead of picking
from this list. Never treat an entry here as a current spec — each one still needs its own
scoping/confirmation pass when it's actually picked up.

## File layout

- `MnMFieldNotes.ps1` — the WinForms host: WebView2 initialization, the keypress-counter
  hook, and all message handlers (session lifecycle, log entries, export, wiki fetch). Owns
  every bit of file I/O and networking in the app.
- `ui/` — the actual UI: `index.html` + `style.css` + `app.js`, served into the WebView2
  control via `SetVirtualHostNameToFolderMapping` (virtual origin `appassets.local`, not
  `file://`). `app.js` has a `hasHost` check with a dev-only mock host
  (`mockHostRespond`) so the UI can be iterated on/previewed in a plain browser via
  `lib/serve-ui.ps1` — the mock branch never runs inside the real app.
- `Start.vbs` — silent launcher (runs the script with no console window).
- `lib/webview2/` — gitignored fetched DLLs (see Architecture above).
- `lib/serve-ui.ps1` — throwaway static file server for previewing `ui/` in a plain browser
  during development (not used by the shipped app at all).
- `lib/webview2-smoketest.ps1`, `lib/keyhook-spike*.ps1` — standalone diagnostic scripts kept
  as reference for how the WebView2 init sequence and the keyboard hook were validated in
  isolation. Not part of the app; safe to ignore unless this area breaks again.
- `README.txt` — user-facing docs. Keep in sync with actual behavior.
- `Data\` — gitignored; `AllTimeLog.jsonl` (append-only, every entry ever logged),
  `Profiles.json` (saved profile names + last-used, see "Profiles" above),
  `WebView2UserData\` (WebView2's own profile folder), `error.log` (written by the global
  `ThreadException` handler — see "PowerShell/WinForms gotcha" above).
- `Sessions\` — gitignored; per-session export `.txt` files land here.

## Wiki data as a read-only reference

The wiki's structured JSON data — `items.json`, `monsters.json`, `crafting.json`,
`gathering-nodes.json`, `vendors.json`, `trainers.json`, `maps.json`, `companions.json`,
`spells.json`, `tradeskills.json`, `gemstones.json` — is used two different ways, over two
different channels. Don't conflate them:

1. **Claude, while building/debugging this app**: reads the local repo directly at
   `D:\Claude files\MonstersAndMemories-Wiki\` — ordinary same-machine file access (`Read`/
   `Grep`/`Glob`), same as reading any other file on this computer. Nothing to do with the
   app's own runtime behavior below.
2. **The running app itself, at runtime** (Lookup tab, autocomplete while logging): always
   fetches from the **published site**,
   `https://distractibled.github.io/DistractibleD-MonstersAndMemories-Wiki/<file>.json`,
   over ordinary HTTPS — the same request any browser makes visiting the live wiki. This is
   deliberately the *only* data-source path in the app's own code, for every user including
   the project owner — no local-file-path special case, confirmed 2026-08-24 specifically
   to keep the mental model simple: **one copy of this app never talks to another copy, or
   to anyone else's computer, under any circumstance.** The only network endpoint the app's
   own code ever touches is that one public URL. The one tradeoff: a wiki edit not yet
   pushed/deployed won't show up in the app until it is — acceptable, don't try to work
   around it with a local-file fallback.

**Read-only, both channels, always.** Never create, edit, or delete anything in the local
wiki repo from this project — no exceptions, and this project's own git history/commits
must never touch that repo or its remote. The published site is fetched with a plain GET,
never written to. That repo's own `CLAUDE.md` documents its full data schema/conventions if
a lookup needs more context than the raw JSON gives.

This does not weaken the Secrecy rules above — the relationship is strictly one-directional
(this project may read the wiki's data; the wiki repo itself must never gain any file,
commit, or text mentioning this project).
