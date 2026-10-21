# Probe the WinRT (OneCore) speech synthesizer: list voices and hash a sample from each.
# ASCII-only on purpose.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStream, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]
function Await($op, $type) {
  $m = $asTaskGeneric.MakeGenericMethod($type)
  $t = $m.Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result
}

$voices = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
Write-Output ("OneCore voices: " + $voices.Count)
foreach ($v in $voices) { Write-Output ("  " + $v.DisplayName + " | " + $v.Language) }

$dir = Join-Path $env:TEMP 'voice-probe2'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$text = 'Hello, this is a voice test, one two three four five.'

foreach ($v in $voices) {
  $s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $s.Voice = $v
  $stream = Await ($s.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $safe = ($v.DisplayName -replace '[^A-Za-z0-9]', '_')
  $file = Join-Path $dir ($safe + '.wav')
  $in = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
  $out = [System.IO.File]::Create($file)
  $in.CopyTo($out)
  $out.Close(); $in.Close(); $stream.Dispose(); $s.Dispose()
  $h = (Get-FileHash $file -Algorithm SHA1).Hash.Substring(0, 12)
  $len = (Get-Item $file).Length
  Write-Output ("wav " + $v.DisplayName + " size=" + $len + " sha1=" + $h)
}
