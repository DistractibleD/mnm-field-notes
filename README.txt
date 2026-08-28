MnM Field Notes
=================

First time setting this up? See INSTALL.txt. This file covers what the app
does and how to use it once it's running.

What this is
------------
A standalone, second-monitor companion window for Monsters and Memories. It's
a place to jot down what happens while you play - kills, gathering/fishing
attempts, crafting/cooking results - typed in by hand as you go, structured
enough that it can later be turned into wiki updates.

How it works
------------
Everything in this app is manual entry. It never reads any file the game
writes, never touches the game's process or memory, and never interacts with
the game in any way - it's the equivalent of keeping a notebook open next to
the game, not a tool that watches the game for you. Network use is limited to
two things: a read-only fetch of already-public wiki data (monsters, items,
zones) for autocomplete and browsing, and - only if you choose to click
"Submit" after ending a session - sending that session's exported text to the
wiki's own review system, which opens a pull request rather than publishing
anything directly. Nothing is ever sent automatically.

How to run it
--------------
Double-click "Start.vbs". This starts the app with no console window popping
up. (You can also right-click MnMFieldNotes.ps1 and choose "Run with
PowerShell" if you prefer to see the console.)

Using it
--------
1. First launch asks for a name to log entries under - this is saved and
   pre-selected next time, but can be changed or added to any time from the
   dropdown at the top (locked while a session is running).
2. Pick a tab: Combat, Gathering, Fishing, Crafting, Cooking, or Multi
   (Crafting and Multi are still being built out - you'll see an "under
   construction" banner there for now). Combat, Gathering, and Fishing all
   show useful info for whatever zone you pick - named/regular monsters,
   expected nodes, catch-rate estimates - even before you start a session.
3. Start a session - either the "Start new session" button at the top, or,
   on Gathering/Fishing, just tapping "Let's start gathering!"/"Start
   fishing!" (which starts the session for you as part of its own setup).
   Then log things as they happen:
   - Combat and Cooking keep a roster of everything encountered this session
     (monsters/dishes) - add one, select it, and log details against it.
   - Gathering and Fishing are built for fast repeat logging: pick a zone,
     set your skill, and just tap what you found/caught each time - no form
     to fill in.
4. "End session & export" writes a plain-text summary of everything logged
   to the Sessions\ folder, grouped and formatted so it's easy to hand
   straight to Claude for a wiki update - the app then also offers to submit
   it directly to the wiki for review.

About the profile name
------------------------
Whatever name you pick on first launch gets attached to everything you log.
That's not an account of any kind - it's a plain text label, saved only on
your own computer. It matters if more than one person is logging: if your
report of something ever conflicts with someone else's (different numbers
for the same thing), that name is what makes it possible to tell the two
apart and sort out which is right, instead of one silently overwriting the
other.

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
