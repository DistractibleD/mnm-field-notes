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
  60+ entries). Logged as `[{faction,effect}]` — same shape as the wiki's own.
- **Crafting**: tradeskill, recipe, skill, difficultyColor, components. Still a stub
  (`#panel-craft`) for everything except Cooking (own tab, see below).

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

1. **All-time log** — append-only, ONE exception: still-running-session Fishing/Gathering
   entries are editable via a client-generated `id` (`genId()`) + `editEntry` →
   `Edit-AllTimeLogEntry` rewrites that JSONL line in place. Scoped to the active session only
   (export already written once ended). Editing the grouping field (`zone` for Fishing,
   node-type `target` for Gathering) must also patch `target` (the export's grouping field)
   or the corrected entry stays under the old header. Combat/Crafting have no edit UI yet —
   mechanism is generic, just needs UI.
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
- `Data\` (gitignored): `AllTimeLog.jsonl`, `Profiles.json`, `GatherNotes.json`,
  `WebView2UserData\`, `error.log` (ThreadException handler).
- `Sessions\` (gitignored): per-session export txts.

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
redirect for a future rename, repoint both by hand and verify. No self-update — download/replace is manual,
deliberately, given the
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

**Read-only for DATA, both channels, always** — never create/edit/delete a file in the wiki
repo, never let this project's git history touch it or its remote (see "Session export
submission" below for the one narrow exception — a network POST to a Worker the wiki repo
already hosts source-for, not a git write, and this project's own copy of that Worker's code
lives here, not there — the wiki repo's copy stays untouched). Published site = `GET` only,
never written to.

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
- PS 5.1 has no `-Form` parameter on `Invoke-WebRequest`/`Invoke-RestMethod` (that's PS 6+
  only) — the multipart/form-data body is built by hand. See `Submit-SessionExport` in
  `MnMFieldNotes.ps1`.
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
