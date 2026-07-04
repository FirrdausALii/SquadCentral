$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$chFlag = [System.Text.Encoding]::UTF8.GetString([byte[]](0xF0, 0x9F, 0x87, 0xA8, 0xF0, 0x9F, 0x87, 0xAD))

function Get-PlayerSlug($name) {
    $n = $name.Normalize([Text.NormalizationForm]::FormD)
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $n.ToCharArray()) {
        if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$sb.Append($ch)
        }
    }
    return ($sb.ToString() -replace '[^a-zA-Z0-9]+', '_').Trim('_')
}

function Format-Player($entry, $sortOrder) {
    $slug = Get-PlayerSlug $entry.name
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.Add('    {')
    $lines.Add("      `"id`": `"worldcup_switzerland_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_switzerland",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add("      `"club`": `"$($entry.club)`",")
    $lines.Add("      `"flag`": `"$chFlag`",")
    $lines.Add('      "nationality": "Switzerland",')
    $lines.Add("      `"sortOrder`": $sortOrder")
    if ($entry.captain) {
        $lines[-1] = $lines[-1] + ','
        $lines.Add('      "captain": true')
    }
    $lines.Add('    }')
    return ($lines -join "`n")
}

$squad = @(
    @{ number=1;  name='Gregor Kobel';          pos='GK'; role='GK'; club='Borussia Dortmund' }
    @{ number=12; name='Yvon Mvogo';            pos='GK'; role='GK'; club='Lorient' }
    @{ number=21; name='Marvin Keller';         pos='GK'; role='GK'; club='Young Boys' }
    @{ number=4;  name='Nico Elvedi';           pos='DF'; role='CB'; club='Borussia Monchengladbach' }
    @{ number=5;  name='Manuel Akanji';         pos='DF'; role='CB'; club='Inter Milan' }
    @{ number=18; name='Eray Comert';           pos='DF'; role='CB'; club='Valencia' }
    @{ number=24; name='Aurele Amenda';         pos='DF'; role='CB'; club='Eintracht Frankfurt' }
    @{ number=25; name='Luca Jaquez';           pos='DF'; role='CB'; club='Stuttgart' }
    @{ number=3;  name='Silvan Widmer';         pos='DF'; role='RB'; club='Mainz 05' }
    @{ number=6;  name='Denis Zakaria';         pos='DF'; role='RB'; club='AS Monaco' }
    @{ number=2;  name='Miro Muheim';           pos='DF'; role='LB'; club='Hamburg' }
    @{ number=13; name='Ricardo Rodriguez';     pos='DF'; role='LB'; club='Real Betis' }
    @{ number=10; name='Granit Xhaka';          pos='MF'; role='DM'; club='Sunderland'; captain=$true }
    @{ number=14; name='Ardon Jashari';         pos='MF'; role='DM'; club='AC Milan' }
    @{ number=8;  name='Remo Freuler';          pos='MF'; role='CM'; club='Bologna' }
    @{ number=15; name='Djibril Sow';           pos='MF'; role='CM'; club='Sevilla' }
    @{ number=20; name='Michel Aebischer';      pos='MF'; role='CM'; club='Pisa' }
    @{ number=9;  name='Johan Manzambi';        pos='MF'; role='AM'; club='Freiburg' }
    @{ number=22; name='Fabian Rieder';         pos='MF'; role='AM'; club='Augsburg' }
    @{ number=11; name='Dan Ndoye';             pos='FW'; role='RW'; club='Nottingham Forest' }
    @{ number=16; name='Christian Fassnacht';   pos='FW'; role='RW'; club='Young Boys' }
    @{ number=17; name='Ruben Vargas';          pos='FW'; role='LW'; club='Sevilla' }
    @{ number=19; name='Noah Okafor';           pos='FW'; role='LW'; club='Leeds United' }
    @{ number=7;  name='Breel Embolo';          pos='FW'; role='CF'; club='Rennes' }
    @{ number=23; name='Zeki Amdouni';          pos='FW'; role='CF'; club='Burnley' }
    @{ number=26; name='Cedric Itten';          pos='FW'; role='CF'; club='Werder Bremen' }
)

$playerBlocks = for ($i = 0; $i -lt $squad.Count; $i++) { Format-Player $squad[$i] $i }
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "formation": "4-2-3-1",
      "squadDepth": {
        "formation": "4-2-3-1",
        "goalkeepers": [
          "worldcup_switzerland_1_Gregor_Kobel",
          "worldcup_switzerland_12_Yvon_Mvogo",
          "worldcup_switzerland_21_Marvin_Keller"
        ],
        "slots": [
          {
            "tag": "LB",
            "players": [
              "worldcup_switzerland_2_Miro_Muheim",
              "worldcup_switzerland_13_Ricardo_Rodriguez"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_switzerland_4_Nico_Elvedi",
              "worldcup_switzerland_5_Manuel_Akanji"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_switzerland_18_Eray_Comert",
              "worldcup_switzerland_24_Aurele_Amenda"
            ]
          },
          {
            "tag": "RB",
            "players": [
              "worldcup_switzerland_3_Silvan_Widmer",
              "worldcup_switzerland_6_Denis_Zakaria"
            ]
          },
          {
            "tag": "DM",
            "players": [
              "worldcup_switzerland_10_Granit_Xhaka",
              "worldcup_switzerland_14_Ardon_Jashari"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_switzerland_8_Remo_Freuler",
              "worldcup_switzerland_15_Djibril_Sow"
            ]
          },
          {
            "tag": "AM",
            "players": [
              "worldcup_switzerland_9_Johan_Manzambi",
              "worldcup_switzerland_22_Fabian_Rieder"
            ]
          },
          {
            "tag": "RW",
            "players": [
              "worldcup_switzerland_11_Dan_Ndoye",
              "worldcup_switzerland_16_Christian_Fassnacht"
            ]
          },
          {
            "tag": "LW",
            "players": [
              "worldcup_switzerland_17_Ruben_Vargas",
              "worldcup_switzerland_19_Noah_Okafor"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_switzerland_7_Breel_Embolo",
              "worldcup_switzerland_23_Zeki_Amdouni"
            ]
          }
        ]
      }
'@

$newMatchesJson = @'
    {
      "id": "worldcup_group_stage_switzerland_bosnia",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Friday 19 Jun",
      "stadium": "Vancouver Stadium",
      "homeTeamId": "worldcup_switzerland",
      "awayTeamId": "worldcup_bosnia",
      "score": [4, 1],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["4-2-3-1", "4-4-2"]
    },
    {
      "id": "worldcup_group_stage_switzerland_canada",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Thursday 25 Jun",
      "stadium": "Vancouver Stadium",
      "homeTeamId": "worldcup_switzerland",
      "awayTeamId": "worldcup_canada",
      "score": [2, 1],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["4-2-3-1", "4-4-2"]
    }
'@

$groupBRows = @'
          "rows": [
            [1, "Switzerland", 7],
            [2, "Canada", 4],
            [3, "Bosnia", 4],
            [4, "Qatar", 1]
          ]
'@

Write-Host "Reading $dataPath ..."
$text = [System.IO.File]::ReadAllText($dataPath, $utf8)

$playerPattern = '(?s)\{\s*"id": "worldcup_switzerland_1_Gregor_Kobel",.*?\},\s*\{\s*"id": "worldcup_brazil_1_Alisson",'
if ($text -notmatch $playerPattern) { throw 'Switzerland player block not found' }
$brazilStart = "    {`n      `"id`": `"worldcup_brazil_1_Alisson`","
$text = [regex]::Replace($text, $playerPattern, ($playersJson + $brazilStart), 1)

$teamPattern = '(?s)("id": "worldcup_switzerland",\s*"leagueId": "worldcup",\s*"name": "Switzerland",\s*"city": "Bern",\s*"coach": "Murat Yakin",\s*"colors": \[\s*"#ff4d6d",\s*"#ffffff"\s*\],\s*"logo": "./images/worldcup/switzerland.png")(?:,\s*"formation": "[^"]+",\s*"squadDepth": \{.*?\})?\s*\}'
if ($text -notmatch $teamPattern) { throw 'Switzerland team block not found' }
$text = [regex]::Replace($text, $teamPattern, "`$1,`n$squadDepthJson`n    }", 1)

# Fix MD1 Qatar vs Switzerland date and Switzerland formation
$text = [regex]::Replace($text, '("id": "worldcup_group_stage_qatar_switzerland",[\s\S]*?"time": )"Sunday 14 Jun"', '${1}"Friday 14 Jun"', 1)
$text = [regex]::Replace($text, '("id": "worldcup_group_stage_qatar_switzerland",[\s\S]*?"formation": \[\s*)"4-3-3",\s*\r?\n\s*"4-3-3"', {
    param($m)
    $m.Groups[1].Value + "`"4-3-3`",`r`n        `"4-2-3-1`""
}, 1)

$text = $text.Replace('"name": "Granit Xhaka (C)"', '"name": "Granit Xhaka"')
$text = $text.Replace('"name": "Ricardo Rodríguez"', '"name": "Ricardo Rodriguez"')
$text = $text.Replace('"scorer": "Granit Xhaka (C)"', '"scorer": "Granit Xhaka"')

if ($text -notmatch 'worldcup_group_stage_switzerland_bosnia') {
    $insertPattern = '(?s)("id": "worldcup_group_stage_qatar_switzerland",.*?\n    \})\s*\],\s*\n  "miniStandings"'
    if ($text -notmatch $insertPattern) { throw 'Insert point for Switzerland matches not found' }
    $text = [regex]::Replace($text, $insertPattern, "`$1,`n$newMatchesJson`n  ],`n  `"miniStandings`"", 1)
}

$groupPattern = '(?s)("id": "B",)\s*"rows": \[\s*\[\s*1,\s*"Canada",\s*0\s*\].*?\[\s*4,\s*"Switzerland",\s*0\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group B standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupBRows", 1)

$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host 'Updated Switzerland squad, Group B fixtures MD1-3, and standings.'
