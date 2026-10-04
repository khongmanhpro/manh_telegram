const userService = require('./services/userService');
const { isAdmin } = require('./utils/auth');
const messages = require('./utils/messages');

/**
 * Per-user rate limit (sliding window). Admins are exempt.
 */
function rateLimit({ windowMs = 10000, max = 15 } = {}) {
    const hits = new Map();

    setInterval(() => {
        const cutoff = Date.now() - windowMs;
        for (const [id, times] of hits) {
            if (times[times.length - 1] < cutoff) hits.delete(id);
        }
    }, 60000).unref();

    return async (ctx, next) => {
        const id = ctx.from?.id;
        if (!id || isAdmin(ctx)) return next();

        const now = Date.now();
        const times = (hits.get(id) || []).filter((t) => now - t < windowMs);
        times.push(now);
        hits.set(id, times);

        if (times.length > max) {
            if (times.length === max + 1) {
                if (ctx.callbackQuery) await ctx.answerCbQuery(messages.rateLimited).catch(() => {});
                else await ctx.reply(messages.rateLimited).catch(() => {});
            } else if (ctx.callbackQuery) {
                await ctx.answerCbQuery().catch(() => {});
            }
            return undefined;
        }
        return next();
    };
}

/**
 * Register/refresh users (at most every 10 minutes per user) and clear the
 * "blocked" flag when they come back
 */
function trackUsers({ refreshMs = 10 * 60 * 1000 } = {}) {
    const seen = new Map();
    return (ctx, next) => {
        const from = ctx.from;
        if (from && !from.is_bot && ctx.chat?.type === 'private') {
            const last = seen.get(from.id) || 0;
            if (Date.now() - last > refreshMs) {
                userService.findOrCreate(from);
                seen.set(from.id, Date.now());
            }
        }
        return next();
    };
}

module.exports = { rateLimit, trackUsers };
