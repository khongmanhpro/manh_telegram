const stateService = require('../services/stateService');
const { isAdmin } = require('../utils/auth');
const logger = require('../utils/logger');

// action -> { handler(ctx, state), admin, accepts: ['text' | 'document' | 'any'] }
const routes = new Map();

/**
 * Register a handler for a multi-step input state
 */
function register(action, handler, { admin = false, accepts = ['text'] } = {}) {
    routes.set(action, { handler, admin, accepts });
}

function setState(userId, state) {
    stateService.set(userId, state);
}

function getState(userId) {
    return stateService.get(userId);
}

function clearState(userId) {
    return stateService.clear(userId);
}

function messageKind(msg) {
    if (msg.text !== undefined) return 'text';
    if (msg.document) return 'document';
    return 'other';
}

/**
 * Must be registered after all commands so /commands are handled first
 */
function attach(bot) {
    bot.command('cancel', async (ctx) => {
        const cleared = clearState(ctx.from.id);
        await ctx.reply(cleared ? '❌ Đã hủy thao tác.' : 'Không có thao tác nào đang chờ.');
    });

    bot.on('message', async (ctx, next) => {
        if (ctx.chat?.type !== 'private') return next();
        if (ctx.message.text?.startsWith('/')) return next();

        const state = stateService.get(ctx.from.id);
        if (!state) return next();

        const route = routes.get(state.action);
        if (!route || (route.admin && !isAdmin(ctx))) {
            clearState(ctx.from.id);
            return next();
        }

        const kind = messageKind(ctx.message);
        if (!route.accepts.includes('any') && !route.accepts.includes(kind)) {
            return ctx.reply('⚠️ Nội dung không hợp lệ cho thao tác này. Gửi lại hoặc gõ /cancel để hủy.');
        }

        try {
            await route.handler(ctx, state);
        } catch (err) {
            logger.error(`State handler "${state.action}" failed:`, err);
            clearState(ctx.from.id);
            await ctx.reply('❌ Đã xảy ra lỗi, thao tác đã được hủy.').catch(() => {});
        }
    });
}

module.exports = { register, setState, getState, clearState, attach };
