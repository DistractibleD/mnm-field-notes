Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

# ---------------------------------------------------------------------------
# MnM Loot Tracker
# Reads Monsters and Memories' own per-character Ledger log files (JSON) from
# %LocalAppData%Low\Niche Worlds Cult\Monsters and Memories\beta1\<Character>\Ledger\
# Read-only. Never writes to any game folder. Never makes a network call.
# ---------------------------------------------------------------------------

$script:AppFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:SessionsFolder = Join-Path $script:AppFolder 'Sessions'
if (-not (Test-Path $script:SessionsFolder)) {
    New-Item -ItemType Directory -Path $script:SessionsFolder | Out-Null
}

$script:CharactersRoot = Join-Path $env:USERPROFILE 'AppData\LocalLow\Niche Worlds Cult\Monsters and Memories\beta1'

$script:ZoneNames = @{
    'aethoril'               = 'Aethoril'
    'ancientcrypt'            = 'Ancient Crypt'
    'blacktidebay'            = 'Blacktide Bay'
    'deepdunes'               = 'Caves of Irem'
    'evershadeweald'          = 'Evershade Weald'
    'faelindral'              = 'Faelindral'
    'fallenpass'              = 'Fallen Pass'
    'glassflats'              = 'Glass Flats'
    'grimtidesanctum'         = 'Grimtide Sanctum'
    'infestedcrypt'           = 'Infested Crypt'
    'keepersbight'            = "Keeper's Bight"
    'nightharbor'             = 'Night Harbor'
    'scarwood'                = 'Scarwood'
    'shadeddunes'             = 'Shaded Dunes'
    'shallowshoals'           = 'Shallow Shoals'
    'sungreetstrand'          = 'Sungreet Strand'
    'telekir'                 = 'Tel Ekir'
    'thegraincellar'          = 'The Grain Cellar'
    'tombofthelastwyrmsbane'  = 'Tomb of the Last Wyrmsbane'
    'valeofzintar'            = 'Vale of Zintar'
}

$script:SelectedCharacter = $null
$script:SessionStart = [DateTimeOffset]::Now
$script:MonsterData = @{}
$script:TotalLootEntries = 0
$script:TotalItemsLooted = 0

function Decode-GameString {
    param([string]$s)
    if ([string]::IsNullOrEmpty($s)) { return $s }
    $val = $s
    if ($s -match '^[a-zA-Z]+_(.+)$') { $val = $matches[1] }
    try {
        $pad = $val.Length % 4
        if ($pad -ne 0) { $val = $val + ('=' * (4 - $pad)) }
        $bytes = [Convert]::FromBase64String($val)
        $dec = [System.Text.Encoding]::UTF8.GetString($bytes)
        if ($dec -match '^[\x20-\x7E]*$') { return $dec }
    } catch {}
    return $s
}

function Read-JsonSafe {
    param([string]$path)
    if (-not $path -or -not (Test-Path $path)) { return $null }
    try {
        $fs = [System.IO.File]::Open($path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $sr = New-Object System.IO.StreamReader($fs)
        $text = $sr.ReadToEnd()
        $sr.Close()
        $fs.Close()
        if ([string]::IsNullOrWhiteSpace($text)) { return $null }
        return $text | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-CharacterList {
    if (-not (Test-Path $script:CharactersRoot)) { return @() }
    Get-ChildItem -Path $script:CharactersRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'Ledger') } |
        ForEach-Object { $_.Name } |
        Sort-Object
}

function Get-LatestLedgerFile {
    param([string]$charName, [string]$kind)
    $ledgerDir = Join-Path (Join-Path $script:CharactersRoot $charName) 'Ledger'
    if (-not (Test-Path $ledgerDir)) { return $null }
    Get-ChildItem -Path $ledgerDir -Filter "${charName}_${kind}_*.json" -File -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending |
        Select-Object -First 1 -ExpandProperty FullName
}

function Get-MostRecentlyActiveCharacter {
    $best = $null
    $bestTime = [datetime]::MinValue
    foreach ($c in (Get-CharacterList)) {
        $ledgerDir = Join-Path (Join-Path $script:CharactersRoot $c) 'Ledger'
        if (Test-Path $ledgerDir) {
            $latest = Get-ChildItem -Path $ledgerDir -Filter '*.json' -File -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
            if ($latest -and $latest.LastWriteTime -gt $bestTime) {
                $bestTime = $latest.LastWriteTime
                $best = $c
            }
        }
    }
    return $best
}

function Update-MonsterData {
    if (-not $script:SelectedCharacter) {
        $script:MonsterData = @{}
        $script:TotalLootEntries = 0
        $script:TotalItemsLooted = 0
        return
    }

    $files = @()
    $cf = Get-LatestLedgerFile $script:SelectedCharacter 'Character'
    $sf = Get-LatestLedgerFile $script:SelectedCharacter 'Social'
    if ($cf) { $files += $cf }
    if ($sf) { $files += $sf }

    $data = @{}
    $seenKeys = New-Object 'System.Collections.Generic.HashSet[string]'
    $totalLootEntries = 0
    $totalItems = 0

    foreach ($path in $files) {
        $json = Read-JsonSafe $path
        if (-not $json -or -not $json.c01) { continue }

        foreach ($entry in $json.c01) {
            if ($entry.f01 -ne 'act_13') { continue }

            $ts = $null
            try { $ts = [DateTimeOffset]::Parse($entry.f04) } catch { continue }
            if ($ts -lt $script:SessionStart) { continue }

            $f03 = $null
            try { $f03 = $entry.f03 | ConvertFrom-Json } catch { continue }
            if (-not $f03) { continue }

            $mob = Decode-GameString ([string]$f03.d02)
            if ([string]::IsNullOrWhiteSpace($mob)) { continue }

            $rawItem = [string]$f03.d04
            $pipeIdx = $rawItem.IndexOf('|')
            $itemName = if ($pipeIdx -ge 0) { $rawItem.Substring($pipeIdx + 1) } else { $rawItem }
            if ([string]::IsNullOrWhiteSpace($itemName)) { continue }

            $qty = 1
            [int]::TryParse([string]$f03.d01, [ref]$qty) | Out-Null
            if ($qty -le 0) { $qty = 1 }

            $zoneRaw = Decode-GameString ([string]$entry.f05)
            $zoneKey = ($zoneRaw.ToLower() -replace '[^a-z]', '')
            $zoneName = if ($script:ZoneNames.ContainsKey($zoneKey)) { $script:ZoneNames[$zoneKey] } else { $zoneRaw }

            $looter = [string]$entry.f07

            $key = "$looter|$($entry.f04)|$mob|$rawItem"
            if (-not $seenKeys.Add($key)) { continue }

            if (-not $data.ContainsKey($mob)) {
                $data[$mob] = [ordered]@{
                    Zones       = New-Object 'System.Collections.Generic.HashSet[string]'
                    Items       = @{}
                    LootEntries = 0
                    FirstSeen   = $ts
                    LastSeen    = $ts
                }
            }
            $m = $data[$mob]
            [void]$m.Zones.Add($zoneName)
            if (-not $m.Items.ContainsKey($itemName)) { $m.Items[$itemName] = 0 }
            $m.Items[$itemName] += $qty
            $m.LootEntries += 1
            if ($ts -lt $m.FirstSeen) { $m.FirstSeen = $ts }
            if ($ts -gt $m.LastSeen) { $m.LastSeen = $ts }

            $totalLootEntries += 1
            $totalItems += $qty
        }
    }

    $script:MonsterData = $data
    $script:TotalLootEntries = $totalLootEntries
    $script:TotalItemsLooted = $totalItems
}

# ---------------------------------------------------------------------------
# UI
# ---------------------------------------------------------------------------

$form = New-Object System.Windows.Forms.Form
$form.Text = 'MnM Loot Tracker  -  read-only, offline, local files only'
$form.Size = New-Object System.Drawing.Size(1080, 780)
$form.MinimumSize = New-Object System.Drawing.Size(760, 500)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object System.Drawing.Font('Segoe UI', 9)

$topPanel = New-Object System.Windows.Forms.Panel
$topPanel.Dock = 'Top'
$topPanel.Height = 118
$form.Controls.Add($topPanel)

$lblCharacter = New-Object System.Windows.Forms.Label
$lblCharacter.Text = 'Character:'
$lblCharacter.Location = New-Object System.Drawing.Point(10, 15)
$lblCharacter.AutoSize = $true
$topPanel.Controls.Add($lblCharacter)

$cmbCharacters = New-Object System.Windows.Forms.ComboBox
$cmbCharacters.Location = New-Object System.Drawing.Point(85, 12)
$cmbCharacters.Size = New-Object System.Drawing.Size(200, 24)
$cmbCharacters.DropDownStyle = 'DropDownList'
$topPanel.Controls.Add($cmbCharacters)

$btnDetect = New-Object System.Windows.Forms.Button
$btnDetect.Text = 'Detect Active Character'
$btnDetect.Location = New-Object System.Drawing.Point(295, 10)
$btnDetect.Size = New-Object System.Drawing.Size(150, 26)
$topPanel.Controls.Add($btnDetect)

$btnRefreshChars = New-Object System.Windows.Forms.Button
$btnRefreshChars.Text = 'Refresh List'
$btnRefreshChars.Location = New-Object System.Drawing.Point(450, 10)
$btnRefreshChars.Size = New-Object System.Drawing.Size(90, 26)
$topPanel.Controls.Add($btnRefreshChars)

$btnNewSession = New-Object System.Windows.Forms.Button
$btnNewSession.Text = 'Start New Session'
$btnNewSession.Location = New-Object System.Drawing.Point(550, 10)
$btnNewSession.Size = New-Object System.Drawing.Size(130, 26)
$topPanel.Controls.Add($btnNewSession)

$btnSave = New-Object System.Windows.Forms.Button
$btnSave.Text = 'Save Session to File'
$btnSave.Location = New-Object System.Drawing.Point(690, 10)
$btnSave.Size = New-Object System.Drawing.Size(150, 26)
$topPanel.Controls.Add($btnSave)

$lblSession = New-Object System.Windows.Forms.Label
$lblSession.Location = New-Object System.Drawing.Point(10, 48)
$lblSession.Size = New-Object System.Drawing.Size(1040, 20)
$lblSession.Text = 'No character selected.'
$topPanel.Controls.Add($lblSession)

$lblSummary = New-Object System.Windows.Forms.Label
$lblSummary.Location = New-Object System.Drawing.Point(10, 70)
$lblSummary.Size = New-Object System.Drawing.Size(1040, 20)
$lblSummary.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$topPanel.Controls.Add($lblSummary)

$lblStatus = New-Object System.Windows.Forms.Label
$lblStatus.Location = New-Object System.Drawing.Point(10, 93)
$lblStatus.Size = New-Object System.Drawing.Size(700, 18)
$lblStatus.ForeColor = [System.Drawing.Color]::DimGray
$lblStatus.Text = 'Coin drop amounts and monster levels are not recorded in the game logs, so they always show N/A.'
$topPanel.Controls.Add($lblStatus)

$splitContainer = New-Object System.Windows.Forms.SplitContainer
$splitContainer.Dock = 'Fill'
$splitContainer.Orientation = 'Horizontal'
$form.Controls.Add($splitContainer)
$form.Controls.SetChildIndex($splitContainer, 0)
$form.Controls.SetChildIndex($topPanel, 1)

$dgvMonsters = New-Object System.Windows.Forms.DataGridView
$dgvMonsters.Dock = 'Fill'
$dgvMonsters.ReadOnly = $true
$dgvMonsters.AllowUserToAddRows = $false
$dgvMonsters.AllowUserToDeleteRows = $false
$dgvMonsters.SelectionMode = 'FullRowSelect'
$dgvMonsters.MultiSelect = $false
$dgvMonsters.AutoSizeColumnsMode = 'Fill'
$dgvMonsters.RowHeadersVisible = $false
$splitContainer.Panel1.Controls.Add($dgvMonsters)

$itemsPanel = New-Object System.Windows.Forms.Panel
$itemsPanel.Dock = 'Fill'
$splitContainer.Panel2.Controls.Add($itemsPanel)

$lblItemsHeader = New-Object System.Windows.Forms.Label
$lblItemsHeader.Dock = 'Top'
$lblItemsHeader.Height = 24
$lblItemsHeader.Text = 'Item breakdown (select a monster above)'
$lblItemsHeader.Font = New-Object System.Drawing.Font('Segoe UI', 9, [System.Drawing.FontStyle]::Bold)
$itemsPanel.Controls.Add($lblItemsHeader)

$dgvItems = New-Object System.Windows.Forms.DataGridView
$dgvItems.Dock = 'Fill'
$dgvItems.ReadOnly = $true
$dgvItems.AllowUserToAddRows = $false
$dgvItems.AllowUserToDeleteRows = $false
$dgvItems.SelectionMode = 'FullRowSelect'
$dgvItems.MultiSelect = $false
$dgvItems.AutoSizeColumnsMode = 'Fill'
$dgvItems.RowHeadersVisible = $false
$itemsPanel.Controls.Add($dgvItems)
$itemsPanel.Controls.SetChildIndex($dgvItems, 0)
$itemsPanel.Controls.SetChildIndex($lblItemsHeader, 1)

function Refresh-Grid {
    $dt = New-Object System.Data.DataTable
    foreach ($col in @('Monster', 'Zones', 'Loot Entries', 'Distinct Items', 'Total Qty', 'Avg Coin Drop', 'Avg Level', 'First Seen', 'Last Seen')) {
        [void]$dt.Columns.Add($col)
    }
    foreach ($mobName in ($script:MonsterData.Keys | Sort-Object)) {
        $m = $script:MonsterData[$mobName]
        $totalQty = 0
        foreach ($v in $m.Items.Values) { $totalQty += $v }
        $row = $dt.NewRow()
        $row['Monster'] = $mobName
        $row['Zones'] = ([string[]]$m.Zones -join ', ')
        $row['Loot Entries'] = $m.LootEntries
        $row['Distinct Items'] = $m.Items.Keys.Count
        $row['Total Qty'] = $totalQty
        $row['Avg Coin Drop'] = 'N/A'
        $row['Avg Level'] = 'N/A'
        $row['First Seen'] = $m.FirstSeen.LocalDateTime.ToString('HH:mm:ss')
        $row['Last Seen'] = $m.LastSeen.LocalDateTime.ToString('HH:mm:ss')
        [void]$dt.Rows.Add($row)
    }

    $prevSelected = $null
    if ($dgvMonsters.CurrentRow) { $prevSelected = $dgvMonsters.CurrentRow.Cells['Monster'].Value }

    $dgvMonsters.DataSource = $dt

    if ($prevSelected) {
        foreach ($r in $dgvMonsters.Rows) {
            if ($r.Cells['Monster'].Value -eq $prevSelected) {
                $r.Selected = $true
                $dgvMonsters.CurrentCell = $r.Cells[0]
                break
            }
        }
    }
}

function Refresh-ItemGrid {
    param([string]$mobName)
    $dt = New-Object System.Data.DataTable
    foreach ($col in @('Item', 'Total Qty Looted')) { [void]$dt.Columns.Add($col) }
    if ($mobName -and $script:MonsterData.ContainsKey($mobName)) {
        $m = $script:MonsterData[$mobName]
        foreach ($item in ($m.Items.Keys | Sort-Object)) {
            $row = $dt.NewRow()
            $row['Item'] = $item
            $row['Total Qty Looted'] = $m.Items[$item]
            [void]$dt.Rows.Add($row)
        }
        $lblItemsHeader.Text = "Item breakdown - $mobName"
    } else {
        $lblItemsHeader.Text = 'Item breakdown (select a monster above)'
    }
    $dgvItems.DataSource = $dt
}

function Get-CurrentSelectedMonster {
    if ($dgvMonsters.CurrentRow) { return [string]$dgvMonsters.CurrentRow.Cells['Monster'].Value }
    return $null
}

function Save-SessionReport {
    param([string]$path)

    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('Monsters and Memories - Loot Session Report')
    [void]$sb.AppendLine("Character: $($script:SelectedCharacter)")
    [void]$sb.AppendLine("Session started: $($script:SessionStart.LocalDateTime.ToString('yyyy-MM-dd HH:mm:ss'))")
    [void]$sb.AppendLine("Report generated: $((Get-Date).ToString('yyyy-MM-dd HH:mm:ss'))")
    $elapsed = [DateTimeOffset]::Now - $script:SessionStart
    [void]$sb.AppendLine("Session duration: $($elapsed.ToString('hh\:mm\:ss'))")
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine('Totals:')
    [void]$sb.AppendLine("  Monsters discovered: $($script:MonsterData.Keys.Count)")
    [void]$sb.AppendLine("  Total loot entries:  $($script:TotalLootEntries)")
    [void]$sb.AppendLine("  Total items looted:  $($script:TotalItemsLooted)")
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine("Note: Coin drop amounts and monster levels are not written to the game's")
    [void]$sb.AppendLine('log files, so they cannot be included in this report.')
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine(('=' * 80))

    foreach ($mobName in ($script:MonsterData.Keys | Sort-Object)) {
        $m = $script:MonsterData[$mobName]
        [void]$sb.AppendLine('')
        [void]$sb.AppendLine($mobName)
        [void]$sb.AppendLine("  Zones: $([string[]]$m.Zones -join ', ')")
        [void]$sb.AppendLine("  Loot entries: $($m.LootEntries)   First seen: $($m.FirstSeen.LocalDateTime.ToString('HH:mm:ss'))   Last seen: $($m.LastSeen.LocalDateTime.ToString('HH:mm:ss'))")
        [void]$sb.AppendLine('  Items:')
        foreach ($item in ($m.Items.Keys | Sort-Object)) {
            [void]$sb.AppendLine("    - $item x $($m.Items[$item])")
        }
    }
    [void]$sb.AppendLine('')
    [void]$sb.AppendLine(('=' * 80))

    [System.IO.File]::WriteAllText($path, $sb.ToString())
}

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------

$cmbCharacters.Add_SelectedIndexChanged({
    $script:SelectedCharacter = $cmbCharacters.SelectedItem
    $script:SessionStart = [DateTimeOffset]::Now
    $script:MonsterData = @{}
    $script:TotalLootEntries = 0
    $script:TotalItemsLooted = 0
    Refresh-Grid
    Refresh-ItemGrid $null
})

$btnRefreshChars.Add_Click({
    $prev = $cmbCharacters.SelectedItem
    $cmbCharacters.Items.Clear()
    foreach ($c in (Get-CharacterList)) { [void]$cmbCharacters.Items.Add($c) }
    if ($prev -and $cmbCharacters.Items.Contains($prev)) {
        $cmbCharacters.SelectedItem = $prev
    } elseif ($cmbCharacters.Items.Count -gt 0) {
        $cmbCharacters.SelectedIndex = 0
    }
})

$btnDetect.Add_Click({
    $best = Get-MostRecentlyActiveCharacter
    if ($best) {
        if (-not $cmbCharacters.Items.Contains($best)) { [void]$cmbCharacters.Items.Add($best) }
        $cmbCharacters.SelectedItem = $best
    } else {
        [System.Windows.Forms.MessageBox]::Show('No character data found yet. Log into the game at least once first.', 'MnM Loot Tracker') | Out-Null
    }
})

$btnNewSession.Add_Click({
    $script:SessionStart = [DateTimeOffset]::Now
    $script:MonsterData = @{}
    $script:TotalLootEntries = 0
    $script:TotalItemsLooted = 0
    Refresh-Grid
    Refresh-ItemGrid $null
})

$btnSave.Add_Click({
    $dlg = New-Object System.Windows.Forms.SaveFileDialog
    $dlg.InitialDirectory = $script:SessionsFolder
    $charPart = if ($script:SelectedCharacter) { $script:SelectedCharacter } else { 'Session' }
    $dlg.FileName = "LootSession_${charPart}_$((Get-Date).ToString('yyyy-MM-dd_HHmmss')).txt"
    $dlg.Filter = 'Text files (*.txt)|*.txt|All files (*.*)|*.*'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        try {
            Save-SessionReport -path $dlg.FileName
            [System.Windows.Forms.MessageBox]::Show("Session saved to:`n$($dlg.FileName)", 'MnM Loot Tracker') | Out-Null
        } catch {
            [System.Windows.Forms.MessageBox]::Show("Could not save file: $($_.Exception.Message)", 'MnM Loot Tracker') | Out-Null
        }
    }
})

$dgvMonsters.Add_SelectionChanged({
    Refresh-ItemGrid (Get-CurrentSelectedMonster)
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
    try {
        if (-not $script:SelectedCharacter) { return }
        Update-MonsterData
        Refresh-Grid
        Refresh-ItemGrid (Get-CurrentSelectedMonster)

        $elapsed = [DateTimeOffset]::Now - $script:SessionStart
        $lblSession.Text = "Character: $($script:SelectedCharacter)   |   Session started: $($script:SessionStart.LocalDateTime.ToString('HH:mm:ss'))   |   Elapsed: $($elapsed.ToString('hh\:mm\:ss'))   |   Last updated: $((Get-Date).ToString('HH:mm:ss'))"
        $lblSummary.Text = "Monsters discovered: $($script:MonsterData.Keys.Count)   |   Total loot entries: $($script:TotalLootEntries)   |   Total items looted: $($script:TotalItemsLooted)"
    } catch {
        $lblStatus.Text = "Update error: $($_.Exception.Message)"
    }
})

$form.Add_FormClosing({ $timer.Stop() })

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------

if (-not (Test-Path $script:CharactersRoot)) {
    [System.Windows.Forms.MessageBox]::Show("Could not find the game's save folder:`n$script:CharactersRoot`n`nMake sure Monsters and Memories is installed and you've logged in at least once.", 'MnM Loot Tracker') | Out-Null
}

foreach ($c in (Get-CharacterList)) { [void]$cmbCharacters.Items.Add($c) }
$activeChar = Get-MostRecentlyActiveCharacter
if ($activeChar) {
    $cmbCharacters.SelectedItem = $activeChar
} elseif ($cmbCharacters.Items.Count -gt 0) {
    $cmbCharacters.SelectedIndex = 0
}

Refresh-Grid
Refresh-ItemGrid $null
$timer.Start()

[System.Windows.Forms.Application]::Run($form)
