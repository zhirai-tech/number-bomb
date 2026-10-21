# Probe whether the built-in Windows OCR engine is available, and which languages it supports.
# ASCII-only on purpose (PowerShell reads BOM-less UTF-8 as ANSI).
try {
  [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
  $langs = [Windows.Media.Ocr.OcrEngine]::AvailableRecognizerLanguages
  Write-Output ("count=" + $langs.Count)
  foreach ($l in $langs) { Write-Output ("lang=" + $l.LanguageTag) }
} catch {
  Write-Output ("ERR: " + $_.Exception.Message)
}
