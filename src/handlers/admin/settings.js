const config = require('../../config');
const settingsService = require('../../services/settingsService');
const { syncFromSheet, SYNC_INTERVAL } = require('../../services/sheetSync');
const { adminOnly, adminAction } = require('../../utils/auth');
const { Markup } = require('telegraf');
const productService = require('../../services/productService');
const stateRouter = require('../stateRouter');
const { h } = require('../../utils/format');
const { firstCustomEmojiId } = require('../../utils/entities');
const { styled } = require('../../utils/keyboard');
const { sendCustomWelcome, buildHomeKeyboard } = require('../../commands/start');

const arg = (ctx) => (ctx.payload || '').trim();

function bankText(label, bank) {
    if (!bank) return `🏦 <b>${label}:</b> (tắt)`;
    return (
        `🏦 <b>${label}:</b>\n` +
        `├ Ngân hàng: <b>${h(bank.NAME)}</b>\n` +
        `├ BIN: <code>${h(bank.BIN)}</code>\n` +
        `├ Số TK: <code>${h(bank.ACCOUNT)}</code>\n` +
        `└ Chủ TK: <b>${h(bank.ACCOUNT_NAME)}</b>`
    );
}

module.exports = (bot) => {
    // /setbank [1|2] BIN | STK | TÊN CHỦ TK | TÊN NH   ·   /setbank 2 off
    bot.command('setbank', adminOnly, (ctx) => {
        const m = arg(ctx).match(/^([12])\s+([\s\S]+)$/);
        if (!m) {
            return ctx.replyWithHTML(
                `${bankText('Ngân hàng 1', config.BANK)}\n\n${bankText('Ngân hàng 2', config.BANK2)}\n\n` +
                `✏️ Sửa: <code>/setbank 1 BIN | SốTK | TÊN CHỦ TK | TênNH</code>\n` +
                `Ví dụ: <code>/setbank 1 970422 | 0123456789 | NGUYEN VAN A | MB</code>\n` +
                `Tắt NH 2: <code>/setbank 2 off</code>\n` +
                `🔎 Tra BIN: vietqr.io/danh-sach-ngan-hang`
            );
        }

        const index = parseInt(m[1], 10);
        if (index === 2 && m[2].trim().toLowerCase() === 'off') {
            settingsService.setBank(2, null);
            return ctx.reply('✅ Đã tắt ngân hàng 2.');
        }

        const [bin, account, name, bankName] = m[2].split('|').map((s) => s.trim());
        if (!/^\d{6}$/.test(bin || '')) return ctx.reply('❌ BIN phải gồm 6 chữ số.');
        if (!/^[0-9A-Za-z]{4,30}$/.test(account || '')) return ctx.reply('❌ Số tài khoản không hợp lệ.');
        if (!name || !bankName) return ctx.reply('❌ Thiếu tên chủ tài khoản hoặc tên ngân hàng.');

        const bank = { BIN: bin, ACCOUNT: account, ACCOUNT_NAME: name.toUpperCase(), NAME: bankName };
        settingsService.setBank(index, bank);
        return ctx.replyWithHTML(`✅ Đã cập nhật:\n\n${bankText(`Ngân hàng ${index}`, bank)}`);
    });

    // /setshop tên | @telegram | zalo | slogan  (bỏ trống = giữ nguyên, "-" = xóa)
    bot.command('setshop', adminOnly, (ctx) => {
        const text = arg(ctx);
        if (!text) {
            return ctx.replyWithHTML(
                `<b>🏪 Thông tin shop</b>\n\n` +
                `Tên: <b>${h(config.SHOP_NAME)}</b>\n` +
                `Telegram hỗ trợ: ${h(config.SUPPORT_CONTACT) || '<i>chưa có</i>'}\n` +
                `Zalo: ${h(config.SUPPORT_ZALO) || '<i>chưa có</i>'}\n` +
                `Slogan: ${h(config.SHOP_TAGLINE) || '<i>chưa có</i>'}\n\n` +
                `<b>Sửa</b>\n<code>/setshop Tên shop | @telegram | 0987654321 | Slogan</code>\n` +
                `<i>Bỏ trống một mục để giữ nguyên, gõ "-" để xóa.</i>`
            );
        }
        const parts = text.split('|').map((s) => s.trim());
        const pick = (i) => (parts[i] === undefined || parts[i] === '' ? undefined : parts[i] === '-' ? '' : parts[i]);
        const name = pick(0);
        if (name === '') return ctx.reply('Tên shop không được để trống.');
        settingsService.setShop({ name, support: pick(1), zalo: pick(2), tagline: pick(3) });
        return ctx.replyWithHTML(
            `<b>✅ Đã cập nhật thông tin shop</b>\n\n` +
            `Tên: <b>${h(config.SHOP_NAME)}</b>\nTelegram: ${h(config.SUPPORT_CONTACT)}\nZalo: ${h(config.SUPPORT_ZALO)}\nSlogan: ${h(config.SHOP_TAGLINE)}\n\n` +
            `<i>Gõ /start để xem lời chào mới.</i>`
        );
    });

    // /setwelcome — admin composes the welcome directly in Telegram (custom emoji, bold, banner photo...)
    bot.command('setwelcome', adminOnly, async (ctx) => {
        if (arg(ctx).toLowerCase() === 'reset') {
            settingsService.setWelcome(null);
            return ctx.replyWithHTML('<b>✅ Đã khôi phục lời chào mặc định.</b> Gõ /start để xem.');
        }
        stateRouter.setState(ctx.from.id, { action: 'set_welcome' });
        return ctx.replyWithHTML(
            `<b>✨ Soạn lời chào</b>\n\n` +
            `Gửi tin nhắn lời chào ngay bây giờ. Có thể:\n` +
            `• Kèm <b>ảnh banner</b> (gửi ảnh + chú thích)\n` +
            `• Dùng <b>emoji động</b>, in đậm, nghiêng, link...\n` +
            `• <code>{name}</code> = tên khách · <code>{shop}</code> = tên shop\n\n` +
            `<blockquote>Emoji động chỉ hiển thị khi tài khoản tạo bot có Telegram Premium.</blockquote>\n\n` +
            `<i>Khôi phục mặc định: /setwelcome reset · Hủy: /cancel</i>`
        );
    });

    stateRouter.register(
        'set_welcome',
        async (ctx) => {
            const msg = ctx.message;
            let welcome;
            if (msg.photo) {
                welcome = { kind: 'photo', fileId: msg.photo[msg.photo.length - 1].file_id, text: msg.caption || '', entities: msg.caption_entities || [] };
            } else if (msg.text) {
                welcome = { kind: 'text', text: msg.text, entities: msg.entities || [] };
            } else {
                return ctx.reply('Chỉ hỗ trợ văn bản hoặc ảnh kèm chú thích. Gửi lại hoặc /cancel.');
            }

            stateRouter.clearState(ctx.from.id);
            const previous = settingsService.getWelcome();
            settingsService.setWelcome(welcome);

            await ctx.replyWithHTML('<b>Xem trước:</b>');
            const sent = await sendCustomWelcome(ctx, buildHomeKeyboard());
            if (!sent) {
                settingsService.setWelcome(previous);
                return ctx.replyWithHTML(
                    `<b>⚠️ Không gửi được lời chào này</b>\n\n` +
                    `Thường do dùng <b>emoji động</b> trong khi tài khoản tạo bot chưa có Telegram Premium. ` +
                    `Bỏ emoji động rồi gửi lại /setwelcome. Lời chào cũ được giữ nguyên.`
                );
            }
            return ctx.replyWithHTML('<b>✅ Đã lưu lời chào mới.</b> Khách gõ /start sẽ thấy như trên.');
        },
        { admin: true, accepts: ['any'] }
    );

    // /seticon cat|sp ID — set a custom emoji icon (Premium) or a normal emoji for a button
    bot.command('seticon', adminOnly, (ctx) => {
        const m = arg(ctx).match(/^(cat|sp)\s+(\d+)(?:\s+(off))?$/i);
        if (!m) {
            const cats = productService.getCategories().map((c) => `<code>/seticon cat ${c.id}</code> · ${h(c.emoji || '')} ${h(c.name)}`).join('\n');
            return ctx.replyWithHTML(
                `<b>🎨 Icon cho nút</b>\n\n` +
                `<code>/seticon cat ID</code> — icon danh mục\n` +
                `<code>/seticon sp ID</code> — icon sản phẩm\n` +
                `<code>/seticon cat ID off</code> — bỏ icon động\n\n` +
                `Sau đó gửi <b>1 emoji</b>: emoji động (logo ChatGPT, Canva...) hoặc emoji thường.\n` +
                `<blockquote>Emoji động trên nút cần tài khoản tạo bot có Telegram Premium.</blockquote>\n\n` +
                `<b>Danh mục</b>\n${cats || '<i>chưa có</i>'}`
            );
        }

        const kind = m[1].toLowerCase();
        const id = parseInt(m[2], 10);
        const target = kind === 'cat' ? productService.getCategory(id) : productService.getById(id);
        if (!target) return ctx.reply(kind === 'cat' ? 'Danh mục không tồn tại.' : 'Sản phẩm không tồn tại.');

        if (m[3]) {
            if (kind === 'cat') productService.updateCategory(id, { icon_emoji_id: null });
            else productService.update(id, { icon_emoji_id: null });
            return ctx.replyWithHTML(`<b>✅ Đã bỏ icon động</b> của ${h(target.name)}`);
        }

        stateRouter.setState(ctx.from.id, { action: 'set_icon', kind, id });
        return ctx.replyWithHTML(`Gửi <b>1 emoji</b> làm icon cho <b>${h(target.name)}</b>.\n\n<i>Gõ /cancel để hủy.</i>`);
    });

    stateRouter.register(
        'set_icon',
        async (ctx, state) => {
            const isCat = state.kind === 'cat';
            const target = isCat ? productService.getCategory(state.id) : productService.getById(state.id);
            if (!target) {
                stateRouter.clearState(ctx.from.id);
                return ctx.reply('Không còn tồn tại.');
            }
            const save = (fields) => (isCat ? productService.updateCategory(state.id, fields) : productService.update(state.id, fields));

            const customId = firstCustomEmojiId(ctx.message);
            if (customId) {
                try {
                    // Test-send first: fails if the bot owner has no Premium
                    await ctx.reply('Xem thử nút:', Markup.inlineKeyboard([[styled(Markup.button.callback(target.name, 'noop'), 'success', customId)]]));
                } catch (err) {
                    stateRouter.clearState(ctx.from.id);
                    return ctx.replyWithHTML(
                        `<b>⚠️ Không dùng được emoji động</b>\n\n` +
                        `Telegram báo: <code>${h(err.description || err.message)}</code>\n` +
                        `Tài khoản tạo bot cần có <b>Telegram Premium</b>. Bạn vẫn có thể dùng emoji thường.`
                    );
                }
                stateRouter.clearState(ctx.from.id);
                save({ icon_emoji_id: customId });
                settingsService.set('custom_icons', '1'); // owner has Premium → enable icons everywhere
                return ctx.replyWithHTML(`<b>✅ Đã đặt icon động</b> cho ${h(target.name)}`);
            }

            const emoji = (ctx.message.text || '').trim();
            if (!emoji || emoji.length > 8 || /[\p{L}\p{N}]/u.test(emoji)) {
                return ctx.reply('Hãy gửi đúng 1 emoji (hoặc /cancel).');
            }
            stateRouter.clearState(ctx.from.id);
            save({ emoji, icon_emoji_id: null });
            return ctx.replyWithHTML(`<b>✅ Đã đặt icon</b> ${h(emoji)} cho ${h(target.name)}`);
        },
        { admin: true, accepts: ['text'] }
    );

    bot.action('noop', (ctx) => ctx.answerCbQuery());

    async function runSync(ctx) {
        if (!config.GOOGLE_SHEET_ID) {
            return ctx.replyWithHTML(
                `❌ <b>Chưa cài đặt Google Sheet!</b>\n\n` +
                `1. Mở Google Sheet → Chia sẻ → "Bất kỳ ai có đường liên kết"\n` +
                `2. Copy Sheet ID từ URL:\n<code>docs.google.com/spreadsheets/d/[SHEET_ID]/edit</code>\n` +
                `3. Thêm vào .env: <code>GOOGLE_SHEET_ID=...</code>\n` +
                `4. Restart bot`
            );
        }
        await ctx.reply('🔄 Đang đồng bộ từ Google Sheet...');
        const result = await syncFromSheet();
        if (result && !result.error) {
            return ctx.replyWithHTML(
                `✅ <b>Đồng bộ thành công!</b>\n\n` +
                `├ ✏️ Cập nhật: ${result.updated}\n` +
                `├ ➕ Thêm mới: ${result.added}\n` +
                `├ 🔴 Tắt (không còn trong sheet): ${result.deactivated}\n` +
                `└ 📊 Tổng: ${result.total}\n\n` +
                `🔄 Tự động sync mỗi ${SYNC_INTERVAL} phút`
            );
        }
        return ctx.replyWithHTML(`❌ Lỗi sync: ${h(result?.error || 'Unknown error')}`);
    }

    bot.command('sync', adminOnly, runSync);
    bot.action('adm_sync', adminAction, async (ctx) => {
        await ctx.answerCbQuery('🔄 Đang sync...');
        return runSync(ctx);
    });
};
