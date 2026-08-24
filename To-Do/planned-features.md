# Planned features

Gap-tracking/roadmap list for this project, mirroring the wiki project's own `To-Do/`
convention — never built from unless the user actually asks to start on one, and not
something a session should treat as a current spec. Claude picks the order when the user
says "keep building" without naming something specific; when the user names a specific
idea from here, that's the one to build.

## 1. Push session exports to GitHub (2026-08-24)

Instead of (or alongside) the current "hand the export .txt to Claude manually" flow, have
the app submit it directly — same spirit as the wiki's own "Submit a Screenshot" form.

- **Reuse, don't rebuild, if possible**: the wiki already has a deployed Cloudflare Worker
  (`SUBMIT_WORKER_URL` in the wiki's `script.js`) that accepts `FormData` (notes text and/or
  a screenshot), creates a branch, commits into `community-notes/` or `images/Inbox/`, and
  opens a PR — a human still has to merge it, nothing reaches the live wiki automatically.
  Worth checking whether this app could POST to that *same* endpoint with a session export
  as the "notes" text, rather than standing up separate infrastructure. Confirm with the
  user before assuming reuse is fine — it's the wiki owner's own Worker/token, shared
  infrancture between two projects is a real decision, not just a technical shortcut.
- **This is a real scope change, not a small addition**: the project's current hard rule is
  network calls only ever reach the *published wiki site* (read-only fetch). Actually
  submitting data outward is a new capability and needs the same care/confirmation the
  read-only fetch decision got — update `CLAUDE.md`'s hard rules deliberately when this is
  actually built, don't just bolt it on.
- Every submission still needs a human merge/review step before it's real wiki data — same
  trust model already established for guild-submitted exports (see "Guild data trust
  model" in `CLAUDE.md`), just moving the hand-off mechanism from "paste to Claude" to
  "auto-opens a PR Claude/the user reviews."

## 2. Photo attachments (2026-08-24)

Let a session log entry attach a screenshot (e.g. a chat message, an item card, a faction
change) alongside the typed fields, sent through the same submission pipeline as #1 once
that exists. Depends on #1 being built first — no separate submission path planned for
just images.

## 3. Contributor scoring + wiki leaderboard (2026-08-24)

Users of the app (the guild members from the sharing decision) who submit genuinely new,
helpful data earn a score; the wiki gets a leaderboard page showing top contributors.

Open questions to resolve when this is actually scoped, not decided yet:
- **What counts as "new helpful data"** — a submission that fills a real gap vs. a
  duplicate of something already known. This determination naturally happens at the same
  point Claude processes/merges a submission into the wiki, so scoring updates would need
  to be part of that same workflow, not a separate pass.
- **Where the score lives** — most likely a new small JSON file in the wiki repo (e.g.
  `contributors.json`), plus a new wiki page rendering it as a leaderboard. That means this
  feature spans *both* projects, not just this one — the wiki side needs its own scoped
  design pass too (new page type, new data file, `CLAUDE.md` updates there) when it's
  actually built.
- Ties into the existing "logged by" name already captured on every export (see "Guild
  data trust model") — that's the natural identity to score against, nothing new needed
  there. Now that profiles are a real persisted concept (see `CLAUDE.md`), scoring would
  naturally key off a profile name rather than free-typed text.

## 4. Cooking as its own tab (2026-08-24)

Cooking gets the same "own tab" treatment Fishing got, not folded into a generic Crafting
recipe list — reasoning: **dishes can carry stat boosts**, and the user wants to be able to
**attach stats to the food they log making, via dropdown tick boxes** (i.e. the
`checklistDropdownHTML`/`setupChecklistDropdown` searchable-checklist pattern established
2026-08-24 — same component the faction dropdowns use, not a one-off). Needs its own scoping
pass when picked up: what the stat list is (presumably the same stat vocabulary
`items.json` already uses for buffs — AGI/STR/etc, resists, haste), whether a dish can have
more than one, and how that maps onto `crafting.json`'s existing recipe shape on the wiki
side (a crafted-food stat boost isn't a field that schema has yet).

## 5. Auto-update check (2026-08-24)

The app checks for and downloads a newer version itself, rather than the user always
getting updates as a fresh manual zip. Real motivation: once guild members have their own
copies (see the guild-sharing decision in `CLAUDE.md`), keeping everyone in sync without
re-sending a zip every time gets old fast — this is worth building once there's an actual
guild rollout to keep in sync, not just a nice-to-have.

Open questions/dependencies, not decided yet — this one has more unresolved shape than the
others above:
- **No version source exists yet.** The app has no version number at all today (not in
  `SessionViewer.ps1`, not anywhere) — a real prerequisite before "check for updates" means
  anything is picking a versioning scheme in the first place.
- **Where would the app check *against*?** This project is deliberately local-only, no git
  remote (see "Secrecy" in `CLAUDE.md`) — there's no hosted "latest version" location today.
  Solving this needs the same kind of explicit, deliberate decision the GitHub-push idea (#1
  above) needs, and may end up sharing infrastructure with it (or may not — a private
  update-check endpoint and a public-facing submission endpoint aren't necessarily the same
  thing). Don't assume they're the same decision without asking.
- **Downloading and running new code is a meaningfully bigger trust boundary than anything
  this app does today** — every existing network call is a read-only `GET` of JSON data;
  auto-update means pulling in and executing new code. Whatever design this ends up with
  needs real integrity/trust safeguards (e.g. the user confirming an update before it
  applies, not a silent auto-run), not just "download and replace the files."

## 6. Fishing UX polish (2026-08-24)

A batch of small-to-medium refinements to the Fishing tab and session-export flow, called
out after reviewing a real session export. Not scoped/ordered yet — pick individually when
picked up, several touch the same fish-pick-grid area so may be worth doing together.

- **Visually separate junk from regular fish** on the fish-pick-grid buttons — a border or
  similar, just to make junk stand out at a glance.
- **Surface "expected fish" for the selected zone at the top of the grid**, visually
  distinct (not just position) — derive the expected list from the wiki's own data
  (`gathering-nodes.json`, Fishing-tradeskill entries) filtered to the active zone.
- **As soon as a player catches a fish (or junk) in a zone this session, add it to that
  zone's "expected fish"** — session-observed catches should feed back into what's shown as
  expected, not just the wiki's pre-existing list.
- **Color-code the fish button font by category** — expected / normal / junk as three
  distinct font colors, cheap visual sort without restructuring the grid.
- **Default fish button sort order should be alphabetical**, except the expected/junk
  buckets above sort ahead of/separately from the plain alphabetical list.
- **Add a running per-fish catch count on each button** — lets the user compare what
  they've logged against their in-game inventory, since the game doesn't always name the
  catch explicitly on-screen.
- **Disable the "Export" action after a session has already been ended/exported** — currently
  re-clickable with no guard.
- **Add an app-wide tooltip system** explaining what buttons/areas do — general
  discoverability, not fishing-specific, but called out while looking at the fishing tab.
- **Toast messages (e.g. "Exported") fade too fast to read** — extend the display duration.
- **Bug, root cause confirmed via mock-browser testing (2026-08-24)**: a real session
  export's header read `Session export - combat` even though the session was a Fishing
  session (body content was correctly grouped under "harvesting"/"Fishing (Fishing)").
  Root cause: the tab-click handler in `ui/app.js` only reassigns `session.type` when the
  **Combat** tab specifically is clicked (`session.type = t.dataset.tab === 'combat' ?
  'combat' : session.type;`) — switching to Harvesting/Fishing/Crafting/Multi never updates
  it, so `session.type` (sent as `sessionType` on `startSession`) stays whatever it
  defaulted to (`'combat'`) unless the user happened to click Combat first. Fix needs a real
  per-tab type mapping (fishing tab → harvesting sessionType with tradeskill Fishing, per
  existing `logEntry` shape) rather than the current combat-only special case — check
  `Write-SessionExport` in `SessionViewer.ps1` too, in case it has its own independent
  assumption about session type.
- **Guard against key-listener spam skewing attempt counts**: if the fishing key is pressed
  3+ times within 1 second, auto-disable the listener and show a warning that spamming the
  key gives bad results — mention the user can add attempts manually instead, and that the
  listener can be re-enabled any time. Make sure the user is generally aware spamming the key
  is bad before this even triggers (the description text added above "Listen for key" is a
  good place to mention it too).
- **Flag unnaturally high click/attempt counts for review** when Claude processes a guild
  submission — exact threshold not decided ("not sure how to gauge what 'many clicks' are"),
  ties into the spam-guard above but is a separate, softer check on the data-review side
  rather than a hard client-side block.
- **Add the ability to edit a logged session entry** after the fact — e.g. fixing a missing
  zone (forgot to select one before logging), or correcting skill/fish-type on a misclick.
  Needs its own scoping pass: which fields are editable, whether edits are visible in the
  all-time log as edits or silently overwrite, etc.
