const config = require('../config');
const userService = require('./userService');
const logger = require('../utils/logger');

function isBlockedError(err) {
    const code = err?.response?.error_code ?? err?.code;
    return code === 403;
}

/**
 * Send an HTML message without throwing. Marks users who blocked the bot.
 * Returns the sent message or null.
 */
async function safeSend(bot, chatId, text, extra = {}) {
    try {
        return await bot.telegram.sendMessage(chatId, text, {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...extra,
        });
    } catch (err) {
        if (isBlockedError(err)) userService.setBlocked(chatId, true);
        logger.warn(`sendMessage to ${chatId} failed:`, err.message);
        return null;
    }
}

async function notifyAdmins(bot, text, extra = {}) {
    const results = [];
    for (const adminId of config.ADMIN_IDS) {
        results.push(await safeSend(bot, adminId, text, extra));
    }
    return results;
}

const lastAlerts = new Map();

/**
 * Notify admins at most once per `intervalMs` for the same `key` (config problems etc.)
 */
async function notifyAdminsThrottled(bot, key, text, intervalMs = 30 * 60 * 1000) {
    const last = lastAlerts.get(key) || 0;
    if (Date.now() - last < intervalMs) return;
    lastAlerts.set(key, Date.now());
    await notifyAdmins(bot, text);
}

const BANK_MISSING_ALERT =
    '<b>⚠️ Chưa cấu hình tài khoản nhận tiền</b>\n\n' +
    'Khách vừa muốn thanh toán chuyển khoản nhưng bot chưa có số tài khoản nên không tạo được QR.\n\n' +
    'Cài ngay: <code>/setbank 1 BIN | Số TK | TÊN CHỦ TK | Tên NH</code>';

/**
 * Remove inline keyboard / delete a stored QR message, ignoring errors
 */
async function clearQrMessage(bot, chatId, messageId, { remove = false } = {}) {
    if (!chatId || !messageId) return;
    try {
        if (remove) await bot.telegram.deleteMessage(chatId, messageId);
        else await bot.telegram.editMessageReplyMarkup(chatId, messageId, undefined, { inline_keyboard: [] });
    } catch (err) {
        logger.warn(`Cannot update QR message ${chatId}/${messageId}:`, err.message);
    }
}

module.exports = { safeSend, notifyAdmins, notifyAdminsThrottled, BANK_MISSING_ALERT, clearQrMessage, isBlockedError };
