# Planned features

Gap-tracking/roadmap list for this project, mirroring the wiki project's own `To-Do/`
convention — never built from unless the user actually asks to start on one, and not
something a session should treat as a current spec. Claude picks the order when the user
says "keep building" without naming something specific; when the user names a specific
idea from here, that's the one to build.

## 1. ~~Push session exports to GitHub~~ — built (2026-08-27), needs deployment to actually work

Built exactly as scoped below: reused the wiki's own Worker (extended, not replaced), one
new hard rule, human-review-by-PR as the trust model. Full mechanism documented in
`CLAUDE.md` "Session export submission" — not duplicated here.

**One remaining step before this does anything real: the user has to paste
`lib/cloudflare-worker/submit-worker.js` into the Cloudflare dashboard and redeploy.**
Until that happens, the "Submit" banner will always come back with an error (verified —
the currently-live Worker doesn't recognize the `sessionExport` field yet, and correctly,
safely rejects it with its own existing "Please attach a screenshot or write a note." error
rather than doing anything unexpected).

Verified before deployment: the Worker's routing/honeypot/oversized-export/backward-compat
logic (browser-based unit tests against the actual file), the PS-built multipart body
(round-tripped through a real `Request.formData()` parse), and the real network path itself
(a live POST to the actual deployed Worker, which correctly parsed it and rejected it for
the expected reason — confirms the wire format and connectivity both work, with zero side
effects since no PR was possible without a recognized field).

Original scoping notes, all resolved as above:
- ~~Reuse, don't rebuild, if possible~~ — confirmed with the user, reused.
- ~~This is a real scope change, not a small addition~~ — confirmed with the user, `CLAUDE.md`
  hard rules updated before any code was written (new hard rule #3 + "Session export
  submission" section).
- ~~Every submission still needs a human merge/review step~~ — this is exactly what merging
  the Worker's PR already requires; no separate gate was added on top.

## 2. Photo attachments (2026-08-24)

Let a session log entry attach a screenshot (e.g. a chat message, an item card, a faction
change) alongside the typed fields, sent through the same submission pipeline as #1 once
that exists. Depends on #1 being built first — no separate submission path planned for
just images.

## 3. ~~Cooking as its own tab~~ — done (2026-08-25)

Built as a full tab — roster + active-detail pattern (like Harvesting, not Fishing's one-tap
grid, since a cooking attempt is a discrete multi-field event). Dishes carry `stats`/
`resists`/`haste` using the exact vocabulary already live in `items.json`'s Food entries
(turned out the schema gap assumed above didn't actually exist — checked the real data
first). Stat/resist selection is a searchable checklist dropdown (picks *which*), paired
with a small value input per checked one (captures *how much* — the checklist component
alone can't express a magnitude). Entries export under `sessionType: 'crafting'` via a new
`Write-CraftingBlock`, grouped by dish with the buff line printed once per dish rather than
repeated per attempt. See "Cooking" in `CLAUDE.md` for the full design. Explicitly kept
separate from Fishing/Combat state per the user's request — own Map, own DOM ids, nothing
shared beyond generic UI helpers and the wiki reference data. Verified in the mock preview:
adding a dish, picking/unpicking stats, logging an attempt, and confirming the roster/stats
bar/log all update correctly; a live run confirmed `crafting.json` fetches cleanly.

## 4. ~~Update check~~ — done (2026-08-25)

Version check + prompt built (see "Update checking" in `CLAUDE.md`). Deliberately NOT a
self-updater — "View release" opens the releases page, user downloads/replaces manually.
Hosting: `mnm-field-notes` repo (public, git identity = GitHub noreply email so the user's
real email stays off any public commit) — originally a separate `mnm-field-notes-releases`
repo holding just `latest.json` + release zips, merged into the app source repo 2026-08-26
once keeping source private stopped mattering (see "Update checking" in `CLAUDE.md` for the
full story). v0.1 and v0.2 have both been cut and published.

Still open:
- **Dev folder stays named `MnM Loot Tracker` on disk (2026-08-26)** — renaming it to match
  the app's current name was considered and explicitly declined, not worth the session
  disruption (this folder is the hard-anchored working directory for the whole dev session).
  This means **whoever builds the release zip must not just zip this folder as-is** — the
  zip's own top-level folder/file naming needs to reflect "MnM Field Notes", not "MnM Loot
  Tracker", regardless of what the source directory on disk is called. The user's own words:
  "As long as the install my org mates get contains the real app name and not this old one
  i am happy" — the dev folder's name is exempt from that, only the distributed artifact
  isn't.
- **No installer, and intentionally so** — the app is portable (no registry/Program
  Files/services), so "install" = unzip + run `Start.vbs`, "uninstall" = delete the folder.
  A traditional installer would add real downsides (unsigned `.exe` triggers SmartScreen)
  for no real benefit at guild scale. Still needs an `INSTALL.txt` in the distributed zip
  explaining what's inside and why, for guild members who aren't the project owner.

## 5. "Add info" contribution tab (2026-08-27)

User's own framing: unlike the wiki (screenshots only), let users add STRUCTURED data
straight from the app — dropdowns, not free text, so it's consistent/parseable. Explicitly
scoped OUT of the 2026-08-27 "landing info" pass (see `CLAUDE.md` "Landing info") since it's
a genuinely separate, much bigger feature — needs its own design session, not a bolt-on.

Rough shape from the user's own description, not yet scoped/confirmed:
- A "What do you want to add?" entry dropdown — Named Monster, Camp, (Item?) as the first
  choices.
- **Named Monster**: level, a free-text comment on where in the zone it's found, drops (item
  name autocompletes against wiki data if it matches; if not found, a separate "add item"
  flow captures full item-card fields via dropdowns rather than free text).
- **Camp**: level range, general area, which regular + named monsters live there.
- User's own suggestion: **try to build Camp and Named off the same underlying
  form/function** — significant field overlap (level, area, monsters-present), worth
  checking during design rather than assuming they're separate before scoping it.
- **Zone-level min/max/avg level** — could go either of two very different ways: (a) a wiki
  schema addition (new fields on `maps.json`, would need the wiki owner's OK — this project's
  wiki repo is read-only, see "Wiki data" in `CLAUDE.md`), or (b) an app-computed empirical
  estimate from Combat's own logged `playerLevel`+`con` per zone, same pattern as Fishing's
  rarity bars (`Get-FishRarity`) — no wiki changes needed for (b). Worth deciding which
  before building, not assuming (a).
- Whatever a user submits here still needs the same human-review trust model as everything
  else this app produces (see "Guild data trust model" in `CLAUDE.md`) before it's real wiki
  data — this tab produces submittable data, it doesn't write to the wiki directly, matching
  how session exports already work.

## 6. ~~Combat landing info: regular monsters + zone level range~~ — done (2026-08-27)

Two additions were scoped to Combat's existing "browse a zone" landing section (see
`CLAUDE.md` "Landing info"), alongside the named-monster list already built:
- ~~Regular (non-named) monsters found in the picked zone~~ — done, `renderCombatRegularInfo()`
  in `app.js`, mirrors the named-monster list (collapsible, searchable, "View on wiki" link to
  the wiki's own parallel `#monsters-regular/<zone>` route, confirmed against the wiki's real
  hash scheme rather than assumed).
- ~~The zone's level range~~ — done, went with the app-computed estimate (wiki schema addition
  was effectively ruled out anyway — this project's wiki repo is read-only, needing the wiki
  owner's OK to add a field there wasn't a call to make unilaterally). `Get-CombatZoneLevelRange`
  in `MnMFieldNotes.ps1` mirrors `Get-FishRarity`'s pattern exactly (min/max `playerLevel` per
  zone, all-time local history, `MIN_LEVEL_RANGE_KILLS = 5` gating the estimate the same way
  `MIN_RARITY_ATTEMPTS` does).

## 7. Combat: camp selector + dedicated "add camp/named" entry point (2026-08-27)

- Let the user narrow Combat's landing browse from "whole zone" down to one camp within it.
  **Blocked on real camp data existing** — checked `monsters.json`/`maps.json`, there is NO
  structured "camp" concept anywhere in the wiki today (camp names only ever show up as
  free-text inside a monster's `areas`, e.g. "Corrupted Ashira Camp"). This can't be built
  until #5's "add camp" authoring flow (or a wiki addition) produces real, structured camp
  data to select from — check that exists first, don't build a selector with nothing to
  select from.
- A dedicated "add camp or named" entry point reachable from the Combat tab specifically —
  this is #5 above, not a new feature (user's own words: "we already talked about this new
  feature"), just confirms Combat should be one of its entry points once #5 is built.

## 8. ~~Gathering: user comment on "where to find this"~~ — done (2026-08-27)

A lighter-weight cousin of #5's full contribution tab: let a user attach a quick free-text
"where can you find this" comment to a node, surfaced via the SAME `data-tip` tooltip
pattern already used everywhere else (see the combined-tooltip work in `CLAUDE.md`
"Gathering").

Built as a purely local note (never submitted/shared, unlike #5's eventual contribution
data) — `Get-GatherNotes`/`Save-GatherNote` persist `Data\GatherNotes.json`, same pattern as
`Profiles.json`. Entry point is a collapsed-by-default toggle in the gather-material modal
(collapsed since that modal opens on every gather — an always-visible field would clutter a
fast, repetitive action), auto-saving on blur. See "Gathering" in `CLAUDE.md` for the full
mechanism. Doesn't make #5 redundant — #5's contribution tab is still the bigger, shared/
submittable version of structured data; this is just a quick personal reminder.

## 9. Tooltip discoverability + coverage (2026-08-27)

- ~~A small, easy-to-spot hint in each tab noting hovering things shows more info~~ — done
  (2026-08-27), `#tooltip-hint` in `index.html`, shown only on Combat/Gathering/Fishing/
  Cooking (the tabs with real `data-tip` content), toggled from the tab-click handler in
  `app.js` against a `TABS_WITH_TOOLTIPS` set.
- Still open: expand tooltip coverage so every node in Gathering and Fishing has SOMETHING to show, not
  just the ones that happen to have a wiki `note`/location-detail/difficulty-tier already.
  Needs scoping first: what should a node with genuinely nothing to say show — nothing (an
  absent tooltip, current behavior) vs. some kind of "no data yet" placeholder?

## 10. ~~Fishing: "average time between attempts"~~ — done (2026-08-27)

A new session-only stat — explicit user caveat: do NOT persist/aggregate this across
sessions or use it for anything beyond that one session's own display, since breaks between
casts (stepping away, alt-tabbing) would silently skew it. Still genuinely useful for a user
who wants a rough feel for how fast they're actually casting during one sitting.

Built as `fishingSession.attemptTimestamps` (in-memory only, never exported/persisted) - one
`Date.now()` pushed per real attempt (a manual `+` or an auto-counted keypress; the `-`
correction button does NOT push one). `formatAvgCastTime()` averages first-to-last gap across
those timestamps, shown as a new "Avg. time between casts" stat tile (`#fs-avgtime`) with the
session-only caveat repeated in its own tooltip. Verified with synthetic timestamps (exact
10s gaps -> "10s", a 125s two-point gap -> "2m 5s", one timestamp -> "—") and with the real
click/key-count paths.

## 11. ~~Landing info: explain WHY to pick a zone, per tab~~ — done (2026-08-27)

Replace the generic "Select a zone to see more." wording (Combat/Fishing/Gathering's landing
sections, see `CLAUDE.md` "Landing info") with tab-specific, benefit-oriented copy — e.g.
"Pick a zone to see how rare each fish is" / "Pick a zone to see which named monsters live
there". Wording is Claude's call when built, but same standing rule as everywhere else in
this app: written for the player reading it, not describing the feature back to the project
owner.

## 12. ~~Tab polish: under-construction marker + hide Lookup~~ — done (2026-08-27)

- Crafting and Multi currently just show a plain `.stub` message — user wants a prominent
  (their words: "big orange") under-construction treatment instead, so an empty tab reads as
  "not built yet" rather than "broken/empty". Built as `.under-construction` (`#ff8c00`
  background, bold) above the existing stub text in both panels.
- Hide the Lookup tab from the visible tab bar — keep the feature/code, just stop surfacing
  it in navigation for now. Done via `style="display:none;"` on the tab button only — the
  panel/code/`#lookup-input` are untouched, so it can be un-hidden trivially if needed. Why
  it's being hidden was never actually asked (redundant with landing info? superseded by
  Maps below?) — the original instruction was explicit and unconditional, so this was built
  as asked without blocking on that curiosity.

## 13. Maps tab — pan/zoom map viewer (2026-08-27)

A new top-level tab. Existing precedent worth reusing rather than building pan/zoom from
scratch: the wiki already has its own full-screen pan/zoom map lightbox
(`#map-viewer`/`#map-viewer-img` in the wiki's `style.css`/`script.js`) — check whether that
implementation (or its approach) can be mirrored/adapted here before inventing a new one.

The wiki's 29 map images vary wildly in resolution (400×631 up to 9702×5821, 20x+
difference), aspect ratio, and per-zone variant count (several zones have 2-4 map images —
isometric/mob-levels/numbered/schematic — not one canonical map). **User's own call,
2026-08-27, after checking the actual assets: this is NOT a blocker for the viewer itself**
— pan/zoom just adapts to whatever image it's given, same as it already does on the wiki
today. Only relevant once pins (#14) exist — see that item for why. One unrelated loose end:
`aethoril.webp` couldn't be read by a standard .NET image check while inspecting these —
likely fine in WebView2's own Chromium engine, but worth confirming rather than assuming.

## 14. Maps tab — user pin annotations (2026-08-27)

Depends on #13 existing first. User-contributed pins placed on the map:
- Small icon + tooltip (reuses the app's own `data-tip` system) — the tooltip is the user's
  own free-text comment about what's found there or why the spot's worth noting.
- Two pin-ownership tiers: the user's OWN pins (local, immediate, no review needed), and
  OTHER users' shared pins — explicitly deferred, user's own words: "we will build this
  later." Sharing pins raises the same submission/review-pipeline questions as #1 (Push
  session exports to GitHub) and the same trust-model questions as "Guild data trust model"
  in `CLAUDE.md` — don't assume that mechanism, decide it fresh when this is picked up.
- Pin categories + filtering — Gathering pins, Camp pins, Fishing pins, etc. (taxonomy not
  yet decided — check whether it should mirror the app's own tab set 1:1 or be its own list).
- Real open questions for whenever this is picked up, not yet answered: pin coordinate
  system relative to the map image (percentage-of-image vs. pixel-based, and how that
  survives the image being re-exported/resized), where a user's own pins are stored
  (`Data\`, presumably, matching everything else this app persists locally), and the
  category taxonomy itself.
- **This is where #13's map-inconsistency findings actually matter** (they don't block the
  viewer itself — see #13): a pin has to anchor to ONE specific image. A zone with 2-4 map
  variants (isometric/mob-levels/numbered/schematic, see #13) means deciding which variant a
  pin belongs to, whether it's pinned to just one variant or needs to appear on all of them,
  and what happens to existing pins if a map image later gets replaced/re-cropped/resized on
  the wiki side (percentage-of-image coordinates survive a resize; they don't survive a
  re-crop or a swap to a differently-composed image). Decide the coordinate system with this
  in mind, don't bolt it on after the fact.

## 15. ~~Normal-theme text readability~~ — done (2026-08-27)

User's own words: "The gray font in the normal app skin is a bit hard to read, messages
might get lost to users not familiar with the app. Please make the text around the app more
visible, or in a easier-to-read color." Scoped to the DEFAULT (dark) skin, not the Win98
easter-egg theme.

Measured actual WCAG contrast ratios (via the standard relative-luminance formula) rather
than guessing which variable was the offender: `--text-secondary` (#9a9ba3) already cleared
4.5:1 against every background surface in the app (~5.5-6.6:1), but `--text-muted` (#6b6c74)
measured only ~2.9-3.5:1 against `--bg-page`/`--bg-surface`/`--bg-raised` — clearly failing
AA's 4.5:1 minimum for normal text, confirming it was the real offender. Changed
`--text-muted` to `#8b8c94`, which measures ~4.5-5.5:1 across all three surfaces. Only that
one variable changed — `--text-primary`/`--text-secondary` were already fine and left as-is.
Win98 theme is a separate easter egg and wasn't touched.

## 16. ~~Desktop/taskbar-pinnable icon~~ — done, confirmed on a real machine (2026-08-28)

User asked whether the app can be pinned to the Windows taskbar today — confirmed it
couldn't, for three compounding reasons (icon + AppUserModelID + `Start.vbs` being a script
rather than something with its own identity). The first fix attempt (`$form.Icon` set at
runtime + `SetCurrentProcessExplicitAppUserModelID`, PS1 era) **turned out insufficient** —
user tested pinning on a real machine and it still showed the plain PowerShell icon, because
Windows resolves a pin's icon/identity from the launch executable's own file, not anything
set at runtime inside it.

**Actual fix**: migrated the app to a compiled `MnMFieldNotes.exe` (see CLAUDE-HISTORY for
the full migration writeup) with `app.ico` embedded directly into the exe's PE resources at
build time (`csc.exe /win32icon:app.ico`, `src/build.ps1`). User re-tested pinning after the
migration and **confirmed it now shows the app's own icon correctly**. See "Taskbar-pinnable
icon" in `CLAUDE.md` for the full mechanism.

`legacy/Start.vbs`/`legacy/MnMFieldNotes.ps1` (the old host) no longer need `app.ico` copied
alongside them — they're not shipped in release zips any more. Whoever builds a release now
just needs to run `src/build.ps1` with `app.ico` present before zipping.

## 17. ~~Fishing: clarify "click the fish you caught" wording~~ — done (2026-08-27)

User wants the label at `app.js` around line 1928 (`<label>Click the fish you caught</label>`)
changed to add "as you catch them" — making explicit that this is a click-every-time action,
not a one-time setup step, for users unfamiliar with the app's flow.

## 18. ~~Fishing: the catch-logged toast blocks the fish grid~~ — done (2026-08-27)

User's own words: "The popup box that pops whenever you click a fish blocks the fish window
in a somewhat annoying way." That's the shared `.toast` (`showToast()` in `app.js`, styled in
`style.css` around line 201) — positioned dead center of the screen
(`position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);`), which sits right on
top of the fish-pick grid it was just triggered from.

Fixed via an opt-in `.toast-corner` modifier (`showToast(text, corner)`, second arg defaults
false) rather than changing the shared toast for everyone — plain center placement stays the
default for errors/guards ("start a session first", etc.). Applied to both the fish-catch
confirmation and Gathering's material-log confirmation, since that has the identical "toast
lands on the grid you just tapped" problem.

## 19. ~~Fishing: sort caught fish ahead of merely-expected fish~~ — done (2026-08-27)

User's own words: "Expected fish should always sort behind currently caught fish." Today,
`renderFishPickGrid()` in `app.js` (around line 2205) puts a fish in the "Expected in this
zone" box if it's either wiki-expected OR already caught this session (`expectedNames` merges
both), then sorts that whole box alphabetically — so a fish the user has actually caught can
still land behind a never-caught-but-wiki-expected fish just because of alphabetical order.

Fixed by sorting caught fish (`catchCounts[f] > 0`) ahead of merely-expected ones within the
box, alphabetical within each tier. Scoped to Fishing only, matching the user's report —
Gathering's node grid has the identical pattern but wasn't touched, since it wasn't what was
asked about.

## 20. ~~Shared/pooled data across guild members~~ — done for Fishing (2026-08-27)

User's own words: "I want as much data as possible. Any data we can use to predict rarity or
use as statistics in our app and on the wiki. Shared datasets sounds wonderful to me."

Built as a two-repo pipeline: the wiki-side half (a separate Claude session working in the
wiki repo) added a GitHub Action that aggregates every merged `session-exports/*.txt` file
into a published `fishing-rarity.json` on every merge (plus manual dispatch) — see that
repo's `CLAUDE.md` "Session exports & pooled Fishing rarity". The app-side half
(`Get-SharedFishRarity` in `MnMFieldNotes.ps1`) fetches that file and `computeZoneRarity()`
sums it in alongside the local baseline — see "Rarity bars" in this repo's `CLAUDE.md` for
the full mechanism, including the one accepted double-count caveat (a locally-logged session
that's ALSO been submitted/merged counts in both totals).

Verified against the real live endpoint (already serving real merged data by the time this
was built — confirmed via `curl`, then through the actual PS function + JSON encoding, then
the full `SV_AUTOTEST` harness).

**Still open**: this was explicitly scoped to Fishing rarity only, since that's the only stat
the app currently computes — the user's original ask covers "any statistic," so drop rates,
gathering yields, etc. would need the same treatment if/when the app computes those itself.
The wiki-side script's line-parser was written generically enough to be reused for a future
stat without a rewrite, per the wiki-side session's own report.

## 21. Fishing: trim the key-listening modal's explainer text (2026-08-28)

`#fish-key-modal` (`ui/index.html`) currently reads: "Press the key you use to fish. From
then on the app counts that key everywhere — it never touches the game itself." User's own
words: remove "the app only ever watches for that one key, and never touches the game
itself" — that's a trust/policy statement, already covered in `README.txt`, and doesn't need
to live in the app's own UI. Standing rule going forward, not just this one modal: app copy
should describe what a button/control *does*, not restate the app's own privacy/safety
policy — keep it out to save space, especially given this app's portrait-2nd-monitor layout
is already tight on room (see CLAUDE.md "Visual style"). Worth a quick pass over other modals/
labels for the same pattern when this is picked up, not just the one sentence flagged here.

## 22. Skill counter boxes show doubled up/down controls (2026-08-28)

`#fish-skill-input`/`#gather-skill-input` (`ui/app.js`) are real `<input type="number">`
fields sitting next to the app's own `-`/`+` buttons — but a real number input also gets the
browser's own native up/down spinner arrows rendered inside the field itself, so there are
two redundant sets of increment controls stacked together (seen in a real screenshot: the
side `-`/`+` buttons plus tiny up/down arrows inside the box). User's own words: "the + and -
on the sides are enough" — hide the native spinner via CSS
(`::-webkit-inner-spin-button`/`::-webkit-outer-spin-button { display: none; }`, or
`-webkit-appearance: none` on the input, matching WebView2's Chromium engine) rather than
switching away from `type="number"`. Also confirm manual typing into the field still works
after that change — it already should (that's the whole point of using a real number input
here per CLAUDE.md's Fishing section), just worth double-checking nothing about hiding the
spinner accidentally affects it.
