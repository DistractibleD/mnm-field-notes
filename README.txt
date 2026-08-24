MnM Field Notes
=================

What this is
------------
A standalone, second-monitor companion window for Monsters and Memories. It's
a place to jot down what happens while you play - kills, harvesting/fishing
attempts, crafting results - typed in by hand as you go, structured enough
that it can later be turned into wiki updates.

How it works
------------
Everything in this app is manual entry. It never reads any file the game
writes, never touches the game's process or memory, and never interacts with
the game in any way - it's the equivalent of keeping a notebook open next to
the game, not a tool that watches the game for you.

This app:
  - NEVER reads any file Monsters and Memories writes (install folder, save
    data, log files, config, anything).
  - NEVER reads game process memory, and NEVER injects code/DLLs into the
    game.
  - NEVER writes to anything inside the game's install or save folders - all
    of its own data lives under this project's own Data\ and Sessions\
    folders.
  - The only network connection it ever makes is a read-only fetch of
    already-public data (monsters, items, gathering nodes, zones) from the
    published wiki site, used for autocomplete and the Lookup tab. It never
    talks to any Niche Worlds Cult server, never sends telemetry, and never
    talks to another copy of this app on anyone else's computer.

This is not a cheat tool. It doesn't change anything about how the game
plays, doesn't automate any action, and doesn't give you any information you
didn't type in yourself.

How to run it
--------------
Double-click "Start.vbs". This starts the app with no console window popping
up. (You can also right-click MnMFieldNotes.ps1 and choose "Run with
PowerShell" if you prefer to see the console.)

Using it
--------
1. First launch asks for a name to log entries under - this is saved and
   pre-selected next time, but can be changed or added to any time from the
   dropdown at the top.
2. Pick a tab: Combat, Harvesting, Fishing, or Crafting (Multi mixes several
   in one session; Crafting/Multi are still being built out).
3. Click "Start session", then log things as they happen:
   - Combat/Harvesting keep a roster of everything encountered this session
     (monsters/nodes) - add one, select it, and log details against it.
   - Fishing is built for fast repeat logging: pick a zone (and optionally a
     specific area, like a particular lake or pond), set your skill, and
     just tap the fish you caught each time - no form to fill in.
4. "End session & export" writes a plain-text summary of everything logged
   to the Sessions\ folder, grouped and formatted so it's easy to hand
   straight to Claude for a wiki update.
5. The Lookup tab searches the wiki's existing monster/item data without
   needing a session running - useful for checking what's already known
   before you go log something new.

Sharing with guildmates
------------------------
This app isn't public, but it's fine to hand a copy of this folder to guild
members so they can log their own sessions too - there's no account system
or server involved, just manual file sharing (Discord, etc.). Each export
records who logged it, so anything that conflicts with existing data can be
flagged rather than silently overwritten.

Known limitations
------------------
- Only as accurate as what you type in - there's no automatic detection of
  anything, so a missed field or a typo just isn't captured.
- A session only includes what's logged between "Start session" and "End
  session & export" - it doesn't retroactively pull in anything from before
  the app was running or before that button was pressed.
- Wiki-sourced autocomplete (zones, known monsters/items/fish) needs a
  working internet connection to load; without it the app still works, just
  without those suggestions.
