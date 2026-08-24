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
  `MnMFieldNotes.ps1`, not anywhere) — a real prerequisite before "check for updates" means
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
out after reviewing a real session export. First wave (fish-pick-grid + quick fixes) done
2026-08-24 — see `CLAUDE.md` "Session types and fields" and "Fishing" for the actual
implementation. Remaining items still need their own pass.

### Done (2026-08-24)

- ~~Visually separate junk from regular fish~~ — dashed border + muted color, matched from
  the wiki node's `note` text (`/junk/i`), confirmed with the user as the intended detection
  method over a hardcoded name list or a manual per-catch toggle.
- ~~Surface "expected fish" for the selected zone at the top of the grid~~ — derived from the
  wiki's `locations` field (now forwarded by `Get-WikiData`) union'd with anything actually
  caught in that zone this session.
- ~~Auto-add caught fish/junk to that zone's "expected fish"~~ — same mechanism as above,
  live-updates the moment a catch is logged.
- ~~Color-code the fish buttons by category~~ — expected (accent gold) / junk (muted dashed)
  / normal (default). Note: junk styling wins visually over expected when a catch is both
  (e.g. a junk item caught in-zone) — position still reflects expected-first, only the
  color/border is overridden.
- ~~Default alphabetical sort~~ — applies within the expected group and the rest group
  separately (expected always sorts to the top as its own block, not interleaved).
- ~~Running per-fish catch count on each button~~ — `×N` badge, this session only.
- ~~Toast messages fade too fast~~ — extended from 2.5s to 4.5s.
- ~~"combat" mislabel bug~~ — root cause was actually deeper than first diagnosed: on top of
  the tab-click handler only updating `session.type` for the Combat tab, `btnStart`'s own
  click handler unconditionally hard-coded `session.type = 'combat'` right before sending
  `startSession`, silently overriding anything the tab handler had set. Fixed by deriving the
  label from `document.querySelector('.tab.active')` directly at start-click time instead of
  trusting a value that two different code paths were independently trying to maintain.

### Still open

- **Disable the "Export" action after a session has already been ended/exported** — wasn't
  in scope for the 2026-08-24 pass (the button already disables via `btnEnd.disabled = true`
  in the `sessionEnded` handler; re-check whether there's still a real gap here, e.g. a
  double-click race before the disabled attribute lands, before building anything).
- **Add an app-wide tooltip system** explaining what buttons/areas do — general
  discoverability, not fishing-specific. Bigger, deserves its own scoping pass.
- **Guard against key-listener spam skewing attempt counts**: if the fishing key is pressed
  3+ times within 1 second, auto-disable the listener and show a warning that spamming the
  key gives bad results — mention the user can add attempts manually instead, and that the
  listener can be re-enabled any time. Touches the native keyboard hook (see
  `CLAUDE.md`'s "PowerShell/WinForms gotcha" — hook callbacks must stay minimal), so this
  needs care, not a quick pass.
- **Flag unnaturally high click/attempt counts for review** when Claude processes a guild
  submission — exact threshold not decided ("not sure how to gauge what 'many clicks' are"),
  ties into the spam-guard above but is a separate, softer check on the data-review side
  rather than a hard client-side block. Not app code — a process note for whoever (Claude)
  reviews submissions.
- **Add the ability to edit a logged session entry** after the fact — e.g. fixing a missing
  zone (forgot to select one before logging), or correcting skill/fish-type on a misclick.
  Needs its own scoping pass: which fields are editable, whether edits are visible in the
  all-time log as edits or silently overwrite, etc.
