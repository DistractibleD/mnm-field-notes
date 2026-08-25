# CLAUDE.md

Rules below = non-negotiable. History/postmortems → `CLAUDE-HISTORY.md` (on-demand, not
autoloaded). This file = current rules/architecture only. Written compact for Claude's own
parsing, not prose for human reading — user won't read/edit this file.

## What this is

Personal 2nd-monitor manual-entry companion for *Monsters and Memories* ("MnM Field Notes").
User types everything after observing on screen — app never reads game files/process/memory,
never interacts with the game. = notebook, not a reader. Two jobs: (1) fast live logging
(Combat/Harvesting/Crafting/Fishing/Cooking), (2) searchable lookup over sibling wiki data.
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

## Naming

"MnM Field Notes" — renamed from generic "Session Viewer"/`SessionViewer.ps1`. Old
genericness = hiding from NWC devs specifically; moot now (user told NWC they can see the
code). Current: window title (`$form.Text`), script file `MnMFieldNotes.ps1`, `<title>`/`<h1>`
in `index.html`. Keep new UI naming consistent with this, don't revert to generic. `Start.vbs`
keeps its own name (functional label, never part of the old generic-from-devs surface).

## Visual style

`ui/style.css` `:root` palette/fonts (Sora headings, Inter body) copied from the wiki's own
`style.css` `:root` — same var names, same hex values. `--accent-craft` (wiki's teal) =
"different session type" marker, used for Harvesting/Crafting/Cooking active-tab state
instead of gold. If the wiki's palette/fonts change, pull from there, don't invent new ones.

Responsive, tuned for portrait 2nd monitor (1080×1920) but fine landscape too. `.layout`
stacks <900px width. `.stats`/`.field-grid` use `repeat(auto-fit,minmax(...))`.
`$form.Width`/`Height` = 900×1500 default (resizable).

## Architecture

PS 5.1 + WinForms hosting a WebView2 control (no browser chrome), HTML/CSS/JS UI. No
Node/npm/.NET SDK needed — WebView2 Runtime ships with Win11/Edge, the 3 control assemblies
pulled raw from NuGet. Setup details: CLAUDE-HISTORY.

- PS host owns ALL file I/O + networking (wiki fetch, all-time log, session export).
  WebView2 page = UI only, round-trips via `WebMessageReceived`/`PostWebMessageAsString`.
- `lib/webview2/*.dll` — gitignored redistributables. Re-fetch from NuGet's flat-container
  API if missing (URL pattern + init sequence: CLAUDE-HISTORY).

### Gotcha: Timer inside a nested handler must be `$script:`-scoped

A Timer created inside another handler's own scriptblock (e.g. inside `Add_Shown` or a
`WebMessageReceived` case) MUST be `$script:` scope, never local —
`$timer.Add_Tick({$timer.Stop()...})` resolves `$timer` to `$null` inside its own closure
when declared ≥2 levels nested → "cannot call method on null-valued expression" every tick,
infinite loop. Caused 2 real crashes (CLAUDE-HISTORY "Harvesting/Fishing keypress counter").
Top-level-scope Timers (1 level nesting) are fine. When in doubt: `$script:` it.

### Gotcha: native hook callbacks must be minimal

`SetWindowsHookEx` callback = flag/counter only, nothing else. NEVER call `Send-ToUI` or
anything that re-enters PS/WebView2/COM from inside the native callback. Use a separate
`$script:`-scoped polling Timer to actually react. Why: (1) caused the crash above, (2)
Windows silently uninstalls slow hooks.

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
which has its own paragraph). Current coverage: session-bar Start/End, profile dropdown,
Combat's 2 faction dropdowns, Fishing's Area field.

### Checklist dropdown — standard "pick any number, searchably" pattern

`checklistDropdownHTML`/`setupChecklistDropdown` = app-wide answer for multi-pick lists.
Toggle button → 2-col checkbox panel + live search, auto-focused. **Use this for ANY future
multi-pick control**, not a plain `<select>`/hand-rolled list — explicit standing request
("running theme... find what we're looking for as fast as possible").

Filtering hides non-matching `.checklist-option` (`filtered-out` class), doesn't remove —
checked state lives on the `<input>` DOM nodes, removing would lose it. Verify: check while
filtered, clear search, check survives.

### Session types and fields

Combat/Harvesting/Crafting = roster + active-detail pattern (sidebar of things encountered
this session; click → active; quick-entry fields apply to it). Multi = mixes all 3 in one
roster. Mirrors the wiki's `conObservations` model (same species, multiple kills, each own
con/level).

- **Combat**: monster, zone, con+level, coin (total off corpse), items, named y/n,
  `factionChanges` (2 checklist dropdowns pos/neg, from `monsters.json` `factionEffects`,
  60+ entries). Logged as `[{faction,effect}]` — same shape as the wiki's own.
- **Harvesting**: tradeskill (Mining/Lumberjacking/Herbalism/Foraging; Fishing has its own
  tab), node, zone, skill, success/fail, resultItem.
- **Crafting**: tradeskill, recipe, skill, difficultyColor, components. Still a stub
  (`#panel-craft`) for everything except Cooking (own tab, see below).

**Session-level export label** (`session.type` in `app.js`, export header/filename) derives
from the active tab at "Start session" click time (`TAB_SESSION_TYPE` map — fishing/harvesting
kept as distinct labels even though both log `sessionType:'harvesting'`; the label is
display-only). Past bug: `btnStart` used to hardcode `session.type='combat'`, silently
overriding the tab. Now reads `.tab.active` at click time. If this breaks again, check BOTH
assignment sites (tab-click handler AND `btnStart`).

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
- **No "No catch" button** (removed) — implied by the attempts counter rising without a
  catch. `flushPendingFishAttempts()` sends the remainder as `success:false` at session end.
  MUST fire before `endSession` (session no longer exists server-side after).
- **Own stats bar** (`#stats-fishing`): Catches/Unique fish/Attempts/Skill/New-for-wiki.
- **Skill recorded at session start** (`fishingStarted`, once, guarded by `startSkillSent`)
  **and end** (`fishingEnded`, same guard) — both fire before `endSession`. Catches
  skill-ups with no catch following.
- **Key-spam guard**: 3+ `keyCounted` messages within 1 second → `checkKeySpam()` pauses
  listening, toast + "Resume listening" banner. Entirely client-side — do NOT touch the
  native hook/poll timer for this (must stay minimal, see gotcha above).

### Cooking — own tab, roster+detail (like Harvesting, not Fishing)

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

1. **All-time log** — append-only, ONE exception: still-running-session Fishing entries are
   editable via a client-generated `id` (`genId()`) + `editEntry` → `Edit-AllTimeLogEntry`
   rewrites that JSONL line in place. Scoped to the active session only (export already
   written once ended). Editing `zone` must also patch `target` (the export's grouping
   field) or the corrected entry stays under the old zone's header. Combat/Harvesting have
   no edit UI yet — mechanism is generic, just needs UI.
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

- `MnMFieldNotes.ps1` — WinForms host, all file I/O + networking, all message handlers.
- `ui/` — `index.html`+`style.css`+`app.js`, served via `SetVirtualHostNameToFolderMapping`
  (origin `appassets.local`, not `file://`). `hasHost` check + dev mock (`mockHostRespond`)
  for browser preview via `lib/serve-ui.ps1` (mock never runs in the real app).
- `Start.vbs` — silent launcher.
- `lib/webview2/` — gitignored DLLs.
- `lib/serve-ui.ps1` — dev-only preview server, not shipped.
- `lib/webview2-smoketest.ps1`, `lib/keyhook-spike*.ps1` — isolated diagnostic scripts,
  reference only.
- `README.txt` — what the app does/how to use it, keep in sync.
- `INSTALL.txt` — setup/uninstall/update guide for someone who just received a copy. Written
  entirely as "you" addressed to that recipient, never to the project owner — no "it's fine
  to share this" framing, that's not their concern to read about.
- `Data\` (gitignored): `AllTimeLog.jsonl`, `Profiles.json`, `WebView2UserData\`,
  `error.log` (ThreadException handler).
- `Sessions\` (gitignored): per-session export txts.

## Update checking

Version = plain incrementing integer (`$script:AppVersion` in `MnMFieldNotes.ps1`), compared
with `[int]`, never `[string]` — string comparison breaks once a segment hits 2 digits
(`"10" < "9"` lexicographically). Integer + numeric comparison sorts correctly forever, no
padding/bookkeeping. A date-based scheme was tried first and dropped: same day = same
version string = second same-day release never triggers a prompt for anyone already on the
first. `$script:AppBuildDate` (separate constant, `yyyy-MM-dd`) is shown alongside the
version in the masthead purely for human "how stale is this" context — not used in the
comparison at all. Checked against
`https://raw.githubusercontent.com/DistractibleD/mnm-field-notes-releases/main/latest.json`
(`{version,url}`) via `Get-UpdateInfo`, called automatically on `ready` and manually via
`checkForUpdates` msg (the "Check for updates" link in the masthead). Never blocks, never
auto-applies — result rendered as a dismissible `#update-banner` (only when a newer version
exists) or a toast (manual check only, so silent background checks don't nag). "View
release" sends `openUrl` to the host (`Start-Process`, `http(s)://` validated first) rather
than a plain `<a target=_blank>` — avoids WebView2 popup-window quirks, always opens the
system browser. Releases repo (`mnm-field-notes-releases`, separate from this repo and from
the wiki repo, git identity = GitHub noreply email) holds only `latest.json` + release zips,
no app source. No self-update — download/replace is manual, deliberately, given the
trust-boundary jump of an app downloading+running its own replacement code.

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

**Read-only, both channels, always** — never create/edit/delete in the wiki repo, never let
this project's git history touch it or its remote. Published site = `GET` only, never
written to. One-directional: this project reads wiki data, never the reverse.
