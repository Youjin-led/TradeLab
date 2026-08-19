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
echo Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID via environment variables before deploying.
echo Example:
echo   set TELEGRAM_BOT_TOKEN=123456:ABC...DEF
echo   set TELEGRAM_CHAT_ID=6868031409
if not defined TELEGRAM_BOT_TOKEN (echo ERROR: TELEGRAM_BOT_TOKEN is not set & pause & exit /b 1)
if not defined TELEGRAM_CHAT_ID (echo ERROR: TELEGRAM_CHAT_ID is not set & pause & exit /b 1)
flyctl secrets set TELEGRAM_BOT_TOKEN=%TELEGRAM_BOT_TOKEN% TELEGRAM_CHAT_ID=%TELEGRAM_CHAT_ID%
if errorlevel 1 (echo SECRETS FAILED & pause & exit /b 1)

echo === Step 4: Deploy ===
flyctl deploy
if errorlevel 1 (echo DEPLOY FAILED & pause & exit /b 1)

echo === DONE! Bot is running! ===
echo Open Telegram and write /status to @tradelab_monitor_bot
pause
