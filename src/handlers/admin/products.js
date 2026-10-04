const productService = require('../../services/productService');
const { adminOnly, adminAction } = require('../../utils/auth');
const { h, formatPrice } = require('../../utils/format');
const { replyLong } = require('../../utils/reply');

const arg = (ctx) => (ctx.payload || '').trim();

function showProductList(ctx) {
    const products = productService.getAllForAdmin();
    if (products.length === 0) return ctx.reply('❌ Chưa có sản phẩm nào.');

    let text = `📦 <b>TẤT CẢ SẢN PHẨM (${products.length})</b>\n`;
    let currentCat;
    for (const p of products) {
        if (p.category_id !== currentCat) {
            currentCat = p.category_id;
            text += `\n${h(p.cat_emoji || '📂')} <b>${h(p.cat_name || 'Chưa phân loại')}</b>\n`;
        }
        let line = `${p.is_active ? '🟢' : '🔴'} <b>ID:${p.id}</b> | ${h(p.name)} | ${formatPrice(p.price)}`;
        line += ` | 📦 ${p.stock_count}`;
        if (p.sheet_stock) line += ` (sheet ${p.sheet_stock})`;
        if (p.reserved) line += ` | 🔒 ${p.reserved}`;
        if (p.contact_only) line += ' | 💬';
        if (p.bonus_buy > 0) line += ` | 🎁 ${p.bonus_buy}+${p.bonus_free}`;
        text += line + '\n';
    }
    text +=
        `\n━━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `🟢 đang bán · 🔴 tắt · 📦 kho thật · 🔒 đang giữ cho đơn chờ · 💬 liên hệ`;
    return replyLong(ctx, text);
}

/**
 * Parse "/cmd <id> <rest>" → { id, rest, product }
 */
function parseIdArg(ctx) {
    const m = arg(ctx).match(/^(\d+)(?:\s+([\s\S]+))?$/);
    if (!m) return {};
    const id = parseInt(m[1], 10);
    return { id, rest: (m[2] || '').trim(), product: productService.getById(id) };
}

module.exports = (bot) => {
    bot.command('listproduct', adminOnly, showProductList);
    bot.action('adm_products', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return showProductList(ctx);
    });

    // /addproduct catID | tên | giá
    bot.command('addproduct', adminOnly, (ctx) => {
        const parts = arg(ctx).split('|').map((s) => s.trim());
        if (parts.length < 3 || !parts[1]) {
            const catList = productService.getCategories().map((c) => `  ${c.id}. ${h(c.emoji)} ${h(c.name)}`).join('\n');
            return ctx.replyWithHTML(
                `➕ <b>THÊM SẢN PHẨM</b>\n\n` +
                `Cách dùng:\n<code>/addproduct catID | tên | giá</code>\n\n` +
                `Ví dụ:\n<code>/addproduct 1 | ChatGPT Plus 3 tháng | 20000</code>\n\n` +
                `📂 <b>Danh mục:</b>\n${catList || '(chưa có)'}\n\n` +
                `💡 Thêm danh mục: <code>/addcategory tên | emoji</code>`
            );
        }

        const catId = parseInt(parts[0], 10);
        const price = parseInt(parts[2].replace(/[^\d]/g, ''), 10);
        if (!productService.getCategory(catId)) return ctx.reply('❌ Danh mục không tồn tại.');
        if (!Number.isFinite(price) || price <= 0) return ctx.reply('❌ Giá phải là số dương.');

        const id = productService.addProduct(catId, parts[1], price);
        return ctx.replyWithHTML(
            `✅ Đã thêm sản phẩm:\n` +
            `├ ID: <b>#${id}</b>\n` +
            `├ Tên: ${h(parts[1])}\n` +
            `├ Giá: ${formatPrice(price)}\n` +
            `└ Danh mục: #${catId}\n\n` +
            `👉 Thêm kho: <code>/addstock ${id}</code>`
        );
    });

    // /addcategory tên | emoji
    bot.command('addcategory', adminOnly, (ctx) => {
        const [name, emoji] = arg(ctx).split('|').map((s) => s.trim());
        if (!name) {
            return ctx.replyWithHTML('Cách dùng: <code>/addcategory tên | emoji</code>\nVí dụ: <code>/addcategory Netflix | 🎬</code>');
        }
        const id = productService.addCategory(name, emoji || '📦');
        return ctx.replyWithHTML(`✅ Đã thêm danh mục #${id}: ${h(emoji || '📦')} ${h(name)}`);
    });

    bot.command('editprice', adminOnly, (ctx) => {
        const { id, rest, product } = parseIdArg(ctx);
        const price = parseInt((rest || '').replace(/[^\d]/g, ''), 10);
        if (!id || !Number.isFinite(price) || price <= 0) {
            return ctx.replyWithHTML('Cách dùng: <code>/editprice [productID] [giá mới]</code>\nVí dụ: <code>/editprice 1 10000</code>');
        }
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        productService.update(id, { price });
        return ctx.replyWithHTML(
            `✅ Đã cập nhật giá:\n├ Sản phẩm: ${h(product.name)}\n├ Giá cũ: ${formatPrice(product.price)}\n└ Giá mới: <b>${formatPrice(price)}</b>`
        );
    });

    bot.command('editname', adminOnly, (ctx) => {
        const { id, rest, product } = parseIdArg(ctx);
        if (!id || !rest) {
            return ctx.replyWithHTML('Cách dùng: <code>/editname [productID] [tên mới]</code>');
        }
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        productService.update(id, { name: rest });
        return ctx.replyWithHTML(`✅ Đã đổi tên:\n├ Cũ: ${h(product.name)}\n└ Mới: <b>${h(rest)}</b>`);
    });

    bot.command('setcategory', adminOnly, (ctx) => {
        const { id, rest, product } = parseIdArg(ctx);
        const catId = parseInt(rest, 10);
        if (!id || !Number.isFinite(catId)) return ctx.replyWithHTML('Cách dùng: <code>/setcategory [productID] [catID]</code>');
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        const cat = productService.getCategory(catId);
        if (!cat) return ctx.reply('❌ Danh mục không tồn tại');
        productService.update(id, { category_id: catId });
        return ctx.replyWithHTML(`✅ ${h(product.name)} → ${h(cat.emoji)} ${h(cat.name)}`);
    });

    // /setpromo ID X Y — "Mua X tặng Y" (0 0 để tắt)
    bot.command('setpromo', adminOnly, (ctx) => {
        const { id, rest, product } = parseIdArg(ctx);
        const [buy, free] = (rest || '').split(/\s+/).map((n) => parseInt(n, 10));
        if (!id || !Number.isFinite(buy) || !Number.isFinite(free) || buy < 0 || free < 0) {
            return ctx.replyWithHTML('Cách dùng: <code>/setpromo [productID] [mua] [tặng]</code>\nVí dụ: <code>/setpromo 1 10 2</code> (mua 10 tặng 2)\nTắt: <code>/setpromo 1 0 0</code>');
        }
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        const on = buy > 0 && free > 0;
        productService.update(id, { bonus_buy: on ? buy : 0, bonus_free: on ? free : 0 });
        return ctx.replyWithHTML(on ? `✅ ${h(product.name)}: 🎁 Mua ${buy} tặng ${free}` : `✅ Đã tắt khuyến mãi cho ${h(product.name)}`);
    });

    // /setnote ID text — "-" = không hiển thị, "default" = dùng mặc định
    bot.command('setnote', adminOnly, (ctx) => {
        const { id, rest, product } = parseIdArg(ctx);
        if (!id || !rest) {
            return ctx.replyWithHTML(
                'Cách dùng: <code>/setnote [productID] [hướng dẫn]</code>\n' +
                '<code>-</code> = không hiển thị · <code>default</code> = dùng hướng dẫn mặc định'
            );
        }
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        const note = rest === 'default' ? null : rest === '-' ? '' : rest;
        productService.update(id, { delivery_note: note });
        return ctx.replyWithHTML(`✅ Đã cập nhật hướng dẫn giao hàng cho <b>${h(product.name)}</b>`);
    });

    bot.command('toggleproduct', adminOnly, (ctx) => {
        const { id, product } = parseIdArg(ctx);
        if (!id) return ctx.replyWithHTML('Cách dùng: <code>/toggleproduct [productID]</code>');
        if (!product || product.is_deleted) return ctx.reply('❌ Sản phẩm không tồn tại');
        const next = product.is_active ? 0 : 1;
        productService.update(id, { is_active: next });
        return ctx.replyWithHTML(`✅ Sản phẩm <b>${h(product.name)}</b>: ${next ? '🟢 Đã BẬT' : '🔴 Đã TẮT'}`);
    });

    // Soft delete: keeps order history & sold stock intact
    bot.command('deleteproduct', adminOnly, (ctx) => {
        const { id, product } = parseIdArg(ctx);
        if (!id) return ctx.replyWithHTML('Cách dùng: <code>/deleteproduct [productID]</code>');
        if (!product || product.is_deleted) return ctx.reply('❌ Sản phẩm không tồn tại');
        productService.update(id, { is_deleted: 1, is_active: 0 });
        return ctx.replyWithHTML(
            `🗑️ Đã xóa sản phẩm: <b>${h(product.name)}</b>\n` +
            `Lịch sử đơn được giữ nguyên. Kho chưa bán: ${product.stock_count} (xóa bằng <code>/clearstock ${id}</code>)\n` +
            `Khôi phục: <code>/restoreproduct ${id}</code>`
        );
    });

    bot.command('restoreproduct', adminOnly, (ctx) => {
        const { id, product } = parseIdArg(ctx);
        if (!id) return ctx.replyWithHTML('Cách dùng: <code>/restoreproduct [productID]</code>');
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        productService.update(id, { is_deleted: 0, is_active: 1 });
        return ctx.replyWithHTML(`♻️ Đã khôi phục: <b>${h(product.name)}</b>`);
    });
};
