using System.Runtime.InteropServices;

// Same P/Invoke the old MnMFieldNotes.ps1 already used (as an inline C#
// Add-Type block) - kept even though the exe's own icon/identity is now the
// real fix for taskbar pinning, since this doesn't hurt and is still correct
// practice for a GUI app's own taskbar grouping.
internal static class AppIdentity
{
    [DllImport("shell32.dll", SetLastError = true)]
    public static extern int SetCurrentProcessExplicitAppUserModelID(
        [MarshalAs(UnmanagedType.LPWStr)] string appId);
}
