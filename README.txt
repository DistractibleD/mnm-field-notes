Session Viewer
=================

What this is
------------
A standalone, second-monitor companion window for Monsters and Memories that
shows what you've looted, from which monster/NPC, in which zone, during your
current play session.

How it works
------------
Monsters and Memories writes its own per-character "Ledger" log files to:

  %USERPROFILE%\AppData\LocalLow\Niche Worlds Cult\Monsters and Memories\beta1\<Character>\Ledger\

Every time you loot an item off a corpse, the game appends a record there
containing the monster's name, the item name, the quantity, the zone, and a
timestamp. This app reads those files every couple of seconds and displays
a running tally. That's it.

This app:
  - Only ever READS files the game already writes for its own purposes.
  - NEVER reads game process memory.
  - NEVER injects code/DLLs into the game.
  - NEVER writes to anything inside the game's install or save folders.
  - NEVER makes any network connection (no telemetry, no uploads, nothing
    ever leaves your PC). You can verify this yourself - open SessionViewer.ps1
    in any text editor; there is no networking code in it at all.
  - Only writes files you explicitly ask it to, via the "Save Session to
    File" button, into this folder's own Sessions\ subfolder (or wherever
    you choose in the save dialog).

This is not a cheat tool. It doesn't change anything about how the game
plays, doesn't automate any action, and doesn't give you any information
the game didn't already write to disk on its own.

How to run it
--------------
Double-click "Start.vbs". This starts the app with no console
window popping up. (You can also just right-click SessionViewer.ps1 and choose
"Run with PowerShell" if you prefer to see the console.)

Using it
--------
1. Pick your character from the dropdown at the top (it auto-selects
   whichever character has the most recently active log file on startup).
2. Play normally. The list of monsters fills in live as you loot things.
3. Click a monster row to see its full item breakdown below.
4. "Start New Session" clears the current tally and starts counting fresh
   from that moment (useful if you want to isolate one farming run, one
   dungeon, etc).
5. "Save Session to File" writes a plain text report of everything tallied
   so far to the Sessions\ folder (or anywhere else you pick).

What it can't show, and why
----------------------------
- Coin drop amounts per monster: the game does not write coin loot from a
  monster corpse to any file - only item loot is logged this way. So this
  always shows "N/A".
- Monster level: the game doesn't write monster level to any file either.
  Also always "N/A".
These columns are still shown (rather than removed) so it's clear they were
considered, in case a future game update starts logging this data.

Known limitations
------------------
- Only counts what you (or, if you're grouped, a party member) actually
  looted - like the loot window itself, if a corpse had more items than
  got picked up, those never appear anywhere.
- "Session" means "since this app was started, or since you last clicked
  Start New Session" - it does not retroactively include earlier play from
  before the app was running.
- If you have several characters, switching the character dropdown starts
  a fresh session for that character.
