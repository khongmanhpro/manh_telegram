// PM2: pm2 start ecosystem.config.js && pm2 save
module.exports = {
    apps: [
        {
            name: 'telegram-shop-bot',
            script: 'src/bot.js',
            instances: 1, // SQLite + long polling: chỉ chạy 1 instance
            exec_mode: 'fork',
            autorestart: true,
            max_restarts: 20,
            restart_delay: 5000,
            max_memory_restart: '300M',
            time: true,
            env: { NODE_ENV: 'production' },
        },
    ],
};
