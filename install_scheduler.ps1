# TradeLab — установка задачи в планировщик Windows
# Запускать: powershell -ExecutionPolicy Bypass -File install_scheduler.ps1

$TaskName = "TradeLab IncubateOnce"
$ScriptPath = "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab\run_incubate_once.ps1"

# Удаляем старую задачу если есть
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Создаём новую
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -File `"$ScriptPath`""

$Trigger1 = New-ScheduledTaskTrigger -Daily -At 10:00
$Trigger2 = New-ScheduledTaskTrigger -Daily -At 18:00

$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($Trigger1, $Trigger2) -Settings $Settings -Principal $Principal -Force

Write-Host "✅ Задача '$TaskName' установлена: ежедневно в 10:00 и 18:00"
