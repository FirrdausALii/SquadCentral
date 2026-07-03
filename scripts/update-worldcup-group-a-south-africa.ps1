$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$saFlag = [System.Text.Encoding]::UTF8.GetString([byte[]](0xF0, 0x9F, 0x87, 0xBF, 0xF0, 0x9F, 0x87, 0xA6))

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
    $lines.Add("      `"id`": `"worldcup_south_africa_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_south_africa",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add("      `"flag`": `"$saFlag`",")
    $lines.Add('      "nationality": "South Africa",')
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

$squad = @(
    @{ number=1;  name='Ronwen Williams';       pos='GK'; role='GK'; club='Mamelodi Sundowns'; captain=$true }
    @{ number=16; name='Sipho Chaine';          pos='GK'; role='GK'; club='Orlando Pirates' }
    @{ number=22; name='Ricardo Goss';          pos='GK'; role='GK'; club='Siwelele' }
    @{ number=3;  name='Khulumani Ndamane';      pos='DF'; role='CB'; club='Mamelodi Sundowns' }
    @{ number=14; name='Mbekezeli Mbokazi';     pos='DF'; role='CB'; club='Chicago Fire' }
    @{ number=19; name='Nkosinathi Sibisi';     pos='DF'; role='CB'; club='Orlando Pirates' }
    @{ number=21; name='Ime Okon';               pos='DF'; role='CB'; club='Hannover 96' }
    @{ number=24; name='Olwethu Makhanya';       pos='DF'; role='CB'; club='Philadelphia Union' }
    @{ number=2;  name='Thabang Matuludi';       pos='DF'; role='RB'; club='Polokwane City' }
    @{ number=20; name='Khuliso Mudau';          pos='DF'; role='RB'; club='Mamelodi Sundowns' }
    @{ number=25; name='Kamogelo Sebelebele';    pos='DF'; role='RB'; club='Orlando Pirates' }
    @{ number=6;  name='Aubrey Modiba';          pos='DF'; role='LB'; club='Mamelodi Sundowns' }
    @{ number=18; name='Samukelo Kabini';        pos='DF'; role='LB'; club='Molde' }
    @{ number=26; name='Bradley Cross';          pos='DF'; role='LB'; club='Kaizer Chiefs' }
    @{ number=4;  name='Teboho Mokoena';         pos='MF'; role='DM'; club='Mamelodi Sundowns' }
    @{ number=5;  name='Thalente Mbatha';        pos='MF'; role='DM'; club='Orlando Pirates' }
    @{ number=13; name='Yaya Sithole';           pos='MF'; role='CM'; club='Tondela' }
    @{ number=23; name='Jayden Adams';           pos='MF'; role='CM'; club='Mamelodi Sundowns' }
    @{ number=10; name='Relebohile Mofokeng';    pos='MF'; role='AM'; club='Orlando Pirates' }
    @{ number=11; name='Themba Zwane';           pos='MF'; role='AM'; club='Mamelodi Sundowns' }
    @{ number=12; name='Thapelo Maseko';         pos='FW'; role='RW'; club='Mamelodi Sundowns' }
    @{ number=7;  name='Oswin Appollis';         pos='FW'; role='LW'; club='Orlando Pirates' }
    @{ number=8;  name='Tshepang Moremi';         pos='FW'; role='LW'; club='Orlando Pirates' }
    @{ number=9;  name='Lyle Foster';            pos='FW'; role='CF'; club='Burnley' }
    @{ number=15; name='Iqraam Rayners';         pos='FW'; role='CF'; club='Mamelodi Sundowns' }
    @{ number=17; name='Evidence Makgopa';       pos='FW'; role='CF'; club='Orlando Pirates' }
)

$playerBlocks = for ($i = 0; $i -lt $squad.Count; $i++) { Format-Player $squad[$i] $i }
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "formation": "5-3-2",
      "squadDepth": {
        "formation": "5-3-2",
        "goalkeepers": [
          "worldcup_south_africa_1_Ronwen_Williams",
          "worldcup_south_africa_16_Sipho_Chaine",
          "worldcup_south_africa_22_Ricardo_Goss"
        ],
        "slots": [
          {
            "tag": "LB",
            "players": [
              "worldcup_south_africa_6_Aubrey_Modiba",
              "worldcup_south_africa_18_Samukelo_Kabini"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_south_africa_3_Khulumani_Ndamane",
              "worldcup_south_africa_14_Mbekezeli_Mbokazi"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_south_africa_19_Nkosinathi_Sibisi",
              "worldcup_south_africa_21_Ime_Okon"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_south_africa_24_Olwethu_Makhanya",
              ""
            ]
          },
          {
            "tag": "RB",
            "players": [
              "worldcup_south_africa_2_Thabang_Matuludi",
              "worldcup_south_africa_20_Khuliso_Mudau"
            ]
          },
          {
            "tag": "DM",
            "players": [
              "worldcup_south_africa_4_Teboho_Mokoena",
              "worldcup_south_africa_5_Thalente_Mbatha"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_south_africa_13_Yaya_Sithole",
              "worldcup_south_africa_23_Jayden_Adams"
            ]
          },
          {
            "tag": "AM",
            "players": [
              "worldcup_south_africa_10_Relebohile_Mofokeng",
              "worldcup_south_africa_11_Themba_Zwane"
            ]
          },
          {
            "tag": "RW",
            "players": [
              "worldcup_south_africa_12_Thapelo_Maseko",
              ""
            ]
          },
          {
            "tag": "LW",
            "players": [
              "worldcup_south_africa_7_Oswin_Appollis",
              "worldcup_south_africa_8_Tshepang_Moremi"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_south_africa_9_Lyle_Foster",
              "worldcup_south_africa_15_Iqraam_Rayners"
            ]
          }
        ]
      }
'@

$newMatchesJson = @'
    {
      "id": "worldcup_group_stage_czech_republic_south_africa",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Friday 19 Jun",
      "stadium": "Guadalajara Stadium",
      "homeTeamId": "worldcup_czech_republic",
      "awayTeamId": "worldcup_south_africa",
      "score": [1, 1],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["3-4-2-1", "5-3-2"]
    },
    {
      "id": "worldcup_group_stage_south_africa_south_korea",
      "leagueId": "worldcup",
      "matchday": "Group Stage",
      "status": "FT",
      "time": "Thursday 25 Jun",
      "stadium": "Guadalajara Stadium",
      "homeTeamId": "worldcup_south_africa",
      "awayTeamId": "worldcup_south_korea",
      "score": [1, 0],
      "scorers": [],
      "goalEvents": [],
      "possession": [],
      "momentum": 0.5,
      "formation": ["5-3-2", "3-4-2-1"]
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

$playerPattern = '(?s)\{\s*"id": "worldcup_south_africa_16_Sipho_Chaine",.*?\},\s*\{\s*"id": "worldcup_bosnia_1_Nikola_Vasilj",'
if ($text -notmatch $playerPattern) { throw 'South Africa player block not found' }
$text = [regex]::Replace($text, $playerPattern, ($playersJson + "    {`n      `"id`": `"worldcup_bosnia_1_Nikola_Vasilj`","), 1)

$teamPattern = '(?s)("id": "worldcup_south_africa",\s*"leagueId": "worldcup",\s*"name": "South Africa",\s*"city": "[^"]*",\s*"coach": "Hugo Broos",\s*"colors": \[\s*"#2de2e6",\s*"#111827"\s*\],\s*"logo": "./images/worldcup/south_africa.png")\s*\}'
if ($text -notmatch $teamPattern) { throw 'South Africa team block not found' }
$text = [regex]::Replace($text, $teamPattern, "`$1,`n$squadDepthJson`n    }", 1)

$insertPattern = '(?s)("id": "worldcup_group_stage_czech_republic_mexico",.*?\},\s*)\{\s*"id": "worldcup_group_stage_south_korea_czech_republic",'
if ($text -notmatch $insertPattern) { throw 'Insert point for SA matches not found' }
$text = [regex]::Replace($text, $insertPattern, "`$1$newMatchesJson`n    {`n      `"id`": `"worldcup_group_stage_south_korea_czech_republic`",", 1)

$groupPattern = '(?s)("id": "A",)\s*"rows": \[\s*\[\s*1,\s*"Mexico",\s*9\s*\].*?\[\s*4,\s*"Czech Republic",\s*1\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group A standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupARows", 1)

$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host 'Updated South Africa squad, fixtures MD1-3, and Group A standings.'
