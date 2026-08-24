# ---------------------------------------------------------------------------
# Session Viewer
# Manual-entry data-collection companion for Monsters and Memories. Never
# reads any file the game writes, never touches its process. Every field is
# typed by the user. See CLAUDE.md for the full rules this file must honor.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# Must happen before any Controls are created (WinForms throws otherwise).
# See "Defense in depth" further down, where the actual ThreadException
# handler is registered, for why this exists.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$uiRoot = Join-Path $root 'ui'
$webview2Root = Join-Path $root 'lib\webview2'
$dataDir = Join-Path $root 'Data'
$sessionsDir = Join-Path $root 'Sessions'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
New-Item -ItemType Directory -Path $sessionsDir -Force | Out-Null

Add-Type -Path (Join-Path $webview2Root 'Microsoft.Web.WebView2.Core.dll')
Add-Type -Path (Join-Path $webview2Root 'Microsoft.Web.WebView2.WinForms.dll')
[Microsoft.Web.WebView2.Core.CoreWebView2Environment]::SetLoaderDllFolderPath($webview2Root) | Out-Null

# ---------------------------------------------------------------------------
# Passive keypress counter (Fishing) - see CLAUDE.md "Keypress counter" for
# the hard rules this must honor: only the one configured key is ever acted
# on, nothing is ever logged/stored beyond a count, and the hook must never
# consume/block a keystroke (always CallNextHookEx) so the game is completely
# unaffected. This is observation, never automation - never simulate input.
# ---------------------------------------------------------------------------
Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class KeyHookNative {
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
'@

function Write-DebugLog {
    param([string]$tag, [string]$message)
    try {
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') [$tag] $message" | Add-Content -Path (Join-Path $dataDir 'error.log') -Encoding UTF8
    } catch {}
}

$WikiBaseUrl = 'https://distractibled.github.io/DistractibleD-MonstersAndMemories-Wiki/'
$AllTimeLogPath = Join-Path $dataDir 'AllTimeLog.jsonl'
$ProfilesPath = Join-Path $dataDir 'Profiles.json'

# ---------------------------------------------------------------------------
# Profiles - who's logging. A small persisted file so the name doesn't need
# retyping every launch; not sensitive data, plain JSON is fine.
# ---------------------------------------------------------------------------
function Get-Profiles {
    if (-not (Test-Path $ProfilesPath)) { return @{ profiles = @(); lastUsed = $null } }
    try {
        $raw = Get-Content -Path $ProfilesPath -Raw -Encoding UTF8 | ConvertFrom-Json
        return @{ profiles = @($raw.profiles); lastUsed = $raw.lastUsed }
    } catch {
        return @{ profiles = @(); lastUsed = $null }
    }
}

function Add-OrSetLastProfile {
    param([string]$name)
    $data = Get-Profiles
    $profiles = [System.Collections.Generic.List[string]]::new()
    $profiles.AddRange([string[]]$data.profiles)
    if (-not $profiles.Contains($name)) { $profiles.Add($name) }
    $out = @{ profiles = @($profiles); lastUsed = $name }
    ($out | ConvertTo-Json -Depth 5) | Set-Content -Path $ProfilesPath -Encoding UTF8
}

# ---------------------------------------------------------------------------
# Wiki data (read-only fetch from the published site - never a local path,
# see CLAUDE.md "Wiki data as a read-only reference")
# ---------------------------------------------------------------------------
function Get-WikiData {
    $result = @{ monsters = @(); items = @(); nodes = @(); factions = @(); zones = @(); error = $null }
    try {
        $monsters = Invoke-RestMethod -Uri ($WikiBaseUrl + 'monsters.json') -TimeoutSec 10
        $items = Invoke-RestMethod -Uri ($WikiBaseUrl + 'items.json') -TimeoutSec 10
        $nodes = Invoke-RestMethod -Uri ($WikiBaseUrl + 'gathering-nodes.json') -TimeoutSec 10
        $maps = Invoke-RestMethod -Uri ($WikiBaseUrl + 'maps.json') -TimeoutSec 10
        $result.monsters = @($monsters | ForEach-Object { @{ name = $_.name } })
        $result.items = @($items | ForEach-Object { @{ name = $_.name } })
        $result.nodes = @($nodes | ForEach-Object { @{ name = $_.name; tradeskill = $_.tradeskill } })
        $result.factions = @(
            $monsters | Where-Object { $_.factionEffects } |
                ForEach-Object { $_.factionEffects } |
                ForEach-Object { $_.faction } |
                Sort-Object -Unique
        )
        # Strip a trailing " (...)" the same way the wiki's own groupMapsByArea
        # does, so alternate renderings of one zone (e.g. "Vale of Zintar" /
        # "Vale of Zintar (Numbered)") collapse to a single dropdown entry.
        $result.zones = @(
            $maps | ForEach-Object { $_.name -replace '\s*\([^)]*\)\s*$', '' } | Sort-Object -Unique
        )
    } catch {
        $result.error = $_.Exception.Message
    }
    return $result
}

# ---------------------------------------------------------------------------
# Passive keypress counter - functions. Send-ToUI is defined later (needs
# $wv), but PowerShell resolves function calls at invocation time, not
# definition time, so referencing it here before its own definition is fine
# as long as both exist before Start-KeyHook is ever actually called.
# ---------------------------------------------------------------------------
$script:KeyHookHandle = [IntPtr]::Zero
$script:KeyHookDelegate = $null
$script:KeyHookMode = 'idle'   # idle | capture | count
$script:KeyHookTarget = $null  # @{ vkCode; ctrl; alt; shift }

function Get-KeyLabel {
    param([int]$vkCode, [bool]$ctrl, [bool]$alt, [bool]$shift)
    $keyName =
        if ($vkCode -ge 0x30 -and $vkCode -le 0x39) { [char]$vkCode }
        elseif ($vkCode -ge 0x41 -and $vkCode -le 0x5A) { [char]$vkCode }
        elseif ($vkCode -ge 0x70 -and $vkCode -le 0x87) { "F$($vkCode - 0x6F)" }
        else { "Key$vkCode" }
    $mods = @()
    if ($ctrl) { $mods += 'Ctrl' }
    if ($alt) { $mods += 'Alt' }
    if ($shift) { $mods += 'Shift' }
    if ($mods.Count -gt 0) { return (($mods -join '+') + '+' + $keyName) }
    return [string]$keyName
}

# The hook callback itself does the absolute minimum - flip a flag / bump a
# counter, nothing else. It never calls Send-ToUI (WebView2 IPC), never calls
# Stop-KeyHook, never does anything that could re-enter PowerShell/COM code
# from inside a native callback. A separate polling timer (below, on the
# normal WinForms message loop, never inside the hook's own call stack) is
# what actually reacts to a capture/count and talks to the UI. Two reasons:
# (1) reentrant PowerShell-scriptblock-calling-scriptblock across a native
# callback boundary is fragile and caused a real crash during testing;
# (2) Windows can silently uninstall a low-level hook whose callback is slow
# or does too much work - keeping it trivial avoids that entirely.
$script:KeyHookCapturedPending = $null
$script:KeyHookCountPending = 0

function Stop-KeyHook {
    if ($script:KeyHookHandle -ne [IntPtr]::Zero) {
        [KeyHookNative]::UnhookWindowsHookEx($script:KeyHookHandle) | Out-Null
        $script:KeyHookHandle = [IntPtr]::Zero
    }
    $script:KeyHookMode = 'idle'
    $script:KeyHookTarget = $null
}

function Start-KeyHook {
    param([string]$mode, $target)
    Stop-KeyHook
    $script:KeyHookMode = $mode
    $script:KeyHookTarget = $target
    $script:KeyHookCapturedPending = $null
    $script:KeyHookCountPending = 0

    $script:KeyHookDelegate = [KeyHookNative+HookProc] {
        param($nCode, $wParam, $lParam)
        try {
            $wp = $wParam.ToInt32()
            if ($nCode -ge 0 -and ($wp -eq [KeyHookNative]::WM_KEYDOWN -or $wp -eq [KeyHookNative]::WM_SYSKEYDOWN)) {
                $vkCode = [Runtime.InteropServices.Marshal]::ReadInt32($lParam)
                $ctrl = ([KeyHookNative]::GetAsyncKeyState([KeyHookNative]::VK_CONTROL) -band 0x8000) -ne 0
                $alt = ([KeyHookNative]::GetAsyncKeyState([KeyHookNative]::VK_MENU) -band 0x8000) -ne 0
                $shift = ([KeyHookNative]::GetAsyncKeyState([KeyHookNative]::VK_SHIFT) -band 0x8000) -ne 0
                $isModifierKey = $vkCode -in @(0x10, 0x11, 0x12, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5)

                if ($script:KeyHookMode -eq 'capture' -and -not $isModifierKey -and $null -eq $script:KeyHookCapturedPending) {
                    $script:KeyHookCapturedPending = @{ vkCode = $vkCode; ctrl = $ctrl; alt = $alt; shift = $shift }
                } elseif ($script:KeyHookMode -eq 'count') {
                    $t = $script:KeyHookTarget
                    if ($null -ne $t -and $vkCode -eq $t.vkCode -and $ctrl -eq $t.ctrl -and $alt -eq $t.alt -and $shift -eq $t.shift) {
                        $script:KeyHookCountPending++
                    }
                }
            }
        } catch {
            # Never let a hook callback throw back into the OS message loop.
        }
        return [KeyHookNative]::CallNextHookEx([IntPtr]::Zero, $nCode, $wParam, $lParam)
    }

    $script:KeyHookHandle = [KeyHookNative]::SetWindowsHookEx([KeyHookNative]::WH_KEYBOARD_LL, $script:KeyHookDelegate, [IntPtr]::Zero, 0)
}

# Polls at a fast-enough interval that a fishing cadence (at most a couple of
# presses per second) never feels laggy, without doing any work on ticks
# where nothing changed.
$script:KeyHookPollTimer = New-Object System.Windows.Forms.Timer
$script:KeyHookPollTimer.Interval = 50
$script:KeyHookPollTimer.Add_Tick({
    try {
        if ($null -ne $script:KeyHookCapturedPending) {
            $c = $script:KeyHookCapturedPending
            $script:KeyHookCapturedPending = $null
            $label = Get-KeyLabel -vkCode $c.vkCode -ctrl $c.ctrl -alt $c.alt -shift $c.shift
            Stop-KeyHook
            Send-ToUI @{ type = 'keyCaptured'; vkCode = $c.vkCode; ctrl = $c.ctrl; alt = $c.alt; shift = $c.shift; label = $label }
        }
        while ($script:KeyHookCountPending -gt 0) {
            $script:KeyHookCountPending--
            Send-ToUI @{ type = 'keyCounted' }
        }
    } catch {
        Write-DebugLog 'KeyHookPollTimer' $_.Exception.ToString()
    }
})
$script:KeyHookPollTimer.Start()

# ---------------------------------------------------------------------------
# All-time log - append-only JSON Lines, one logged entry per line. Durable
# by construction: a crash mid-session never corrupts previously-written
# entries, and nothing needs to be re-parsed/re-written on every kill.
# ---------------------------------------------------------------------------
function Add-AllTimeLogEntry {
    param($obj)
    ($obj | ConvertTo-Json -Compress -Depth 10) | Add-Content -Path $AllTimeLogPath -Encoding UTF8
}

function Get-SessionEntries {
    param([string]$sessionId)
    if (-not (Test-Path $AllTimeLogPath)) { return @() }
    Get-Content -Path $AllTimeLogPath -Encoding UTF8 | ForEach-Object {
        if ($_.Trim()) {
            $o = $_ | ConvertFrom-Json
            if ($o.sessionId -eq $sessionId) { $o }
        }
    }
}

# ---------------------------------------------------------------------------
# Per-session export - one plain-text file, wiki-relevant fields only.
# ---------------------------------------------------------------------------
function Format-CoinString {
    param($coin)
    $parts = @()
    if ($coin.platinum) { $parts += "$($coin.platinum)p" }
    if ($coin.gold) { $parts += "$($coin.gold)g" }
    if ($coin.silver) { $parts += "$($coin.silver)s" }
    if ($coin.copper) { $parts += "$($coin.copper)c" }
    if ($parts.Count -eq 0) { return '0c' }
    return ($parts -join ' ')
}

function Write-CombatBlock {
    param($sb, $entries)
    $grouped = $entries | Group-Object -Property target
    foreach ($g in $grouped) {
        $named = ($g.Group | Where-Object { $_.named } | Select-Object -First 1)
        $tag = if ($named) { ' - NAMED' } else { '' }
        $plural = if ($g.Count -ne 1) { 's' } else { '' }
        $header = "== " + $g.Name + " (" + $g.Count + " kill" + $plural + ")" + $tag + " =="
        [void]$sb.AppendLine($header)
        foreach ($e in $g.Group) {
            $items = if ($e.items -and $e.items.Count -gt 0) { $e.items -join ', ' } else { 'none' }
            $levelPart = if ($e.playerLevel) { " | Level: $($e.playerLevel)" } else { '' }
            [void]$sb.AppendLine("- Zone: $($e.zone) | Con: $($e.con)$levelPart | Coin: $(Format-CoinString $e.coin) | Items: $items")
            if ($e.factionChanges -and $e.factionChanges.Count -gt 0) {
                $pos = @($e.factionChanges | Where-Object { $_.effect -eq 'positive' } | ForEach-Object { $_.faction })
                $neg = @($e.factionChanges | Where-Object { $_.effect -eq 'negative' } | ForEach-Object { $_.faction })
                if ($pos.Count -gt 0) { [void]$sb.AppendLine("  Faction +: $($pos -join ', ')") }
                if ($neg.Count -gt 0) { [void]$sb.AppendLine("  Faction -: $($neg -join ', ')") }
            }
        }
        [void]$sb.AppendLine('')
    }
}

function Write-HarvestingBlock {
    param($sb, $entries)
    $grouped = $entries | Group-Object -Property target
    foreach ($g in $grouped) {
        $tradeskill = $g.Group[0].tradeskill
        [void]$sb.AppendLine("== $($g.Name) ($tradeskill) ==")
        foreach ($e in $g.Group) {
            $skillPart = if ($null -ne $e.skill) { "Skill: $($e.skill) | " } else { '' }
            $outcome = if ($e.success) { "Result: $(if ($e.resultItem) { $e.resultItem } else { 'success' })" } else { 'No catch/result' }
            $attemptsPart = if ($null -ne $e.attempts) { " | Attempts: $($e.attempts)" } else { '' }
            [void]$sb.AppendLine("- Zone: $($e.zone) | $skillPart$outcome$attemptsPart")
        }
        [void]$sb.AppendLine('')
    }
}

function Write-SessionExport {
    param([string]$sessionId, [hashtable]$sessionInfo)

    $entries = @(Get-SessionEntries -sessionId $sessionId)
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine("Session export - $($sessionInfo.type)")
    [void]$sb.AppendLine("Logged by: $($sessionInfo.loggedBy)")
    [void]$sb.AppendLine("Started: $($sessionInfo.startedAt)")
    [void]$sb.AppendLine("Ended: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
    [void]$sb.AppendLine("Entries: $($entries.Count)")
    [void]$sb.AppendLine('')

    $byType = $entries | Group-Object -Property sessionType
    foreach ($typeGroup in $byType) {
        if ($byType.Count -gt 1) { [void]$sb.AppendLine("--- $($typeGroup.Name) ---"); [void]$sb.AppendLine('') }
        switch ($typeGroup.Name) {
            'combat' { Write-CombatBlock -sb $sb -entries $typeGroup.Group }
            'harvesting' { Write-HarvestingBlock -sb $sb -entries $typeGroup.Group }
            default { Write-CombatBlock -sb $sb -entries $typeGroup.Group }
        }
    }

    $fileName = "$($sessionInfo.startedAt -replace '[: ]','-')_$($sessionInfo.loggedBy)_$($sessionInfo.type).txt"
    $fileName = $fileName -replace '[\\/:*?"<>|]', '_'
    $path = Join-Path $sessionsDir $fileName
    Set-Content -Path $path -Value $sb.ToString() -Encoding UTF8
    return @{ path = $path; fileName = $fileName; count = $entries.Count }
}

# ---------------------------------------------------------------------------
# WinForms + WebView2 host
# ---------------------------------------------------------------------------
$script:Sessions = @{}  # sessionId -> @{ type; loggedBy; startedAt }

$form = New-Object System.Windows.Forms.Form
$form.Text = 'Session Viewer'
$form.Width = 900
$form.Height = 1500

# This app is designed to run on a second monitor while playing (see
# CLAUDE.md "Visual style"), not share the primary one - open there
# automatically when one is connected.
$secondaryScreen = [System.Windows.Forms.Screen]::AllScreens | Where-Object { -not $_.Primary } | Select-Object -First 1
if ($secondaryScreen) {
    $form.StartPosition = 'Manual'
    $area = $secondaryScreen.WorkingArea
    $form.Location = New-Object System.Drawing.Point(
        ($area.X + [Math]::Max(0, [int](($area.Width - $form.Width) / 2))),
        ($area.Y + [Math]::Max(0, [int](($area.Height - $form.Height) / 2)))
    )
} else {
    $form.StartPosition = 'CenterScreen'
}

if ($env:SV_AUTOTEST -eq '1') {
    # Hard ceiling so an automated run can never hang/block indefinitely,
    # no matter what goes wrong elsewhere.
    $script:AutotestFailsafe = New-Object System.Windows.Forms.Timer
    $script:AutotestFailsafe.Interval = 20000
    $script:AutotestFailsafe.Add_Tick({
        $script:AutotestFailsafe.Stop()
        $reportPath = Join-Path $root 'lib\autotest-result.txt'
        if (-not (Test-Path $reportPath)) {
            Set-Content -Path $reportPath -Value 'FAILSAFE: test did not complete within 20s' -Encoding UTF8
        }
        $form.Close()
    })
    $script:AutotestFailsafe.Start()
}

$wv = New-Object Microsoft.Web.WebView2.WinForms.WebView2
$wv.Dock = 'Fill'
$cp = New-Object Microsoft.Web.WebView2.WinForms.CoreWebView2CreationProperties
$cp.UserDataFolder = Join-Path $dataDir 'WebView2UserData'
$wv.CreationProperties = $cp
$form.Controls.Add($wv)
$form.Add_FormClosing({ Stop-KeyHook })

function Send-ToUI {
    param([hashtable]$obj)
    $json = $obj | ConvertTo-Json -Compress -Depth 10
    $wv.CoreWebView2.PostWebMessageAsJson($json)
}

$wv.add_CoreWebView2InitializationCompleted({
    param($s, $e)
    if (-not $e.IsSuccess) {
        [System.Windows.Forms.MessageBox]::Show("Could not start the embedded browser: $($e.InitializationException.Message)", 'Session Viewer') | Out-Null
        $form.Close()
        return
    }

    $s.CoreWebView2.SetVirtualHostNameToFolderMapping('appassets.local', $uiRoot, [Microsoft.Web.WebView2.Core.CoreWebView2HostResourceAccessKind]::Allow)

    $s.CoreWebView2.add_WebMessageReceived({
        param($s2, $e2)
        try {
            $msg = $e2.WebMessageAsJson | ConvertFrom-Json
        } catch {
            return
        }

        switch ($msg.type) {
            'ready' {
                $script:wikiData = Get-WikiData
                Send-ToUI @{ type = 'wikiData'; monsters = $script:wikiData.monsters; items = $script:wikiData.items; nodes = $script:wikiData.nodes; factions = $script:wikiData.factions; zones = $script:wikiData.zones; error = $script:wikiData.error }
                $profileData = Get-Profiles
                Send-ToUI @{ type = 'profiles'; profiles = $profileData.profiles; lastUsed = $profileData.lastUsed }
            }
            'setProfile' {
                Add-OrSetLastProfile -name $msg.name
            }
            'startSession' {
                $sessionId = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + ([guid]::NewGuid().ToString('N').Substring(0,6))
                $script:Sessions[$sessionId] = @{
                    type = $msg.sessionType
                    loggedBy = $msg.loggedBy
                    startedAt = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
                }
                Send-ToUI @{ type = 'sessionStarted'; sessionId = $sessionId }
            }
            'logEntry' {
                # Deliberately generic: whatever fields the UI sent in msg.entry
                # are stored as-is, plus session metadata. Adding/removing a
                # field for any session type never needs a change here - see
                # CLAUDE.md "Session types and fields" / the data-model note
                # on keeping this flexible.
                $info = $script:Sessions[$msg.sessionId]
                if (-not $info) { Send-ToUI @{ type = 'error'; message = 'Unknown session' }; return }
                $entryObj = $msg.entry
                $entryObj | Add-Member -MemberType NoteProperty -Name sessionId -Value $msg.sessionId -Force
                $entryObj | Add-Member -MemberType NoteProperty -Name sessionType -Value $msg.sessionType -Force
                $entryObj | Add-Member -MemberType NoteProperty -Name loggedBy -Value $info.loggedBy -Force
                Add-AllTimeLogEntry -obj $entryObj
            }
            'endSession' {
                $info = $script:Sessions[$msg.sessionId]
                if (-not $info) { Send-ToUI @{ type = 'error'; message = 'Unknown session' }; return }
                $result = Write-SessionExport -sessionId $msg.sessionId -sessionInfo $info
                $script:Sessions.Remove($msg.sessionId)
                Send-ToUI @{ type = 'sessionEnded'; exportFileName = $result.fileName; entryCount = $result.count }

                if ($env:SV_AUTOTEST -eq '1') {
                    $wikiOk = ($script:wikiData.monsters.Count -gt 0 -or $script:wikiData.items.Count -gt 0) -and (-not $script:wikiData.error)
                    $allEntries = @(Get-SessionEntries -sessionId $msg.sessionId)
                    $harvestEntry = $allEntries | Where-Object { $_.sessionType -eq 'harvesting' } | Select-Object -First 1
                    $report = @(
                        "wikiFetchOk=$wikiOk (monsters=$($script:wikiData.monsters.Count) items=$($script:wikiData.items.Count) error=$($script:wikiData.error))",
                        "sessionId=$($msg.sessionId)",
                        "exportPath=$($result.path)",
                        "exportEntryCount=$($result.count)",
                        "exportFileExists=$(Test-Path $result.path)",
                        "allTimeLogHasEntry=$($allEntries.Count -gt 0)",
                        "harvestEntryFound=$($null -ne $harvestEntry)",
                        "harvestAttempts=$($harvestEntry.attempts)",
                        "harvestNode=$($harvestEntry.target)"
                    )
                    Set-Content -Path (Join-Path $root 'lib\autotest-result.txt') -Value $report -Encoding UTF8
                    $script:closeAfterExportTimer = New-Object System.Windows.Forms.Timer
                    $script:closeAfterExportTimer.Interval = 500
                    $script:closeAfterExportTimer.Add_Tick({ $script:closeAfterExportTimer.Stop(); $form.Close() })
                    $script:closeAfterExportTimer.Start()
                }
            }
            'startKeyCapture' {
                Start-KeyHook -mode 'capture' -target $null
            }
            'startKeyCounting' {
                $target = @{ vkCode = [int]$msg.vkCode; ctrl = [bool]$msg.ctrl; alt = [bool]$msg.alt; shift = [bool]$msg.shift }
                Start-KeyHook -mode 'count' -target $target
            }
            'stopKeyCounting' {
                Stop-KeyHook
            }
        }
    })

    $s.CoreWebView2.add_NavigationCompleted({
        param($s3, $e3)
        if ($env:SV_AUTOTEST -eq '1' -and $e3.IsSuccess) {
            # Dev-only scripted driver: exercises the real UI (real JS, real
            # PS message handlers) end to end, then reports a result to disk
            # and closes. Never runs in normal use (SV_AUTOTEST unset).
            $testScript = @'
(function() {
  function byId(id) { return document.getElementById(id); }
  function setVal(id, v) { byId(id).value = v; }
  setVal('profile-modal-input', 'AutoTestUser');
  byId('profile-modal-save').click();
  byId('btn-start-session').click();
  setTimeout(function() {
    setVal('new-mob', 'a test dummy');
    byId('add-mob').click();
    setTimeout(function() {
      setVal('f-zone', 'Test Zone');
      byId('f-silver').value = '7';
      setVal('f-item', 'Totally New Test Item');
      byId('add-item-btn').click();
      byId('log-kill-btn').click();
      setTimeout(function() {
        document.querySelector('.tab[data-tab="fishing"]').click();
        byId('fish-listen-btn').click();
      }, 300);
    }, 300);
  }, 300);

  // Skill modal opens on "Start fishing!" now - fill it in and confirm.
  setTimeout(function() {
    byId('fish-start-btn').click();
    setVal('fish-skill-modal-input', '10');
    byId('fish-skill-modal-go').click();
  }, 3200);

  // Active screen is up: pick a zone via the searchable single-select
  // checklist dropdown (radio inputs, not a <select> any more), bump skill,
  // and add a custom fish so a pick button exists even if the wiki fetch
  // failed in this environment.
  setTimeout(function() {
    byId('fish-zone-toggle').click();
    var firstZoneOption = document.querySelector('#fish-zone-grid input[type=radio]');
    if (firstZoneOption) firstZoneOption.click();
    byId('fish-skill-plus').click();
    setVal('fish-new-name', 'Autotest Fish');
    byId('fish-add-btn').click();
  }, 4600);

  // Catch the fish we just added, then leave one attempt uncaught so the
  // end-of-session auto-flush (there's no separate "no catch" button any
  // more) has something to send.
  setTimeout(function() {
    var fishBtn = document.querySelector('.fish-pick-btn[data-fish="Autotest Fish"]');
    if (fishBtn) fishBtn.click();
    byId('fish-attempts-plus').click();
    setTimeout(function() { byId('btn-end-session').click(); }, 300);
  }, 5800);
})();
'@
            Start-Sleep -Milliseconds 500
            $s3.ExecuteScriptAsync($testScript) | Out-Null

            # Simulate two real keypresses on the SAME configured key: the
            # first is consumed by capture (sets the key), the second should
            # be counted once fishing has actually started (see startFishing()
            # in app.js - counting only begins after the skill modal is
            # confirmed). Entirely self-contained - never touches the game.
            $script:keyTimer1 = New-Object System.Windows.Forms.Timer
            $script:keyTimer1.Interval = 2500
            $script:keyTimer1.Add_Tick({
                try { $script:keyTimer1.Stop(); [System.Windows.Forms.SendKeys]::Send('{F15}') }
                catch { Write-DebugLog 'keyTimer1' $_.Exception.ToString() }
            })
            $script:keyTimer1.Start()

            $script:keyTimer2 = New-Object System.Windows.Forms.Timer
            $script:keyTimer2.Interval = 4200
            $script:keyTimer2.Add_Tick({
                try { $script:keyTimer2.Stop(); [System.Windows.Forms.SendKeys]::Send('{F15}') }
                catch { Write-DebugLog 'keyTimer2' $_.Exception.ToString() }
            })
            $script:keyTimer2.Start()
        }
    })

    $s.CoreWebView2.Navigate('https://appassets.local/index.html')
})

$form.Add_Shown({
    $wv.EnsureCoreWebView2Async($null) | Out-Null
})

# Defense in depth: a bug anywhere in an event handler should never surface
# as a raw ".NET Framework - unhandled exception" dialog to the user (alarming
# and unhelpful for a non-technical audience). Log it and show one plain
# message instead. This does not fix bugs - it just fails safely if one slips
# through despite the try/catch already in the hook callback and elsewhere.
[System.Windows.Forms.Application]::add_ThreadException({
    param($s, $e)
    try {
        $logPath = Join-Path $dataDir 'error.log'
        "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $($e.Exception.ToString())" | Add-Content -Path $logPath -Encoding UTF8
    } catch {}
    if ($env:SV_AUTOTEST -ne '1') {
        [System.Windows.Forms.MessageBox]::Show(
            "Something went wrong and that last action may not have saved. You can keep using the app - if this keeps happening, check Data\error.log.",
            'Session Viewer'
        ) | Out-Null
    }
})

[System.Windows.Forms.Application]::Run($form)
