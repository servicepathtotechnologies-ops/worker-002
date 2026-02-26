module.exports = {
  apps: [
    {
      name: "ctrlchecks-worker",

      script: "bash",

      args: '-c "npm run build && node dist/index.js"',

      exec_mode: "fork",
      instances: 1,

      env: {
        NODE_ENV: "production",
      },

      max_memory_restart: "1500M",

      autorestart: true,
      watch: false,

      restart_delay: 5000,

      log_date_format: "YYYY-MM-DD HH:mm:ss",

      error_file: "./logs/error.log",
      out_file: "./logs/output.log",
    },
  ],
};
