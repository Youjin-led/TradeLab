@echo off
set PATH=%PATH%;C:\Users\Ардор\.fly\bin

echo === Step 1: Login to Fly.io ===
flyctl auth login
if errorlevel 1 (echo LOGIN FAILED & pause & exit /b 1)

echo === Step 2: Launch app ===
cd /d "C:\Users\Ардор\OneDrive\Рабочий стол\Проекты\TradeLab"
flyctl launch --no-deploy
if errorlevel 1 (echo LAUNCH FAILED & pause & exit /b 1)

echo === Step 3: Set secrets ===
flyctl secrets set TELEGRAM_BOT_TOKEN=8361892404:AAFQfQ-sCLQwAvhEKKwQZN8Y3FZ6zNJiWN4 TELEGRAM_CHAT_ID=6868031409
if errorlevel 1 (echo SECRETS FAILED & pause & exit /b 1)

echo === Step 4: Deploy ===
flyctl deploy
if errorlevel 1 (echo DEPLOY FAILED & pause & exit /b 1)

echo === DONE! Bot is running! ===
echo Open Telegram and write /status to @tradelab_monitor_bot
pause
