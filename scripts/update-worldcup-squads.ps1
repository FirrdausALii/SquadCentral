# Sync World Cup squads from Wikipedia markdown export to data.json
param(
    [string]$WikiPath = "",
    [string]$DataPath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if (-not $WikiPath) { $WikiPath = Join-Path $root "scripts\worldcup-squads-wiki.txt" }
if (-not $DataPath) { $DataPath = Join-Path $root "data.json" }

$teamMap = [ordered]@{
    "Czech Republic" = "worldcup_czech_republic"
    "Mexico" = "worldcup_mexico"
    "South Africa" = "worldcup_south_africa"
    "South Korea" = "worldcup_south_korea"
    "Bosnia and Herzegovina" = "worldcup_bosnia"
    "Canada" = "worldcup_canada"
    "Qatar" = "worldcup_qatar"
    "Switzerland" = "worldcup_switzerland"
    "Brazil" = "worldcup_brazil"
    "Haiti" = "worldcup_haiti"
    "Morocco" = "worldcup_morocco"
    "Scotland" = "worldcup_scotland"
    "Australia" = "worldcup_australia"
    "Paraguay" = "worldcup_paraguay"
    "Turkey" = "worldcup_turkey"
    "United States" = "worldcup_usa"
    "Curaçao" = "worldcup_curacao"
    "Ecuador" = "worldcup_ecuador"
    "Germany" = "worldcup_germany"
    "Ivory Coast" = "worldcup_ivory_coast"
    "Japan" = "worldcup_japan"
    "Netherlands" = "worldcup_netherlands"
    "Sweden" = "worldcup_sweden"
    "Tunisia" = "worldcup_tunisia"
    "Belgium" = "worldcup_belgium"
    "Egypt" = "worldcup_egypt"
    "Iran" = "worldcup_iran"
    "New Zealand" = "worldcup_new_zealand"
    "Cape Verde" = "worldcup_cape_verde"
    "Saudi Arabia" = "worldcup_saudi_arabia"
    "Spain" = "worldcup_spain"
    "Uruguay" = "worldcup_uruguay"
    "France" = "worldcup_france"
    "Iraq" = "worldcup_iraq"
    "Norway" = "worldcup_norway"
    "Senegal" = "worldcup_senegal"
    "Algeria" = "worldcup_algeria"
    "Argentina" = "worldcup_argentina"
    "Austria" = "worldcup_austria"
    "Jordan" = "worldcup_jordan"
    "Colombia" = "worldcup_colombia"
    "DR Congo" = "worldcup_dr_congo"
    "Portugal" = "worldcup_portugal"
    "Uzbekistan" = "worldcup_uzbekistan"
    "Croatia" = "worldcup_croatia"
    "England" = "worldcup_england"
    "Ghana" = "worldcup_ghana"
    "Panama" = "worldcup_panama"
}

function Normalize-Name([string]$s) {
    if (-not $s) { return "" }
    $t = $s.ToLowerInvariant()
    $t = $t -replace '\(captain\)|\(vice-captain\)|\(c\)', ''
    $t = $t -replace '[^a-z0-9\s]', ''
    $t = $t -replace '\s+', ' '
    return $t.Trim()
}

function Make-PlayerId([string]$teamId, [int]$number, [string]$name) {
    $slug = ($name -replace '\(captain\)|\(vice-captain\)', '').Trim() -replace '\s+', '_'
    return "${teamId}_${number}_${slug}"
}

function FifaPosToFields([string]$fifaPos) {
    switch ($fifaPos) {
        "GK" { return @{ pos = "GK"; role = "GK" } }
        "DF" { return @{ pos = "DF"; role = "CB" } }
        "MF" { return @{ pos = "MF"; role = "CM" } }
        "FW" { return @{ pos = "FW"; role = "CF" } }
        default { return @{ pos = "MF"; role = "CM" } }
    }
}

function Get-TeamKeyFromTitle([string]$title) {
    foreach ($key in $teamMap.Keys) {
        if ($key -eq $title) { return $key }
    }
    $norm = ($title.ToLowerInvariant() -replace '[^a-z0-9]', '')
    foreach ($key in $teamMap.Keys) {
        $nk = ($key.ToLowerInvariant() -replace '[^a-z0-9]', '')
        if ($nk -eq $norm) { return $key }
    }
    return $null
}

function Parse-WikiSquads([string]$path) {
    $lines = Get-Content -LiteralPath $path -Encoding UTF8
    $squads = @{}
    $currentTeam = $null
    foreach ($line in $lines) {
        if ($line -match '^### (.+)$') {
            $title = $Matches[1].Trim()
            $currentTeam = Get-TeamKeyFromTitle $title
            continue
        }
        if (-not $currentTeam) { continue }
        if ($line -notmatch '^\|\s*(\d+)\s*\|\s*\d+\s*(GK|DF|MF|FW)\s*\|\s*(.+?)\s*\|\s*\(') { continue }
        $num = [int]$Matches[1]
        $fifa = $Matches[2]
        $rawName = $Matches[3].Trim()
        $isCaptain = $rawName -match '\(captain\)'
        $name = ($rawName -replace '\(captain\)|\(vice-captain\)', '').Trim()
        $parts = $line -split '\|'
        if ($parts.Count -lt 8) { continue }
        $club = $parts[7].Trim()
        if (-not $squads.Contains($currentTeam)) { $squads[$currentTeam] = @() }
        $squads[$currentTeam] += [pscustomobject]@{
            number = $num
            fifaPos = $fifa
            name = $name
            club = $club
            captain = [bool]$isCaptain
        }
    }
    return $squads
}

if (-not (Test-Path -LiteralPath $WikiPath)) {
    throw "Wiki file not found: $WikiPath"
}

Write-Host "Parsing Wikipedia squads..."
$squads = Parse-WikiSquads $WikiPath
Write-Host "Teams parsed: $($squads.Keys.Count)"

Write-Host "Loading data.json..."
$jsonText = [System.IO.File]::ReadAllText($DataPath)
$data = $jsonText | ConvertFrom-Json

$worldcupTeamIds = @($teamMap.Values)
$otherPlayers = @($data.players | Where-Object { $worldcupTeamIds -notcontains $_.teamId })
$existingByTeam = @{}
foreach ($tid in $worldcupTeamIds) {
    $existingByTeam[$tid] = @($data.players | Where-Object { $_.teamId -eq $tid })
}

$newWorldcupPlayers = @()
$stats = @()

foreach ($teamName in $teamMap.Keys) {
    $teamId = $teamMap[$teamName]
    if (-not $squads.Contains($teamName)) {
        Write-Warning "No wiki squad for $teamName - keeping existing players"
        $newWorldcupPlayers += $existingByTeam[$teamId]
        continue
    }
    $wikiList = @($squads[$teamName] | Sort-Object number)
    if ($wikiList.Count -ne 26) {
        Write-Warning "$teamName has $($wikiList.Count) players (expected 26)"
    }
    $existing = @($existingByTeam[$teamId])
    $sample = $existing | Select-Object -First 1
    $nationality = if ($sample) { $sample.nationality } else { $teamName }
    $flag = if ($sample) { $sample.flag } else { "" }
    $usedIds = @{}
    $teamPlayers = @()

    foreach ($wp in $wikiList) {
        $match = $existing | Where-Object { $_.number -eq $wp.number -and -not $usedIds.ContainsKey($_.id) } | Select-Object -First 1
        if (-not $match) {
            $wn = Normalize-Name $wp.name
            $match = $existing | Where-Object { (Normalize-Name $_.name) -eq $wn -and -not $usedIds.ContainsKey($_.id) } | Select-Object -First 1
        }
        if (-not $match) {
            $match = $existing | Where-Object { -not $usedIds.ContainsKey($_.id) } | Select-Object -First 1
        }

        $fields = FifaPosToFields $wp.fifaPos
        $role = if ($match -and $match.role) { $match.role } else { $fields.role }
        # Keep GK role; for others prefer existing detailed role when FIFA pos category matches
        if ($match) {
            $oldPos = $match.pos
            if ($wp.fifaPos -eq "GK") { $role = "GK" }
            elseif ($wp.fifaPos -eq "DF" -and $oldPos -eq "DF") { $role = $match.role }
            elseif ($wp.fifaPos -eq "MF" -and $oldPos -eq "MF") { $role = $match.role }
            elseif ($wp.fifaPos -eq "FW" -and $oldPos -eq "FW") { $role = $match.role }
            else { $role = $fields.role }
        }

        $id = if ($match) { $match.id } else { Make-PlayerId $teamId $wp.number $wp.name }
        $usedIds[$id] = $true

        $player = [ordered]@{
            id = $id
            teamId = $teamId
            number = [int]$wp.number
            name = $wp.name
            pos = $fields.pos
            role = $role
            club = $wp.club
            nationality = $nationality
            flag = $flag
        }
        if ($wp.captain) { $player.captain = $true }
        if ($match -and $null -ne $match.sortOrder) { $player.sortOrder = $match.sortOrder }
        if ($match -and $match.instagram) { $player.instagram = $match.instagram }

        $teamPlayers += [pscustomobject]$player
    }

    $newWorldcupPlayers += $teamPlayers
    $stats += [pscustomobject]@{ team = $teamName; players = $teamPlayers.Count }
}

$data.players = @($otherPlayers + $newWorldcupPlayers)
$data.dataRevision = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

Write-Host "Writing data.json..."
$out = $data | ConvertTo-Json -Depth 100
# ConvertTo-Json may not preserve all formatting; use compact then pretty via .NET
[System.IO.File]::WriteAllText($DataPath, $out + "`n", [System.Text.UTF8Encoding]::new($false))

$total = ($newWorldcupPlayers | Measure-Object).Count
Write-Host "Done. World Cup players: $total"
$stats | Format-Table -AutoSize
