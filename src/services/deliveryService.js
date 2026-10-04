const config = require('../config');
const orderService = require('./orderService');
const productService = require('./productService');
const { notifyAdmins, clearQrMessage, isBlockedError } = require('./notifier');
const userService = require('./userService');
const messages = require('../utils/messages');
const { chunkText } = require('../utils/format');
const { postDeliveryKeyboard, adminDeliverKeyboard } = require('../utils/keyboard');
const logger = require('../utils/logger');

/**
 * Send delivered accounts to the customer (chunked for large orders).
 * Throws on failure so the caller can alert admins.
 */
async function sendAccounts(bot, order, accounts) {
    const chunks = chunkText(messages.orderDelivered(order, accounts));
    for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        await bot.telegram.sendMessage(order.user_id, chunks[i], {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(isLast ? postDeliveryKeyboard(order.id) : {}),
        });
    }
}

async function sendAccountsOrAlert(bot, order, accounts) {
    try {
        await sendAccounts(bot, order, accounts);
        orderService.recordDeliveryAttempt(order.id, true);
        return true;
    } catch (err) {
        if (isBlockedError(err)) userService.setBlocked(order.user_id, true);
        orderService.recordDeliveryAttempt(order.id, false, err.message);
        logger.error(`Delivery message for order #${order.id} failed:`, err.message);
        await notifyAdmins(bot, messages.adminDeliveryFailed(order, err.message));
        return false;
    }
}

/**
 * Fulfill a paid order: deliver from stock, or hand over to admins for manual delivery.
 * opts.markFullyPaid: admin confirmed payment manually
 * opts.method: label for admin notification
 * opts.skipAdminManualNotice: the confirming admin will be prompted directly
 */
async function fulfillOrder(bot, orderId, opts = {}) {
    const result = orderService.fulfill(orderId, { markFullyPaid: !!opts.markFullyPaid });
    if (!result.success) return result;

    const order = result.order;
    await clearQrMessage(bot, order.qr_chat_id, order.qr_message_id);

    if (result.delivered) {
        result.sent = await sendAccountsOrAlert(bot, order, result.accounts);
        if (opts.method) await notifyAdmins(bot, messages.adminDelivered(order, opts.method));

        // Low stock alert when crossing the threshold
        const qty = order.quantity + (order.bonus_qty || 0);
        const before = result.stockAfter + qty;
        if (result.stockAfter <= config.LOW_STOCK_THRESHOLD && before > config.LOW_STOCK_THRESHOLD) {
            const product = productService.getById(order.product_id);
            await notifyAdmins(bot, messages.adminLowStock(product, result.stockAfter));
        }
        return result;
    }

    // Not enough stock → manual delivery
    await bot.telegram
        .sendMessage(order.user_id, messages.orderPaidAwaiting(order), { parse_mode: 'HTML' })
        .catch((err) => logger.warn('Notify paid-awaiting failed:', err.message));
    if (!opts.skipAdminManualNotice) {
        await notifyAdmins(bot, messages.adminNeedManual(order), adminDeliverKeyboard(order.id));
    }
    return result;
}

/**
 * Admin-provided accounts for a paid order
 */
async function manualDeliver(bot, orderId, accounts) {
    const result = orderService.manualDeliver(orderId, accounts);
    if (!result.success) return result;
    result.sent = await sendAccountsOrAlert(bot, result.order, accounts);
    return result;
}

/**
 * Resend the exact delivery data already assigned to a delivered order.
 * This intentionally never touches stock.
 */
async function resendOrder(bot, orderId) {
    const order = orderService.getById(orderId);
    if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
    if (order.status !== 'delivered' || !order.delivery_data) {
        return { success: false, error: 'Đơn chưa có dữ liệu giao hàng để gửi lại' };
    }
    const accounts = order.delivery_data.split('\n');
    const sent = await sendAccountsOrAlert(bot, order, accounts);
    return { success: sent, sent, order: orderService.getById(orderId) };
}

module.exports = { fulfillOrder, manualDeliver, resendOrder, sendAccounts };
