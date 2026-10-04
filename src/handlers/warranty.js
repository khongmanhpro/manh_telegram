const db = require('../database');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const warrantyService = require('../services/warrantyService');
const { safeSend, notifyAdmins } = require('../services/notifier');
const stateRouter = require('./stateRouter');
const messages = require('../utils/messages');
const { adminWarrantyKeyboard } = require('../utils/keyboard');
const { adminAction } = require('../utils/auth');
const { appendStatus } = require('../utils/reply');

/**
 * Take replacement accounts from stock and resolve the claim atomically
 */
const replaceFromStock = db.transaction((claimId, count) => {
    const claim = warrantyService.getById(claimId);
    if (!claim || claim.status !== 'open') return { error: 'Yêu cầu đã được xử lý' };
    const accounts = productService.takeStock(claim.product_id, count, claim.user_id, claim.order_id);
    if (!accounts) return { error: 'Kho không đủ hàng — dùng "Nhập TK thay thế"' };
    warrantyService.resolve(claimId, 'replaced', accounts.join('\n'));
    return { claim, accounts };
});

module.exports = (bot) => {
    // Customer opens a claim
    bot.action(/^wr_(\d+)$/, async (ctx) => {
        const order = orderService.getById(parseInt(ctx.match[1], 10));
        if (!order || order.user_id !== ctx.from.id) return ctx.answerCbQuery('Không tìm thấy đơn hàng');
        if (order.status !== 'delivered') return ctx.answerCbQuery('Chỉ bảo hành đơn đã giao', { show_alert: true });
        if (warrantyService.getOpenByOrder(order.id)) {
            return ctx.answerCbQuery('Đơn này đang có yêu cầu bảo hành chờ xử lý', { show_alert: true });
        }
        await ctx.answerCbQuery();
        stateRouter.setState(ctx.from.id, { action: 'warranty', orderId: order.id });
        return ctx.replyWithHTML(messages.askWarranty(order));
    });

    stateRouter.register('warranty', async (ctx, state) => {
        const text = ctx.message.text.trim();
        if (text.length < 5) return ctx.replyWithHTML('Vui lòng <b>mô tả chi tiết hơn</b>, hoặc /cancel để hủy.');
        stateRouter.clearState(ctx.from.id);

        const order = orderService.getById(state.orderId);
        if (!order || order.user_id !== ctx.from.id || warrantyService.getOpenByOrder(order.id)) {
            return ctx.reply('Không thể tạo yêu cầu bảo hành cho đơn này.');
        }

        const claim = warrantyService.create(order.id, ctx.from.id, text.slice(0, 1000));
        await notifyAdmins(bot, messages.adminWarranty(claim, order, ctx.from), adminWarrantyKeyboard(claim.id));
        return ctx.replyWithHTML(messages.warrantySubmitted(claim));
    });

    // Admin: replace 1 account from stock
    bot.action(/^wra_(\d+)$/, adminAction, async (ctx) => {
        const res = replaceFromStock(parseInt(ctx.match[1], 10), 1);
        if (res.error) return ctx.answerCbQuery(`${res.error}`, { show_alert: true });
        await ctx.answerCbQuery('✅ Đã đổi');
        const sent = await safeSend(bot, res.claim.user_id, messages.warrantyReplaced(res.claim, res.accounts));
        return appendStatus(ctx, `<b>✅ Đã đổi 1 tài khoản từ kho</b>${sent ? '' : ' · ⚠️ chưa gửi được cho khách'}`);
    });

    // Admin: type replacement accounts manually
    bot.action(/^wrm_(\d+)$/, adminAction, async (ctx) => {
        const claim = warrantyService.getById(parseInt(ctx.match[1], 10));
        if (!claim || claim.status !== 'open') return ctx.answerCbQuery('⚠️ Yêu cầu đã được xử lý');
        await ctx.answerCbQuery();
        stateRouter.setState(ctx.from.id, { action: 'warranty_manual', claimId: claim.id });
        return ctx.replyWithHTML(
            `<b>✍️ Tài khoản thay thế · bảo hành #${claim.id}</b>\n\nGửi tài khoản mới, mỗi dòng 1 tài khoản.\n\n<i>Gõ /cancel để hủy.</i>`
        );
    });

    stateRouter.register(
        'warranty_manual',
        async (ctx, state) => {
            stateRouter.clearState(ctx.from.id);
            const accounts = ctx.message.text.split('\n').map((l) => l.trim()).filter(Boolean);
            if (accounts.length === 0) return ctx.reply('Không có dữ liệu.');

            const claim = warrantyService.getById(state.claimId);
            if (!claim || !warrantyService.resolve(claim.id, 'replaced', accounts.join('\n'))) {
                return ctx.reply('⚠️ Yêu cầu đã được xử lý trước đó.');
            }
            const sent = await safeSend(bot, claim.user_id, messages.warrantyReplaced(claim, accounts));
            return ctx.replyWithHTML(
                sent ? `<b>✅ Đã gửi tài khoản thay thế</b> · bảo hành #${claim.id}` : `⚠️ Đã lưu nhưng chưa gửi được cho khách <code>${claim.user_id}</code>`
            );
        },
        { admin: true }
    );

    // Admin: reject
    bot.action(/^wrr_(\d+)$/, adminAction, async (ctx) => {
        const claim = warrantyService.getById(parseInt(ctx.match[1], 10));
        if (!claim || !warrantyService.resolve(claim.id, 'rejected')) {
            return ctx.answerCbQuery('⚠️ Yêu cầu đã được xử lý');
        }
        await ctx.answerCbQuery('Đã từ chối');
        await safeSend(bot, claim.user_id, messages.warrantyRejected(claim));
        return appendStatus(ctx, '<b>Đã từ chối</b>');
    });
};
