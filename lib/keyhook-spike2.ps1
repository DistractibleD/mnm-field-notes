$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$src = @'
using System;
using System.Runtime.InteropServices;

public class KeyHook2 {
    public delegate IntPtr HookProc(int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern IntPtr SetWindowsHookEx(int idHook, HookProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    public static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    public const int WH_KEYBOARD_LL = 13;
    public const int WM_KEYDOWN = 0x0100;
}
'@
Add-Type -TypeDefinition $src -Language CSharp

$script:hitCount = 0
$script:lastVk = 0

$hookDelegate = [KeyHook2+HookProc] {
    param($nCode, $wParam, $lParam)
    if ($nCode -ge 0 -and $wParam.ToInt32() -eq [KeyHook2]::WM_KEYDOWN) {
        $vk = [Runtime.InteropServices.Marshal]::ReadInt32($lParam)
        $script:hitCount++
        $script:lastVk = $vk
    }
    return [KeyHook2]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
}

$hHook = [KeyHook2]::SetWindowsHookEx([KeyHook2]::WH_KEYBOARD_LL, $hookDelegate, [IntPtr]::Zero, 0)
if ($hHook -eq [IntPtr]::Zero) {
    "Hook install FAILED"
    exit 1
}

# A tiny invisible form gives us a real message loop (WH_KEYBOARD_LL hook
# callbacks are delivered via the installing thread's message queue).
$form = New-Object System.Windows.Forms.Form
$form.Width = 200
$form.Height = 100
$form.StartPosition = 'CenterScreen'
$form.TopMost = $true

$resultPath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) 'keyhook-spike2-result.txt'
Remove-Item $resultPath -ErrorAction SilentlyContinue

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 400
$fired = $false
$timer.Add_Tick({
    if (-not $fired) {
        $fired = $true
        [System.Windows.Forms.SendKeys]::SendWait('{F15}')
    } else {
        $timer.Stop()
        [KeyHook2]::UnhookWindowsHookEx($hHook) | Out-Null
        Set-Content -Path $resultPath -Value "hitCount=$script:hitCount lastVk=$script:lastVk (F15 = 126 / 0x7E)"
        $form.Close()
    }
})
$form.Add_Shown({ $timer.Start() })

$failsafe = New-Object System.Windows.Forms.Timer
$failsafe.Interval = 8000
$failsafe.Add_Tick({
    $failsafe.Stop()
    if (-not (Test-Path $resultPath)) {
        Set-Content -Path $resultPath -Value "FAILSAFE TIMEOUT hitCount=$script:hitCount lastVk=$script:lastVk"
    }
    $form.Close()
})
$failsafe.Start()

[System.Windows.Forms.Application]::Run($form)
