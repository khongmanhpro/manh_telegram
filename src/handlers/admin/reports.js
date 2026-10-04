const path = require('path');
const orderService = require('../../services/orderService');
const userService = require('../../services/userService');
const { createBackup } = require('../../services/backupService');
const { buildStatsMessage } = require('../../services/reportService');
const { adminOnly, adminAction } = require('../../utils/auth');
const { h, formatPrice, formatDate, localDayStart } = require('../../utils/format');
const { toCSV } = require('../../utils/csv');
const { replyLong } = require('../../utils/reply');
const config = require('../../config');

module.exports = (bot) => {
    bot.command('stats', adminOnly, (ctx) => ctx.replyWithHTML(buildStatsMessage()));
    bot.action('adm_stats', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        return ctx.replyWithHTML(buildStatsMessage());
    });

    // /export [days=30] → CSV of orders
    bot.command('export', adminOnly, async (ctx) => {
        const days = Math.min(Math.max(parseInt(ctx.payload, 10) || 30, 1), 3650);
        const orders = orderService.exportSince(localDayStart(days - 1));
        if (orders.length === 0) return ctx.reply(`Không có đơn nào trong ${days} ngày qua.`);

        const rows = [
            ['ID', 'Ngày tạo', 'Khách ID', 'Tên khách', 'Username', 'Sản phẩm', 'Số lượng', 'Tặng', 'Giảm giá', 'Mã giảm', 'Tổng tiền', 'Đã nhận', 'Thanh toán', 'Ngân hàng', 'Mã CK', 'Trạng thái', 'Thanh toán lúc', 'Giao lúc'],
            ...orders.map((o) => [
                o.id, formatDate(o.created_at), o.user_id, o.user_name || '', o.username || '', o.product_name,
                o.quantity, o.bonus_qty || 0, o.discount || 0, o.coupon_code || '', o.total_price, o.paid_amount || 0,
                o.payment_method, o.bank_name || '', o.payment_code || '', o.status, formatDate(o.paid_at), formatDate(o.delivered_at),
            ]),
        ];
        // BOM so Excel opens UTF-8 correctly
        const csv = Buffer.from('\uFEFF' + toCSV(rows), 'utf8');
        return ctx.replyWithDocument(
            { source: csv, filename: `orders-${days}d-${new Date().toISOString().slice(0, 10)}.csv` },
            { caption: `📄 ${orders.length} đơn hàng trong ${days} ngày` }
        );
    });

    bot.command('users', adminOnly, (ctx) => {
        const users = userService.getRecent(50);
        let text = `👥 <b>USERS GẦN ĐÂY (${users.length})</b>\n\n`;
        text += users
            .map((u) =>
                `${u.is_blocked ? '🚫' : '🆔'} <code>${u.telegram_id}</code> | ${h(u.full_name)}` +
                (u.username ? ` (@${h(u.username)})` : '') +
                `\n  💰 ${formatPrice(u.balance)} | 📅 ${formatDate(u.created_at)}`
            )
            .join('\n\n');
        return replyLong(ctx, text);
    });

    // Manual backup — sent only to the requesting admin
    bot.command('backup', adminOnly, async (ctx) => {
        await ctx.reply('💾 Đang tạo backup...');
        const file = await createBackup();
        return ctx.replyWithDocument(
            { source: file, filename: path.basename(file) },
            { caption: `💾 Backup database (giữ ${config.BACKUP_KEEP} bản gần nhất trên server). File chứa dữ liệu tài khoản — lưu trữ cẩn thận.` }
        );
    });
};
