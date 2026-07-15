#!/bin/bash
# TradeLab Watcher — бесконечный режим с автоперезапуском
# Запускает watcher с --forever, перезапускает при падении

WATCHER_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$WATCHER_DIR/tradelab-watch.log"

echo "============================================" | tee -a "$LOG_FILE"
echo "TradeLab Watcher Forever — $(date)" | tee -a "$LOG_FILE"
echo "============================================" | tee -a "$LOG_FILE"

cd "$WATCHER_DIR"

while true; do
  echo "[$(date)] Запуск watcher..." | tee -a "$LOG_FILE"
  
  node tools/tradelab_watch.js --forever --minutes=60 2>&1 | tee -a "$LOG_FILE"
  
  EXIT_CODE=$?
  echo "[$(date)] Watcher завершился с кодом $EXIT_CODE. Перезапуск через 5 секунд..." | tee -a "$LOG_FILE"
  sleep 5
done
