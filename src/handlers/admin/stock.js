const { Markup } = require('telegraf');
const productService = require('../../services/productService');
const orderService = require('../../services/orderService');
const stateRouter = require('../stateRouter');
const { adminOnly, adminAction } = require('../../utils/auth');
const { h, formatDate } = require('../../utils/format');
const { replyLong, appendStatus } = require('../../utils/reply');
const messages = require('../../utils/messages');

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const arg = (ctx) => (ctx.payload || '').trim();

async function readTextDocument(ctx) {
    const doc = ctx.message.document;
    if (doc.file_size > MAX_FILE_BYTES) throw new Error('File quá lớn (tối đa 5MB)');
    if (!/\.(txt|csv)$/i.test(doc.file_name || '') && !/^text\//.test(doc.mime_type || '')) {
        throw new Error('Chỉ hỗ trợ file .txt hoặc .csv');
    }
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const res = await fetch(link, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`Tải file thất bại (HTTP ${res.status})`);
    return (await res.text()).replace(/^\uFEFF/, '');
}

/**
 * Read lines from a text message or an uploaded .txt file
 */
async function readLines(ctx) {
    const text = ctx.message.document ? await readTextDocument(ctx) : ctx.message.text;
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function productListText(title, products) {
    return `${title}\n\n` + products.map((p) => `#${p.id} ${h(p.name)} — 📦 ${p.stock_count}`).join('\n');
}

module.exports = (bot) => {
    // /addstock [ID] → then send lines or a .txt file
    bot.command('addstock', adminOnly, (ctx) => {
        const id = parseInt(arg(ctx), 10);
        if (!id) {
            return replyLong(
                ctx,
                productListText(
                    `📦 <b>THÊM TÀI KHOẢN VÀO KHO</b>\n\nCách dùng: <code>/addstock [productID]</code>\nSau đó gửi danh sách (mỗi dòng 1 TK) hoặc file .txt\n\n📋 <b>Sản phẩm:</b>`,
                    productService.getAllForAdmin()
                )
            );
        }
        const product = productService.getById(id);
        if (!product || product.is_deleted) return ctx.reply('❌ Sản phẩm không tồn tại');

        stateRouter.setState(ctx.from.id, { action: 'addstock', productId: id });
        return ctx.replyWithHTML(
            `📦 Thêm tài khoản cho: <b>${h(product.name)}</b>\n` +
            `📊 Kho hiện tại: ${product.stock_count}\n\n` +
            `👇 Gửi danh sách tài khoản (mỗi dòng 1 cái) <b>hoặc file .txt</b>:\n\n` +
            `<i>Ví dụ:</i>\n<code>email1@outlook.com|pass1|chatgpt_pass1</code>\n<code>email2@outlook.com|pass2|chatgpt_pass2</code>\n\n` +
            `Trùng lặp sẽ tự bỏ qua. Gõ /cancel để hủy.`
        );
    });

    stateRouter.register(
        'addstock',
        async (ctx, state) => {
            let lines;
            try {
                lines = await readLines(ctx);
            } catch (err) {
                return ctx.reply(`❌ ${err.message}. Gửi lại hoặc /cancel.`);
            }
            stateRouter.clearState(ctx.from.id);
            if (lines.length === 0) return ctx.reply('❌ Không có dữ liệu.');

            const { added, duplicates } = productService.addStock(state.productId, lines);
            const product = productService.getById(state.productId);
            await ctx.replyWithHTML(
                `✅ <b>Đã thêm ${added} tài khoản!</b>` +
                (duplicates ? `\n⚠️ Bỏ qua ${duplicates} dòng trùng` : '') +
                `\n\n├ Sản phẩm: ${h(product.name)}\n└ 📦 Tồn kho: <b>${product.stock_count}</b>`
            );

            // Orders paid while out of stock can now be delivered
            const waiting = orderService.getAwaitingDelivery().filter((o) => o.product_id === state.productId);
            if (waiting.length) {
                await ctx.replyWithHTML(
                    `📝 Có ${waiting.length} đơn đã thanh toán đang chờ giao cho sản phẩm này:\n` +
                    waiting.map((o) => `• Đơn #${o.id} × ${messages.qtyText(o)} → <code>/confirm ${o.id}</code>`).join('\n')
                );
            }
        },
        { admin: true, accepts: ['text', 'document'] }
    );

    bot.command('viewstock', adminOnly, (ctx) => {
        const id = parseInt(arg(ctx), 10);
        if (!id) {
            return replyLong(ctx, productListText('🏪 <b>TỒN KHO</b>', productService.getAllForAdmin()) + '\n\n💡 Chi tiết: <code>/viewstock [ID]</code>');
        }
        const product = productService.getById(id);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');

        const items = productService.viewUnsold(id, 50);
        if (items.length === 0) return ctx.replyWithHTML(`📦 <b>${h(product.name)}</b>\n\n❌ Kho trống!`);

        let text = `📦 <b>${h(product.name)}</b> — ${product.stock_count} tài khoản\n\n`;
        text += items.map((item, i) => `${i + 1}. <code>${h(item.data)}</code>`).join('\n');
        if (product.stock_count > items.length) text += `\n\n... và ${product.stock_count - items.length} tài khoản khác`;
        return replyLong(ctx, text);
    });

    // /clearstock [ID] — asks for confirmation first
    bot.command('clearstock', adminOnly, (ctx) => {
        const id = parseInt(arg(ctx), 10);
        if (!id) return ctx.replyWithHTML('Cách dùng: <code>/clearstock [productID]</code>');
        const product = productService.getById(id);
        if (!product) return ctx.reply('❌ Sản phẩm không tồn tại');
        if (product.stock_count === 0) return ctx.reply('Kho đã trống.');

        return ctx.replyWithHTML(
            `⚠️ Xóa <b>${product.stock_count}</b> tài khoản chưa bán của <b>${h(product.name)}</b>?\nThao tác không thể hoàn tác.`,
            Markup.inlineKeyboard([
                [Markup.button.callback('🗑️ Xóa', `adm_clear_${id}`), Markup.button.callback('Hủy', 'adm_clear_no')],
            ])
        );
    });

    bot.action(/^adm_clear_(\d+)$/, adminAction, async (ctx) => {
        const removed = productService.clearUnsold(parseInt(ctx.match[1], 10));
        await ctx.answerCbQuery('Đã xóa');
        return appendStatus(ctx, `🗑️ Đã xóa ${removed} tài khoản chưa bán`);
    });

    bot.action('adm_clear_no', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return appendStatus(ctx, '↩️ Đã hủy');
    });

    // /tracuu keyword — find an account (who bought it) or an order by ID / payment code
    bot.command('tracuu', adminOnly, (ctx) => {
        const keyword = arg(ctx);
        if (keyword.length < 3) {
            return ctx.replyWithHTML('Cách dùng: <code>/tracuu [email/tài khoản/mã CK/ID đơn]</code> (tối thiểu 3 ký tự)');
        }

        let text = `🔎 <b>Kết quả cho:</b> <code>${h(keyword)}</code>\n`;
        const order = /^\d+$/.test(keyword)
            ? orderService.getById(parseInt(keyword, 10))
            : orderService.getByPaymentCode(keyword.toUpperCase());
        if (order) {
            text +=
                `\n🧾 <b>Đơn #${order.id}</b> — ${messages.STATUS[order.status] || h(order.status)}\n` +
                `📦 ${h(order.product_name)} × ${messages.qtyText(order)}\n` +
                `👤 ${h(order.user_name || '')} (<code>${order.user_id}</code>)\n` +
                `🔑 <code>${h(order.payment_code || '')}</code> · 📅 ${formatDate(order.created_at)}\n`;
        }

        const rows = productService.searchStock(keyword);
        if (rows.length) {
            text += `\n📦 <b>Tài khoản (${rows.length}):</b>\n`;
            for (const s of rows) {
                text += `\n<code>${h(s.data)}</code>\n└ ${h(s.product_name)} · `;
                text += s.is_sold
                    ? `✅ bán cho <code>${s.sold_to}</code>${s.order_id ? ` (đơn #${s.order_id})` : ''} lúc ${formatDate(s.sold_at)}`
                    : '🟢 chưa bán';
            }
        }

        if (!order && !rows.length) text += '\nKhông tìm thấy.';
        return replyLong(ctx, text);
    });
};
