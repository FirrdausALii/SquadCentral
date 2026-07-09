# Lists team crest PNGs under images/ that are smaller than 64px on either axis.
# Re-export those assets at 128x128 or higher for sharper display at 32px.
param([int]$MinSize = 64)

$root = Split-Path -Parent $PSScriptRoot
$images = Join-Path $root "images"
if (-not (Test-Path $images)) {
  Write-Error "images folder not found: $images"
  exit 1
}

Add-Type -AssemblyName System.Drawing
$small = @()

Get-ChildItem $images -Recurse -Filter "*.png" | ForEach-Object {
  try {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $w = $img.Width
    $h = $img.Height
    $img.Dispose()
    if ($w -lt $MinSize -or $h -lt $MinSize) {
      $small += [PSCustomObject]@{
        Path = $_.FullName.Substring($root.Length + 1)
        Width = $w
        Height = $h
      }
    }
  } catch {
    Write-Warning "Could not read $($_.FullName): $_"
  }
}

Write-Host "Crests under ${MinSize}px: $($small.Count)"
$small | Sort-Object Width, Height | Format-Table -AutoSize
