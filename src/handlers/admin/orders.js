const orderService = require('../../services/orderService');
const topupService = require('../../services/topupService');
const userService = require('../../services/userService');
const warrantyService = require('../../services/warrantyService');
const deliveryService = require('../../services/deliveryService');
const { safeSend, clearQrMessage } = require('../../services/notifier');
const stateRouter = require('../stateRouter');
const messages = require('../../utils/messages');
const { adminOnly, adminAction } = require('../../utils/auth');
const { h, formatPrice, formatDate } = require('../../utils/format');
const { replyLong, appendStatus } = require('../../utils/reply');
const { adminWarrantyKeyboard, shopKeyboard } = require('../../utils/keyboard');

const arg = (ctx) => (ctx.payload || '').trim();

function orderLine(o) {
    return (
        `${messages.STATUS_EMOJI[o.status] || '❓'} <b>#${o.id}</b> | ${h(o.user_name || o.user_id)}\n` +
        `  ${h(o.product_name)} × ${messages.qtyText(o)} = ${formatPrice(o.total_price)}` +
        (o.payment_method === 'balance' ? ' (số dư)' : '') +
        `\n  📅 ${formatDate(o.created_at)}`
    );
}

module.exports = (bot) => {
    /**
     * Admin confirms payment → deliver from stock or prompt this admin for manual delivery
     */
    async function confirmOrder(ctx, orderId) {
        const order = orderService.getById(orderId);
        if (!order) return { error: 'Đơn hàng không tồn tại' };
        if (order.status !== 'pending' && order.status !== 'paid') return { error: `Đơn đã xử lý (${order.status})` };

        const result = await deliveryService.fulfillOrder(bot, orderId, { markFullyPaid: true, skipAdminManualNotice: true });
        if (!result.success) return { error: result.error };
        if (result.delivered) return { delivered: true, sent: result.sent };

        stateRouter.setState(ctx.from.id, { action: 'deliver_order', orderId });
        await ctx.replyWithHTML(messages.adminManualPrompt(result.order));
        return { delivered: false };
    }

    bot.command('confirm', adminOnly, async (ctx) => {
        const orderId = parseInt(arg(ctx), 10);
        if (!orderId) return ctx.replyWithHTML('Cách dùng: <code>/confirm [orderID]</code>');
        const res = await confirmOrder(ctx, orderId);
        if (res.error) return ctx.replyWithHTML(`❌ Lỗi: ${h(res.error)}`);
        if (res.delivered) {
            return ctx.replyWithHTML(`✅ Đơn <b>#${orderId}</b> đã xác nhận & giao hàng${res.sent ? '' : ' (⚠️ không gửi được tin cho khách)'}`);
        }
        return undefined;
    });

    bot.action(/^admin_confirm_(\d+)$/, adminAction, async (ctx) => {
        const orderId = parseInt(ctx.match[1], 10);
        await ctx.answerCbQuery('⏳ Đang xử lý...');
        const res = await confirmOrder(ctx, orderId);
        if (res.error) return appendStatus(ctx, `⚠️ ${h(res.error)}`);
        return appendStatus(ctx, res.delivered ? '<b>✅ Đã xác nhận và giao hàng tự động</b>' : '<b>💳 Đã xác nhận thanh toán</b> · chờ nhập tài khoản');
    });

    async function cancelByAdmin(orderId) {
        const res = orderService.cancel(orderId, { allowPaid: true });
        if (!res.success) return res;
        await clearQrMessage(bot, res.order.qr_chat_id, res.order.qr_message_id, { remove: true });
        await safeSend(bot, res.order.user_id, messages.orderCancelled(res.order, res.refunded));
        return res;
    }

    bot.action(/^admin_cancel_(\d+)$/, adminAction, async (ctx) => {
        const res = await cancelByAdmin(parseInt(ctx.match[1], 10));
        if (!res.success) return ctx.answerCbQuery(`⚠️ ${res.error}`, { show_alert: true });
        await ctx.answerCbQuery('❌ Đã hủy');
        return appendStatus(ctx, `<b>Đã hủy đơn</b>${res.refunded ? ` · hoàn ${formatPrice(res.refunded)} vào số dư` : ''}`);
    });

    bot.command('cancelorder', adminOnly, async (ctx) => {
        const orderId = parseInt(arg(ctx), 10);
        if (!orderId) return ctx.replyWithHTML('Cách dùng: <code>/cancelorder [orderID]</code>');
        const res = await cancelByAdmin(orderId);
        if (!res.success) return ctx.replyWithHTML(`❌ ${h(res.error)}`);
        return ctx.replyWithHTML(`❌ Đã hủy đơn <b>#${orderId}</b>${res.refunded ? ` — hoàn ${formatPrice(res.refunded)} vào số dư khách` : ''}`);
    });

    // Manual delivery
    bot.action(/^adm_deliver_(\d+)$/, adminAction, async (ctx) => {
        const order = orderService.getById(parseInt(ctx.match[1], 10));
        if (!order || order.status !== 'paid') return ctx.answerCbQuery('⚠️ Đơn không ở trạng thái chờ giao');
        await ctx.answerCbQuery();
        stateRouter.setState(ctx.from.id, { action: 'deliver_order', orderId: order.id });
        return ctx.replyWithHTML(messages.adminManualPrompt(order));
    });

    stateRouter.register(
        'deliver_order',
        async (ctx, state) => {
            const text = ctx.message.text;
            const accounts = text.split('\n').map((l) => l.trim()).filter(Boolean);
            if (accounts.length === 0) return ctx.reply('❌ Không có dữ liệu. Gửi lại hoặc /cancel.');
            stateRouter.clearState(ctx.from.id);

            const res = await deliveryService.manualDeliver(bot, state.orderId, accounts);
            if (!res.success) return ctx.replyWithHTML(`❌ ${h(res.error)}`);
            const order = res.order;
            const expected = order.quantity + (order.bonus_qty || 0);
            return ctx.replyWithHTML(
                `✅ <b>Đã giao hàng đơn #${order.id}!</b>\n\n` +
                `📦 ${h(order.product_name)} × ${messages.qtyText(order)}\n` +
                `👤 Khách: <code>${order.user_id}</code>` +
                (accounts.length !== expected ? `\n⚠️ Đã gửi ${accounts.length}/${expected} tài khoản` : '') +
                (res.sent ? '' : '\n⚠️ Không gửi được tin cho khách — khách xem lại tại /donhang')
            );
        },
        { admin: true }
    );

    async function showPending(ctx) {
        const orders = orderService.getAllPending();
        if (orders.length === 0) return ctx.reply('✅ Không có đơn hàng chờ thanh toán!');
        const text =
            `⏳ <b>ĐƠN CHỜ THANH TOÁN (${orders.length})</b>\n\n` +
            orders
                .map((o) => `${orderLine(o)}\n  🔑 <code>${h(o.payment_code)}</code>${o.paid_amount ? ` · đã nhận ${formatPrice(o.paid_amount)}` : ''}\n  → <code>/confirm ${o.id}</code>`)
                .join('\n\n');
        return replyLong(ctx, text);
    }

    async function showAwaiting(ctx) {
        const orders = orderService.getAwaitingDelivery();
        if (orders.length === 0) return ctx.reply('✅ Không có đơn chờ giao thủ công!');
        const text =
            `📝 <b>ĐƠN ĐÃ THANH TOÁN — CHỜ GIAO (${orders.length})</b>\n\n` +
            orders.map((o) => `${orderLine(o)}\n  → <code>/confirm ${o.id}</code> (giao từ kho hoặc nhập tay)`).join('\n\n');
        return replyLong(ctx, text);
    }

    bot.command('pending', adminOnly, showPending);
    bot.command('awaiting', adminOnly, showAwaiting);
    bot.action('adm_pending', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return showPending(ctx);
    });
    bot.action('adm_awaiting', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return showAwaiting(ctx);
    });

    bot.command('orders', adminOnly, (ctx) => {
        const orders = orderService.getRecent(30);
        if (orders.length === 0) return ctx.reply('📋 Chưa có đơn hàng nào.');
        return replyLong(ctx, `📋 <b>ĐƠN HÀNG GẦN ĐÂY (${orders.length})</b>\n\n` + orders.map(orderLine).join('\n\n'));
    });

    // Open warranty claims
    async function showWarranty(ctx) {
        const claims = warrantyService.getOpen();
        if (claims.length === 0) return ctx.reply('✅ Không có yêu cầu bảo hành nào đang mở.');
        for (const c of claims.slice(0, 10)) {
            await ctx.replyWithHTML(
                `🛠 <b>Bảo hành #${c.id}</b> — đơn #${c.order_id}\n📦 ${h(c.product_name)}\n👤 <code>${c.user_id}</code> · ${formatDate(c.created_at)}\n💬 ${h(c.message)}`,
                adminWarrantyKeyboard(c.id)
            );
        }
        if (claims.length > 10) await ctx.reply(`... và ${claims.length - 10} yêu cầu khác`);
        return undefined;
    }
    bot.command('warranty', adminOnly, showWarranty);
    bot.action('adm_warranty', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return showWarranty(ctx);
    });

    // Manual top-up confirmation (when no payment gateway)
    bot.action(/^adm_topup_(\d+)$/, adminAction, async (ctx) => {
        const res = topupService.confirmManual(parseInt(ctx.match[1], 10));
        if (!res.success) return ctx.answerCbQuery(`⚠️ ${res.error}`, { show_alert: true });
        await ctx.answerCbQuery('✅ Đã cộng số dư');
        await clearQrMessage(bot, res.topup.qr_chat_id, res.topup.qr_message_id);
        await safeSend(bot, res.topup.user_id, messages.topupSuccess(res.topup.amount, res.balance), shopKeyboard());
        return appendStatus(ctx, `<b>✅ Đã cộng ${formatPrice(res.topup.amount)}</b> vào số dư khách`);
    });

    // /addbalance userId amount [ghi chú]
    bot.command('addbalance', adminOnly, async (ctx) => {
        const m = arg(ctx).match(/^(\d+)\s+(-?\d+)(?:\s+([\s\S]+))?$/);
        if (!m) {
            return ctx.replyWithHTML('Cách dùng: <code>/addbalance [userID] [số tiền] [ghi chú]</code>\nSố âm để trừ. Ví dụ: <code>/addbalance 123456 50000 Hoàn tiền</code>');
        }
        const userId = parseInt(m[1], 10);
        const amount = parseInt(m[2], 10);
        const note = (m[3] || '').trim();
        const user = userService.get(userId);
        if (!user) return ctx.reply('❌ User không tồn tại');
        if (amount === 0) return ctx.reply('❌ Số tiền phải khác 0');
        if (amount < 0 && !userService.deductBalance(userId, -amount)) {
            return ctx.reply(`❌ Số dư không đủ để trừ (hiện có ${formatPrice(user.balance)})`);
        }
        if (amount > 0) userService.addBalance(userId, amount);

        const balance = userService.get(userId).balance;
        await safeSend(
            bot,
            userId,
            `${amount > 0 ? '💰 Bạn được cộng' : '💸 Bạn bị trừ'} <b>${formatPrice(Math.abs(amount))}</b>` +
            (note ? `\n📝 ${h(note)}` : '') +
            `\n👛 Số dư hiện tại: <b>${formatPrice(balance)}</b>`
        );
        return ctx.replyWithHTML(`✅ ${h(user.full_name)} (<code>${userId}</code>): ${amount > 0 ? '+' : ''}${formatPrice(amount)} → số dư ${formatPrice(balance)}`);
    });
};
