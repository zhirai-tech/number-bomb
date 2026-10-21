param([string]$Exe, [string]$Out)
# Launch the packaged exe and capture its own window.
# ASCII-only file on purpose: PowerShell reads BOM-less UTF-8 as ANSI, so paths come in as arguments.
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
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
[void][Win]::SetForegroundWindow($h)
Start-Sleep -Milliseconds 900
$r = New-Object Win+RECT
[void][Win]::GetWindowRect($h, [ref]$r)
$w = $r.R - $r.L; $hh = $r.B - $r.T
Write-Output ("window: " + $w + "x" + $hh + " at " + $r.L + "," + $r.T)
$bmp = New-Object System.Drawing.Bitmap $w, $hh
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.CopyFromScreen((New-Object System.Drawing.Point $r.L, $r.T), [System.Drawing.Point]::Empty, (New-Object System.Drawing.Size $w, $hh))
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output ("saved: " + $Out)
Start-Sleep -Milliseconds 300
$p.CloseMainWindow() | Out-Null
Start-Sleep -Milliseconds 700
if (-not $p.HasExited) { $p.Kill() }
Write-Output "exe closed"
