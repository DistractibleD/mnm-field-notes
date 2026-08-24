# CLAUDE.md

Guidance for Claude Code working in this project. Read this in full before making any
change here — the security rules below are non-negotiable, not defaults to weigh against
convenience.

## What this is

A standalone, offline, second-monitor companion window for *Monsters and Memories*
("MnM Loot Tracker"). It reads the game's own local log files and shows what's been
looted, from which monster/NPC, in which zone, per play session. Nothing more.

It is explicitly **not** a cheat tool — it doesn't automate anything, doesn't change how
the game plays, and never surfaces information the game didn't already write to disk on
its own.

## Hard security rules — never violate these

These apply to every change in this project, forever, regardless of what a future
request seems to ask for. If a request would require breaking one of these, stop and
say so rather than finding a workaround.

1. **Read-only toward the game, always.** This app may only *read* files that
   *Monsters and Memories* already writes for its own purposes. It must never write,
   modify, rename, or delete anything inside either of the game's own folders:
   - `%LocalAppData%\Monsters & Memories\` (install/launcher folder)
   - `%LocalAppData%Low\Niche Worlds Cult\Monsters and Memories\` (save data folder)
   Files are opened with `FileAccess.Read` + `FileShare.ReadWrite` specifically so the
   game is never locked out and this app can never accidentally hold a write handle.
2. **No process memory access, ever.** Never read the game process's memory in any way
   (no `ReadProcessMemory`, no memory scanning, no pointer walking, nothing that
   attaches to the running game process at all).
3. **No code injection, ever.** Never inject a DLL, hook a function, patch game code, or
   otherwise make this app "known" to the game process in any way. This app and the
   game process must remain two completely unrelated, unconnected programs — the only
   relationship between them is that one happens to read files the other happens to
   write.
4. **No network activity, ever — this app is fully offline.** No telemetry, no update
   checker, no crash reporting, no analytics, no outbound request of any kind, to any
   destination. This must remain true and verifiable just by reading the source — never
   add `System.Net`, `Invoke-WebRequest`, `Invoke-RestMethod`, sockets, or any other
   networking call anywhere in this codebase.
5. **Writes stay inside this project's own folder.** The only files this app ever writes
   are session reports, and only when the user explicitly clicks "Save Session to File"
   — written to this folder's own `Sessions\` subfolder (gitignored, personal data) or
   wherever the user picks in the save dialog. Never write anywhere else, never write
   automatically/silently.

If a future feature request would require touching game files, reading game memory, or
adding any networking, the answer is no — explain the conflict to the user rather than
implementing a narrower version of it.

## Secrecy — this project is private

- **Never mention this project anywhere in the separate Monsters and Memories Wiki
  project** (`D:\Claude files\MonstersAndMemories-Wiki\`) — not in its `changelog.json`
  ("Latest Changes" feed), not in a commit message, not in any file in that repo, not in
  passing conversation while doing unrelated wiki work in that repo's session.
- **Local-only, no remote.** This folder has its own local git repository
  (`git init`, no `git remote`) — deliberately never connected to GitHub or any other
  host. Do not add a remote, do not push, do not create an account or repo on any
  hosting service for this project unless the user explicitly asks for that in this
  project's own session, in the future, in clear terms.
- Nothing about this project should be uploaded, synced, or shared anywhere without the
  user explicitly asking for that specific action.

## How the data actually works

Source: `%USERPROFILE%\AppData\LocalLow\Niche Worlds Cult\Monsters and Memories\beta1\<Character>\Ledger\*.json`
— one `_Character_<date>.json` and one `_Social_<date>.json` file per character per day,
each holding a flat `c01` array of event objects: `{f01: act type, f03: JSON-string
payload, f04: timestamp, f05: zone, f07: acting character, ...}`.

- **`act_13`** = a loot event (looting an item off a corpse). This is the only event
  type this app reads. Payload (`f03`, itself a JSON string, parse twice): `d01` =
  quantity, `d02` = monster/NPC name, `d04` = `"<id>|ItemName"` (split on the first `|`,
  the id is a per-event/instance number, ignorable), `d05` = the item's stable 24-hex-char
  template GUID (same identifier space as the game's own chat item-link code, confirmed
  2026-08-24 — every item name maps to exactly one such GUID across 1,300+ sampled
  events. Not currently used by this app; noted here in case it's wanted later).
- Several string fields (`d02`, `f05`, and other `name_`/`zone_`-prefixed values
  elsewhere in the Ledger schema) are base64-encoded, sometimes with a literal
  `<word>_` prefix before the base64 payload, sometimes raw base64 with no prefix —
  `Decode-GameString` in `LootTracker.ps1` handles both forms.
- **Confirmed NOT available anywhere in any file the game writes** (checked exhaustively
  across every Ledger event type, `Player.log`, `settings.json`, `chats.json`,
  `windows.json`, and the launcher's `game.db` — which only holds a patcher `manifest`
  table): monster coin drops (currency only appears in player-to-player trade events,
  never tied to a monster corpse), monster level, and character world position (x/y/z).
  Don't try to derive or approximate any of these — show `N/A` and say so, same as the
  app already does for coin/level. If the game ever starts logging one of these, revisit;
  until then, treat this as settled, not an open question to keep re-investigating.
- `act_14` events (corpse/loot-window target select) exist but only ever tag
  `npc_corpse` or `party_split` — they do **not** fire on live/unlooted monster
  encounters, so they can't be used to build a broader "monsters seen" list beyond what
  was actually looted from.

## Tech stack — and why

This machine has no Node/npm and no .NET SDK (only a bare runtime host stub) — checked
2026-08-24. The app is built as **PowerShell 5.1 + WinForms** (`Add-Type -AssemblyName
System.Windows.Forms`), which ships with Windows and needs no build step, no compiler,
and no external dependency of any kind. Stick with this approach for any future change
here unless the toolchain situation on this machine genuinely changes — don't introduce
a Node/Electron/dotnet-SDK-dependent rewrite that would require installing new tooling.

## File layout

- `LootTracker.ps1` — the app itself (UI + data-reading logic in one file).
- `Launch Loot Tracker.vbs` — silent launcher (runs the script with no console window).
- `README.txt` — user-facing docs: how to run it, what it does and doesn't do, current
  limitations. Keep this in sync with any behavior change.
- `Sessions\` — gitignored; holds saved session `.txt` reports (personal data, not
  source code, never committed).
