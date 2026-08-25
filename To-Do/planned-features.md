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

## 4. ~~Cooking as its own tab~~ — done (2026-08-25)

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

## 5. ~~Update check~~ — done (2026-08-25)

Version check + prompt built (see "Update checking" in `CLAUDE.md`). Deliberately NOT a
self-updater — "View release" opens the releases page, user downloads/replaces manually.
Hosting: new repo `mnm-field-notes-releases` (public, separate from app source and from the
wiki repo), holding just `latest.json` + release zips. Git identity on that repo uses the
GitHub noreply email, same as the wiki repo, so the user's real email stays off any public
commit.

Still open, not needed for the check/prompt itself but for actually distributing updates:
- **No release has been cut yet** — `latest.json`'s `url` points at `/releases/latest`, but
  no GitHub Release/zip exists there yet. First real update will need one tagged, with
  `lib/webview2/*.dll` included in the zip (see the Installer note below — those are
  gitignored in this dev repo but a distributable zip needs them present).
- **No installer, and intentionally so** — the app is portable (no registry/Program
  Files/services), so "install" = unzip + run `Start.vbs`, "uninstall" = delete the folder.
  A traditional installer would add real downsides (unsigned `.exe` triggers SmartScreen)
  for no real benefit at guild scale. Still needs an `INSTALL.txt` in the distributed zip
  explaining what's inside and why, for guild members who aren't the project owner.
