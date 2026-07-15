module.exports = {
  apps: [{
    name: 'tradelab-watcher',
    script: 'tools/tradelab_watch.js',
    args: '--runs=999999 --minutes=60',
    cwd: __dirname,
    // Restart if memory exceeds 500MB
    max_memory_restart: '500M',
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/tradelab-error.log',
    out_file: 'logs/tradelab-out.log',
    // Auto-restart on crash
    autorestart: true,
    // Wait between restarts
    restart_delay: 10000,
    // Keep alive
    exp_backoff_restart_delay: 100,
    // Environment
    env: {
      NODE_ENV: 'production'
    }
  }]
};
