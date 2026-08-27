# ---------------------------------------------------------------------------
# MnM Field Notes
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
$script:AppVersion = '0.4'
$script:AppBuildDate = '2026-08-27'
$UpdateCheckUrl = 'https://raw.githubusercontent.com/DistractibleD/mnm-field-notes/main/latest.json'
# Same Worker URL as SUBMIT_WORKER_URL in the wiki's own script.js - the
# "sessionExport" code path is this project's own addition, see CLAUDE.md
# "Session export submission" and lib/cloudflare-worker/submit-worker.js.
$SubmitWorkerUrl = 'https://muddy-bar-88a7.mnm-wiki.workers.dev'
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
    $result = @{ monsters = @(); items = @(); nodes = @(); recipes = @(); factions = @(); zones = @(); pageUrl = $WikiBaseUrl; error = $null }
    try {
        $monsters = Invoke-RestMethod -Uri ($WikiBaseUrl + 'monsters.json') -TimeoutSec 10
        $items = Invoke-RestMethod -Uri ($WikiBaseUrl + 'items.json') -TimeoutSec 10
        $nodes = Invoke-RestMethod -Uri ($WikiBaseUrl + 'gathering-nodes.json') -TimeoutSec 10
        $crafting = Invoke-RestMethod -Uri ($WikiBaseUrl + 'crafting.json') -TimeoutSec 10
        $maps = Invoke-RestMethod -Uri ($WikiBaseUrl + 'maps.json') -TimeoutSec 10
        $result.monsters = @($monsters | ForEach-Object {
            # drops is [{item:"Name"}, ...] in the wiki - flatten to plain
            # strings, same reasoning as gathering nodes' `results` below.
            $flatDrops = @($_.drops | ForEach-Object { $_.item })
            @{ name = $_.name; named = [bool]$_.named; locations = @($_.maps); areas = @($_.areas); drops = $flatDrops }
        })
        $result.items = @($items | ForEach-Object { @{ name = $_.name } })
        $result.nodes = @($nodes | ForEach-Object {
            # results can mix plain strings ("Copper Ore") and family objects
            # ({family:"Chipped", label:"Chipped Gems"}) - flatten both to the
            # display label so the client only ever deals with plain strings.
            $flatResults = @($_.results | ForEach-Object { if ($_.label) { $_.label } else { $_ } })
            @{ name = $_.name; tradeskill = $_.tradeskill; locations = @($_.locations); note = $_.note; results = $flatResults; minSkill = $_.minSkill; trivialSkill = $_.trivialSkill }
        })
        $result.recipes = @($crafting | ForEach-Object { @{ name = $_.name; tradeskill = $_.tradeskill } })
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

# Date-based version strings (yyyy.MM.dd) sort correctly with a plain string
# comparison, so no version-parsing library is needed.
function Get-UpdateInfo {
    try {
        $latest = Invoke-RestMethod -Uri $UpdateCheckUrl -TimeoutSec 10
        return @{
            currentVersion = $script:AppVersion
            buildDate = $script:AppBuildDate
            latestVersion = $latest.version
            url = $latest.url
            available = (Compare-AppVersion -a $latest.version -b $script:AppVersion) -gt 0
            error = $null
        }
    } catch {
        return @{ currentVersion = $script:AppVersion; buildDate = $script:AppBuildDate; latestVersion = $null; url = $null; available = $false; error = $_.Exception.Message }
    }
}

# "major.minor", e.g. "0.1" pre-1.0 (still alpha), "1.0" = first finished
# release. Compared as real integers per segment, never as strings/whole-value
# casts - "0.10" vs "0.9" would be wrong both ways otherwise (string: "1" <
# "9"; a single [int] cast can't parse a dotted string at all).
function Compare-AppVersion {
    param([string]$a, [string]$b)
    $aParts = $a -split '\.' | ForEach-Object { [int]$_ }
    $bParts = $b -split '\.' | ForEach-Object { [int]$_ }
    if ($aParts[0] -ne $bParts[0]) { return $aParts[0] - $bParts[0] }
    return $aParts[1] - $bParts[1]
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

# Aggregates every Fishing entry ever logged (all sessions, all time) into
# per-zone totals - attempts vs. catches per fish - so the client can show an
# empirical "how rare is this fish here" guess (Fishing tab rarity bars,
# 2026-08-27). Read-only, recomputed fresh on 'ready' rather than cached:
# AllTimeLog.jsonl is small at this app's scale, staying correct beats
# staying fast here. Each logged entry's `attempts` is casts leading up to
# that entry (a catch or a flushed no-catch batch - see logFishCatch/
# flushPendingFishAttempts in app.js), so summing it across a zone gives
# total casts there; `success`+`resultItem` gives which fish, if any.
function Get-FishRarity {
    $result = @{}
    if (-not (Test-Path $AllTimeLogPath)) { return $result }
    Get-Content -Path $AllTimeLogPath -Encoding UTF8 | ForEach-Object {
        if (-not $_.Trim()) { return }
        try { $o = $_ | ConvertFrom-Json } catch { return }
        if ($o.tradeskill -ne 'Fishing' -or -not $o.zone) { return }
        if (-not $result.ContainsKey($o.zone)) {
            $result[$o.zone] = @{ totalAttempts = 0; fish = @{} }
        }
        $attempts = if ($null -ne $o.attempts) { [int]$o.attempts } else { 0 }
        $result[$o.zone].totalAttempts += $attempts
        if ($o.success -and $o.resultItem) {
            $fishName = $o.resultItem
            if (-not $result[$o.zone].fish.ContainsKey($fishName)) { $result[$o.zone].fish[$fishName] = 0 }
            $result[$o.zone].fish[$fishName]++
        }
    }
    return $result
}

# Pooled Fishing rarity across every guild member's MERGED session exports
# (backlog #20/#21) - fetched from the wiki repo's own published
# fishing-rarity.json (built there by a GitHub Action on every merge to
# session-exports/, see that repo's CLAUDE.md "Session exports & pooled
# Fishing rarity"). Same shape as Get-FishRarity by design, so the client can
# merge the two without any translation. Soft-fails to an empty object on any
# error (network, 404 before the file exists, malformed JSON) - same
# reasoning as Get-WikiData's own error handling, never blocks the app.
function Get-SharedFishRarity {
    try {
        $data = Invoke-RestMethod -Uri ($WikiBaseUrl + 'fishing-rarity.json') -TimeoutSec 10
        if ($null -eq $data) { return @{} }
        return $data
    } catch {
        return @{}
    }
}

# Empirical zone level range (2026-08-27, backlog #6) - min/max of every
# playerLevel logged against a Combat kill in that zone, across all-time
# local history. Same reasoning as Get-FishRarity: the wiki has no numeric
# level field on any monster (checked, 0/660 per CLAUDE.md), and this
# project's wiki repo is read-only anyway, so an app-computed estimate from
# this app's own data is the only buildable option, not a stopgap. Skips
# entries with no playerLevel (the field is optional per-kill) rather than
# treating a missing value as 0, which would silently drag every zone's
# minimum down to 0.
function Get-CombatZoneLevelRange {
    $result = @{}
    if (-not (Test-Path $AllTimeLogPath)) { return $result }
    Get-Content -Path $AllTimeLogPath -Encoding UTF8 | ForEach-Object {
        if (-not $_.Trim()) { return }
        try { $o = $_ | ConvertFrom-Json } catch { return }
        if ($o.sessionType -ne 'combat' -or -not $o.zone -or $null -eq $o.playerLevel) { return }
        $level = [int]$o.playerLevel
        if (-not $result.ContainsKey($o.zone)) {
            $result[$o.zone] = @{ min = $level; max = $level; count = 0 }
        }
        if ($level -lt $result[$o.zone].min) { $result[$o.zone].min = $level }
        if ($level -gt $result[$o.zone].max) { $result[$o.zone].max = $level }
        $result[$o.zone].count++
    }
    return $result
}

# Rewrites the one matching line in place (by the entry's client-generated
# id) rather than appending a correction - the all-time log stays append-only
# for new entries, this is the one deliberate exception, scoped to fixing a
# misclick before the session that logged it has ended (see 'editEntry').
function Edit-AllTimeLogEntry {
    param([string]$entryId, [PSCustomObject]$patch)
    if (-not (Test-Path $AllTimeLogPath)) { return }
    $lines = Get-Content -Path $AllTimeLogPath -Encoding UTF8
    $out = foreach ($line in $lines) {
        if (-not $line.Trim()) { $line; continue }
        $o = $line | ConvertFrom-Json
        if ($o.id -eq $entryId) {
            foreach ($prop in $patch.PSObject.Properties) {
                $o | Add-Member -MemberType NoteProperty -Name $prop.Name -Value $prop.Value -Force
            }
            $o | ConvertTo-Json -Compress -Depth 10
        } else {
            $line
        }
    }
    Set-Content -Path $AllTimeLogPath -Value $out -Encoding UTF8
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
            $areaPart = if ($e.area) { " | Area: $($e.area)" } else { '' }
            $skillPart = if ($null -ne $e.skill) { "Skill: $($e.skill) | " } else { '' }
            $outcome = if ($e.success) { "Result: $(if ($e.resultItem) { $e.resultItem } else { 'success' })" } else { 'No catch/result' }
            $attemptsPart = if ($null -ne $e.attempts) { " | Attempts: $($e.attempts)" } else { '' }
            [void]$sb.AppendLine("- Zone: $($e.zone)$areaPart | $skillPart$outcome$attemptsPart")
        }
        [void]$sb.AppendLine('')
    }
}

function Write-CraftingBlock {
    param($sb, $entries)
    $grouped = $entries | Group-Object -Property target
    foreach ($g in $grouped) {
        $tradeskill = $g.Group[0].tradeskill
        [void]$sb.AppendLine("== $($g.Name) ($tradeskill) ==")

        # Stats/resists/haste live on the dish itself, not per-attempt (a
        # recipe always grants the same buff), so print them once from the
        # first attempt rather than repeating on every line.
        $first = $g.Group[0]
        $statsParts = @()
        if ($first.stats) { $first.stats.PSObject.Properties | ForEach-Object { $statsParts += "$($_.Name) +$($_.Value)" } }
        $resistParts = @()
        if ($first.resists) { $first.resists.PSObject.Properties | ForEach-Object { $resistParts += "$($_.Name) +$($_.Value)" } }
        if ($statsParts.Count -gt 0 -or $resistParts.Count -gt 0 -or $first.haste) {
            $statsLine = if ($statsParts.Count -gt 0) { $statsParts -join ', ' } else { 'none' }
            $resistLine = if ($resistParts.Count -gt 0) { $resistParts -join ', ' } else { 'none' }
            $hasteLine = if ($first.haste) { "+$($first.haste)%" } else { 'none' }
            [void]$sb.AppendLine("Grants: $statsLine | Resists: $resistLine | Haste: $hasteLine")
        }

        foreach ($e in $g.Group) {
            $skillPart = if ($null -ne $e.skill) { "Skill: $($e.skill) | " } else { '' }
            $outcome = if ($e.success) { 'Success' } else { 'Fail' }
            $componentsPart = if ($e.components -and $e.components.Count -gt 0) { " | Components: $($e.components -join ', ')" } else { '' }
            [void]$sb.AppendLine("- $($skillPart)Difficulty: $($e.difficultyColor) | Result: $outcome$componentsPart")
        }
        [void]$sb.AppendLine('')
    }
}

# Computed rarity stats for the export - the wiki-side reviewer only ever
# sees ONE submission's raw entries otherwise, not the fuller statistical
# picture this app already builds for its own rarity bars (see
# computeZoneRarity()/renderFishRarityPanel() in app.js). Reuses Get-FishRarity
# (the same function powering the live in-app bars) for the all-time half, so
# there's one source of truth for "how is rarity computed" rather than two.
# Same honest framing as the in-app bars: this app's own logged data, not the
# wiki's Common/Uncommon/Rare label.
function Write-FishRarityBlock {
    param($sb, $entries)
    $fishEntries = @($entries | Where-Object { $_.tradeskill -eq 'Fishing' })
    if ($fishEntries.Count -eq 0) { return }

    $allTimeRarity = Get-FishRarity
    [void]$sb.AppendLine("--- Fishing rarity data (this app's own logged data, not the wiki's rarity label) ---")
    [void]$sb.AppendLine('')

    $byZone = $fishEntries | Group-Object -Property zone
    foreach ($zg in $byZone) {
        $zone = $zg.Name
        if (-not $zone) { continue }
        $sessionAttempts = ($zg.Group | Measure-Object -Property attempts -Sum).Sum
        if (-not $sessionAttempts) { $sessionAttempts = 0 }
        $sessionCatches = [ordered]@{}
        foreach ($e in $zg.Group) {
            if ($e.success -and $e.resultItem) {
                if (-not $sessionCatches.Contains($e.resultItem)) { $sessionCatches[$e.resultItem] = 0 }
                $sessionCatches[$e.resultItem]++
            }
        }

        [void]$sb.AppendLine("== $zone ==")
        [void]$sb.AppendLine("This session - $sessionAttempts attempt$(if ($sessionAttempts -ne 1) { 's' }):")
        if ($sessionCatches.Count -eq 0) {
            [void]$sb.AppendLine('  (no catches this session)')
        } else {
            foreach ($fishName in ($sessionCatches.Keys | Sort-Object)) {
                $count = $sessionCatches[$fishName]
                $pct = if ($sessionAttempts -gt 0) { [math]::Round(($count / $sessionAttempts) * 100, 1) } else { 0 }
                [void]$sb.AppendLine("  - $fishName`: $count / $sessionAttempts ($pct%)")
            }
        }

        if ($allTimeRarity.ContainsKey($zone)) {
            $allTime = $allTimeRarity[$zone]
            [void]$sb.AppendLine("All-time on this install, includes this session - $($allTime.totalAttempts) attempts:")
            foreach ($fishName in ($allTime.fish.Keys | Sort-Object)) {
                $count = $allTime.fish[$fishName]
                $pct = if ($allTime.totalAttempts -gt 0) { [math]::Round(($count / $allTime.totalAttempts) * 100, 1) } else { 0 }
                [void]$sb.AppendLine("  - $fishName`: $count / $($allTime.totalAttempts) ($pct%)")
            }
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
    if ($sessionInfo.ContainsKey('fishingStartSkill')) {
        [void]$sb.AppendLine("Fishing skill at session start: $($sessionInfo.fishingStartSkill)")
    }
    if ($sessionInfo.ContainsKey('fishingEndSkill')) {
        [void]$sb.AppendLine("Fishing skill at session end: $($sessionInfo.fishingEndSkill)")
    }
    if ($sessionInfo.ContainsKey('gatheringStartSkill')) {
        [void]$sb.AppendLine("Gathering skill at session start: $($sessionInfo.gatheringStartSkill)")
    }
    if ($sessionInfo.ContainsKey('gatheringEndSkill')) {
        [void]$sb.AppendLine("Gathering skill at session end: $($sessionInfo.gatheringEndSkill)")
    }
    [void]$sb.AppendLine('')

    $byType = $entries | Group-Object -Property sessionType
    foreach ($typeGroup in $byType) {
        if ($byType.Count -gt 1) { [void]$sb.AppendLine("--- $($typeGroup.Name) ---"); [void]$sb.AppendLine('') }
        switch ($typeGroup.Name) {
            'combat' { Write-CombatBlock -sb $sb -entries $typeGroup.Group }
            'harvesting' { Write-HarvestingBlock -sb $sb -entries $typeGroup.Group }
            'crafting' { Write-CraftingBlock -sb $sb -entries $typeGroup.Group }
            default { Write-CombatBlock -sb $sb -entries $typeGroup.Group }
        }
    }

    Write-FishRarityBlock -sb $sb -entries $entries

    $fileName = "$($sessionInfo.startedAt -replace '[: ]','-')_$($sessionInfo.loggedBy)_$($sessionInfo.type).txt"
    $fileName = $fileName -replace '[\\/:*?"<>|]', '_'
    $path = Join-Path $sessionsDir $fileName
    Set-Content -Path $path -Value $sb.ToString() -Encoding UTF8
    return @{ path = $path; fileName = $fileName; count = $entries.Count }
}

# ---------------------------------------------------------------------------
# Session export submission - the one exception to "never write outward",
# see CLAUDE.md "Session export submission". POSTs to the wiki's own
# Cloudflare Worker (extended with a session-export path, this project's own
# copy at lib\cloudflare-worker\submit-worker.js) - it commits the export to
# a new branch and opens a PR; nothing is live until the wiki owner merges
# it. PS 5.1 has no `-Form` parameter on Invoke-RestMethod (PS 6+ only), so
# the multipart/form-data body is built by hand.
# ---------------------------------------------------------------------------
function Submit-SessionExport {
    param([string]$SessionText, [string]$Title)
    $boundary = [guid]::NewGuid().ToString('N')
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.Append("--$boundary`r`n")
    [void]$sb.Append("Content-Disposition: form-data; name=`"sessionExport`"`r`n`r`n")
    [void]$sb.Append("$SessionText`r`n")
    [void]$sb.Append("--$boundary`r`n")
    [void]$sb.Append("Content-Disposition: form-data; name=`"title`"`r`n`r`n")
    [void]$sb.Append("$Title`r`n")
    # Honeypot field the Worker checks on every submission (real callers
    # never fill it) - MnM Field Notes always sends it empty, matching the
    # wiki's own form, even though this isn't a public-facing form.
    [void]$sb.Append("--$boundary`r`n")
    [void]$sb.Append("Content-Disposition: form-data; name=`"website`"`r`n`r`n`r`n")
    [void]$sb.Append("--$boundary--`r`n")
    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($sb.ToString())

    try {
        $response = Invoke-RestMethod -Uri $SubmitWorkerUrl -Method Post `
            -ContentType "multipart/form-data; boundary=$boundary" -Body $bodyBytes -TimeoutSec 25
        if ($response.error) { return @{ ok = $false; error = $response.error } }
        return @{ ok = $true; error = $null }
    } catch {
        $msg = $_.Exception.Message
        try {
            $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
            if ($errBody.error) { $msg = $errBody.error }
        } catch {}
        return @{ ok = $false; error = $msg }
    }
}

# Pulls "Session export - fishing" / "Logged by: X" / "Entries: N" back out
# of the export text itself for a friendlier PR title, rather than the
# client passing separate metadata that could drift from the file's own
# header - single source of truth.
function Get-SessionExportTitle {
    param([string]$Text, [string]$FileName)
    $typeMatch = [regex]::Match($Text, 'Session export - (.+)')
    $byMatch = [regex]::Match($Text, 'Logged by: (.+)')
    $countMatch = [regex]::Match($Text, 'Entries: (\d+)')
    if ($typeMatch.Success -and $byMatch.Success) {
        $title = "$($typeMatch.Groups[1].Value.Trim()) session by $($byMatch.Groups[1].Value.Trim())"
        if ($countMatch.Success) { $title += " ($($countMatch.Groups[1].Value) entries)" }
        return $title
    }
    return "Session export ($FileName)"
}

# ---------------------------------------------------------------------------
# WinForms + WebView2 host
# ---------------------------------------------------------------------------
$script:Sessions = @{}  # sessionId -> @{ type; loggedBy; startedAt }

$form = New-Object System.Windows.Forms.Form
$form.Text = 'MnM Field Notes'
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
        [System.Windows.Forms.MessageBox]::Show("Could not start the embedded browser: $($e.InitializationException.Message)", 'MnM Field Notes') | Out-Null
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
                Send-ToUI @{ type = 'wikiData'; monsters = $script:wikiData.monsters; items = $script:wikiData.items; nodes = $script:wikiData.nodes; recipes = $script:wikiData.recipes; factions = $script:wikiData.factions; zones = $script:wikiData.zones; pageUrl = $script:wikiData.pageUrl; error = $script:wikiData.error }
                $profileData = Get-Profiles
                Send-ToUI @{ type = 'profiles'; profiles = $profileData.profiles; lastUsed = $profileData.lastUsed }
                $update = Get-UpdateInfo
                Send-ToUI @{ type = 'updateInfo'; currentVersion = $update.currentVersion; buildDate = $update.buildDate; latestVersion = $update.latestVersion; url = $update.url; available = $update.available; error = $update.error }
                Send-ToUI @{ type = 'fishRarity'; data = (Get-FishRarity) }
                Send-ToUI @{ type = 'sharedFishRarity'; data = (Get-SharedFishRarity) }
                Send-ToUI @{ type = 'combatLevelRange'; data = (Get-CombatZoneLevelRange) }
            }
            'checkForUpdates' {
                $update = Get-UpdateInfo
                Send-ToUI @{ type = 'updateInfo'; currentVersion = $update.currentVersion; buildDate = $update.buildDate; latestVersion = $update.latestVersion; url = $update.url; available = $update.available; error = $update.error; manual = $true }
            }
            'openUrl' {
                if ($msg.url -match '^https?://') {
                    Start-Process -FilePath $msg.url
                }
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
            'fishingStarted' {
                if ($script:Sessions.ContainsKey($msg.sessionId)) {
                    $script:Sessions[$msg.sessionId].fishingStartSkill = $msg.skill
                }
            }
            'fishingEnded' {
                if ($script:Sessions.ContainsKey($msg.sessionId)) {
                    $script:Sessions[$msg.sessionId].fishingEndSkill = $msg.skill
                }
            }
            'gatheringStarted' {
                if ($script:Sessions.ContainsKey($msg.sessionId)) {
                    $script:Sessions[$msg.sessionId].gatheringStartSkill = $msg.skill
                }
            }
            'gatheringEnded' {
                if ($script:Sessions.ContainsKey($msg.sessionId)) {
                    $script:Sessions[$msg.sessionId].gatheringEndSkill = $msg.skill
                }
            }
            'editEntry' {
                # Only entries in a still-running session are editable - once
                # a session's ended and exported, the export file is already
                # written and editing the all-time log alone would leave it
                # silently out of sync with what got exported.
                if ($script:Sessions.ContainsKey($msg.sessionId)) {
                    Edit-AllTimeLogEntry -entryId $msg.entryId -patch $msg.patch
                }
            }
            'submitExport' {
                $exportPath = Join-Path $sessionsDir $msg.fileName
                if (-not (Test-Path $exportPath)) {
                    Send-ToUI @{ type = 'submitExportResult'; ok = $false; error = 'Export file not found - was it moved or deleted?'; fileName = $msg.fileName }
                    return
                }
                $text = Get-Content -Path $exportPath -Raw -Encoding UTF8
                $title = Get-SessionExportTitle -Text $text -FileName $msg.fileName
                $result = Submit-SessionExport -SessionText $text -Title $title
                Send-ToUI @{ type = 'submitExportResult'; ok = $result.ok; error = $result.error; fileName = $msg.fileName }
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
  byId('btn-session-action').click(); // Combat has no prompt flow, so this starts immediately
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

  // Confirming the skill modal opens a zone modal next (added 2026-08-24) -
  // pick a zone there via its own searchable single-select checklist, then
  // confirm. A session is already running by this point (started on the
  // Combat tab above), so this joins it rather than starting a new one.
  setTimeout(function() {
    byId('fish-zone-modal-toggle').click();
    var firstZoneModalOption = document.querySelector('#fish-zone-modal-grid input[type=radio]');
    if (firstZoneModalOption) firstZoneModalOption.click();
    byId('fish-zone-modal-go').click();
  }, 3600);

  // Active screen is up: pick a zone via the in-screen searchable
  // single-select checklist dropdown too (radio inputs, not a <select> any
  // more), bump skill, and add a custom fish so a pick button exists even
  // if the wiki fetch failed in this environment.
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
    setVal('fish-area', 'Test Cove');
    var fishBtn = document.querySelector('.fish-pick-btn[data-fish="Autotest Fish"]');
    if (fishBtn) fishBtn.click();
    byId('fish-attempts-plus').click();
  }, 5800);

  // Edit the entry just logged (added 2026-08-24) - exercises the whole
  // round trip: client-side patch, 'editEntry' to the host, and the
  // all-time log actually getting rewritten in place.
  setTimeout(function() {
    var editBtn = document.querySelector('[data-edit-id]');
    if (editBtn) {
      editBtn.click();
      setVal('fish-edit-skill', '99');
      byId('fish-edit-save').click();
    }
  }, 6400);

  // Gathering (added 2026-08-26, modal order + multi-pick material step
  // reworked 2026-08-26) - a session is already running by this point, so
  // this exercises the "join the existing session" branch of the skill-modal
  // handler, plus the real 'gatheringStarted'/'gatheringEnded' PS handlers
  // and Write-HarvestingBlock's export formatting. Modal chain is now
  // zone -> tradeskill -> skill (skill last, asked fresh every time).
  setTimeout(function() {
    document.querySelector('.tab[data-tab="gathering"]').click();
    byId('gather-start-btn').click();
  }, 6900);

  setTimeout(function() {
    byId('gather-zone-modal-toggle').click();
    var firstZoneModalOption = document.querySelector('#gather-zone-modal-grid input[type=radio]');
    if (firstZoneModalOption) firstZoneModalOption.click();
    byId('gather-zone-modal-go').click();
  }, 7100);

  setTimeout(function() {
    byId('gather-tradeskill-mining').click();
  }, 7300);

  setTimeout(function() {
    setVal('gather-skill-modal-input', '5');
    byId('gather-skill-modal-go').click();
  }, 7500);

  // Two units in one go, exercising the multi-pick-with-quantity material
  // modal: a custom node, then a custom material clicked twice plus a second
  // custom material clicked once, confirmed with a single "Log it".
  setTimeout(function() {
    byId('gather-skill-plus').click();
    setVal('gather-new-node', 'Autotest Node');
    byId('gather-add-node-btn').click();
    var nodeBtn = document.querySelector('#gather-node-grid [data-node="Autotest Node"]');
    if (nodeBtn) nodeBtn.click();
    setTimeout(function() {
      setVal('gather-material-new', 'Autotest Material');
      byId('gather-material-add-btn').click();
      // +Add clears the box after adding once - the new material now has its
      // own grid button, tap it again for a second unit of the same thing.
      var m1 = document.querySelector('#gather-material-grid [data-material="Autotest Material"]');
      if (m1) m1.click();
      setVal('gather-material-new', 'Second Material');
      byId('gather-material-add-btn').click();
      byId('gather-material-log').click();
    }, 200);
  }, 7900);

  setTimeout(function() { byId('btn-session-action').click(); }, 8500); // session is running by now, so this ends it
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
            'MnM Field Notes'
        ) | Out-Null
    }
})

[System.Windows.Forms.Application]::Run($form)
