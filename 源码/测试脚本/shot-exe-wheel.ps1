param([string]$Exe, [string]$Out, [double]$Rx = 0.653, [double]$Ry = 0.391, [int]$Clicks = 2)
# Start the packaged exe, click a point (given as a ratio of the window box) and capture the window.
# ASCII-only file on purpose: PowerShell reads BOM-less UTF-8 as ANSI, so paths come in as arguments.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win2 {
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
[void][Win2]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 1200

$r = New-Object Win2+RECT
[void][Win2]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
$x = $r.L + [int][Math]::Round($Rx * $w)
$y = $r.T + [int][Math]::Round($Ry * $hh)
Write-Output ("window " + $w + "x" + $hh + " at " + $r.L + "," + $r.T + " -> click " + $x + "," + $y)

# First click a neutral spot (card title) to activate the window, then click the
# target $Clicks times. Toggle buttons need -Clicks 1. ASCII-only file on purpose.
[void][Win2]::SetCursorPos($r.L + [int][Math]::Round(0.50 * $w), $r.T + [int][Math]::Round(0.36 * $hh))
Start-Sleep -Milliseconds 200
[Win2]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[Win2]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 400

[void][Win2]::SetCursorPos($x, $y)
Start-Sleep -Milliseconds 300
for ($k = 0; $k -lt $Clicks; $k++) {
  [Win2]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)   # left down
  Start-Sleep -Milliseconds 60
  [Win2]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)   # left up
  Start-Sleep -Milliseconds 500
}
Start-Sleep -Milliseconds 1500

$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point $r.L, $r.T), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size $w, $hh))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved: " + $Out)

$p.CloseMainWindow() | Out-Null
Start-Sleep -Milliseconds 700
if (-not $p.HasExited) { $p.Kill() }
Write-Output "exe closed"
