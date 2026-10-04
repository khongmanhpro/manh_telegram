const orderService = require('../services/orderService');
const warrantyService = require('../services/warrantyService');
const messages = require('../utils/messages');
const { orderListKeyboard, orderViewKeyboard, shopKeyboard } = require('../utils/keyboard');
const { respond, replyLong } = require('../utils/reply');
const { showShop } = require('./product');

async function showOrders(ctx, edit = !!ctx.callbackQuery) {
    const orders = orderService.getRecentByUser(ctx.from.id, 10);
    if (orders.length === 0) return respond(ctx, messages.noOrders, shopKeyboard(), edit);
    return respond(ctx, messages.orderList(orders), orderListKeyboard(orders), edit);
}

async function showOrderDetail(ctx, orderId) {
    const order = orderService.getById(orderId);
    if (!order || order.user_id !== ctx.from.id) {
        return ctx.answerCbQuery('Không tìm thấy đơn hàng');
    }
    await ctx.answerCbQuery();

    const claims = warrantyService.getByOrder(order.id);
    const canWarranty = order.status === 'delivered' && !claims.some((c) => c.status === 'open');
    const text = messages.orderDetail(order, claims);
    const keyboard = orderViewKeyboard(order, { canWarranty });

    if (text.length <= 4000) return respond(ctx, text, keyboard);
    return replyLong(ctx, text, keyboard);
}

module.exports = (bot) => {
    bot.command(['donhang', 'checkpay'], (ctx) => showOrders(ctx, false));

    bot.action('my_orders', async (ctx) => {
        await ctx.answerCbQuery();
        return showOrders(ctx);
    });

    bot.action(/^ov_(\d+)$/, (ctx) => showOrderDetail(ctx, parseInt(ctx.match[1], 10)));

    // Buttons from messages sent by older versions
    bot.action(/^check_paid_(\d+)$/, (ctx) => showOrderDetail(ctx, parseInt(ctx.match[1], 10)));
    bot.action('data_main', async (ctx) => {
        await ctx.answerCbQuery();
        return showOrders(ctx, false);
    });
    bot.action('buy_again', async (ctx) => {
        await ctx.answerCbQuery();
        return showShop(ctx, false);
    });
};

module.exports.showOrders = showOrders;
