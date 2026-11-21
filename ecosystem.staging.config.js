const path = require('path');

module.exports = {
  apps: [
    {
      name: 'jphrc-ims-staging-api',
      script: './server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        PORT: 5002,
        HOST: '127.0.0.1',
        HRMS_CRON_ENABLED: 'false',
        HRMS_API_ENABLED: 'false',
        ESCALATIONS_ENABLED: 'false',
        STORAGE_KEY_PREFIX: 'staging/',
        EMAIL_REDIRECT_TO: 'hospitalsjaiprakash@gmail.com',
      },
      watch: false,
      max_memory_restart: '300M',
      error_file: path.resolve(__dirname, 'logs/staging-error.log'),
      out_file: path.resolve(__dirname, 'logs/staging-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
