const couponService = require('../../services/couponService');
const { adminOnly } = require('../../utils/auth');
const { h, formatPrice, formatDate } = require('../../utils/format');
const { replyLong } = require('../../utils/reply');

const arg = (ctx) => (ctx.payload || '').trim();

function couponLine(c) {
    const value = c.type === 'percent' ? `${c.value}%` : formatPrice(c.value);
    let line = `${c.is_active ? '🟢' : '🔴'} <code>${h(c.code)}</code> — giảm ${value}`;
    line += ` · đã dùng ${c.used_count}${c.max_uses ? `/${c.max_uses}` : ''}`;
    if (c.min_order) line += ` · đơn từ ${formatPrice(c.min_order)}`;
    if (c.expires_at) line += ` · HSD ${formatDate(c.expires_at)}`;
    return line;
}

module.exports = (bot) => {
    // /addcoupon CODE | 10% | maxUses | minOrder | days
    bot.command('addcoupon', adminOnly, (ctx) => {
        const parts = arg(ctx).split('|').map((s) => s.trim());
        if (parts.length < 2 || !parts[0]) {
            return ctx.replyWithHTML(
                `🎟 <b>TẠO MÃ GIẢM GIÁ</b>\n\n` +
                `<code>/addcoupon MÃ | giá trị | số lượt | đơn tối thiểu | số ngày</code>\n\n` +
                `Ví dụ:\n` +
                `<code>/addcoupon SALE10 | 10%</code> — giảm 10%, không giới hạn\n` +
                `<code>/addcoupon GIAM5K | 5000 | 100 | 20000 | 7</code> — giảm 5.000đ, 100 lượt, đơn từ 20.000đ, hạn 7 ngày\n\n` +
                `Mỗi khách chỉ dùng 1 lần / mã.`
            );
        }
        try {
            const coupon = couponService.create({
                code: parts[0],
                value: parts[1],
                maxUses: parseInt(parts[2], 10) || 0,
                minOrder: parseInt((parts[3] || '').replace(/[^\d]/g, ''), 10) || 0,
                days: parseInt(parts[4], 10) || 0,
            });
            return ctx.replyWithHTML(`✅ Đã tạo mã:\n${couponLine(coupon)}`);
        } catch (err) {
            return ctx.reply(`❌ ${err.message}`);
        }
    });

    bot.command('coupons', adminOnly, (ctx) => {
        const list = couponService.list();
        if (list.length === 0) return ctx.reply('Chưa có mã giảm giá nào. Tạo bằng /addcoupon');
        return replyLong(ctx, `🎟 <b>MÃ GIẢM GIÁ</b>\n\n` + list.map(couponLine).join('\n'));
    });

    bot.command('delcoupon', adminOnly, (ctx) => {
        const code = arg(ctx);
        if (!code) return ctx.replyWithHTML('Cách dùng: <code>/delcoupon MÃ</code>');
        return ctx.replyWithHTML(couponService.deactivate(code) ? `✅ Đã tắt mã <code>${h(code.toUpperCase())}</code>` : '❌ Không tìm thấy mã');
    });
};
