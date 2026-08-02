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
