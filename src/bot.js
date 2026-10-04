const config = require('./config');
const logger = require('./utils/logger');
const settingsService = require('./services/settingsService');

// DB overrides (/setbank, /setshop) first, then validate the effective config
settingsService.applyToConfig();
const { errors, warnings } = config.validate();
warnings.forEach((w) => logger.warn(w));
if (errors.length) {
    errors.forEach((e) => logger.error(`❌ ${e}`));
    logger.error('💡 Kiểm tra lại file .env (xem .env.example)');
    process.exit(1);
}

const db = require('./database');
const { createBot } = require('./app');
const { startAutoSync } = require('./services/sheetSync');
const { startJobs } = require('./jobs');
const { startServer } = require('./server');

const bot = createBot();
let server = null;

function onStarted() {
    logger.info(`🤖 ${config.SHOP_NAME} Bot đã khởi động (@${bot.botInfo?.username || '?'})`);
    logger.info(`👤 Admins: ${config.ADMIN_IDS.join(', ')} · 🏦 ${config.BANK.NAME} ${config.BANK.ACCOUNT}`);
    logger.info(`💳 Thanh toán: ${config.SEPAY_API_KEY ? 'tự động (SePay)' : 'admin xác nhận thủ công'}`);
    startAutoSync();
    startJobs(bot);
}

async function main() {
    await bot.telegram
        .setMyCommands([
            { command: 'start', description: '🔄 Bắt đầu / Khởi động lại' },
            { command: 'product', description: '📦 Danh sách sản phẩm' },
            { command: 'donhang', description: '🧾 Đơn hàng của tôi' },
            { command: 'nap', description: '💰 Nạp số dư' },
            { command: 'menu', description: '👤 Thông tin tài khoản' },
            { command: 'support', description: '🆘 Hỗ trợ' },
            { command: 'myid', description: '🆔 Lấy ID của bạn' },
        ])
        .catch((err) => logger.warn('setMyCommands failed:', err.message));

    if (config.TELEGRAM_WEBHOOK_DOMAIN) {
        bot.botInfo = await bot.telegram.getMe();
        const telegramMiddleware = await bot.createWebhook({
            domain: config.TELEGRAM_WEBHOOK_DOMAIN,
            path: '/telegram/webhook',
            ...(config.TELEGRAM_WEBHOOK_SECRET ? { secret_token: config.TELEGRAM_WEBHOOK_SECRET } : {}),
        });
        server = startServer(bot, { telegramMiddleware });
        logger.info(`Telegram webhook: https://${config.TELEGRAM_WEBHOOK_DOMAIN}/telegram/webhook`);
        onStarted();
        return;
    }

    if (config.SEPAY_API_KEY || (config.ADMIN_EMAIL && config.ADMIN_PASSWORD && config.WEB_SESSION_SECRET)) server = startServer(bot);
    // launch() resolves only when the bot stops → start background work in the onLaunch callback
    await bot.launch({}, onStarted);
}

main().catch((err) => {
    logger.error('❌ Không thể khởi động bot:', err.message);
    logger.error('💡 Kiểm tra lại BOT_TOKEN trong file .env');
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err?.message || err);
});
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    if (err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') return; // transient network error
    process.exit(1); // let PM2/Docker restart
});

function shutdown(signal) {
    logger.info(`${signal} received, shutting down...`);
    try {
        if (!config.TELEGRAM_WEBHOOK_DOMAIN) bot.stop(signal);
    } catch {
        /* not running */
    }
    if (server) server.close();
    db.close();
    process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
