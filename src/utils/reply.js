const { chunkText, h } = require('./format');

function isNotModified(err) {
    return /message is not modified/i.test(err?.description || err?.message || '');
}

/**
 * Edit the callback message in place when possible, otherwise send a new message.
 */
async function respond(ctx, text, extra = {}, edit = !!ctx.callbackQuery) {
    const opts = { parse_mode: 'HTML', disable_web_page_preview: true, ...extra };
    const msg = ctx.callbackQuery?.message;
    if (edit && msg && msg.text !== undefined && text.length <= 4096) {
        try {
            return await ctx.editMessageText(text, opts);
        } catch (err) {
            if (isNotModified(err)) return null;
        }
    }
    return ctx.reply(text, opts);
}

/**
 * Send a possibly long HTML message in chunks; keyboard goes on the last chunk.
 */
async function replyLong(ctx, text, extra = {}) {
    const chunks = chunkText(text);
    let last = null;
    for (let i = 0; i < chunks.length; i++) {
        const isLast = i === chunks.length - 1;
        last = await ctx.reply(chunks[i], {
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...(isLast ? extra : {}),
        });
    }
    return last;
}

/**
 * Append a status line to the (admin) callback message and remove its buttons
 */
async function appendStatus(ctx, line) {
    const original = ctx.callbackQuery?.message?.text || '';
    try {
        await ctx.editMessageText(`${h(original)}\n\n${line}`, { parse_mode: 'HTML' });
    } catch (err) {
        if (!isNotModified(err)) await ctx.reply(line, { parse_mode: 'HTML' }).catch(() => {});
    }
}

/**
 * Send a payment QR photo (downloaded by us) with an HTML caption.
 * Falls back to a text message with the same payment details if the image is unavailable.
 */
async function sendQrPhoto(ctx, qrUrl, caption, extra = {}) {
    const { fetchQrImage } = require('../services/paymentService');
    const image = await fetchQrImage(qrUrl);
    if (image) {
        try {
            if (caption.length <= 1024) {
                return await ctx.replyWithPhoto({ source: image, filename: 'qr.png' }, { caption, parse_mode: 'HTML', ...extra });
            }
            const photo = await ctx.replyWithPhoto({ source: image, filename: 'qr.png' }, extra);
            await ctx.replyWithHTML(caption);
            return photo;
        } catch {
            /* fall through to text */
        }
    }
    return ctx.replyWithHTML(caption, extra);
}

/**
 * Remove buttons from the callback message, ignoring errors
 */
async function clearButtons(ctx) {
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
}

module.exports = { respond, replyLong, appendStatus, clearButtons, sendQrPhoto, isNotModified };
