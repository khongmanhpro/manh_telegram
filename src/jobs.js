const config = require('./config');
const orderService = require('./services/orderService');
const topupService = require('./services/topupService');
const stateService = require('./services/stateService');
const settingsService = require('./services/settingsService');
const { safeSend, notifyAdmins, clearQrMessage } = require('./services/notifier');
const { backupAndSend } = require('./services/backupService');
const { buildDailyReport } = require('./services/reportService');
const messages = require('./utils/messages');
const logger = require('./utils/logger');

async function expirePending(bot) {
    for (const res of orderService.expireOld(config.ORDER_EXPIRE_MINUTES)) {
        const order = res.order;
        await clearQrMessage(bot, order.qr_chat_id, order.qr_message_id, { remove: true });
        await safeSend(bot, order.user_id, messages.orderExpired(order, res.refunded));
    }
    for (const topup of topupService.expireOld(config.ORDER_EXPIRE_MINUTES)) {
        await clearQrMessage(bot, topup.qr_chat_id, topup.qr_message_id, { remove: true });
    }
    stateService.purgeExpired();
}

/**
 * Run `task` once per day at HH:MM (shop timezone). Last run date is persisted
 * so a restart within the same minute doesn't run it twice.
 */
async function runDaily(key, time, task) {
    if (!time) return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    if (hhmm < time || settingsService.get(`job_${key}`) === today) return;
    settingsService.set(`job_${key}`, today);
    await task();
}

function startJobs(bot) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await expirePending(bot);
            await runDaily('daily_report', config.DAILY_REPORT_TIME, () => notifyAdmins(bot, buildDailyReport()));
            await runDaily('backup', config.BACKUP_TIME, () => backupAndSend(bot));
        } catch (err) {
            logger.error('Job tick failed:', err);
        } finally {
            running = false;
        }
    };
    setInterval(tick, 60 * 1000);
    setTimeout(tick, 10 * 1000);
    logger.info(`Jobs started (order expiry ${config.ORDER_EXPIRE_MINUTES}m, report ${config.DAILY_REPORT_TIME || 'off'}, backup ${config.BACKUP_TIME || 'off'})`);
}

module.exports = { startJobs, expirePending, runDaily };
