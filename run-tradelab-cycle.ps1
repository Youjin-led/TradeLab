$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $Root 'TRADELAB_SCHEDULE_LOG.md'
$OutPath = Join-Path $Root 'tradelab-scheduled-cycle.out.log'
$ErrPath = Join-Path $Root 'tradelab-scheduled-cycle.err.log'
$StartedAt = (Get-Date).ToString('s')

Add-Content -LiteralPath $LogPath -Value "### $StartedAt"
Add-Content -LiteralPath $LogPath -Value ''
Add-Content -LiteralPath $LogPath -Value '- Started scheduled TradeLab cycle.'

Push-Location $Root
try {
  $output = & npm.cmd run tradelab:cycle 2>&1
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath $OutPath -Encoding UTF8

  if ($exitCode -eq 0) {
    Add-Content -LiteralPath $LogPath -Value '- Status: PASS'
  } else {
    Add-Content -LiteralPath $LogPath -Value "- Status: FAIL ($exitCode)"
    $output | Set-Content -LiteralPath $ErrPath -Encoding UTF8
  }

  Add-Content -LiteralPath $LogPath -Value "- Finished: $((Get-Date).ToString('s'))"
  Add-Content -LiteralPath $LogPath -Value ''
  exit $exitCode
} catch {
  $_ | Out-String | Set-Content -LiteralPath $ErrPath -Encoding UTF8
  Add-Content -LiteralPath $LogPath -Value "- Status: ERROR"
  Add-Content -LiteralPath $LogPath -Value "- Error: $($_.Exception.Message)"
  Add-Content -LiteralPath $LogPath -Value "- Finished: $((Get-Date).ToString('s'))"
  Add-Content -LiteralPath $LogPath -Value ''
  exit 1
} finally {
  Pop-Location
}
