@echo off
cd /d "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab"
node tools/tradelab_live_loop.js paper > tradelab-live-loop.log 2>&1
