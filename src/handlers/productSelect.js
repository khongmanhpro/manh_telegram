const productService = require('../services/productService');
const stateRouter = require('./stateRouter');
const messages = require('../utils/messages');
const { quantityKeyboard, contactKeyboard } = require('../utils/keyboard');
const { respond } = require('../utils/reply');
const { showCheckout, computeMaxQty } = require('./checkout');

module.exports = (bot) => {
    bot.action(/^product_(\d+)$/, async (ctx) => {
        const product = productService.getById(parseInt(ctx.match[1], 10));
        if (!product || !product.is_active || product.is_deleted) {
            return ctx.answerCbQuery('Sản phẩm không tồn tại hoặc đã ngừng bán', { show_alert: true });
        }

        if (product.contact_only) {
            await ctx.answerCbQuery();
            return respond(ctx, messages.contactOnly(product), contactKeyboard(product));
        }

        const maxQty = computeMaxQty(product);
        if (maxQty === 0) return ctx.answerCbQuery(messages.noStock, { show_alert: true });

        await ctx.answerCbQuery();
        return respond(ctx, messages.selectQuantity(product), quantityKeyboard(product.id, maxQty));
    });

    // Custom quantity input (for quantities above the quick buttons)
    bot.action(/^qtyc_(\d+)$/, async (ctx) => {
        const product = productService.getById(parseInt(ctx.match[1], 10));
        if (!product) return ctx.answerCbQuery('Sản phẩm không tồn tại');
        await ctx.answerCbQuery();
        stateRouter.setState(ctx.from.id, { action: 'custom_qty', productId: product.id });
        return ctx.replyWithHTML(messages.askCustomQuantity(product, computeMaxQty(product)));
    });

    stateRouter.register('custom_qty', async (ctx, state) => {
        const quantity = parseInt(ctx.message.text.trim(), 10);
        if (!Number.isInteger(quantity) || quantity < 1) {
            return ctx.replyWithHTML('Vui lòng gửi một <b>số nguyên dương</b>, hoặc /cancel để hủy.');
        }
        stateRouter.clearState(ctx.from.id);
        return showCheckout(ctx, state.productId, quantity);
    });
};
