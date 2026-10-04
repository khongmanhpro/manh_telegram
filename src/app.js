const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');
const { rateLimit, trackUsers } = require('./middlewares');
const stateRouter = require('./handlers/stateRouter');
const { notifyAdmins } = require('./services/notifier');
const { h } = require('./utils/format');

/**
 * Build the bot with all middlewares and handlers registered (no network calls)
 */
function createBot(token = config.BOT_TOKEN) {
    const bot = new Telegraf(token, { handlerTimeout: 60000 });

    bot.use(trackUsers());
    bot.use(rateLimit());

    // Error handler: log, tell the user, alert admins (throttled)
    let lastAlert = 0;
    bot.catch(async (err, ctx) => {
        logger.error(`Error for ${ctx.updateType}:`, err);
        if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Đã xảy ra lỗi').catch(() => {});
        else await ctx.reply('❌ Đã xảy ra lỗi. Vui lòng thử lại sau.').catch(() => {});
        if (Date.now() - lastAlert > 60000) {
            lastAlert = Date.now();
            await notifyAdmins(bot, `🚨 <b>Lỗi bot</b> (${h(ctx.updateType)}, user <code>${ctx.from?.id}</code>):\n<code>${h(err.message)}</code>`);
        }
    });

    // Customer commands
    require('./commands/start')(bot);
    require('./commands/product')(bot);
    require('./commands/orders')(bot);
    require('./commands/nap')(bot);

    // Callback flows
    require('./handlers/productSelect')(bot);
    require('./handlers/checkout')(bot);
    require('./handlers/warranty')(bot);
    require('./handlers/admin')(bot);

    // Multi-step input — must be last
    stateRouter.attach(bot);

    return bot;
}

module.exports = { createBot };
