using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Net.Http;
using System.Threading.Tasks;

// Self-update: downloads the release zip from GitHub, replaces only the
// release-shipped files (the exe, ui\, lib\webview2\, README.txt,
// INSTALL.txt), and relaunches - never touches Data\/Sessions\, since
// those were never part of the release zip to begin with (gitignored,
// created fresh on first run - see CLAUDE.md "File layout"). This is what
// keeps the user's profile/all-time stats safe without any special-case
// "don't delete this" logic: the copy list simply never mentions them.
//
// No separate helper program needed - verified directly (a disposable
// throwaway test, not assumed) that Windows allows renaming a currently-
// EXECUTING exe to a new name, writing a brand new file at the vacated
// original path, and the still-running (renamed) process carries on
// completely unaffected. So the running app can replace its own exe file
// in-place, launch the new one, and exit itself - no waiting-helper-process
// dance required. ui\/lib\webview2\ files are safe to overwrite directly
// even while running: nothing holds a lock on them (WebView2 serves ui\
// files per-request rather than keeping them open, and since the MOTW fix
// in Program.cs, the WebView2 managed DLLs are loaded via
// Assembly.Load(byte[]) rather than LoadFrom, which never keeps a file
// handle open either).
//
// This is a real trust-boundary jump - the app now downloads and executes
// code it fetched from the internet, the exact risk CLAUDE.md originally
// flagged as the reason self-update wasn't built. Confirmed explicitly
// with the user before building this (2026-08-28), same as every other
// outbound-network capability in this app.
internal static class AppUpdater
{
    private static readonly HttpClient Http = new HttpClient { Timeout = TimeSpan.FromMinutes(3) };

    public sealed class Result
    {
        public bool Ok;
        public string Error;
    }

    public static async Task<Result> ApplyUpdateAsync(string zipUrl)
    {
        if (string.IsNullOrEmpty(zipUrl) || !System.Text.RegularExpressions.Regex.IsMatch(zipUrl, "^https://"))
        {
            return new Result { Ok = false, Error = "Missing or invalid download URL." };
        }

        // Refuse mid-session, host-side, even though the UI already guards
        // this - a session's own metadata/unflushed state only becomes
        // durable at "End session & export" (see SessionState.AnyActive).
        if (SessionState.AnyActive())
        {
            return new Result { Ok = false, Error = "End your current session before updating." };
        }

        string zipPath = Path.Combine(Path.GetTempPath(), "MnMFieldNotes-update-" + Guid.NewGuid().ToString("N") + ".zip");
        string stagingDir = Path.Combine(Path.GetTempPath(), "MnMFieldNotes-update-" + Guid.NewGuid().ToString("N"));

        try
        {
            byte[] bytes = await Http.GetByteArrayAsync(zipUrl);
            File.WriteAllBytes(zipPath, bytes);

            Directory.CreateDirectory(stagingDir);
            ZipFile.ExtractToDirectory(zipPath, stagingDir);

            // The release zip's own top-level entry is a single named folder
            // (e.g. "MnM Field Notes\...", see src/build.ps1's release
            // process) - found generically rather than hardcoding that exact
            // name, so a future rename of the zip's internal folder doesn't
            // silently break this.
            string sourceRoot = Directory.GetDirectories(stagingDir).FirstOrDefault() ?? stagingDir;
            string newExePath = Path.Combine(sourceRoot, "MnMFieldNotes.exe");

            // Validate BEFORE touching anything live - if the download or
            // extraction produced something unexpected, bail out here with
            // the current install completely untouched, rather than
            // discovering a problem mid-swap.
            if (!File.Exists(newExePath))
            {
                return new Result { Ok = false, Error = "Downloaded update looks incomplete - MnMFieldNotes.exe not found." };
            }

            CopyDirectoryOverwrite(Path.Combine(sourceRoot, "ui"), AppPaths.UiRoot);
            CopyDirectoryOverwrite(Path.Combine(sourceRoot, "lib", "webview2"), AppPaths.WebView2Root);
            CopyFileIfPresent(Path.Combine(sourceRoot, "README.txt"), Path.Combine(AppPaths.Root, "README.txt"));
            CopyFileIfPresent(Path.Combine(sourceRoot, "INSTALL.txt"), Path.Combine(AppPaths.Root, "INSTALL.txt"));

            string currentExePath = Path.Combine(AppPaths.Root, "MnMFieldNotes.exe");
            string oldExePath = Path.Combine(AppPaths.Root, "MnMFieldNotes.exe.old");
            // Best-effort - a leftover .old from a previous update that
            // never got cleaned up shouldn't block a new one.
            try { if (File.Exists(oldExePath)) File.Delete(oldExePath); } catch { }

            File.Move(currentExePath, oldExePath);
            File.Copy(newExePath, currentExePath, overwrite: true);

            Process.Start(new ProcessStartInfo
            {
                FileName = currentExePath,
                WorkingDirectory = AppPaths.Root,
                UseShellExecute = true,
            });

            return new Result { Ok = true, Error = null };
        }
        catch (Exception ex)
        {
            return new Result { Ok = false, Error = ex.Message };
        }
        finally
        {
            // Never let cleanup failure mask (or block) the actual result -
            // same reasoning as every other best-effort cleanup in this app.
            try { if (File.Exists(zipPath)) File.Delete(zipPath); } catch { }
            try { if (Directory.Exists(stagingDir)) Directory.Delete(stagingDir, true); } catch { }
        }
    }

    // Best-effort: deletes a stale MnMFieldNotes.exe.old left over from a
    // previous update, once THIS (new) process has been running for a bit -
    // by then the old process that owned that file has had time to fully
    // exit and release it. Called once from Program.cs at startup, never
    // allowed to block or fail loudly.
    public static void CleanUpOldExe()
    {
        try
        {
            string oldExePath = Path.Combine(AppPaths.Root, "MnMFieldNotes.exe.old");
            if (File.Exists(oldExePath)) File.Delete(oldExePath);
        }
        catch { /* still locked, or already gone - fine either way, try again next launch */ }
    }

    private static void CopyDirectoryOverwrite(string sourceDir, string destDir)
    {
        if (!Directory.Exists(sourceDir)) return;
        Directory.CreateDirectory(destDir);
        foreach (string file in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            string relative = file.Substring(sourceDir.Length).TrimStart(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
            string destPath = Path.Combine(destDir, relative);
            Directory.CreateDirectory(Path.GetDirectoryName(destPath));
            File.Copy(file, destPath, overwrite: true);
        }
    }

    private static void CopyFileIfPresent(string sourcePath, string destPath)
    {
        if (File.Exists(sourcePath)) File.Copy(sourcePath, destPath, overwrite: true);
    }
}
