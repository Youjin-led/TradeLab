@echo off
REM TradeLab paper trading - виртуальная торговля (без реальных денег)
REM Запускает непрерывный цикл paper-торговли в отдельном окне.
cd /d "%~dp0"
node tools/tradelab_live_loop.js paper
pause
