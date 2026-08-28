using System;
using System.IO;

// Mirrors Write-DebugLog in the old MnMFieldNotes.ps1 - appends a timestamped
// line to Data\error.log, swallowing its own errors (logging must never be
// what crashes the app).
internal static class DebugLog
{
    public static void Write(string tag, string message)
    {
        try
        {
            string line = string.Format(
                "{0:yyyy-MM-dd HH:mm:ss} [{1}] {2}{3}",
                DateTime.Now, tag, message, Environment.NewLine);
            File.AppendAllText(AppPaths.ErrorLogPath, line);
        }
        catch
        {
            // Logging itself must never throw.
        }
    }
}
