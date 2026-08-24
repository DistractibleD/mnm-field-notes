$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)

$src = @'
using System;
using System.Runtime.InteropServices;

public class KeyHook3 {
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
}
'@
Add-Type -TypeDefinition $src -Language CSharp

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$logPath = Join-Path $root 'keyhook-spike3-result.txt'
Remove-Item $logPath -ErrorAction SilentlyContinue
function Log($m) { Add-Content -Path $logPath -Value "$(Get-Date -Format 'HH:mm:ss.fff') $m" }

$script:Mode = 'capture'   # capture | count
$script:TargetVk = $null
$script:CapturedPending = $null
$script:CountPending = 0
$script:HookHandle = [IntPtr]::Zero
$script:HookDelegate = $null

function Stop-Hook3 {
    if ($script:HookHandle -ne [IntPtr]::Zero) {
        [KeyHook3]::UnhookWindowsHookEx($script:HookHandle) | Out-Null
        $script:HookHandle = [IntPtr]::Zero
    }
}

function Start-Hook3 {
    $script:HookDelegate = [KeyHook3+HookProc] {
        param($nCode, $wParam, $lParam)
        try {
            if ($nCode -ge 0 -and $wParam.ToInt32() -eq [KeyHook3]::WM_KEYDOWN) {
                $vk = [Runtime.InteropServices.Marshal]::ReadInt32($lParam)
                if ($script:Mode -eq 'capture' -and $null -eq $script:CapturedPending) {
                    $script:CapturedPending = $vk
                } elseif ($script:Mode -eq 'count' -and $vk -eq $script:TargetVk) {
                    $script:CountPending++
                }
            }
        } catch {
            Log "HOOK CALLBACK THREW: $($_.Exception.ToString())"
        }
        return [KeyHook3]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
    }
    $script:HookHandle = [KeyHook3]::SetWindowsHookEx([KeyHook3]::WH_KEYBOARD_LL, $script:HookDelegate, [IntPtr]::Zero, 0)
    Log "Hook installed, handle=$script:HookHandle mode=$script:Mode"
}

# Stub for Send-ToUI - just logs, never touches WebView2/COM at all.
function Send-ToUIStub {
    param($obj)
    Log "Send-ToUIStub called: $($obj | ConvertTo-Json -Compress)"
}

$pollTimer = New-Object System.Windows.Forms.Timer
$pollTimer.Interval = 50
$pollTimer.Add_Tick({
    try {
        if ($null -ne $script:CapturedPending) {
            $vk = $script:CapturedPending
            $script:CapturedPending = $null
            Stop-Hook3
            Log "Captured vk=$vk - switching to count mode"
            Send-ToUIStub @{ type = 'keyCaptured'; vkCode = $vk }
            $script:TargetVk = $vk
            $script:Mode = 'count'
            Start-Hook3
        }
        while ($script:CountPending -gt 0) {
            $script:CountPending--
            Log "Counted a press"
            Send-ToUIStub @{ type = 'keyCounted' }
        }
    } catch {
        Log "POLL TIMER THREW: $($_.Exception.ToString())"
    }
})
$pollTimer.Start()

# Invisible, off-taskbar window - just enough of a message loop for the
# Timer/hook to work, nothing visible on screen.
$form = New-Object System.Windows.Forms.Form
$form.ShowInTaskbar = $false
$form.Opacity = 0
$form.FormBorderStyle = 'None'
$form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point(-2000, -2000)
$form.Width = 10
$form.Height = 10

$form.Add_Shown({
    Log "Form shown"
    Start-Hook3

    $script:t1 = New-Object System.Windows.Forms.Timer
    $script:t1.Interval = 1000
    $script:t1.Add_Tick({
        try { $script:t1.Stop(); Log "Sending F15 #1"; [System.Windows.Forms.SendKeys]::Send('{F15}') }
        catch { Log "t1 THREW: $($_.Exception.ToString())" }
    })
    $script:t1.Start()

    $script:t2 = New-Object System.Windows.Forms.Timer
    $script:t2.Interval = 2000
    $script:t2.Add_Tick({
        try { $script:t2.Stop(); Log "Sending F15 #2"; [System.Windows.Forms.SendKeys]::Send('{F15}') }
        catch { Log "t2 THREW: $($_.Exception.ToString())" }
    })
    $script:t2.Start()

    $script:closeTimer = New-Object System.Windows.Forms.Timer
    $script:closeTimer.Interval = 4000
    $script:closeTimer.Add_Tick({
        $script:closeTimer.Stop()
        Log "Final: mode=$script:Mode targetVk=$script:TargetVk countPending=$script:CountPending"
        Stop-Hook3
        $form.Close()
    })
    $script:closeTimer.Start()
})

[System.Windows.Forms.Application]::add_ThreadException({
    param($s, $e)
    Log "UNHANDLED (ThreadException): $($e.Exception.ToString())"
})
[System.Windows.Forms.Application]::Run($form)
Log "Script done"
