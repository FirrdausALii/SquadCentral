$ErrorActionPreference = 'Stop'
$dataPath = Join-Path $PSScriptRoot '..\data.json'
$utf8 = New-Object System.Text.UTF8Encoding $false
$krFlag = [System.Text.Encoding]::UTF8.GetString([byte[]](0xF0, 0x9F, 0x87, 0xB0, 0xF0, 0x9F, 0x87, 0xB7))

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
    $lines.Add("      `"id`": `"worldcup_south_korea_$($entry.number)_$slug`",")
    $lines.Add('      "teamId": "worldcup_south_korea",')
    $lines.Add("      `"number`": $($entry.number),")
    $lines.Add("      `"name`": `"$($entry.name)`",")
    $lines.Add("      `"pos`": `"$($entry.pos)`",")
    $lines.Add("      `"role`": `"$($entry.role)`",")
    $lines.Add("      `"club`": `"$($entry.club)`",")
    $lines.Add("      `"flag`": `"$krFlag`",")
    $lines.Add('      "nationality": "South Korea",')
    $lines.Add("      `"sortOrder`": $sortOrder")
    if ($entry.captain) {
        $lines[-1] = $lines[-1] + ','
        $lines.Add('      "captain": true')
    }
    $lines.Add('    }')
    return ($lines -join "`n")
}

$squad = @(
    @{ number=1;  name='Kim Seung-Gyu';       pos='GK'; role='GK'; club='FC Tokyo' }
    @{ number=12; name='Song Bum-Keun';       pos='GK'; role='GK'; club='Jeonbuk Hyundai Motors' }
    @{ number=21; name='Jo Hyeon-Woo';        pos='GK'; role='GK'; club='Ulsan HD' }
    @{ number=2;  name='Lee Han-Beom';         pos='DF'; role='CB'; club='FC Midtjylland' }
    @{ number=3;  name='Lee Gi-Hyuk';          pos='DF'; role='CB'; club='Gangwon FC' }
    @{ number=4;  name='Kim Min-Jae';          pos='DF'; role='CB'; club='Bayern Munich' }
    @{ number=5;  name='Kim Tae-Hyeon';         pos='DF'; role='CB'; club='Kashima Antlers' }
    @{ number=14; name='Cho Wi-Je';            pos='DF'; role='CB'; club='Jeonbuk Hyundai Motors' }
    @{ number=15; name='Kim Moon-Hwan';        pos='DF'; role='RM'; club='Daejeon Hana Citizen' }
    @{ number=22; name='Seol Young-Woo';       pos='DF'; role='RM'; club='FK Crvena Zvezda' }
    @{ number=13; name='Lee Tae-Seok';         pos='DF'; role='LM'; club='Austria Wien' }
    @{ number=23; name='Jens Castrop';         pos='MF'; role='LM'; club='Borussia Monchengladbach' }
    @{ number=6;  name='Hwang In-Beom';        pos='MF'; role='DM'; club='Feyenoord' }
    @{ number=8;  name='Paik Seung-Ho';        pos='MF'; role='DM'; club='Birmingham City' }
    @{ number=16; name='Park Jin-Seob';        pos='MF'; role='DM'; club='Zhejiang Professional' }
    @{ number=24; name='Kim Jin-Gyu';          pos='MF'; role='DM'; club='Jeonbuk Hyundai Motors' }
    @{ number=10; name='Lee Jae-Sung';         pos='MF'; role='AM'; club='Mainz 05' }
    @{ number=17; name='Bae Jun-Ho';           pos='MF'; role='AM'; club='Stoke City' }
    @{ number=19; name='Lee Kang-In';          pos='MF'; role='AM'; club='Paris Saint-Germain' }
    @{ number=20; name='Yang Hyun-Jun';        pos='FW'; role='RW'; club='Celtic' }
    @{ number=26; name='Lee Dong-Gyeong';      pos='FW'; role='RW'; club='Ulsan HD' }
    @{ number=11; name='Hwang Hee-Chan';       pos='FW'; role='LW'; club='Wolverhampton Wanderers' }
    @{ number=25; name='Eom Ji-Sung';          pos='FW'; role='LW'; club='Swansea City' }
    @{ number=7;  name='Son Heung-Min';       pos='FW'; role='CF'; club='Los Angeles FC'; captain=$true }
    @{ number=9;  name='Cho Gue-Sung';         pos='FW'; role='CF'; club='FC Midtjylland' }
    @{ number=18; name='Oh Hyeon-Gyu';         pos='FW'; role='CF'; club='Besiktas' }
)

$playerBlocks = for ($i = 0; $i -lt $squad.Count; $i++) { Format-Player $squad[$i] $i }
$playersJson = ($playerBlocks -join ",`n") + ",`n"

$squadDepthJson = @'
      "formation": "3-4-2-1",
      "squadDepth": {
        "formation": "3-4-2-1",
        "goalkeepers": [
          "worldcup_south_korea_1_Kim_Seung_Gyu",
          "worldcup_south_korea_12_Song_Bum_Keun",
          "worldcup_south_korea_21_Jo_Hyeon_Woo"
        ],
        "slots": [
          {
            "tag": "CB",
            "players": [
              "worldcup_south_korea_3_Lee_Gi_Hyuk",
              "worldcup_south_korea_4_Kim_Min_Jae"
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_south_korea_2_Lee_Han_Beom",
              ""
            ]
          },
          {
            "tag": "CB",
            "players": [
              "worldcup_south_korea_5_Kim_Tae_Hyeon",
              "worldcup_south_korea_14_Cho_Wi_Je"
            ]
          },
          {
            "tag": "LM",
            "players": [
              "worldcup_south_korea_13_Lee_Tae_Seok",
              "worldcup_south_korea_23_Jens_Castrop"
            ]
          },
          {
            "tag": "DM",
            "players": [
              "worldcup_south_korea_6_Hwang_In_Beom",
              "worldcup_south_korea_8_Paik_Seung_Ho"
            ]
          },
          {
            "tag": "CM",
            "players": [
              "worldcup_south_korea_16_Park_Jin_Seob",
              "worldcup_south_korea_24_Kim_Jin_Gyu"
            ]
          },
          {
            "tag": "RM",
            "players": [
              "worldcup_south_korea_22_Seol_Young_Woo",
              "worldcup_south_korea_15_Kim_Moon_Hwan"
            ]
          },
          {
            "tag": "AM",
            "players": [
              "worldcup_south_korea_19_Lee_Kang_In",
              "worldcup_south_korea_10_Lee_Jae_Sung"
            ]
          },
          {
            "tag": "AM",
            "players": [
              "worldcup_south_korea_17_Bae_Jun_Ho",
              ""
            ]
          },
          {
            "tag": "RW",
            "players": [
              "worldcup_south_korea_20_Yang_Hyun_Jun",
              "worldcup_south_korea_26_Lee_Dong_Gyeong"
            ]
          },
          {
            "tag": "LW",
            "players": [
              "worldcup_south_korea_11_Hwang_Hee_Chan",
              "worldcup_south_korea_25_Eom_Ji_Sung"
            ]
          },
          {
            "tag": "CF",
            "players": [
              "worldcup_south_korea_7_Son_Heung_Min",
              "worldcup_south_korea_9_Cho_Gue_Sung"
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

$playerPattern = '(?s)\{\s*"id": "worldcup_south_korea_1_Kim_Seung_gyu",.*?\},\s*\{\s*"id": "worldcup_canada_1_Dayne_St\._Clair",'
if ($text -notmatch $playerPattern) { throw 'South Korea player block not found' }
$canadaStart = "    {`n      `"id`": `"worldcup_canada_1_Dayne_St._Clair`","
$text = [regex]::Replace($text, $playerPattern, ($playersJson + $canadaStart), 1)

$teamPattern = '(?s)("id": "worldcup_south_korea",\s*"leagueId": "worldcup",\s*"name": "South Korea",\s*"city": "Seoul",\s*"coach": "Hong Myung-Bo",\s*"colors": \[\s*"#ff4d6d",\s*"#2de2e6"\s*\],\s*"logo": "./images/worldcup/south_korea.png")(?:,\s*"formation": "[^"]+",\s*"squadDepth": \{.*?\})?\s*\}'
if ($text -notmatch $teamPattern) { throw 'South Korea team block not found' }
$text = [regex]::Replace($text, $teamPattern, "`$1,`n$squadDepthJson`n    }", 1)

# Normalize MD1 goal scorer names in South Korea vs Czech Republic
$text = $text.Replace('"scorer": "Oh Hyeon-gyu"', '"scorer": "Oh Hyeon-Gyu"')
$text = $text.Replace('"scorer": "Hwang In-beom"', '"scorer": "Hwang In-Beom"')
$text = $text.Replace('"scorer": "Lee Kang-in"', '"scorer": "Lee Kang-In"')
$text = $text.Replace('"assist": "Lee Kang-in"', '"assist": "Lee Kang-In"')

$groupPattern = '(?s)("id": "A",)\s*"rows": \[\s*\[\s*1,\s*"Mexico",\s*9\s*\].*?\[\s*4,\s*"Czech Republic",\s*1\s*\]\s*\]'
if ($text -notmatch $groupPattern) { throw 'Group A standings block not found' }
$text = [regex]::Replace($text, $groupPattern, "`${1}`n$groupARows", 1)

$rev = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = [regex]::Replace($text, '"dataRevision":\s*\d+', "`"dataRevision`": $rev", 1)

[System.IO.File]::WriteAllText($dataPath, $text, $utf8)
Write-Host 'Updated South Korea squad, Group A fixtures confirmed, and standings.'
