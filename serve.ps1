# Simple static file server for Squad Central (no Node/npm required)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".htm"  = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

function Start-StaticListener([int[]]$ports) {
  foreach ($port in $ports) {
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    try {
      $listener.Start()
      return @{ Listener = $listener; Port = $port }
    }
    catch {
      $listener.Close()
    }
  }
  return $null
}

function Get-TransfermarktHtml([string]$tmUrl) {
  $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    $tmp = [IO.Path]::GetTempFileName()
    try {
      $httpCode = & curl.exe @(
        "-sS", "-L", "--max-time", "25",
        "-A", $ua,
        "-H", "Accept-Language: en-GB,en;q=0.9",
        "-H", "Accept: text/html,application/xhtml+xml",
        "-o", $tmp,
        "-w", "%{http_code}",
        $tmUrl
      ) 2>&1
      if ($LASTEXITCODE -ne 0) {
        throw "Transfermarkt request failed via curl (exit $LASTEXITCODE): $httpCode"
      }
      $code = [string]$httpCode
      if ($code -ne "200") {
        throw "Transfermarkt returned HTTP $code"
      }
      return [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
    }
    finally {
      Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
    }
  }

  # Fallback — PowerShell Invoke-WebRequest often hangs on Transfermarkt
  $tmResp = Invoke-WebRequest -Uri $tmUrl -UserAgent $ua -UseBasicParsing -TimeoutSec 25
  return $tmResp.Content
}

function Write-JsonError($response, [int]$status, [string]$message) {
  $response.StatusCode = $status
  $response.ContentType = "application/json; charset=utf-8"
  $safe = ($message -replace '\\', '\\' -replace '"', '\"' -replace "[\r\n]+", " ")
  $err = "{`"error`":`"$safe`"}"
  $errBytes = [Text.Encoding]::UTF8.GetBytes($err)
  $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
}

function Write-JsonOk($response, [string]$json) {
  $response.StatusCode = 200
  $response.ContentType = "application/json; charset=utf-8"
  $jsonBytes = [Text.Encoding]::UTF8.GetBytes($json)
  $response.ContentLength64 = $jsonBytes.Length
  $response.OutputStream.Write($jsonBytes, 0, $jsonBytes.Length)
}

function Find-BrowserExe() {
  $candidates = @(
    (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe"),
    (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
  )
  foreach ($p in $candidates) {
    if ($p -and (Test-Path -LiteralPath $p)) { return $p }
  }
  return $null
}

function Read-TextFileAuto([string]$path) {
  $bytes = [IO.File]::ReadAllBytes($path)
  if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    return [Text.Encoding]::Unicode.GetString($bytes, 2, $bytes.Length - 2)
  }
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    return [Text.Encoding]::UTF8.GetString($bytes, 3, $bytes.Length - 3)
  }
  $nul = 0
  $n = [Math]::Min($bytes.Length, 400)
  for ($i = 0; $i -lt $n; $i++) { if ($bytes[$i] -eq 0) { $nul++ } }
  if ($nul -gt 20) {
    return [Text.Encoding]::Unicode.GetString($bytes)
  }
  return [Text.Encoding]::UTF8.GetString($bytes)
}

function Extract-JsonObject([string]$text) {
  $start = $text.IndexOf('{')
  $end = $text.LastIndexOf('}')
  if ($start -lt 0 -or $end -le $start) { return $null }
  return $text.Substring($start, $end - $start + 1)
}

function Get-SofaScoreJsonViaCurl([string]$ssUrl) {
  $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { return $null }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $httpCode = & curl.exe @(
      "-sS", "-L", "--max-time", "20",
      "-A", $ua,
      "-H", "Accept: application/json",
      "-H", "Accept-Language: en-GB,en;q=0.9",
      "-H", "Origin: https://www.sofascore.com",
      "-H", "Referer: https://www.sofascore.com/",
      "-o", $tmp,
      "-w", "%{http_code}",
      $ssUrl
    ) 2>&1
    if ($LASTEXITCODE -ne 0) { return $null }
    $code = [string]$httpCode
    if ($code -ne "200") { return $null }
    $text = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
    $json = Extract-JsonObject $text
    if ($json -and $json -notmatch '"reason"\s*:\s*"Forbidden"') { return $json }
    return $null
  }
  finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Get-SofaScoreJsonViaBrowser([string]$ssUrl) {
  $browser = Find-BrowserExe
  if (-not $browser) {
    throw "SofaScore fetch needs Google Chrome or Microsoft Edge installed."
  }
  $profileDir = Join-Path $env:TEMP "squadcentral-ss-chrome"
  if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir | Out-Null
  }
  $out = Join-Path $env:TEMP ("ss-dom-" + [guid]::NewGuid().ToString("N") + ".html")
  $err = Join-Path $env:TEMP ("ss-dom-" + [guid]::NewGuid().ToString("N") + ".err")
  try {
    $p = Start-Process -FilePath $browser -ArgumentList @(
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--virtual-time-budget=12000",
      "--timeout=25000",
      "--user-data-dir=$profileDir",
      "--dump-dom",
      $ssUrl
    ) -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(45000)) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      throw "SofaScore browser fetch timed out"
    }
    Start-Sleep -Milliseconds 400
    $text = $null
    for ($i = 0; $i -lt 12; $i++) {
      try {
        if ((Test-Path -LiteralPath $out) -and (Get-Item -LiteralPath $out).Length -ge 8) {
          $text = Read-TextFileAuto $out
          if ($text) { break }
        }
      }
      catch {
        Start-Sleep -Milliseconds 250
      }
      Start-Sleep -Milliseconds 250
    }
    if (-not $text) { throw "SofaScore browser fetch returned an empty page" }
    $json = Extract-JsonObject $text
    if (-not $json) { throw "SofaScore browser fetch was not JSON" }
    if ($json -match '"reason"\s*:\s*"Forbidden"') {
      throw "SofaScore blocked the browser fetch (403)"
    }
    return $json
  }
  finally {
    Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $err -Force -ErrorAction SilentlyContinue
  }
}

function Get-SofaScoreJson([string]$ssUrl) {
  $viaCurl = Get-SofaScoreJsonViaCurl $ssUrl
  if ($viaCurl) { return $viaCurl }
  return Get-SofaScoreJsonViaBrowser $ssUrl
}

$script:FbrefDebugPort = 9338
$script:FbrefProfileName = "squadcentral-fbref-chrome"

function Test-FbrefHtmlOk([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $false }
  if ($text.Length -lt 200) { return $false }
  if ($text -match 'Just a moment' -and $text -notmatch 'class="lineup"' -and $text -notmatch 'id="sched') { return $false }
  if ($text -match 'cf-turnstile' -and $text -notmatch 'class="lineup"' -and $text.Length -lt 120000) { return $false }
  return $true
}

function Get-FbrefCdpHttp([string]$path) {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { return $null }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $code = & curl.exe @(
      "-sS", "--max-time", "3",
      "-o", $tmp,
      "-w", "%{http_code}",
      "http://127.0.0.1:$($script:FbrefDebugPort)$path"
    ) 2>$null
    if ([string]$code -ne "200") { return $null }
    return [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
  }
  catch {
    return $null
  }
  finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Stop-FbrefProfileChrome {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -match '^(chrome|msedge)\.exe$' -and
      $_.CommandLine -and
      $_.CommandLine -like "*$($script:FbrefProfileName)*"
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep -Milliseconds 500
}

function Start-FbrefChrome {
  if (Get-FbrefCdpHttp "/json/version") { return }
  $browser = Find-BrowserExe
  if (-not $browser) {
    throw "FBref fetch needs Google Chrome or Microsoft Edge installed."
  }
  $profileDir = Join-Path $env:TEMP $script:FbrefProfileName
  if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir | Out-Null
  }
  Stop-FbrefProfileChrome
  $null = Start-Process -FilePath $browser -ArgumentList @(
    "--remote-debugging-port=$($script:FbrefDebugPort)",
    "--remote-allow-origins=*",
    "--user-data-dir=$profileDir",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-blink-features=AutomationControlled",
    "--window-size=1180,860",
    "about:blank"
  )
  for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Milliseconds 400
    if (Get-FbrefCdpHttp "/json/version") { return }
  }
  throw "Could not start Chrome for FBref. Close other Chrome windows using the FBref profile and try again."
}

function Get-FbrefCdpPageWs {
  $raw = Get-FbrefCdpHttp "/json/list"
  if (-not $raw) { throw "Chrome debug port did not return a page." }
  $parsed = $raw | ConvertFrom-Json
  $wsUrl = $null
  foreach ($p in @($parsed)) {
    $kind = [string]$p.type
    $url = [string]$p.webSocketDebuggerUrl
    if ($kind -eq "page" -and $url -match '^ws://' -and [string]$p.url -notmatch '^chrome://') {
      $wsUrl = $url
      break
    }
  }
  if (-not $wsUrl) {
    $created = Get-FbrefCdpHttp "/json/new?about:blank"
    if ($created) {
      $newPage = $created | ConvertFrom-Json
      $wsUrl = [string]$newPage.webSocketDebuggerUrl
    }
  }
  if ($wsUrl -notmatch '^ws://') {
    throw "Chrome debug page is missing a WebSocket URL."
  }
  return $wsUrl
}

function Get-FbrefHtmlViaCurl([string]$fbUrl) {
  $ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if (-not $curl) { return $null }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $httpCode = & curl.exe @(
      "-sS", "-L", "--compressed", "--max-time", "25",
      "-A", $ua,
      "-H", "Accept-Language: en-GB,en;q=0.9",
      "-H", "Accept: text/html,application/xhtml+xml",
      "-H", "Referer: https://fbref.com/",
      "-o", $tmp,
      "-w", "%{http_code}",
      $fbUrl
    ) 2>&1
    if ($LASTEXITCODE -ne 0) { return $null }
    $code = [string]$httpCode
    if ($code -ne "200") { return $null }
    $text = [IO.File]::ReadAllText($tmp, [Text.Encoding]::UTF8)
    if (Test-FbrefHtmlOk $text) { return $text }
    return $null
  }
  finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Get-FbrefHtmlViaBrowser([string]$fbUrl) {
  if (Get-FbrefCdpHttp "/json/version") { return $null }
  $browser = Find-BrowserExe
  if (-not $browser) { return $null }
  $profileDir = Join-Path $env:TEMP $script:FbrefProfileName
  if (-not (Test-Path -LiteralPath $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir | Out-Null
  }
  $out = Join-Path $env:TEMP ("fbref-dom-" + [guid]::NewGuid().ToString("N") + ".html")
  $err = Join-Path $env:TEMP ("fbref-dom-" + [guid]::NewGuid().ToString("N") + ".err")
  try {
    $p = Start-Process -FilePath $browser -ArgumentList @(
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-sync",
      "--virtual-time-budget=18000",
      "--timeout=30000",
      "--user-data-dir=$profileDir",
      "--dump-dom",
      $fbUrl
    ) -RedirectStandardOutput $out -RedirectStandardError $err -PassThru -WindowStyle Hidden
    if (-not $p.WaitForExit(50000)) {
      Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
      return $null
    }
    Start-Sleep -Milliseconds 400
    $text = $null
    for ($i = 0; $i -lt 12; $i++) {
      try {
        if ((Test-Path -LiteralPath $out) -and (Get-Item -LiteralPath $out).Length -ge 8) {
          $text = Read-TextFileAuto $out
          if ($text) { break }
        }
      }
      catch {
        Start-Sleep -Milliseconds 250
      }
      Start-Sleep -Milliseconds 250
    }
    return $text
  }
  finally {
    Remove-Item -LiteralPath $out -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $err -Force -ErrorAction SilentlyContinue
  }
}

function Get-FbrefHtmlViaCdp([string]$fbUrl) {
  Start-FbrefChrome
  $wsUrl = Get-FbrefCdpPageWs
  $outFile = Join-Path $env:TEMP ("fbref-cdp-" + [guid]::NewGuid().ToString("N") + ".html")
  $waitMs = 90000
  $rs = [runspacefactory]::CreateRunspace()
  $rs.ApartmentState = "MTA"
  $rs.Open()
  $ps = [powershell]::Create()
  $ps.Runspace = $rs
  [void]$ps.AddScript({
    param($wsUrl, $fbUrl, $outFile, $waitMs)
    $ErrorActionPreference = "Stop"

    function Send-Cdp($ws, [int]$id, [string]$method, $params) {
      $msg = @{ id = $id; method = $method }
      if ($null -ne $params) { $msg.params = $params }
      $json = $msg | ConvertTo-Json -Compress -Depth 12
      $bytes = [Text.Encoding]::UTF8.GetBytes($json)
      $seg = [ArraySegment[byte]]::new($bytes)
      [void]$ws.SendAsync($seg, [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
    }

    function Recv-CdpRaw($ws, [int]$timeoutMs) {
      $cts = New-Object Threading.CancellationTokenSource
      $cts.CancelAfter([Math]::Max(500, $timeoutMs))
      $buffer = New-Object byte[] 65536
      $ms = New-Object IO.MemoryStream
      do {
        $seg = [ArraySegment[byte]]::new($buffer)
        $result = $ws.ReceiveAsync($seg, $cts.Token).GetAwaiter().GetResult()
        $ms.Write($buffer, 0, $result.Count)
      } while (-not $result.EndOfMessage)
      return [Text.Encoding]::UTF8.GetString($ms.ToArray())
    }

    function Recv-CdpId($ws, [int]$id, [int]$timeoutMs) {
      $deadline = [datetime]::UtcNow.AddMilliseconds($timeoutMs)
      while ([datetime]::UtcNow -lt $deadline) {
        $left = [int]($deadline - [datetime]::UtcNow).TotalMilliseconds
        if ($left -lt 300) { $left = 300 }
        $text = Recv-CdpRaw $ws $left
        try { $obj = $text | ConvertFrom-Json } catch { continue }
        if ($obj.id -eq $id) { return $obj }
      }
      throw "CDP timeout waiting for id $id"
    }

    $statusExpr = @'
(function(){
  var title = String(document.title || "");
  var cf = /just a moment/i.test(title) || !!document.querySelector("#cf-chl-widget, .cf-turnstile, iframe[src*='challenges.cloudflare']");
  var nLineup = document.querySelectorAll(".lineup").length;
  var hasSched = !!document.querySelector("table[id^='sched'], table.stats_table");
  var hasScore = !!document.querySelector("div.scorebox, .scorebox");
  var real = /fbref/i.test(title) && !/just a moment/i.test(title);
  var ready = nLineup >= 1 || hasSched || (real && hasScore);
  return JSON.stringify({ ready: ready, cf: cf, title: title.slice(0, 180), nLineup: nLineup, hasSched: hasSched });
})()
'@

    $htmlExpr = @'
(function(){
  var title = String(document.title || "");
  var lineups = document.querySelectorAll(".lineup");
  var sched = document.querySelector("table[id^='sched']") || document.querySelector("table.stats_table");
  var scorebox = document.querySelector("div.scorebox, .scorebox");
  var parts = [];
  if (scorebox) parts.push(scorebox.outerHTML);
  for (var i = 0; i < lineups.length; i++) parts.push(lineups[i].outerHTML);
  if (sched) {
    var wrap = sched.closest(".table_wrapper") || sched.closest("[id^='all_sched']") || sched;
    parts.push(wrap.outerHTML);
  }
  return "<!DOCTYPE html><html><head><meta charset=utf-8><title>" + title.replace(/[<>]/g, "") + "</title></head><body>" + parts.join("\n") + "</body></html>";
})()
'@

    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ws.ConnectAsync([Uri]$wsUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
    try {
      Send-Cdp $ws 1 "Page.enable" $null
      [void](Recv-CdpId $ws 1 8000)
      Send-Cdp $ws 2 "Runtime.enable" $null
      [void](Recv-CdpId $ws 2 8000)
      Send-Cdp $ws 3 "Page.addScriptToEvaluateOnNewDocument" @{
        source = "Object.defineProperty(navigator,'webdriver',{get:()=>undefined});"
      }
      [void](Recv-CdpId $ws 3 8000)
      Send-Cdp $ws 4 "Page.navigate" @{ url = $fbUrl }
      [void](Recv-CdpId $ws 4 15000)

      $deadline = [datetime]::UtcNow.AddMilliseconds($waitMs)
      $evalId = 10
      $lastCf = $true
      while ([datetime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 1200
        $evalId++
        Send-Cdp $ws $evalId "Runtime.evaluate" @{ expression = $statusExpr; returnByValue = $true }
        $resp = Recv-CdpId $ws $evalId 8000
        $rawStatus = [string]$resp.result.result.value
        if (-not $rawStatus) { continue }
        $st = $rawStatus | ConvertFrom-Json
        $lastCf = [bool]$st.cf
        if ($st.ready) {
          $evalId++
          Send-Cdp $ws $evalId "Runtime.evaluate" @{ expression = $htmlExpr; returnByValue = $true }
          $htmlResp = Recv-CdpId $ws $evalId 15000
          $html = [string]$htmlResp.result.result.value
          if ($html -and $html.Length -gt 200) {
            [IO.File]::WriteAllText($outFile, $html, [Text.Encoding]::UTF8)
            return "OK"
          }
        }
      }
      if ($lastCf) { return "CF" }
      return "EMPTY"
    }
    finally {
      try {
        $ws.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, "done", [Threading.CancellationToken]::None).GetAwaiter().GetResult() | Out-Null
      }
      catch { }
      $ws.Dispose()
    }
  }).AddArgument($wsUrl).AddArgument($fbUrl).AddArgument($outFile).AddArgument($waitMs)

  try {
    $handle = $ps.BeginInvoke()
    if (-not $handle.AsyncWaitHandle.WaitOne($waitMs + 12000)) {
      $ps.Stop()
      throw "FBref Chrome session timed out. Complete the check in the Chrome window if it is open, then Fetch again."
    }
    $output = $ps.EndInvoke($handle)
    if ($ps.HadErrors) {
      $errText = ($ps.Streams.Error | ForEach-Object { $_.ToString() }) -join "; "
      throw $errText
    }
    $status = [string]($output | Select-Object -Last 1)
    if ($status -eq "OK" -and (Test-Path -LiteralPath $outFile)) {
      return [IO.File]::ReadAllText($outFile, [Text.Encoding]::UTF8)
    }
    if ($status -eq "CF") {
      throw "FBref is waiting on Cloudflare. Complete the check in the Chrome window, then click Fetch again."
    }
    throw "FBref Chrome loaded no lineup tables. Paste the match URL and try again."
  }
  finally {
    $ps.Dispose()
    $rs.Close()
    Remove-Item -LiteralPath $outFile -Force -ErrorAction SilentlyContinue
  }
}

function Get-FbrefHtml([string]$fbUrl) {
  $viaCurl = Get-FbrefHtmlViaCurl $fbUrl
  if ($viaCurl) { return $viaCurl }
  $viaBrowser = Get-FbrefHtmlViaBrowser $fbUrl
  if (Test-FbrefHtmlOk $viaBrowser) { return $viaBrowser }
  $viaCdp = Get-FbrefHtmlViaCdp $fbUrl
  if (-not (Test-FbrefHtmlOk $viaCdp)) {
    throw "FBref is waiting on Cloudflare. Complete the check in the Chrome window, then click Fetch again."
  }
  return $viaCdp
}

function Write-HtmlOk($response, [string]$html) {
  $response.StatusCode = 200
  $response.ContentType = "text/html; charset=utf-8"
  $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
  $response.ContentLength64 = $htmlBytes.Length
  $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
}

function ConvertTo-SafeFbrefUrl([string]$rawUrl, [string]$matchId) {
  $id = ([string]$matchId).Trim().ToLowerInvariant()
  if ($id -match '^[0-9a-f]{8}$') {
    return "https://fbref.com/en/matches/$id"
  }
  $u = ([string]$rawUrl).Trim()
  if ([string]::IsNullOrWhiteSpace($u)) { return $null }
  try {
    $uri = [Uri]$u
  }
  catch {
    return $null
  }
  if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") { return $null }
  $hostName = $uri.Host.ToLowerInvariant()
  if ($hostName -ne "fbref.com" -and $hostName -ne "www.fbref.com") { return $null }
  if ($uri.AbsolutePath -notmatch '^/en/(matches|comps)/') { return $null }
  return "https://fbref.com" + $uri.PathAndQuery
}

if ($args.Count -gt 0) {
  $portsToTry = @([int]$args[0])
}
else {
  # 3000 is often taken on Windows; try safer defaults first
  $portsToTry = @(8080, 5173, 3456, 8765, 5500, 3001, 3000)
}

$started = Start-StaticListener $portsToTry
if (-not $started) {
  Write-Host ""
  Write-Host "Could not start the server. Ports tried: $($portsToTry -join ', ')" -ForegroundColor Red
  Write-Host "Close any other serve.bat window, or run: serve.bat 9000" -ForegroundColor Yellow
  Write-Host ""
  exit 1
}

$listener = $started.Listener
$port = $started.Port
$baseUrl = "http://127.0.0.1:$port"

Write-Host ""
Write-Host "Squad Central is running at:" -ForegroundColor Green
Write-Host "  $baseUrl/" -ForegroundColor Cyan
Write-Host "  $baseUrl/admin.html" -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray
Write-Host ""

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response

    try {
      $path = [Uri]::UnescapeDataString($request.Url.LocalPath)
      if ([string]::IsNullOrWhiteSpace($path) -or $path -eq "/") {
        $path = "/index.html"
      }

      if ($path -eq "/api/tm-squad") {
        $clubId = $request.QueryString.Get("clubId")
        if ([string]::IsNullOrWhiteSpace($clubId) -or $clubId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid clubId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/kader/verein/$clubId/plus/1"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-search") {
        $query = $request.QueryString.Get("q")
        if ([string]::IsNullOrWhiteSpace($query) -or $query.Length -gt 80) {
          Write-JsonError $response 400 "Missing or invalid q query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query=" + [uri]::EscapeDataString($query.Trim())
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-spieler") {
        $playerId = $request.QueryString.Get("playerId")
        if ([string]::IsNullOrWhiteSpace($playerId) -or $playerId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid playerId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/profil/spieler/$playerId"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-transfers") {
        $clubId = $request.QueryString.Get("clubId")
        $season = $request.QueryString.Get("season")
        if (
          [string]::IsNullOrWhiteSpace($clubId) -or $clubId -notmatch '^\d+$' -or
          [string]::IsNullOrWhiteSpace($season) -or $season -notmatch '^\d{4}$'
        ) {
          Write-JsonError $response 400 "Missing or invalid clubId/season query parameters."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/transfers/verein/$clubId/saison_id/$season"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-club") {
        $clubId = $request.QueryString.Get("clubId")
        if ([string]::IsNullOrWhiteSpace($clubId) -or $clubId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid clubId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/startseite/verein/$clubId"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-matchday") {
        $compId = $request.QueryString.Get("compId")
        $season = $request.QueryString.Get("season")
        $matchday = $request.QueryString.Get("matchday")
        if (
          [string]::IsNullOrWhiteSpace($compId) -or $compId -notmatch '^[A-Za-z0-9]+$' -or
          [string]::IsNullOrWhiteSpace($season) -or $season -notmatch '^\d{4}$' -or
          [string]::IsNullOrWhiteSpace($matchday) -or $matchday -notmatch '^\d+$'
        ) {
          Write-JsonError $response 400 "Missing or invalid compId/season/matchday query parameters."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/spieltag/wettbewerb/$compId/saison_id/$season/spieltag/$matchday"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-spielbericht") {
        $matchId = $request.QueryString.Get("matchId")
        if ([string]::IsNullOrWhiteSpace($matchId) -or $matchId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid matchId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/spielbericht/index/spielbericht/$matchId"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-nationalspieler") {
        $clubId = $request.QueryString.Get("clubId")
        if ([string]::IsNullOrWhiteSpace($clubId) -or $clubId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid clubId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/nationalspieler/verein/$clubId"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-tabelle") {
        $compId = $request.QueryString.Get("compId")
        $season = $request.QueryString.Get("season")
        if (
          [string]::IsNullOrWhiteSpace($compId) -or $compId -notmatch '^[A-Za-z0-9]+$' -or
          [string]::IsNullOrWhiteSpace($season) -or $season -notmatch '^\d{4}$'
        ) {
          Write-JsonError $response 400 "Missing or invalid compId/season query parameters."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/tabelle/wettbewerb/$compId/saison_id/$season"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-torschuetzen") {
        $compId = $request.QueryString.Get("compId")
        $season = $request.QueryString.Get("season")
        if (
          [string]::IsNullOrWhiteSpace($compId) -or $compId -notmatch '^[A-Za-z0-9]+$' -or
          [string]::IsNullOrWhiteSpace($season) -or $season -notmatch '^\d{4}$'
        ) {
          Write-JsonError $response 400 "Missing or invalid compId/season query parameters."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/torschuetzenliste/wettbewerb/$compId/saison_id/$season"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/ss-lineups") {
        $eventId = $request.QueryString.Get("eventId")
        if ([string]::IsNullOrWhiteSpace($eventId) -or $eventId -notmatch '^\d{4,}$') {
          Write-JsonError $response 400 "Missing or invalid eventId query parameter."
          continue
        }

        $ssUrl = "https://www.sofascore.com/api/v1/event/$eventId/lineups"
        try {
          $json = Get-SofaScoreJson $ssUrl
          Write-JsonOk $response $json
        }
        catch {
          Write-JsonError $response 502 ("SofaScore lineup request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/ss-incidents") {
        $eventId = $request.QueryString.Get("eventId")
        if ([string]::IsNullOrWhiteSpace($eventId) -or $eventId -notmatch '^\d{4,}$') {
          Write-JsonError $response 400 "Missing or invalid eventId query parameter."
          continue
        }

        $ssUrl = "https://www.sofascore.com/api/v1/event/$eventId/incidents"
        try {
          $json = Get-SofaScoreJson $ssUrl
          Write-JsonOk $response $json
        }
        catch {
          Write-JsonError $response 502 ("SofaScore incidents request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/ss-week-enrich") {
        $rawIds = $request.QueryString.Get("eventIds")
        if ([string]::IsNullOrWhiteSpace($rawIds)) {
          Write-JsonError $response 400 "Missing eventIds query parameter (comma-separated SofaScore ids)."
          continue
        }
        $ids = @(
          $rawIds -split "," |
            ForEach-Object { ([string]$_).Trim() } |
            Where-Object { $_ -match '^\d{4,}$' } |
            Select-Object -Unique -First 20
        )
        if (-not $ids.Count) {
          Write-JsonError $response 400 "No valid SofaScore event ids in eventIds."
          continue
        }

        $includeLineups = $request.QueryString.Get("includeLineups")
        $wantLineups = -not ($includeLineups -eq "0" -or $includeLineups -eq "false")
        $parts = New-Object System.Collections.Generic.List[string]
        foreach ($eventId in $ids) {
          $entryJson = $null
          try {
            $lineups = "null"
            if ($wantLineups) {
              $lineups = Get-SofaScoreJson "https://www.sofascore.com/api/v1/event/$eventId/lineups"
              if ([string]::IsNullOrWhiteSpace($lineups)) { $lineups = "null" }
              Start-Sleep -Milliseconds 200
            }
            $incidents = Get-SofaScoreJson "https://www.sofascore.com/api/v1/event/$eventId/incidents"
            if ([string]::IsNullOrWhiteSpace($incidents)) { $incidents = "null" }
            $entryJson = "{`"eventId`":`"$eventId`",`"lineups`":$lineups,`"incidents`":$incidents}"
          }
          catch {
            $safe = ($_.Exception.Message -replace '\\', '\\' -replace '"', '\"' -replace "[\r\n]+", " ")
            $entryJson = "{`"eventId`":`"$eventId`",`"error`":`"$safe`"}"
          }
          $parts.Add($entryJson)
          Start-Sleep -Milliseconds 250
        }
        $json = "{`"results`":[" + ($parts -join ",") + "]}"
        Write-JsonOk $response $json
        continue
      }

      if ($path -eq "/api/ss-avg-positions") {
        $eventId = $request.QueryString.Get("eventId")
        if ([string]::IsNullOrWhiteSpace($eventId) -or $eventId -notmatch '^\d{4,}$') {
          Write-JsonError $response 400 "Missing or invalid eventId query parameter."
          continue
        }

        $ssUrl = "https://www.sofascore.com/api/v1/event/$eventId/average-positions"
        try {
          $json = Get-SofaScoreJson $ssUrl
          Write-JsonOk $response $json
        }
        catch {
          Write-JsonError $response 502 ("SofaScore average-positions request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/ss-search") {
        $query = $request.QueryString.Get("q")
        if ([string]::IsNullOrWhiteSpace($query) -or $query.Length -gt 80) {
          Write-JsonError $response 400 "Missing or invalid q query parameter."
          continue
        }

        $ssUrl = "https://www.sofascore.com/api/v1/search/events?q=" + [uri]::EscapeDataString($query.Trim())
        try {
          $json = Get-SofaScoreJson $ssUrl
          Write-JsonOk $response $json
        }
        catch {
          Write-JsonError $response 502 ("SofaScore search request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/ss-round") {
        $tournamentId = $request.QueryString.Get("tournamentId")
        $seasonYear = $request.QueryString.Get("seasonYear")
        $round = $request.QueryString.Get("round")
        if (
          [string]::IsNullOrWhiteSpace($tournamentId) -or $tournamentId -notmatch '^\d+$' -or
          [string]::IsNullOrWhiteSpace($seasonYear) -or $seasonYear -notmatch '^\d{4}$' -or
          [string]::IsNullOrWhiteSpace($round) -or $round -notmatch '^\d+$'
        ) {
          Write-JsonError $response 400 "Missing or invalid tournamentId/seasonYear/round query parameters."
          continue
        }

        try {
          if (-not $script:ssSeasonCache) { $script:ssSeasonCache = @{} }
          $cacheKey = [string]$tournamentId
          $seasonsJson = $script:ssSeasonCache[$cacheKey]
          if ([string]::IsNullOrWhiteSpace($seasonsJson)) {
            $seasonsJson = Get-SofaScoreJson "https://www.sofascore.com/api/v1/unique-tournament/$tournamentId/seasons"
            $script:ssSeasonCache[$cacheKey] = $seasonsJson
          }
          $yearNum = [int]$seasonYear
          $wantYear = "{0:d2}/{1:d2}" -f ($yearNum % 100), (($yearNum + 1) % 100)
          $seasonObj = $seasonsJson | ConvertFrom-Json
          $seasonHit = @($seasonObj.seasons) | Where-Object { [string]$_.year -eq $wantYear } | Select-Object -First 1
          if (-not $seasonHit) {
            $seasonHit = @($seasonObj.seasons) | Where-Object { [string]$_.name -match [regex]::Escape($wantYear) } | Select-Object -First 1
          }
          if (-not $seasonHit -or -not $seasonHit.id) {
            throw "No SofaScore season $wantYear for tournament $tournamentId"
          }
          $seasonId = [string]$seasonHit.id
          $json = Get-SofaScoreJson "https://www.sofascore.com/api/v1/unique-tournament/$tournamentId/season/$seasonId/events/round/$round"
          Write-JsonOk $response $json
        }
        catch {
          Write-JsonError $response 502 ("SofaScore round request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/fbref-match") {
        $matchId = $request.QueryString.Get("matchId")
        $rawUrl = $request.QueryString.Get("url")
        $fbUrl = ConvertTo-SafeFbrefUrl $rawUrl $matchId
        if ([string]::IsNullOrWhiteSpace($fbUrl) -or $fbUrl -notmatch '/en/matches/') {
          Write-JsonError $response 400 "Missing or invalid FBref match id / URL."
          continue
        }
        try {
          $html = Get-FbrefHtml $fbUrl
          Write-HtmlOk $response $html
        }
        catch {
          Write-JsonError $response 502 ("FBref match request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/fbref-schedule") {
        $rawUrl = $request.QueryString.Get("url")
        $fbUrl = ConvertTo-SafeFbrefUrl $rawUrl ""
        if ([string]::IsNullOrWhiteSpace($fbUrl) -or $fbUrl -notmatch '/en/comps/') {
          Write-JsonError $response 400 "Missing or invalid FBref schedule URL."
          continue
        }
        try {
          $html = Get-FbrefHtml $fbUrl
          Write-HtmlOk $response $html
        }
        catch {
          Write-JsonError $response 502 ("FBref schedule request failed: " + $_.Exception.Message)
        }
        continue
      }

      if ($path -eq "/api/tm-mitarbeiter") {
        $clubId = $request.QueryString.Get("clubId")
        if ([string]::IsNullOrWhiteSpace($clubId) -or $clubId -notmatch '^\d+$') {
          Write-JsonError $response 400 "Missing or invalid clubId query parameter."
          continue
        }

        $tmUrl = "https://www.transfermarkt.com/-/mitarbeiter/verein/$clubId"
        try {
          $html = Get-TransfermarktHtml $tmUrl
          $response.StatusCode = 200
          $response.ContentType = "text/html; charset=utf-8"
          $htmlBytes = [Text.Encoding]::UTF8.GetBytes($html)
          $response.ContentLength64 = $htmlBytes.Length
          $response.OutputStream.Write($htmlBytes, 0, $htmlBytes.Length)
        }
        catch {
          Write-JsonError $response 502 ("Transfermarkt request failed: " + $_.Exception.Message)
        }
        continue
      }

      $relative = $path.TrimStart("/").Replace("/", [IO.Path]::DirectorySeparatorChar)
      $file = Join-Path $root $relative
      $file = [IO.Path]::GetFullPath($file)

      if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
        $response.StatusCode = 403
        $bytes = [Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
        $response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }

      $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) {
        $response.ContentType = $mime[$ext]
      }

      $response.StatusCode = 200
      $content = [IO.File]::ReadAllBytes($file)
      $response.ContentLength64 = $content.Length
      $response.OutputStream.Write($content, 0, $content.Length)
    }
    catch {
      $response.StatusCode = 500
      $msg = [Text.Encoding]::UTF8.GetBytes("500 Internal Server Error")
      $response.OutputStream.Write($msg, 0, $msg.Length)
    }
    finally {
      $response.Close()
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
