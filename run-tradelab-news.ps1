$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogPath = Join-Path $Root 'TRADELAB_NEWS_SCHEDULE_LOG.md'
$OutPath = Join-Path $Root 'tradelab-scheduled-news.out.log'
$ErrPath = Join-Path $Root 'tradelab-scheduled-news.err.log'
$StartedAt = (Get-Date).ToString('s')
$Symbols = 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT,INJUSDT,APTUSDT,JUPUSDT,SEIUSDT,OPUSDT,NEARUSDT,FILUSDT,RENDERUSDT,AVAXUSDT,LINKUSDT'

Add-Content -LiteralPath $LogPath -Value "### $StartedAt"
Add-Content -LiteralPath $LogPath -Value ''
Add-Content -LiteralPath $LogPath -Value '- Started scheduled TradeLab news-impact analysis.'

Push-Location $Root
try {
  $output = & npm.cmd run tradelab:news -- $Symbols 2>&1
  $exitCode = $LASTEXITCODE
  $output | Set-Content -LiteralPath $OutPath -Encoding UTF8

  if ($exitCode -eq 0) {
    $dependencyOutput = & npm.cmd run tradelab:dependencies 2>&1
    $dependencyExitCode = $LASTEXITCODE
    Add-Content -LiteralPath $OutPath -Value ''
    Add-Content -LiteralPath $OutPath -Value $dependencyOutput
    if ($dependencyExitCode -ne 0) {
      Add-Content -LiteralPath $LogPath -Value "- Status: DEPENDENCY_FAIL ($dependencyExitCode)"
      $dependencyOutput | Set-Content -LiteralPath $ErrPath -Encoding UTF8
      exit $dependencyExitCode
    }
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
  Add-Content -LiteralPath $LogPath -Value '- Status: ERROR'
  Add-Content -LiteralPath $LogPath -Value "- Error: $($_.Exception.Message)"
  Add-Content -LiteralPath $LogPath -Value "- Finished: $((Get-Date).ToString('s'))"
  Add-Content -LiteralPath $LogPath -Value ''
  exit 1
} finally {
  Pop-Location
}
