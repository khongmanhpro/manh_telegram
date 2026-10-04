const productService = require('../services/productService');
const messages = require('../utils/messages');
const { productListKeyboard, categoryKeyboard } = require('../utils/keyboard');
const { respond } = require('../utils/reply');

/**
 * Entry point of the shop: categories if there are several, otherwise the product list
 */
async function showShop(ctx, edit = !!ctx.callbackQuery) {
    const categories = productService.getShopCategories();
    if (categories.length > 1) {
        return respond(ctx, messages.categoryHeader, categoryKeyboard(categories), edit);
    }
    return showProducts(ctx, productService.getAll(), { edit });
}

// Purchasable first, then contact-only, then sold out (stable within each group)
function availabilityRank(p) {
    if (p.display_stock > 0) return 0;
    return p.contact_only ? 1 : 2;
}

async function showProducts(ctx, products, { edit = !!ctx.callbackQuery, backToCategories = false, title } = {}) {
    if (products.length === 0) return respond(ctx, messages.noProducts, {}, edit);
    const sorted = [...products].sort((a, b) => availabilityRank(a) - availabilityRank(b));
    return respond(ctx, messages.productCatalog(sorted, title), productListKeyboard(sorted, { backToCategories }), edit);
}

module.exports = (bot) => {
    bot.command('product', (ctx) => showShop(ctx, false));

    bot.action(['refresh_products', 'categories'], async (ctx) => {
        await ctx.answerCbQuery();
        return showShop(ctx);
    });

    bot.action(/^cat_(all|\d+)$/, async (ctx) => {
        await ctx.answerCbQuery();
        const key = ctx.match[1];
        if (key === 'all') return showProducts(ctx, productService.getAll(), { backToCategories: true, title: '🛍 Tất cả sản phẩm' });

        const id = parseInt(key, 10);
        const category = productService.getShopCategories().find((c) => c.id === id);
        const title = category ? `${category.emoji || '📂'} ${category.name}` : undefined;
        return showProducts(ctx, productService.getByCategory(id), { backToCategories: true, title });
    });
};

module.exports.showShop = showShop;
