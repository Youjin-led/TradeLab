@echo off
REM TradeLab paper-торговля (фоновый запуск, без окна)
REM Автоперезапуск: если луп упал, через 60 сек поднимется снова.
cd /d "%~dp0"
if not exist logs mkdir logs
:loop
node tools/tradelab_live_loop.js paper >> logs\paper-loop.log 2>&1
timeout /t 60 /nobreak >nul
goto loop
