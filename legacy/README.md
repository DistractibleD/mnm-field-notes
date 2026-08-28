# Legacy PS1 host

`MnMFieldNotes.ps1` + `Start.vbs` — the original PowerShell/WinForms host, replaced
2026-08-28 by the compiled `MnMFieldNotes.exe` (see `src/` + repo-root `CLAUDE.md`
"Architecture"). Kept here only as a reference/fallback, not maintained going forward —
all new work happens in `src/`. Not included in release zips.

To run it (needs `lib/webview2/*.dll`, same as the exe): right-click `Start.vbs` →
Open, or `powershell -File MnMFieldNotes.ps1` from this folder.
