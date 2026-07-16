@echo off
echo === Step 1: Login to Cloudflare ===
wrangler login
if errorlevel 1 (echo LOGIN FAILED & pause & exit /b 1)

echo === Step 2: Deploy ===
cd /d "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab"
wrangler deploy
if errorlevel 1 (echo DEPLOY FAILED & pause & exit /b 1)

echo === Step 3: Get your worker URL ===
echo Your worker is deployed! Check wrangler output for the URL.
echo Then setup webhook:
echo wrangler secret put TELEGRAM_BOT_TOKEN
echo wrangler secret put TELEGRAM_CHAT_ID
pause
