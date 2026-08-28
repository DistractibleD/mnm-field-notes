# Planned features

Gap-tracking/roadmap list for this project, mirroring the wiki project's own `To-Do/`
convention — never built from unless the user actually asks to start on one, and not
something a session should treat as a current spec. Claude picks the order when the user
says "keep building" without naming something specific; when the user names a specific
idea from here, that's the one to build.

## 1. ~~Push session exports to GitHub~~ — done, deployed and confirmed working (2026-08-28)

Built exactly as scoped below: reused the wiki's own Worker (extended, not replaced), one
new hard rule, human-review-by-PR as the trust model. Full mechanism documented in
`CLAUDE.md` "Session export submission" — not duplicated here.

**Deployed**: the user pasted `lib/cloudflare-worker/submit-worker.js` into the Cloudflare
dashboard and redeployed. A real session export was submitted from the C#-era app and
succeeded end-to-end — confirmed by the user ("Submitted — thanks! It's waiting for review
on the wiki now."), opening a real PR against the wiki repo. This closed out a real bug hit
during the exe migration (unquoted `Content-Disposition` `name` param breaking Cloudflare's
`request.formData()` parser — see CLAUDE.md's "Session export submission" and the
`MultipartFormDataContent` gotcha in "Architecture").

Original scoping notes, all resolved as above:
- ~~Reuse, don't rebuild, if possible~~ — confirmed with the user, reused.
- ~~This is a real scope change, not a small addition~~ — confirmed with the user, `CLAUDE.md`
  hard rules updated before any code was written (new hard rule #3 + "Session export
  submission" section).
- ~~Every submission still needs a human merge/review step~~ — this is exactly what merging
  the Worker's PR already requires; no separate gate was added on top.

## 2. ~~Photo attachments~~ — done, scoped to monsters/nodes (2026-08-28)

Originally scoped as "attach a screenshot to a session log entry, through the same pipeline
as #1" — built differently once #1 was actually built and its Worker inspected: rather than
extending the session-export path, this reuses the wiki's OWN existing screenshot/notes
submission path (`handleWikiSubmission` in the Worker) completely unchanged, since that's a
much closer match — a screenshot is fundamentally "about a monster/node," not "about a
session." **Zero Worker code changes needed.** Full mechanism in `CLAUDE.md` "Screenshot
submissions."

Scoped to named/boss monsters (Combat) and gathering nodes (Gathering) specifically — not a
generic "attach to any log entry" — per the wiki's own submission guide, which says regular
monsters don't need pictures at all. Verified against the real live Worker (two
side-effect-free requests hitting specific rejection messages, no PR/branch created either
way) before considering this done, not just tested against the mock preview.

**Still open, not built in this pass**: attaching a screenshot to other subjects (items,
faction changes, crafting recipes) the wiki's own submit form also supports — this was
scoped to what the user actually asked for ("nodes, bosses or mobs"), not every possible
subject the underlying pipeline could theoretically support. Extending to more subjects
later is mostly UI work (the shared `openScreenshotModal(subject, kind, zone)` already
takes an arbitrary kind label) — the plumbing doesn't need to change.

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
  Files/services), so "install" = unzip + run `MnMFieldNotes.exe`, "uninstall" = delete the
  folder. A traditional installer would add real downsides (unsigned `.exe` triggers
  SmartScreen) for no real benefit at guild scale. Still needs an `INSTALL.txt` in the
  distributed zip explaining what's inside and why, for guild members who aren't the project
  owner.

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

## 13. ~~Maps tab — pan/zoom map viewer~~ — done (2026-08-28)

Built exactly as scoped below: mirrored the wiki's own `#map-viewer` pan/zoom lightbox
(that repo's `script.js`/`style.css`) near-verbatim rather than inventing a new one — same
fit-to-view scale math, scroll-to-zoom/drag-to-pan mechanics, thumbnail-then-full swap, and
prev/next blink animation for multi-variant areas. Full mechanism in `CLAUDE.md` "Maps tab" —
not duplicated here.

The map-inconsistency concern (varying resolutions/aspect ratios/variant counts) turned out
to be a non-issue for the viewer itself, confirmed by the user's own 2026-08-27 call below —
pan/zoom just adapts to whatever it's given. The `aethoril.webp` loose end resolved itself:
the image is loaded by a plain `<img>` tag directly in the WebView2 page (Chromium), never
decoded by any .NET code on the host side, so the earlier "couldn't be read by a standard
.NET image check" finding never applied to how this actually got built.

Verified in the browser preview (mock host, placeholder SVG "maps" standing in for real wiki
images): grid renders grouped-by-area with variant links, viewer opens fit-to-screen,
scroll-to-zoom confirmed via a dispatched wheel event, prev/next navigation between variants
works with the blink animation, a single-image area correctly hides the nav arrows, and
Escape closes the viewer.

**Still open, deliberately not attempted**: no "featured maps" curated panel (the wiki pins
"Aethoril"/"Calafrey & Szurr Regions" above its alphabetical grid) — that's homepage
curation content specific to the wiki's own audience, not needed for a lookup tool tab here.

## 14. Maps tab — user pin annotations (2026-08-27) — on hold, waiting on better map assets

Depends on #13 (now built). **User's own call, 2026-08-28, right as #13 was being picked up:
"Wait with the map pin function - This has to wait untill we have better maps."** Don't start
this until the user explicitly says the map assets are ready — this reinforces (doesn't just
repeat) the #13 note below about why map-image inconsistency specifically matters here even
though it didn't block the viewer itself.

User-contributed pins placed on the map:
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

## 21. ~~Fishing: trim the key-listening modal's explainer text~~ — done (2026-08-28)

`#fish-key-modal` (`ui/index.html`) read: "Press the key you use to fish. From then on the
app counts that key everywhere — it never touches the game itself." User's own words: remove
"the app only ever watches for that one key, and never touches the game itself" — that's a
trust/policy statement, already covered in `README.txt`, and doesn't need to live in the
app's own UI. Trimmed to "Press the key you use to fish. From then on the app counts that key
everywhere."

Also swept the rest of the UI for the same pattern per the item's own note ("worth a quick
pass over other modals/labels") and found one more instance: the Fishing pre-start screen's
own explainer paragraph in `renderFishingPanel()` (`ui/app.js`) had the identical clause
("the app only ever watches for that one key, and never touches the game itself") — trimmed
the same way, function description kept, trust/policy statement removed. No other instances
found (`README.txt`/`INSTALL.txt`'s own trust language is fine, that's exactly what's *meant*
to live there per the standing rule). Verified in the browser preview (`lib/serve-ui.ps1`):
both paragraphs render without the trimmed clause.

## 22. ~~Skill counter boxes show doubled up/down controls~~ — done (2026-08-28)

`#fish-skill-input`/`#gather-skill-input` (`ui/app.js`) are real `<input type="number">`
fields sitting next to the app's own `-`/`+` buttons — but a real number input also gets the
browser's own native up/down spinner arrows rendered inside the field itself, so there were
two redundant sets of increment controls stacked together. User's own words: "the + and - on
the sides are enough." Fixed in `ui/style.css` (added right after `.mini-btn`, since it's
specifically about the input paired with those buttons) — `-webkit-appearance: none` on
`::-webkit-inner-spin-button`/`::-webkit-outer-spin-button` for both IDs (WebView2 is
Chromium, so only the `-webkit-` prefix actually matters; `-moz-appearance: textfield` added
too, harmless dead weight outside Firefox). Scoped to just these two IDs, not a blanket
`input[type=number]` rule — other number inputs in the app (`f-plat`/`f-gold`/etc., `ck-skill`,
`ck-haste`, Cooking's stat-value inputs) have no adjacent +/- buttons, so their native spinner
is still the only increment control they have and shouldn't be removed.

Verified in the browser preview: the modal's own skill input (`#fish-skill-modal-input`, out
of scope, no side buttons) still shows its native spinner as expected; the active screen's
`#fish-skill-input` (in scope) does not, and typing a value into it directly still works.
Confirmed via `document.styleSheets` inspection that both CSS rules load and target the
correct IDs.

## 23. App-side "home" screen, like the wiki's (2026-08-28)

User's own words: "Like we have on the wiki i think we should have a 'home' screen on the
app, wishing users welcome, explaining what the app does (in not too many words), telling
them how it works and how to navigate." Mirrors the wiki's own `renderHomePage` — a welcome
blurb + nav cards — but scoped down for this app's own audience (someone who already has the
zip and is looking at a running desktop window, not a first-time visitor landing on a public
site from a search engine), so needs its own pass rather than a straight port.

Not yet scoped: whether this is its own top-level tab/screen (competing with the existing
Combat/Gathering/Fishing/etc. tab bar - see "Landing info" in `CLAUDE.md`, which already
gives every tab a no-session-needed browse view, arguably covering some of the same "come in
and find something useful immediately" goal) or a one-time/dismissible first-launch panel
(closer to how `#profile-modal` already greets a brand-new install). Whichever it is, keep it
short per the user's own explicit ask ("in not too many words") — this app's own portrait
2nd-monitor layout is already tight on space (see CLAUDE.md "Visual style"), and the existing
`README.txt`/in-app tooltips already cover most of the explaining in more detail than a home
screen should try to repeat.
