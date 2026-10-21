param([string]$TextFile, [string]$Voice, [int]$RatePct, [string]$Out)
# Synthesize speech with the WinRT (OneCore) engine and save it as a WAV.
# This is what makes Microsoft Huihui / Yaoyao / Kangkang really sound different:
# the SAPI engine that WebView2 uses only has Huihui for Chinese.
# ASCII-only file on purpose.
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

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8).Trim()
if (-not $text) { throw 'empty text' }
if ($RatePct -eq 0) { $RatePct = 5 }

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
if ($Voice) {
  foreach ($v in [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices) {
    if ($v.DisplayName -eq $Voice) { $synth.Voice = $v; break }
  }
}

$esc = [System.Security.SecurityElement]::Escape($text)
$ssml = '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">' +
        '<prosody rate="' + $RatePct + '%">' + $esc + '</prosody></speak>'

$stream = Await ($synth.SynthesizeSsmlToStreamAsync($ssml)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
$in = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($stream)
# NOTE: $Out is a typed [string] parameter and PowerShell variable names are
# case-insensitive, so the file stream must NOT be called $out.
$fs = [System.IO.File]::Create($Out)
$buf = New-Object byte[] 81920
while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) { $fs.Write($buf, 0, $n) }
$fs.Close(); $in.Close(); $stream.Dispose(); $synth.Dispose()

Write-Output ('ok ' + (Get-Item $Out).Length)
