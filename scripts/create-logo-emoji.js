#!/usr/bin/env node
/**
 * Create a custom-emoji pack from assets/logos/NN.png (order = scripts/ai-catalog.js),
 * attach each emoji to its category as the button icon, then test-send one icon button
 * to the primary admin. Icons are enabled only if Telegram accepts it (bot owner has Premium).
 *
 *   node scripts/create-logo-emoji.js
 */
const path = require('path');
const fs = require('fs');
const { Telegram } = require('telegraf');
const config = require('../src/config');
const db = require('../src/database');
const settingsService = require('../src/services/settingsService');
const catalog = require('./ai-catalog');

const LOGO_DIR = path.join(__dirname, '..', 'assets', 'logos');
const tg = new Telegram(config.BOT_TOKEN);

// Telegram wants fully-qualified emoji; these default to text style without U+FE0F
const TEXT_DEFAULT = new Set(['🎞', '🖼', '🎙']);
const qualify = (e) => (TEXT_DEFAULT.has(e) ? `${e}️` : e);

async function main() {
    const owner = config.ADMIN_ID;
    if (!owner) throw new Error('ADMIN_IDS chưa cấu hình');
    const me = await tg.getMe();
    const setName = `shop_logos_by_${me.username}`;

    let set = await tg.callApi('getStickerSet', { name: setName }).catch(() => null);
    if (!set) {
        console.log(`Uploading ${catalog.length} logos...`);
        const stickers = [];
        for (const [i, item] of catalog.entries()) {
            const file = path.join(LOGO_DIR, `${String(i + 1).padStart(2, '0')}.png`);
            if (!fs.existsSync(file)) throw new Error(`Thiếu logo: ${file}`);
            const uploaded = await tg.callApi('uploadStickerFile', {
                user_id: owner,
                sticker: { source: fs.createReadStream(file), filename: path.basename(file) },
                sticker_format: 'static',
            });
            stickers.push({ sticker: uploaded.file_id, format: 'static', emoji_list: [qualify(item.emoji)] });
            process.stdout.write('.');
        }
        console.log('\nCreating emoji pack...');
        await tg.callApi('createNewStickerSet', {
            user_id: owner,
            name: setName,
            title: `${config.SHOP_NAME} · Logo`.slice(0, 64),
            sticker_type: 'custom_emoji',
            stickers,
        });
        set = await tg.callApi('getStickerSet', { name: setName });
    } else {
        console.log(`Emoji pack đã tồn tại: ${setName} (${set.stickers.length} emoji)`);
    }

    const ids = set.stickers.map((s) => s.custom_emoji_id);
    const findCategory = db.prepare('SELECT id, name FROM categories WHERE lower(name) = lower(?)');
    const setIcon = db.prepare('UPDATE categories SET icon_emoji_id = ? WHERE id = ?');
    catalog.forEach((item, i) => {
        const cat = findCategory.get(item.name);
        if (cat && ids[i]) setIcon.run(ids[i], cat.id);
    });
    console.log(`Đã gắn ${Math.min(ids.length, catalog.length)} logo vào danh mục.`);
    console.log(`Link bộ emoji: https://t.me/addemoji/${setName}`);

    // Test-send: icons work only if the bot owner has Telegram Premium
    try {
        await tg.sendMessage(owner, '🎨 <b>Kiểm tra logo trên nút</b>\nNếu thấy logo ChatGPT trên nút dưới đây là thành công.', {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[{ text: catalog[0].name, callback_data: 'noop', style: 'success', icon_custom_emoji_id: ids[0] }]],
            },
        });
        settingsService.set('custom_icons', '1');
        console.log('✅ Telegram chấp nhận icon → đã BẬT logo trên nút.');
    } catch (err) {
        settingsService.set('custom_icons', '0');
        console.log(`⚠️ Telegram từ chối icon (${err.description || err.message}) → giữ emoji thường. Cần Telegram Premium cho tài khoản tạo bot.`);
    }
}

main().catch((err) => {
    console.error('❌', err.description || err.message);
    process.exit(1);
});
