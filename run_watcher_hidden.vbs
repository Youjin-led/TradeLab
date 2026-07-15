' TradeLab Watcher — скрытый запуск без окна
' Этот скрипт запускается при старте Windows и держит watcher живым

Dim shell, watcherDir, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

watcherDir = "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab"

' Ждём интернет (проверяем каждые 10 секунд)
Do
    Dim netReady
    netReady = shell.Run("ping -n 1 8.8.8.8", 0, True)
    If netReady = 0 Then Exit Do
    WScript.Sleep 10000
Loop

' Бесконечный цикл: запускаем watcher, если падает — перезапускаем
Do
    Dim logFile
    logFile = watcherDir & "\tradelab_monitor.log"
    
    Dim timestamp
    timestamp = Now()
    
    ' Пишем в лог
    Dim logStream
    Set logStream = fso.OpenTextFile(logFile, 8, True)
    logStream.WriteLine "[" & timestamp & "] Watcher старт..."
    logStream.Close
    
    ' Запускаем watcher (скрыто, без окна)
    shell.Run "cmd /c cd /d """ & watcherDir & """ && node tools/tradelab_watch.js", 0, True
    
    ' Если дошли сюда — watcher упал
    timestamp = Now()
    Set logStream = fso.OpenTextFile(logFile, 8, True)
    logStream.WriteLine "[" & timestamp & "] Watcher упал, перезапуск через 30с..."
    logStream.Close
    
    WScript.Sleep 30000
Loop
