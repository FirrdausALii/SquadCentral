$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$caFlag = [System.Text.Encoding]::UTF8.GetString([byte[]](0xF0, 0x9F, 0x87, 0xA8, 0xF0, 0x9F, 0x87, 0xA6))

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
    $lines.Add("      `"id`": `"worldcup_canada_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_canada",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add("      `"club`": `"$($entry.club)`",")
    $lines.Add("      `"flag`": `"$caFlag`",")
    $lines.Add('      "nationality": "Canada",')
    $lines.Add("      `"sortOrder`": $sortOrder")
    if ($entry.captain) {
        $lines[-1] = $lines[-1] + ','
        $lines.Add('      "captain": true')
    }
    $lines.Add('    }')
    return ($lines -join "`n")
}

$squad = @(
    @{ number=1;  name='Dayne St. Clair';       pos='GK'; role='GK'; club='Inter Miami' }
    @{ number=16; name='Maxime Crepeau';        pos='GK'; role='GK'; club='Orlando City' }
    @{ number=18; name='Owen Goodman';          pos='GK'; role='GK'; club='Crystal Palace U18' }
    @{ number=3;  name='Alfie Jones';           pos='DF'; role='CB'; club='Middlesbrough' }
    @{ number=4;  name='Luc De Fougerolles';    pos='DF'; role='CB'; club='Fulham U21' }
    @{ number=5;  name='Joel Waterman';         pos='DF'; role='CB'; club='Chicago Fire' }
    @{ number=13; name='Derek Cornelius';       pos='DF'; role='CB'; club='Marseille' }
    @{ number=15; name='Moise Bombito';          pos='DF'; role='CB'; club='Nice' }
    @{ number=2;  name='Alistair Johnston';     pos='DF'; role='RB'; club='Celtic' }
    @{ number=23; name='Niko Sigur';            pos='DF'; role='RB'; club='Hajduk Split' }
    @{ number=19; name='Alphonso Davies';       pos='DF'; role='LB'; club='Bayern Munich'; captain=$true }
    @{ number=22; name='Richie Laryea';         pos='DF'; role='LB'; club='Toronto FC' }
    @{ number=6;  name='Mathieu Choiniere';     pos='MF'; role='CM'; club='Los Angeles' }
    @{ number=7;  name='Stephen Eustaquio';     pos='MF'; role='CM'; club='Porto' }
    @{ number=8;  name='Ismael Kone';           pos='MF'; role='CM'; club='Sassuolo' }
    @{ number=21; name='Jonathan Osorio';       pos='MF'; role='CM'; club='Toronto FC' }
    @{ number=25; name='Nathan Saliba';          pos='MF'; role='CM'; club='Anderlecht' }
    @{ number=14; name='Jacob Shaffelburg';     pos='FW'; role='RW'; club='Los Angeles' }
    @{ number=17; name='Tajon Buchanan';         pos='FW'; role='RW'; club='Villarreal' }
    @{ number=11; name='Liam Millar';           pos='FW'; role='LW'; club='Hull City' }
    @{ number=20; name='Ali Ahmed';             pos='FW'; role='LW'; club='Norwich City' }
    @{ number=26; name='Jayden Nelson';         pos='FW'; role='LW'; club='Austin FC' }
    @{ number=9;  name='Cyle Larin';            pos='FW'; role='CF'; club='Southampton' }
    @{ number=10; name='Jonathan David';        pos='FW'; role='CF'; club='Juventus' }
    @{ number=12; name='Tani Oluwaseyi';        pos='FW'; role='CF'; club='Villarreal' }
    @{ number=24; name='Promise David';         pos='FW'; role='CF'; club='Union St. Gilloise' }
)

$playerBlocks = for ($i = 0; $i -lt $squad.Count; $i++) { Format-Player $squad[$i] $i }
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "formation": "4-4-2",
      "squadDepth": {
        "formation": "4-4-2",
        "goalkeepers": [
          "worldcup_canada_1_Dayne_St_Clair",
          "worldcup_canada_16_Maxime_Crepeau",
          "worldcup_canada_18_Owen_Goodman"
        ],
        "slots": [
          {
            "tag": "LB",
            "players": [
              "worldcup_canada_19_Alphonso_Davies",
              "worldcup_canada_22_Richie_Laryea"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_canada_13_Derek_Cornelius",
              "worldcup_canada_4_Luc_De_Fougerolles"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_canada_3_Alfie_Jones",
              "worldcup_canada_5_Joel_Waterman"
            ]
          },
          {
            "tag": "RB",
            "players": [
              "worldcup_canada_2_Alistair_Johnston",
              "worldcup_canada_23_Niko_Sigur"
            ]
          },
          {
            "tag": "LM",
            "players": [
              "worldcup_canada_11_Liam_Millar",
              "worldcup_canada_20_Ali_Ahmed"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_canada_7_Stephen_Eustaquio",
              "worldcup_canada_8_Ismael_Kone"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_canada_6_Mathieu_Choiniere",
              "worldcup_canada_21_Jonathan_Osorio"
            ]
          },
          {
            "tag": "RM",
            "players": [
              "worldcup_canada_17_Tajon_Buchanan",
              "worldcup_canada_14_Jacob_Shaffelburg"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_canada_9_Cyle_Larin",
              "worldcup_canada_10_Jonathan_David"
            ]
          }
        ]
      }
'@

$newMatchJson = @'
    {
      "id": "worldcup_group_stage_canada_qatar",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Friday 19 Jun",
      "stadium": "Toronto Stadium",
      "homeTeamId": "worldcup_canada",
      "awayTeamId": "worldcup_qatar",
      "score": [6, 0],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["4-4-2", "4-3-3"]
    },
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

$playerPattern = '(?s)\{\s*"id": "worldcup_canada_1_Dayne_St\._Clair",.*?\},\s*\{\s*"id": "worldcup_qatar_22_Meshaal_Barsham",'
if ($text -notmatch $playerPattern) { throw 'Canada player block not found' }
$qatarStart = "    {`n      `"id`": `"worldcup_qatar_22_Meshaal_Barsham`","
$text = [regex]::Replace($text, $playerPattern, ($playersJson + $qatarStart), 1)

$teamPattern = '(?s)("id": "worldcup_canada",\s*"leagueId": "worldcup",\s*"name": "Canada",\s*"city": "Toronto",\s*"coach": "Jesse Marsch",\s*"colors": \[\s*"#ff4d6d",\s*"#ffffff"\s*\],\s*"logo": "./images/worldcup/canada.png")(?:,\s*"formation": "[^"]+",\s*"squadDepth": \{.*?\})?\s*\}'
if ($text -notmatch $teamPattern) { throw 'Canada team block not found' }
$text = [regex]::Replace($text, $teamPattern, "`$1,`n$squadDepthJson`n    }", 1)

$text = [regex]::Replace($text, '("id": "worldcup_group_stage_canada_bosnia",[\s\S]*?"time": )"Saturday 13 Jun"', '${1}"Friday 13 Jun"', 1)
$text = $text.Replace('"name": "Alphonso Davies (C)"', '"name": "Alphonso Davies"')
$text = $text.Replace('"name": "Luc de Fougerolles"', '"name": "Luc De Fougerolles"')

if ($text -notmatch 'worldcup_group_stage_canada_qatar') {
    $insertPattern = '(?s)("id": "worldcup_group_stage_canada_bosnia",.*?\n    \},\s*)\{\s*"id": "worldcup_group_stage_united_states_paraguay",'
    if ($text -notmatch $insertPattern) { throw 'Insert point for Canada vs Qatar match not found' }
    $text = [regex]::Replace($text, $insertPattern, "`$1$newMatchJson`n    {`n      `"id`": `"worldcup_group_stage_united_states_paraguay`",", 1)
}

$groupPattern = '(?s)("id": "B",)\s*"rows": \[\s*\[\s*1,\s*"Switzerland",\s*7\s*\].*?\[\s*4,\s*"Qatar",\s*1\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group B standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupBRows", 1)

$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host 'Updated Canada squad, Group B fixtures MD1-3, and standings.'
