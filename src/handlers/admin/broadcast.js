const { Markup } = require('telegraf');
const userService = require('../../services/userService');
const { isBlockedError } = require('../../services/notifier');
const stateRouter = require('../stateRouter');
const { adminOnly, adminAction } = require('../../utils/auth');
const { sleep } = require('../../utils/format');
const { appendStatus } = require('../../utils/reply');
const logger = require('../../utils/logger');

// Telegram allows ~30 messages/second for bots; stay below it
const DELAY_MS = 40;
let running = false;

/**
 * Send to all non-blocked users. `send(chatId)` performs one delivery.
 * Runs in the background (not awaited by the handler).
 */
async function runBroadcast(bot, adminChatId, send) {
    running = true;
    const ids = userService.getActiveIds();
    let sent = 0;
    let failed = 0;
    let blocked = 0;

    try {
        await bot.telegram.sendMessage(adminChatId, `📢 Đang gửi tới ${ids.length} users...`);
        for (const id of ids) {
            for (let attempt = 0; attempt < 2; attempt++) {
                try {
                    await send(id);
                    sent++;
                    break;
                } catch (err) {
                    const retryAfter = err?.response?.parameters?.retry_after;
                    if (retryAfter && attempt === 0) {
                        await sleep((retryAfter + 1) * 1000);
                        continue;
                    }
                    if (isBlockedError(err)) {
                        userService.setBlocked(id, true);
                        blocked++;
                    } else {
                        failed++;
                    }
                    break;
                }
            }
            await sleep(DELAY_MS);
        }
        await bot.telegram.sendMessage(
            adminChatId,
            `📢 <b>Đã gửi xong!</b>\n├ ✅ Thành công: ${sent}\n├ 🚫 Đã chặn bot: ${blocked}\n└ ❌ Lỗi khác: ${failed}`,
            { parse_mode: 'HTML' }
        );
    } catch (err) {
        logger.error('Broadcast failed:', err);
    } finally {
        running = false;
    }
}

module.exports = (bot) => {
    bot.command('broadcast', adminOnly, async (ctx) => {
        if (running) return ctx.reply('⏳ Đang có một broadcast chạy, vui lòng chờ.');
        const text = (ctx.payload || '').trim();

        if (text) {
            // Inline text (HTML) — validate by sending a preview to the admin first
            try {
                await ctx.replyWithHTML(text);
            } catch (err) {
                return ctx.reply(`❌ HTML không hợp lệ: ${err.description || err.message}`);
            }
            stateRouter.setState(ctx.from.id, { action: 'broadcast_confirm', html: text });
        } else {
            stateRouter.setState(ctx.from.id, { action: 'broadcast' });
            return ctx.replyWithHTML(
                `📢 <b>GỬI THÔNG BÁO</b>\n\n` +
                `Gửi nội dung ngay bây giờ: văn bản, ảnh, video, file... (giữ nguyên định dạng).\n\n` +
                `Gõ /cancel để hủy.`
            );
        }
        return confirmPrompt(ctx);
    });

    function confirmPrompt(ctx) {
        const count = userService.getActiveIds().length;
        return ctx.reply(
            `👆 Xem trước nội dung ở trên. Gửi tới ${count} users?`,
            Markup.inlineKeyboard([[Markup.button.callback(`📢 Gửi tới ${count} users`, 'bc_go'), Markup.button.callback('Hủy', 'bc_cancel')]])
        );
    }

    stateRouter.register(
        'broadcast',
        async (ctx) => {
            stateRouter.setState(ctx.from.id, {
                action: 'broadcast_confirm',
                fromChatId: ctx.chat.id,
                messageId: ctx.message.message_id,
            });
            await ctx.telegram.copyMessage(ctx.chat.id, ctx.chat.id, ctx.message.message_id);
            return confirmPrompt(ctx);
        },
        { admin: true, accepts: ['any'] }
    );

    // Text sent while waiting for confirmation is not valid input
    stateRouter.register('broadcast_confirm', (ctx) => ctx.reply('👆 Bấm nút xác nhận ở trên, hoặc /cancel để hủy.'), {
        admin: true,
        accepts: ['any'],
    });

    bot.action('bc_go', adminAction, async (ctx) => {
        const state = stateRouter.getState(ctx.from.id);
        if (!state || state.action !== 'broadcast_confirm') return ctx.answerCbQuery('⚠️ Phiên đã hết hạn, gửi lại /broadcast');
        if (running) return ctx.answerCbQuery('⏳ Đang có broadcast khác chạy');
        stateRouter.clearState(ctx.from.id);
        await ctx.answerCbQuery('📢 Bắt đầu gửi');
        await appendStatus(ctx, '📢 Đang gửi...');

        const send = state.html
            ? (id) => bot.telegram.sendMessage(id, state.html, { parse_mode: 'HTML', disable_web_page_preview: true })
            : (id) => bot.telegram.copyMessage(id, state.fromChatId, state.messageId);
        runBroadcast(bot, ctx.chat.id, send); // background
        return undefined;
    });

    bot.action('bc_cancel', adminAction, async (ctx) => {
        stateRouter.clearState(ctx.from.id);
        await ctx.answerCbQuery();
        return appendStatus(ctx, '↩️ Đã hủy');
    });
};
