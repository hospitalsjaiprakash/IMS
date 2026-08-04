module.exports = {
  apps: [
    {
      name: 'jphrc-ims-api',
      script: './server/index.js',
      cwd: '/var/www/jphrc-ims',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
      },
      watch: false,
      max_memory_restart: '500M',
      error_file: '/var/log/pm2/jphrc-ims-error.log',
      out_file: '/var/log/pm2/jphrc-ims-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      restart_delay: 4000,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],
};
