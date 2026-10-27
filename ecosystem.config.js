const path = require('path');

module.exports = {
  apps: [
    {
      name: 'jphrc-ims-api',
      script: './server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '500M',
      error_file: path.resolve(__dirname, 'logs/pm2-error.log'),
      out_file: path.resolve(__dirname, 'logs/pm2-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
