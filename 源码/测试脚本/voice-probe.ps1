# List SAPI voices and synthesize the same sentence with each, then hash the WAVs.
# If the hashes differ, the voices really are different engines.  ASCII-only on purpose.
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
Write-Output "installed voices:"
foreach ($v in $synth.GetInstalledVoices()) {
  if ($v.Enabled) { Write-Output ("  " + $v.VoiceInfo.Name + " | " + $v.VoiceInfo.Gender + " | " + $v.VoiceInfo.Culture) }
}

$dir = Join-Path $env:TEMP 'voice-probe'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$text = 'Hello, this is a voice test, one two three four five.'
foreach ($v in $synth.GetInstalledVoices()) {
  if (-not $v.Enabled) { continue }
  $name = $v.VoiceInfo.Name
  $file = Join-Path $dir (($name -replace '[^A-Za-z0-9]', '_') + '.wav')
  $s2 = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try { $s2.SelectVoice($name) } catch { Write-Output ("  select failed: " + $name); continue }
  $s2.SetOutputToWaveFile($file)
  $s2.Speak($text)
  $s2.Dispose()
  $fi = Get-Item $file
  $h = (Get-FileHash $file -Algorithm SHA1).Hash.Substring(0, 12)
  Write-Output ("wav " + $name + " size=" + $fi.Length + " sha1=" + $h)
}
