param(
  [string]$Exe,
  [string]$Out,
  [string]$Actions,          # "click:0.72,0.47" (window-relative) | "dragabs:100,900,900,1000" (screen) | "wait:800"
  [int]$WaitMs = 1500
)
# Drive the packaged exe with real mouse input and capture its window at the end.
# ASCII-only file on purpose: PowerShell reads BOM-less UTF-8 as ANSI.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class M4 {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
}
"@

$p = Start-Process -FilePath $Exe -PassThru
$h = [IntPtr]::Zero
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 250
  $p.Refresh()
  if ($p.MainWindowHandle -ne [IntPtr]::Zero) { $h = $p.MainWindowHandle; break }
}
if ($h -eq [IntPtr]::Zero) { Write-Output "ERROR: window not found"; $p.Kill(); exit 1 }
[void][M4]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 1300

$rect = New-Object M4+RECT
[void][M4]::GetWindowRect($h, [ref]$rect)
$L = $rect.L; $T = $rect.T; $W = $rect.R - $rect.L; $Hh = $rect.B - $rect.T
Write-Output ("window " + $W + "x" + $Hh + " at " + $L + "," + $T)

function ClickAt([int]$x, [int]$y) {
  [void][M4]::SetCursorPos($x, $y)
  Start-Sleep -Milliseconds 180
  [M4]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 60
  [M4]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
  Start-Sleep -Milliseconds 450
}

# neutral click to make sure the window is active (lands on the title area, hits no control)
ClickAt ([int]($L + 0.5 * $W)) ([int]($T + 0.02 * $Hh))

foreach ($act in ($Actions -split ';')) {
  $a = $act.Trim()
  if ($a -eq '') { continue }
  $kind, $rest = $a.Split(':', 2)
  $nums = $null
  if ($kind -ne 'key' -and $kind -ne 'hash') { $nums = @($rest.Split(',') | ForEach-Object { [double]$_ }) }

  if ($kind -eq 'click') {
    $x = [int]($L + $nums[0] * $W); $y = [int]($T + $nums[1] * $Hh)
    ClickAt $x $y
    Write-Output ("click " + $x + "," + $y)

  } elseif ($kind -eq 'dragabs') {
    $x1 = [int]$nums[0]; $y1 = [int]$nums[1]; $x2 = [int]$nums[2]; $y2 = [int]$nums[3]
    [void][M4]::SetCursorPos($x1, $y1)
    Start-Sleep -Milliseconds 250
    [M4]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 150
    for ($k = 1; $k -le 14; $k++) {
      [void][M4]::SetCursorPos([int]($x1 + ($x2 - $x1) * $k / 14), [int]($y1 + ($y2 - $y1) * $k / 14))
      Start-Sleep -Milliseconds 30
    }
    Start-Sleep -Milliseconds 180
    [M4]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 450
    Write-Output ("dragabs " + $x1 + "," + $y1 + " -> " + $x2 + "," + $y2)

  } elseif ($kind -eq 'hash') {
    for ($tries = 0; $tries -lt 30; $tries++) {
      if (Test-Path $rest) { break }
      Start-Sleep -Milliseconds 200
    }
    if (Test-Path $rest) {
      $fi = Get-Item $rest
      $hv = (Get-FileHash $rest -Algorithm SHA1).Hash.Substring(0, 12)
      Write-Output ("hash " + $rest + " size=" + $fi.Length + " sha1=" + $hv)
    } else {
      Write-Output ("hash " + $rest + " MISSING")
    }

  } elseif ($kind -eq 'key') {
    [System.Windows.Forms.SendKeys]::SendWait($rest)
    Start-Sleep -Milliseconds 500
    Write-Output ("key " + $rest)

  } elseif ($kind -eq 'clickabs') {
    $x = [int]$nums[0]; $y = [int]$nums[1]
    ClickAt $x $y
    Write-Output ("clickabs " + $x + "," + $y)

  } elseif ($kind -eq 'wait') {
    Start-Sleep -Milliseconds ([int]$nums[0])
    Write-Output ("wait " + $nums[0])
  }
}

Start-Sleep -Milliseconds $WaitMs
[void][M4]::GetWindowRect($h, [ref]$rect)
$L = $rect.L; $T = $rect.T; $W = $rect.R - $rect.L; $Hh = $rect.B - $rect.T
$bmp = New-Object System.Drawing.Bitmap $W, $Hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point $L, $T), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size $W, $Hh))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved: " + $Out + "  window=" + $W + "x" + $Hh + " at " + $L + "," + $T)

Start-Sleep -Milliseconds 300
$p.CloseMainWindow() | Out-Null
Start-Sleep -Milliseconds 700
if (-not $p.HasExited) { $p.Kill() }
Write-Output "exe closed"
