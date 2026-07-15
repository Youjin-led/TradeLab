# TradeLab — ежедневный запуск incubate_once
# Запускается планировщиком Windows каждый день в 10:00 и 18:00

$LogFile = "$PSScriptRoot\incubate_once.log"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

try {
    $result = node "$PSScriptRoot\tools\tradelab_incubate_once.js" 2>&1
    $summary = $result | ConvertFrom-Json | Select-Object -ExpandProperty summary
    "$Timestamp | OK | incubating: $($summary.incubating) | quarantined: $($summary.quarantined) | phase: $($summary.marketPhase)" | Out-File -FilePath $LogFile -Append
} catch {
    "$Timestamp | ERROR | $_" | Out-File -FilePath $LogFile -Append
}
