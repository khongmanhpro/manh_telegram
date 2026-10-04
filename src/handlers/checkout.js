const config = require('../config');
const productService = require('../services/productService');
const orderService = require('../services/orderService');
const paymentService = require('../services/paymentService');
const userService = require('../services/userService');
const couponService = require('../services/couponService');
const deliveryService = require('../services/deliveryService');
const { notifyAdmins, notifyAdminsThrottled, BANK_MISSING_ALERT } = require('../services/notifier');
const stateRouter = require('./stateRouter');
const messages = require('../utils/messages');
const { bonusFor, h } = require('../utils/format');
const { checkoutKeyboard, qrPaymentKeyboard, adminOrderKeyboard, shopKeyboard } = require('../utils/keyboard');
const { respond, clearButtons, sendQrPhoto } = require('../utils/reply');

// Prevent double-taps from creating duplicate orders
const locks = new Set();
async function withUserLock(ctx, fn) {
    const id = ctx.from.id;
    if (locks.has(id)) return ctx.answerCbQuery('⏳ Đang xử lý...').catch(() => {});
    locks.add(id);
    try {
        return await fn();
    } finally {
        locks.delete(id);
    }
}

/**
 * Banks usable for QR payment, keeping their original index for callback data
 */
function usableBanks() {
    return paymentService
        .getBanks()
        .map((b, index) => ({ ...b, index }))
        .filter((b) => paymentService.isConfigured(b.index));
}

function isPurchasable(product) {
    return product && product.is_active && !product.is_deleted && !product.contact_only && product.price > 0;
}

/**
 * Largest quantity (≤ MAX_QTY) whose quantity + bonus fits in available stock
 */
function computeMaxQty(product) {
    let q = Math.min(config.MAX_QTY, product.display_stock);
    while (q > 0 && q + bonusFor(product, q) > product.display_stock) q--;
    return q;
}

/**
 * Price calculation incl. bonus and coupon. Returns { ok, ...pricing } or { ok: false, reason }
 */
function price(product, quantity, couponCode, userId) {
    const bonus = bonusFor(product, quantity);
    const subtotal = product.price * quantity;
    let discount = 0;
    if (couponCode) {
        const res = couponService.validate(couponCode, userId, subtotal);
        if (!res.ok) return { ok: false, reason: res.reason };
        discount = res.discount;
    }
    return { ok: true, bonus, subtotal, discount, total: subtotal - discount, couponCode: couponCode || null };
}

/**
 * Load product + validate quantity. Returns { product } or { error }
 */
function loadForPurchase(productId, quantity) {
    const product = productService.getById(productId);
    if (!isPurchasable(product)) return { error: 'Sản phẩm không tồn tại hoặc đã ngừng bán' };
    const max = computeMaxQty(product);
    if (max === 0) return { error: messages.noStock };
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > max) {
        return { error: `Số lượng không hợp lệ. Tối đa ${max} sản phẩm.` };
    }
    return { product };
}

async function showCheckout(ctx, productId, quantity, couponCode = null) {
    const { product, error } = loadForPurchase(productId, quantity);
    if (error) {
        if (ctx.callbackQuery) return ctx.answerCbQuery(error, { show_alert: true });
        return ctx.reply(error);
    }

    const user = userService.findOrCreate(ctx.from);
    let pricing = price(product, quantity, couponCode, user.telegram_id);
    let notice = '';
    if (!pricing.ok) {
        notice = `⚠️ <i>${h(pricing.reason)}</i>\n\n`;
        pricing = price(product, quantity, null, user.telegram_id);
    }

    const banks = usableBanks();
    if (banks.length === 0 && pricing.total > 0) {
        notice += '⚠️ <i>Thanh toán chuyển khoản đang được cập nhật. Bạn có thể dùng số dư ví hoặc liên hệ hỗ trợ.</i>\n\n';
        await notifyAdminsThrottled({ telegram: ctx.telegram }, 'bank_missing', BANK_MISSING_ALERT);
    }

    if (ctx.callbackQuery) await ctx.answerCbQuery().catch(() => {});
    const text = notice + messages.checkoutSummary({ product, quantity, ...pricing, balance: user.balance });
    const keyboard = checkoutKeyboard({
        productId,
        quantity,
        couponCode: pricing.couponCode,
        total: pricing.total,
        balance: user.balance,
        banks,
    });
    return respond(ctx, text, keyboard);
}

async function payByQr(ctx, bot, productId, quantity, bankIndex, couponCode) {
    const { product, error } = loadForPurchase(productId, quantity);
    if (error) return ctx.answerCbQuery(error, { show_alert: true });

    if (!paymentService.isConfigured(bankIndex)) {
        await notifyAdminsThrottled({ telegram: ctx.telegram }, 'bank_missing', BANK_MISSING_ALERT);
        return ctx.answerCbQuery('Thanh toán chuyển khoản đang được cập nhật, vui lòng thử lại sau.', { show_alert: true });
    }

    if (orderService.countPendingByUser(ctx.from.id) >= config.MAX_PENDING_ORDERS) {
        await ctx.answerCbQuery();
        return ctx.reply(messages.tooManyPending(config.MAX_PENDING_ORDERS));
    }

    userService.findOrCreate(ctx.from);
    const pricing = price(product, quantity, couponCode, ctx.from.id);
    if (!pricing.ok) return ctx.answerCbQuery(`${pricing.reason}`, { show_alert: true });
    if (pricing.total <= 0) return ctx.answerCbQuery('Đơn 0đ — vui lòng chọn "Nhận miễn phí"', { show_alert: true });

    await ctx.answerCbQuery('⏳ Đang tạo đơn hàng...');
    const payment = paymentService.generatePayment(pricing.total, bankIndex, 'order');
    const order = orderService.create({
        userId: ctx.from.id,
        productId,
        quantity,
        bonusQty: pricing.bonus,
        totalPrice: pricing.total,
        discount: pricing.discount,
        couponCode: pricing.couponCode,
        paymentCode: payment.paymentCode,
        bankName: payment.bankName,
    });

    await clearButtons(ctx);
    const autoPay = !!config.SEPAY_API_KEY;
    const caption = messages.paymentQR({ order, product, payment, expireMinutes: config.ORDER_EXPIRE_MINUTES, autoPay });
    const sent = await sendQrPhoto(ctx, payment.qrUrl, caption, qrPaymentKeyboard(order.id));
    if (sent) orderService.setQrMessage(order.id, sent.chat.id, sent.message_id);

    await notifyAdmins(bot, messages.adminNewOrder(order, ctx.from, autoPay), adminOrderKeyboard(order.id));
}

async function payByBalance(ctx, bot, productId, quantity, couponCode) {
    const { product, error } = loadForPurchase(productId, quantity);
    if (error) return ctx.answerCbQuery(error, { show_alert: true });

    userService.findOrCreate(ctx.from);
    const pricing = price(product, quantity, couponCode, ctx.from.id);
    if (!pricing.ok) return ctx.answerCbQuery(`${pricing.reason}`, { show_alert: true });

    const res = orderService.payWithBalance({
        userId: ctx.from.id,
        productId,
        quantity,
        bonusQty: pricing.bonus,
        totalPrice: pricing.total,
        discount: pricing.discount,
        couponCode: pricing.couponCode,
        paymentCode: paymentService.generatePaymentCode('order'),
    });
    if (!res.success) return ctx.answerCbQuery(`${res.error}`, { show_alert: true });

    await ctx.answerCbQuery('✅ Đã thanh toán bằng số dư');
    await clearButtons(ctx);
    await deliveryService.fulfillOrder(bot, res.order.id, { method: 'số dư' });
}

module.exports = (bot) => {
    // qty_{productId}_{quantity}
    bot.action(/^qty_(\d+)_(\d+)$/, (ctx) => showCheckout(ctx, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10)));

    // cp_{productId}_{quantity} → ask coupon code
    bot.action(/^cp_(\d+)_(\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        stateRouter.setState(ctx.from.id, {
            action: 'coupon',
            productId: parseInt(ctx.match[1], 10),
            quantity: parseInt(ctx.match[2], 10),
        });
        return ctx.reply(messages.askCoupon);
    });

    stateRouter.register('coupon', async (ctx, state) => {
        stateRouter.clearState(ctx.from.id);
        const code = couponService.normalize(ctx.message.text);
        return showCheckout(ctx, state.productId, state.quantity, code);
    });

    // pq_{productId}_{quantity}_{bankIndex}_{coupon|-}
    bot.action(/^pq_(\d+)_(\d+)_(\d)_([A-Z0-9]+|-)$/, (ctx) =>
        withUserLock(ctx, () =>
            payByQr(ctx, bot, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10), parseInt(ctx.match[3], 10),
                ctx.match[4] === '-' ? null : ctx.match[4])
        )
    );

    // pb_{productId}_{quantity}_{coupon|-}
    bot.action(/^pb_(\d+)_(\d+)_([A-Z0-9]+|-)$/, (ctx) =>
        withUserLock(ctx, () =>
            payByBalance(ctx, bot, parseInt(ctx.match[1], 10), parseInt(ctx.match[2], 10),
                ctx.match[3] === '-' ? null : ctx.match[3])
        )
    );

    // Cancel before an order exists
    bot.action('cancel_order', async (ctx) => {
        await ctx.answerCbQuery('Đã hủy');
        return respond(ctx, messages.cancelledCheckout, shopKeyboard());
    });

    // Customer cancels their own pending order
    bot.action(/^cancel_order_(\d+)$/, async (ctx) => {
        const res = orderService.cancel(parseInt(ctx.match[1], 10), { userId: ctx.from.id });
        if (!res.success) return ctx.answerCbQuery(`${res.error}`, { show_alert: true });

        await ctx.answerCbQuery('Đã hủy đơn hàng');
        if (ctx.callbackQuery.message?.photo) await ctx.deleteMessage().catch(() => {});
        else await clearButtons(ctx);
        if (res.order.qr_message_id && res.order.qr_message_id !== ctx.callbackQuery.message?.message_id) {
            await ctx.telegram.deleteMessage(res.order.qr_chat_id, res.order.qr_message_id).catch(() => {});
        }
        return ctx.replyWithHTML(messages.orderCancelled(res.order, res.refunded));
    });
};

module.exports.showCheckout = showCheckout;
module.exports.computeMaxQty = computeMaxQty;
module.exports.isPurchasable = isPurchasable;
