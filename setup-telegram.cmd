@echo off
setlocal
REM ============================================================
REM TradeLab — настройка Telegram-отчётов для paper-торговли
REM Копирует TELEGRAM_BOT_TOKEN и TELEGRAM_CHAT_ID из резервного
REM .env в локальный .env этого репозитория. Секреты НЕ выводятся
REM на экран. Затем перезапускает paper-луп в фоне.
REM ============================================================

set "SRC=C:\Users\Ардор\OneDrive\Рабочий стол\MiMoCode\projects\TradeLab-backup-secrets\.env"
set "DST=%~dp0.env"
set "LOG=%~dp0logs\paper-loop.log"

if not exist "%SRC%" (
  echo [ОШИБКА] Резервный .env не найден: %SRC%
  pause
  exit /b 1
)

set "BOT="
set "CHAT="
for /f "usebackq tokens=1,* delims==" %%A in ("%SRC%") do (
  if /i "%%A"=="TELEGRAM_BOT_TOKEN" set "BOT=%%B"
  if /i "%%A"=="TELEGRAM_CHAT_ID" set "CHAT=%%B"
)

if "%BOT%"=="" (
  echo [ОШИБКА] В резервном .env нет TELEGRAM_BOT_TOKEN
  pause
  exit /b 1
)
if "%CHAT%"=="" (
  echo [ОШИБКА] В резервном .env нет TELEGRAM_CHAT_ID
  pause
  exit /b 1
)

(
  echo TELEGRAM_BOT_TOKEN=%BOT%
  echo TELEGRAM_CHAT_ID=%CHAT%
  echo LIVE_LOOP_MODE=paper
) > "%DST%"

echo [OK] .env создан, Telegram-ключи скопированы.

REM Останавливаем старый луп (если запущен)
taskkill /F /FI "WINDOWTITLE eq TradeLabPaper*" /IM node.exe >nul 2>&1

REM Запускаем луп в фоне (без окна)
if not exist "%~dp0logs" mkdir "%~dp0logs"
start "TradeLabPaper" /MIN cmd /c "%~dp0run-paper-hidden.cmd"

echo [OK] Paper-луп перезапущен в фоне. Отчёты придут в Telegram.
pause
