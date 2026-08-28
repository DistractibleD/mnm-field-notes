using System;
using System.Runtime.InteropServices;

// Same P/Invoke declarations as the old MnMFieldNotes.ps1's inline
// Add-Type block (KeyHookNative), copied near-verbatim - it was already
// real C#, just JIT'd through PowerShell's Add-Type before. See CLAUDE.md
// "Keypress counter": only the one configured key is ever acted on,
// nothing is ever logged/stored beyond a count, and the hook must never
// consume/block a keystroke (always CallNextHookEx) so the game is
// completely unaffected. This is observation, never automation.
internal static class KeyHookNative
{
    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);

    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
    public const int WM_SYSKEYDOWN = 0x0104;
    public const int VK_CONTROL = 0x11;
    public const int VK_MENU = 0x12;
    public const int VK_SHIFT = 0x10;
}
