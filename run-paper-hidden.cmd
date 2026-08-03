@echo off
REM TradeLab paper-торговля (фоновый запуск, без окна)
cd /d "%~dp0"
if not exist logs mkdir logs
node tools/tradelab_live_loop.js paper >> logs\paper-loop.log 2>&1
