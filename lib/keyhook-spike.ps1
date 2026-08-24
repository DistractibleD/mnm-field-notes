$ErrorActionPreference = 'Stop'

$src = @'
using System;
using System.Runtime.InteropServices;

public class KeyHookSpike {
    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
}
'@

Add-Type -TypeDefinition $src -Language CSharp
"Compiled OK: $([KeyHookSpike].FullName) present, WH_KEYBOARD_LL=$([KeyHookSpike]::WH_KEYBOARD_LL)"

# Actually install + immediately remove a real low-level hook to prove SetWindowsHookEx works end-to-end.
$proc = [System.Diagnostics.Process]::GetCurrentProcess()
$mod = $proc.MainModule.ModuleName
$hookDelegate = [KeyHookSpike+HookProc] {
    param($nCode, $wParam, $lParam)
    return [KeyHookSpike]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
}
$hHook = [KeyHookSpike]::SetWindowsHookEx([KeyHookSpike]::WH_KEYBOARD_LL, $hookDelegate, [IntPtr]::Zero, 0)
if ($hHook -eq [IntPtr]::Zero) {
    "Hook install FAILED, Win32 error: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())"
} else {
    "Hook installed OK, handle=$hHook"
    [KeyHookSpike]::UnhookWindowsHookEx($hHook) | Out-Null
    "Hook removed OK"
}
