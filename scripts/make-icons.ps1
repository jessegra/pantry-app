param([string]$OutDir)
Add-Type -AssemblyName System.Drawing

# Placeholder app icon: brand-blue tile with the "inventory" shelves glyph in white.
function New-Icon([int]$size, [string]$path, [bool]$maskable) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(0x1D, 0x5B, 0xD6))
  # Maskable icons keep the glyph inside the central 80% safe zone.
  $scale = if ($maskable) { $size * 0.6 / 24 } else { $size * 0.8 / 24 }
  $off = ($size - 24 * $scale) / 2
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (1.7 * $scale)
  $pen.StartCap = 'Round'; $pen.EndCap = 'Round'; $pen.LineJoin = 'Round'
  function P([double]$v) { return [single]($off + $v * $scale) }
  $g.DrawRectangle($pen, (P 4), (P 5), [single](16 * $scale), [single](5 * $scale))
  $g.DrawRectangle($pen, (P 4), (P 14), [single](16 * $scale), [single](5 * $scale))
  $g.DrawLine($pen, (P 8), (P 7.5), (P 11), (P 7.5))
  $g.DrawLine($pen, (P 8), (P 16.5), (P 11), (P 16.5))
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Item -ItemType Directory -Force (Join-Path $OutDir 'icons') | Out-Null
New-Icon 192 (Join-Path $OutDir 'icons\icon-192.png') $false
New-Icon 512 (Join-Path $OutDir 'icons\icon-512.png') $false
New-Icon 512 (Join-Path $OutDir 'icons\icon-maskable-512.png') $true
New-Icon 180 (Join-Path $OutDir 'apple-touch-icon.png') $true
