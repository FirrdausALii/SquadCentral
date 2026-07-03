$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$czFlag = [System.Text.Encoding]::UTF8.GetString([byte[]](0xF0, 0x9F, 0x87, 0xA8, 0xF0, 0x9F, 0x87, 0xBF))

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
    $lines.Add("      `"id`": `"worldcup_czech_republic_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_czech_republic",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add("      `"club`": `"$($entry.club)`",")
    $lines.Add("      `"flag`": `"$czFlag`",")
    $lines.Add('      "nationality": "Czech Republic",')
    $lines.Add("      `"sortOrder`": $sortOrder")
    if ($entry.captain) {
        $lines[-1] = $lines[-1] + ','
        $lines.Add('      "captain": true')
    }
    $lines.Add('    }')
    return ($lines -join "`n")
}

$squad = @(
    @{ number=1;  name='Matej Kovar';           pos='GK'; role='GK'; club='PSV Eindhoven' }
    @{ number=16; name='Jindrich Stanek';       pos='GK'; role='GK'; club='Slavia Prague' }
    @{ number=23; name='Lukas Hornicek';        pos='GK'; role='GK'; club='Braga' }
    @{ number=2;  name='David Zima';            pos='DF'; role='CB'; club='Slavia Prague' }
    @{ number=3;  name='Tomas Holes';           pos='DF'; role='CB'; club='Slavia Prague' }
    @{ number=4;  name='Robin Hranac';          pos='DF'; role='CB'; club='Hoffenheim' }
    @{ number=6;  name='Stepan Chaloupek';      pos='DF'; role='CB'; club='Slavia Prague' }
    @{ number=7;  name='Ladislav Krejci';       pos='DF'; role='CB'; club='Wolverhampton Wanderers'; captain=$true }
    @{ number=6;  name='Vladimir Coufal';       pos='DF'; role='RM'; club='Hoffenheim' }
    @{ number=21; name='David Doudera';         pos='DF'; role='RM'; club='Slavia Prague' }
    @{ number=14; name='David Jurasek';         pos='DF'; role='LM'; club='Slavia Prague' }
    @{ number=20; name='Jaroslav Zeleny';       pos='DF'; role='LM'; club='Sparta Prague' }
    @{ number=24; name='Alexander Sojka';       pos='DF'; role='LM'; club='Viktoria Plzen' }
    @{ number=8;  name='Vladimir Darida';       pos='MF'; role='CM'; club='Hradec Kralove' }
    @{ number=12; name='Lukas Cerv';            pos='MF'; role='CM'; club='Viktoria Plzen' }
    @{ number=18; name='Michal Sadilek';       pos='MF'; role='CM'; club='Slavia Prague' }
    @{ number=22; name='Tomas Soucek';          pos='MF'; role='CM'; club='West Ham' }
    @{ number=25; name='Hugo Sochurek';         pos='MF'; role='CM'; club='Sparta Prague' }
    @{ number=13; name='Mojmir Chytil';         pos='FW'; role='RW'; club='Slavia Prague' }
    @{ number=15; name='Pavel Sulc';            pos='FW'; role='RW'; club='Lyon' }
    @{ number=17; name='Lukas Provod';          pos='FW'; role='LW'; club='Slavia Prague' }
    @{ number=26; name='Denis Visinsky';        pos='FW'; role='LW'; club='Viktoria Plzen' }
    @{ number=9;  name='Adam Hlozek';           pos='FW'; role='CF'; club='Hoffenheim' }
    @{ number=10; name='Patrik Schick';         pos='FW'; role='CF'; club='Bayer Leverkusen' }
    @{ number=11; name='Jan Kuchta';            pos='FW'; role='CF'; club='Sparta Prague' }
    @{ number=19; name='Tomas Chory';           pos='FW'; role='CF'; club='Slavia Prague' }
)

$playerBlocks = for ($i = 0; $i -lt $squad.Count; $i++) { Format-Player $squad[$i] $i }
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "formation": "3-4-2-1",
      "squadDepth": {
        "formation": "3-4-2-1",
        "goalkeepers": [
          "worldcup_czech_republic_1_Matej_Kovar",
          "worldcup_czech_republic_16_Jindrich_Stanek",
          "worldcup_czech_republic_23_Lukas_Hornicek"
        ],
        "slots": [
          {
            "tag": "CB",
            "players": [
              "worldcup_czech_republic_2_David_Zima",
              "worldcup_czech_republic_3_Tomas_Holes"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_czech_republic_4_Robin_Hranac",
              "worldcup_czech_republic_7_Ladislav_Krejci"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_czech_republic_6_Stepan_Chaloupek",
              ""
            ]
          },
          {
            "tag": "LM",
            "players": [
              "worldcup_czech_republic_14_David_Jurasek",
              "worldcup_czech_republic_20_Jaroslav_Zeleny"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_czech_republic_8_Vladimir_Darida",
              "worldcup_czech_republic_12_Lukas_Cerv"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_czech_republic_18_Michal_Sadilek",
              "worldcup_czech_republic_22_Tomas_Soucek"
            ]
          },
          {
            "tag": "RM",
            "players": [
              "worldcup_czech_republic_6_Vladimir_Coufal",
              "worldcup_czech_republic_21_David_Doudera"
            ]
          },
          {
            "tag": "RW",
            "players": [
              "worldcup_czech_republic_13_Mojmir_Chytil",
              "worldcup_czech_republic_15_Pavel_Sulc"
            ]
          },
          {
            "tag": "LW",
            "players": [
              "worldcup_czech_republic_17_Lukas_Provod",
              "worldcup_czech_republic_26_Denis_Visinsky"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_czech_republic_10_Patrik_Schick",
              "worldcup_czech_republic_9_Adam_Hlozek"
            ]
          }
        ]
      }
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

$playerPattern = '(?s)\{\s*"id": "worldcup_czech_republic_1_Jindrich_Stanek",.*?\},\s*\{\s*"id": "msl_melaka_20_Dino_Kalesic",'
if ($text -notmatch $playerPattern) { throw 'Czech Republic player block not found' }
$melakaStart = "    {`n      `"id`": `"msl_melaka_20_Dino_Kalesic`","
$text = [regex]::Replace($text, $playerPattern, ($playersJson + $melakaStart), 1)

$teamPattern = '(?s)("id": "worldcup_czech_republic",\s*"leagueId": "worldcup",\s*"name": "Czech Republic",\s*"city": "Prague",\s*"coach": "Miroslav Koubek",\s*"colors": \[\s*"#2de2e6",\s*"#111827"\s*\],\s*"logo": "./images/worldcup/czech_republic.png")(?:,\s*"formation": "[^"]+",\s*"squadDepth": \{.*?\})?\s*\}'
if ($text -notmatch $teamPattern) { throw 'Czech Republic team block not found' }
$text = [regex]::Replace($text, $teamPattern, "`$1,`n$squadDepthJson`n    }", 1)

# Normalize MD1 goal and lineup names for Czech Republic vs South Korea
$text = $text.Replace('"scorer": "Ladislav Krejci (C)"', '"scorer": "Ladislav Krejci"')
$text = $text.Replace('"name": "Alexandr Sojka"', '"name": "Alexander Sojka"')
$text = [regex]::Replace($text, '("tag": "RM",\s*"number": )5(,\s*"name": "Vladimir Coufal")', '${1}6${2}', 1)

$groupPattern = '(?s)("id": "A",)\s*"rows": \[\s*\[\s*1,\s*"Mexico",\s*9\s*\].*?\[\s*4,\s*"Czech Republic",\s*1\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group A standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupARows", 1)

$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host 'Updated Czech Republic squad, Group A fixtures confirmed, and standings.'
