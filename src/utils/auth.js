const config = require('../config');

function isAdmin(ctxOrId) {
    const id = typeof ctxOrId === 'number' ? ctxOrId : ctxOrId?.from?.id;
    return config.ADMIN_IDS.includes(id);
}

/**
 * Middleware for admin-only commands
 */
function adminOnly(ctx, next) {
    if (!isAdmin(ctx)) {
        return ctx.reply('⛔ Bạn không có quyền sử dụng lệnh này.');
    }
    return next();
}

/**
 * Middleware for admin-only callback buttons
 */
function adminAction(ctx, next) {
    if (!isAdmin(ctx)) return ctx.answerCbQuery('⛔ Không có quyền');
    return next();
}

module.exports = { isAdmin, adminOnly, adminAction };
