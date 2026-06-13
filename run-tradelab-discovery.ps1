$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $Root 'TRADELAB_DISCOVERY_SCHEDULE_LOG.md'
$OutPath = Join-Path $Root 'tradelab-scheduled-discovery.out.log'
$ErrPath = Join-Path $Root 'tradelab-scheduled-discovery.err.log'
$StartedAt = (Get-Date).ToString('s')

Add-Content -LiteralPath $LogPath -Value "### $StartedAt"
Add-Content -LiteralPath $LogPath -Value ''
Add-Content -LiteralPath $LogPath -Value '- Started scheduled TradeLab discovery.'

Push-Location $Root
try {
  $output = & npm.cmd run tradelab:discover 2>&1
  $discoverExitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath $OutPath -Encoding UTF8

  if ($discoverExitCode -eq 0) {
    $cycleOutput = & npm.cmd run tradelab:cycle 2>&1
    $cycleExitCode = $LASTEXITCODE
    Add-Content -LiteralPath $OutPath -Value ''
    Add-Content -LiteralPath $OutPath -Value $cycleOutput

    if ($cycleExitCode -eq 0) {
      Add-Content -LiteralPath $LogPath -Value '- Status: PASS'
    } else {
      Add-Content -LiteralPath $LogPath -Value "- Status: CYCLE_FAIL ($cycleExitCode)"
      $cycleOutput | Set-Content -LiteralPath $ErrPath -Encoding UTF8
      exit $cycleExitCode
    }
  } else {
    Add-Content -LiteralPath $LogPath -Value "- Status: DISCOVERY_FAIL ($discoverExitCode)"
    $output | Set-Content -LiteralPath $ErrPath -Encoding UTF8
    exit $discoverExitCode
  }

  Add-Content -LiteralPath $LogPath -Value "- Finished: $((Get-Date).ToString('s'))"
  Add-Content -LiteralPath $LogPath -Value ''
  exit 0
} catch {
  $_ | Out-String | Set-Content -LiteralPath $ErrPath -Encoding UTF8
  Add-Content -LiteralPath $LogPath -Value '- Status: ERROR'
  Add-Content -LiteralPath $LogPath -Value "- Error: $($_.Exception.Message)"
  Add-Content -LiteralPath $LogPath -Value "- Finished: $((Get-Date).ToString('s'))"
  Add-Content -LiteralPath $LogPath -Value ''
  exit 1
} finally {
  Pop-Location
}
