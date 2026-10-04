const config = require('../config');
const paymentService = require('../services/paymentService');
const topupService = require('../services/topupService');
const userService = require('../services/userService');
const { notifyAdmins, notifyAdminsThrottled, BANK_MISSING_ALERT } = require('../services/notifier');
const messages = require('../utils/messages');
const { formatPrice, h } = require('../utils/format');
const { adminTopupKeyboard, topupKeyboard } = require('../utils/keyboard');
const { respond, sendQrPhoto } = require('../utils/reply');

/**
 * "50000", "50.000", "50k" → 50000
 */
function parseAmount(text) {
    const s = String(text || '').trim().toLowerCase().replace(/[.,\s]/g, '');
    const m = s.match(/^(\d+)(k)?$/);
    if (!m) return NaN;
    return parseInt(m[1], 10) * (m[2] ? 1000 : 1);
}

function showTopupMenu(ctx, edit = !!ctx.callbackQuery) {
    return respond(ctx, messages.topupUsage(), topupKeyboard(), edit);
}

async function createTopup(ctx, bot, amount) {
    if (amount < config.NAP_MIN || amount > config.NAP_MAX) {
        return ctx.replyWithHTML(`Số tiền nạp phải từ <b>${formatPrice(config.NAP_MIN)}</b> đến <b>${formatPrice(config.NAP_MAX)}</b>.`);
    }

    if (!paymentService.isConfigured(0)) {
        await notifyAdminsThrottled(bot, 'bank_missing', BANK_MISSING_ALERT);
        return ctx.replyWithHTML('Nạp tiền qua chuyển khoản đang được cập nhật. Vui lòng thử lại sau hoặc liên hệ hỗ trợ.');
    }

    userService.findOrCreate(ctx.from);
    // Only one active top-up QR per user; a late payment to an old code is still credited
    for (const old of topupService.cancelPendingByUser(ctx.from.id)) {
        if (old.qr_message_id) await ctx.telegram.deleteMessage(old.qr_chat_id, old.qr_message_id).catch(() => {});
    }

    const payment = paymentService.generatePayment(amount, 0, 'topup');
    const topup = topupService.create(ctx.from.id, amount, payment.paymentCode);
    const autoPay = !!config.SEPAY_API_KEY;
    const caption = messages.topupQR({ topup, payment, expireMinutes: config.ORDER_EXPIRE_MINUTES, autoPay });

    const sent = await sendQrPhoto(ctx, payment.qrUrl, caption);
    topupService.setQrMessage(topup.id, sent.chat.id, sent.message_id);

    if (!autoPay) {
        await notifyAdmins(
            bot,
            `<b>👛 Yêu cầu nạp tiền #${topup.id}</b>\n\n` +
            `Số tiền: <b>${formatPrice(amount)}</b>\n` +
            `Khách: ${h(ctx.from.first_name || '')} · <code>${ctx.from.id}</code>\n` +
            `Nội dung CK: <code>${topup.payment_code}</code>\n\n` +
            `<i>Bấm Xác nhận sau khi nhận được tiền.</i>`,
            adminTopupKeyboard(topup.id)
        );
    }
    return sent;
}

module.exports = (bot) => {
    bot.command('nap', (ctx) => {
        if (!ctx.payload?.trim()) return showTopupMenu(ctx, false);
        const amount = parseAmount(ctx.payload);
        if (!Number.isFinite(amount)) return showTopupMenu(ctx, false);
        return createTopup(ctx, bot, amount);
    });

    bot.action('topup_menu', async (ctx) => {
        await ctx.answerCbQuery();
        return showTopupMenu(ctx, false);
    });

    bot.action(/^topup_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery('Đang tạo mã QR...');
        return createTopup(ctx, bot, parseInt(ctx.match[1], 10));
    });
};

module.exports.showTopupMenu = showTopupMenu;
module.exports.parseAmount = parseAmount;
