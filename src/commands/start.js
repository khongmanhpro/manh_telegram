const config = require('../config');
const userService = require('../services/userService');
const orderService = require('../services/orderService');
const productService = require('../services/productService');
const settingsService = require('../services/settingsService');
const stateService = require('../services/stateService');
const messages = require('../utils/messages');
const { applyPlaceholders } = require('../utils/entities');
const { homeKeyboard, accountKeyboard, supportKeyboard, MENU, LEGACY_MENU } = require('../utils/keyboard');
const { respond } = require('../utils/reply');
const logger = require('../utils/logger');
const { showShop } = require('./product');
const { showOrders } = require('./orders');
const { showTopupMenu } = require('./nap');

function buildHomeKeyboard() {
    return homeKeyboard({ categories: productService.getShopCategories(), products: productService.getAll() });
}

/**
 * Send the admin's custom welcome (text or photo with entities, e.g. custom emoji).
 * Returns null if none is set or sending failed (caller falls back to the default).
 */
async function sendCustomWelcome(ctx, keyboard) {
    const welcome = settingsService.getWelcome();
    if (!welcome) return null;

    const name = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(' ');
    const { text, entities } = applyPlaceholders(welcome.text || '', welcome.entities || [], { name, shop: config.SHOP_NAME });
    try {
        if (welcome.kind === 'photo') {
            return await ctx.replyWithPhoto(welcome.fileId, { caption: text, caption_entities: entities, ...keyboard });
        }
        return await ctx.reply(text, { entities, link_preview_options: { is_disabled: true }, ...keyboard });
    } catch (err) {
        logger.warn('Custom welcome failed, using default:', err.message);
        return null;
    }
}

/**
 * Remove the reply keyboard sent by earlier versions (the inline home grid replaces it)
 */
async function removeLegacyKeyboard(ctx) {
    try {
        const m = await ctx.reply('⏳', { reply_markup: { remove_keyboard: true } });
        await ctx.deleteMessage(m.message_id);
    } catch {
        /* not critical */
    }
}

async function sendWelcome(ctx) {
    const user = userService.findOrCreate(ctx.from);
    await removeLegacyKeyboard(ctx);
    const keyboard = buildHomeKeyboard();
    const sent = await sendCustomWelcome(ctx, keyboard);
    if (sent) return sent;
    return ctx.replyWithHTML(messages.welcome(user.full_name), keyboard);
}

async function showAccount(ctx) {
    const user = userService.findOrCreate(ctx.from);
    return ctx.replyWithHTML(messages.accountInfo(user, orderService.countByUser(user.telegram_id)), accountKeyboard());
}

function showSupport(ctx) {
    return ctx.replyWithHTML(messages.supportInfo(), supportKeyboard());
}

module.exports = (bot) => {
    bot.start(sendWelcome);

    bot.command('menu', showAccount);
    bot.command('support', showSupport);
    bot.command('myid', (ctx) => ctx.replyWithHTML(messages.myId(ctx.from.id)));

    bot.action('home_refresh', async (ctx) => {
        await ctx.answerCbQuery('Đã cập nhật');
        return respond(ctx, messages.homeHeader(), buildHomeKeyboard());
    });
    bot.action('account', async (ctx) => {
        await ctx.answerCbQuery();
        return showAccount(ctx);
    });
    bot.action('support', async (ctx) => {
        await ctx.answerCbQuery();
        return showSupport(ctx);
    });

    // Reply-keyboard buttons from earlier versions (still on some users' phones)
    const menu = (key, handler) =>
        bot.hears([MENU[key], LEGACY_MENU[key]].filter(Boolean), (ctx) => {
            stateService.clear(ctx.from.id);
            return handler(ctx);
        });
    menu('products', (ctx) => showShop(ctx, false));
    menu('orders', (ctx) => showOrders(ctx, false));
    menu('topup', (ctx) => showTopupMenu(ctx, false));
    menu('account', showAccount);
    menu('support', showSupport);
};

module.exports.sendWelcome = sendWelcome;
module.exports.sendCustomWelcome = sendCustomWelcome;
module.exports.buildHomeKeyboard = buildHomeKeyboard;
