$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false

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
    $lines.Add("      `"id`": `"worldcup_mexico_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_mexico",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add('      "flag": "🇲🇽",')
    $lines.Add('      "nationality": "Mexico",')
    $lines.Add("      `"sortOrder`": $sortOrder,")
    if ($entry.captain) {
        $lines.Add("      `"club`": `"$($entry.club)`",")
        $lines.Add('      "captain": true')
    } else {
        $lines.Add("      `"club`": `"$($entry.club)`"")
    }
    $lines.Add('    }')
    return ($lines -join "`n")
}

$mexicoSquad = @(
    @{ number=1;  name='Raul Rangel';        pos='GK'; role='GK'; club='Chivas' }
    @{ number=12; name='Carlos Acevedo';     pos='GK'; role='GK'; club='Santos Laguna' }
    @{ number=13; name='Guillermo Ochoa';    pos='GK'; role='GK'; club='AEL Limassol' }
    @{ number=3;  name='Cesar Montes';       pos='DF'; role='CB'; club='Lokomotiv Moscow' }
    @{ number=5;  name='Johan Vasquez';      pos='DF'; role='CB'; club='Genoa' }
    @{ number=2;  name='Jorge Sanchez';      pos='DF'; role='RB'; club='PAOK' }
    @{ number=15; name='Israel Reyes';       pos='DF'; role='RB'; club='CF America' }
    @{ number=20; name='Mateo Chavez';       pos='DF'; role='LB'; club='AZ Alkmaar' }
    @{ number=23; name='Jesus Gallardo';     pos='DF'; role='LB'; club='Toluca' }
    @{ number=4;  name='Edson Alvarez';      pos='MF'; role='DM'; club='West Ham'; captain=$true }
    @{ number=6;  name='Erik Lira';          pos='MF'; role='DM'; club='Cruz Azul' }
    @{ number=24; name='Luis Chavez';        pos='MF'; role='DM'; club='Dynamo Moscow' }
    @{ number=8;  name='Alvaro Fidalgo';     pos='MF'; role='CM'; club='Real Betis' }
    @{ number=17; name='Orbelin Pineda';     pos='MF'; role='CM'; club='AEK Athens' }
    @{ number=18; name='Obed Vargas';        pos='MF'; role='CM'; club='Atletico Madrid' }
    @{ number=7;  name='Luis Romo';          pos='MF'; role='AM'; club='Chivas' }
    @{ number=19; name='Gilberto Mora';      pos='MF'; role='AM'; club='Tijuana' }
    @{ number=26; name='Brian Gutierrez';    pos='MF'; role='AM'; club='Chivas' }
    @{ number=21; name='Cesar Huerta';       pos='FW'; role='RW'; club='Anderlecht' }
    @{ number=25; name='Roberto Alvarado';   pos='FW'; role='RW'; club='Chivas' }
    @{ number=10; name='Alexis Vega';        pos='FW'; role='LW'; club='Toluca' }
    @{ number=16; name='Julian Quinones';    pos='FW'; role='LW'; club='Al Qadsiah' }
    @{ number=9;  name='Raul Jimenez';       pos='FW'; role='CF'; club='Fulham' }
    @{ number=11; name='Santiago Gimenez';   pos='FW'; role='CF'; club='AC Milan' }
    @{ number=14; name='Armando Gonzalez';   pos='FW'; role='CF'; club='Chivas' }
    @{ number=22; name='Guillermo Martinez'; pos='FW'; role='CF'; club='Pumas' }
)

$playerBlocks = for ($i = 0; $i -lt $mexicoSquad.Count; $i++) {
    Format-Player $mexicoSquad[$i] $i
}
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "squadDepth": {
        "formation": "4-1-4-1",
        "goalkeepers": [
          "worldcup_mexico_1_Raul_Rangel",
          "worldcup_mexico_12_Carlos_Acevedo",
          "worldcup_mexico_13_Guillermo_Ochoa"
        ],
        "slots": [
          {
            "tag": "LB",
            "players": [
              "worldcup_mexico_23_Jesus_Gallardo",
              "worldcup_mexico_20_Mateo_Chavez"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_mexico_3_Cesar_Montes",
              ""
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_mexico_5_Johan_Vasquez",
              ""
            ]
          },
          {
            "tag": "RB",
            "players": [
              "worldcup_mexico_2_Jorge_Sanchez",
              "worldcup_mexico_15_Israel_Reyes"
            ]
          },
          {
            "tag": "DM",
            "players": [
              "worldcup_mexico_4_Edson_Alvarez",
              "worldcup_mexico_6_Erik_Lira"
            ]
          },
          {
            "tag": "LW",
            "players": [
              "worldcup_mexico_10_Alexis_Vega",
              "worldcup_mexico_16_Julian_Quinones"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_mexico_8_Alvaro_Fidalgo",
              "worldcup_mexico_17_Orbelin_Pineda"
            ]
          },
          {
            "tag": "AM",
            "players": [
              "worldcup_mexico_7_Luis_Romo",
              "worldcup_mexico_26_Brian_Gutierrez"
            ]
          },
          {
            "tag": "RW",
            "players": [
              "worldcup_mexico_21_Cesar_Huerta",
              "worldcup_mexico_25_Roberto_Alvarado"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_mexico_9_Raul_Jimenez",
              "worldcup_mexico_11_Santiago_Gimenez"
            ]
          }
        ]
      }
'@

$newMatchesJson = @'
    {
      "id": "worldcup_group_stage_mexico_south_korea",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Friday 19 Jun",
      "stadium": "Estadio Guadalajara",
      "homeTeamId": "worldcup_mexico",
      "awayTeamId": "worldcup_south_korea",
      "score": [1, 0],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["4-1-4-1", "3-4-2-1"]
    },
    {
      "id": "worldcup_group_stage_czech_republic_mexico",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Thursday 25 Jun",
      "stadium": "Estadio Guadalajara",
      "homeTeamId": "worldcup_czech_republic",
      "awayTeamId": "worldcup_mexico",
      "score": [0, 3],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["3-4-2-1", "4-1-4-1"]
    },
'@

$groupARows = @'
          "rows": [
            [1, "Mexico", 9],
            [2, "South Africa", 4],
            [3, "South Korea", 3],
            [4, "Czech Republic", 1]
          ]
'@

Write-Host "Reading $dataPath ..."
$text = [System.IO.File]::ReadAllText($dataPath, $utf8)

# Replace Mexico player block
$playerPattern = '(?s)\{\s*"id": "worldcup_mexico_6_Erik_Lira",.*?\},\s*\{\s*"id": "worldcup_south_africa_16_Sipho_Chaine",'
if ($text -notmatch $playerPattern) { throw 'Mexico player block not found' }
$text = [regex]::Replace($text, $playerPattern, ($playersJson + "    {`n      `"id`": `"worldcup_south_africa_16_Sipho_Chaine`","), 1)

# Replace squadDepth on Mexico team
$squadPattern = '(?s)("id": "worldcup_mexico",.*?"formation": "4-1-4-1",)\s*"squadDepth": \{.*?\}\s*\}'
if ($text -notmatch $squadPattern) { throw 'Mexico squadDepth block not found' }
$text = [regex]::Replace($text, $squadPattern, "`$1`n$squadDepthJson`n    }", 1)

# Insert MD2 + MD3 after Mexico vs South Africa
$insertPattern = '(?s)("id": "worldcup_group_stage_mexico_south_africa",.*?\}\s*\},\s*)\{\s*"id": "worldcup_group_stage_south_korea_czech_republic",'
if ($text -notmatch $insertPattern) { throw 'Insert point for new matches not found' }
$text = [regex]::Replace($text, $insertPattern, "`$1$newMatchesJson`n    {`n      `"id`": `"worldcup_group_stage_south_korea_czech_republic`",", 1)

# Group A standings
$groupPattern = '(?s)("id": "A",)\s*"rows": \[\s*\[\s*1,\s*"Mexico",\s*0\s*\].*?\[\s*4,\s*"Czech Republic",\s*0\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group A standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupARows", 1)

# Bump dataRevision
$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host "Updated Mexico squad, fixtures MD2-3, and Group A standings."
