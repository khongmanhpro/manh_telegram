const { Markup } = require('telegraf');
const config = require('../../config');
const orderService = require('../../services/orderService');
const warrantyService = require('../../services/warrantyService');
const { adminOnly, adminAction } = require('../../utils/auth');
const { h, formatPrice, localDayStart } = require('../../utils/format');
const { respond } = require('../../utils/reply');

const btn = Markup.button.callback;

// Command reference per section — shown in place instead of one huge list
const SECTIONS = {
    products: {
        title: '📦 Sản phẩm',
        lines: [
            ['/listproduct', 'Danh sách sản phẩm'],
            ['/addproduct catID | tên | giá', 'Thêm sản phẩm'],
            ['/addcategory tên | emoji', 'Thêm danh mục'],
            ['/editprice ID giá', 'Sửa giá'],
            ['/editname ID tên', 'Sửa tên'],
            ['/setcategory ID catID', 'Đổi danh mục'],
            ['/setpromo ID X Y', 'Mua X tặng Y (0 0 để tắt)'],
            ['/setnote ID nội dung', 'Hướng dẫn gửi kèm khi giao'],
            ['/toggleproduct ID', 'Bật / tắt'],
            ['/deleteproduct ID', 'Xóa (giữ lịch sử đơn)'],
            ['/restoreproduct ID', 'Khôi phục'],
            ['/seticon cat ID', 'Icon danh mục (emoji động / thường)'],
            ['/seticon sp ID', 'Icon sản phẩm'],
        ],
        extra: [[btn('📋 Xem danh sách sản phẩm', 'adm_products')]],
    },
    stock: {
        title: '🗃 Kho hàng',
        lines: [
            ['/addstock ID', 'Thêm tài khoản (tin nhắn hoặc file .txt)'],
            ['/viewstock ID', 'Xem kho'],
            ['/clearstock ID', 'Xóa kho chưa bán'],
            ['/tracuu từ khóa', 'Tài khoản đã bán cho ai, tra đơn'],
        ],
    },
    orders: {
        title: '💳 Đơn hàng & tiền',
        lines: [
            ['/pending', 'Đơn chờ thanh toán'],
            ['/awaiting', 'Đơn chờ giao thủ công'],
            ['/confirm ID', 'Xác nhận & giao hàng'],
            ['/cancelorder ID', 'Hủy đơn (tự hoàn số dư)'],
            ['/orders', 'Đơn gần đây'],
            ['/warranty', 'Bảo hành đang mở'],
            ['/addbalance userID số_tiền', 'Cộng / trừ số dư'],
        ],
    },
    promo: {
        title: '🎟 Khuyến mãi',
        lines: [
            ['/addcoupon MÃ | 10% | lượt | đơn tối thiểu | ngày', 'Tạo mã'],
            ['/coupons', 'Danh sách mã'],
            ['/delcoupon MÃ', 'Tắt mã'],
        ],
    },
    settings: {
        title: '⚙️ Cài đặt & báo cáo',
        lines: [
            ['/setbank', 'Ngân hàng nhận tiền'],
            ['/setshop tên | @telegram | zalo | slogan', 'Thông tin shop & liên hệ'],
            ['/setwelcome', 'Soạn lời chào (ảnh banner, emoji động)'],
            ['/sync', 'Đồng bộ Google Sheet'],
            ['/stats', 'Thống kê chi tiết'],
            ['/export số_ngày', 'Xuất CSV đơn hàng'],
            ['/users', 'Danh sách khách'],
            ['/backup', 'Backup database'],
            ['/broadcast', 'Gửi thông báo tới khách'],
        ],
    },
};

function dashboard() {
    const stats = orderService.getStats();
    const today = orderService.revenueSince(localDayStart(0));
    const openClaims = warrantyService.getOpen().length;

    const text =
        `<b>🔧 ${h(config.SHOP_NAME)} · Quản trị</b>\n\n` +
        `Hôm nay: <b>${formatPrice(today.s)}</b> · ${today.c} đơn\n` +
        `Tổng doanh thu: <b>${formatPrice(stats.totalRevenue)}</b>\n` +
        `Khách hàng: ${stats.totalUsers} · Tồn kho: ${stats.totalStock}\n\n` +
        `Chờ thanh toán: <b>${stats.pendingOrders}</b>\n` +
        `Chờ giao thủ công: <b>${stats.awaitingDelivery}</b>\n` +
        `Bảo hành đang mở: <b>${openClaims}</b>\n\n` +
        `<i>Chọn mục để xem lệnh và thao tác.</i>`;

    const keyboard = Markup.inlineKeyboard([
        [btn(`🕐 Chờ thanh toán (${stats.pendingOrders})`, 'adm_pending'), btn(`📝 Chờ giao (${stats.awaitingDelivery})`, 'adm_awaiting')],
        [btn(`🛠 Bảo hành (${openClaims})`, 'adm_warranty'), btn('📊 Thống kê', 'adm_stats')],
        [btn(SECTIONS.products.title, 'adm_s_products'), btn(SECTIONS.stock.title, 'adm_s_stock')],
        [btn(SECTIONS.orders.title, 'adm_s_orders'), btn(SECTIONS.promo.title, 'adm_s_promo')],
        [btn(SECTIONS.settings.title, 'adm_s_settings'), btn('🔄 Sync Sheet', 'adm_sync')],
    ]);
    return { text, keyboard };
}

function sectionView(key) {
    const s = SECTIONS[key];
    const text =
        `<b>${s.title}</b>\n\n` +
        s.lines.map(([cmd, desc]) => `<code>${h(cmd)}</code>\n<i>${h(desc)}</i>`).join('\n\n') +
        `\n\n<i>Chạm vào lệnh để sao chép.</i>`;
    const keyboard = Markup.inlineKeyboard([...(s.extra || []), [btn('‹ Bảng điều khiển', 'adm_home')]]);
    return { text, keyboard };
}

module.exports = (bot) => {
    bot.command('admin', adminOnly, (ctx) => {
        const { text, keyboard } = dashboard();
        return ctx.replyWithHTML(text, keyboard);
    });

    bot.action('adm_home', adminAction, async (ctx) => {
        await ctx.answerCbQuery();
        const { text, keyboard } = dashboard();
        return respond(ctx, text, keyboard);
    });

    bot.action(/^adm_s_(\w+)$/, adminAction, async (ctx) => {
        if (!SECTIONS[ctx.match[1]]) return ctx.answerCbQuery();
        await ctx.answerCbQuery();
        const { text, keyboard } = sectionView(ctx.match[1]);
        return respond(ctx, text, keyboard);
    });
};
