@echo off
cd /d "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab"
pm2 resurrect 2>nul || pm2 start ecosystem.config.js
