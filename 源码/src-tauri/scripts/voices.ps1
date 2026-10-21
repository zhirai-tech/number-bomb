# List the WinRT (OneCore) speech voices, Chinese ones first: "DisplayName|Language" per line.
# ASCII-only file on purpose.
$ErrorActionPreference = 'Stop'
[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
$all = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
$zh = @(); $other = @()
foreach ($v in $all) {
  $line = $v.DisplayName + '|' + $v.Language
  if ($v.Language -like 'zh*') { $zh += $line } else { $other += $line }
}
foreach ($l in $zh) { Write-Output $l }
foreach ($l in $other) { Write-Output $l }
