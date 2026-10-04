const orderService = require('./orderService');
const { h, formatPrice, localDayStart, formatDay } = require('../utils/format');

function revenueLine(label, r) {
    return `${label}: <b>${formatPrice(r.s)}</b> <i>· ${r.c} đơn</i>`;
}

function topList(rows) {
    return rows.map((p, i) => `${i + 1}. ${h(p.name)}\n<i>${p.qty} sản phẩm · ${formatPrice(p.revenue)}</i>`).join('\n');
}

/**
 * Detailed stats message (today / 7 days / 30 days / top products)
 */
function buildStatsMessage() {
    const stats = orderService.getStats();
    const top = orderService.topProducts(localDayStart(29), 5);

    let msg =
        `<b>📊 Thống kê</b>\n\n` +
        `<b>Doanh thu</b>\n` +
        `${revenueLine('Hôm nay', orderService.revenueSince(localDayStart(0)))}\n` +
        `${revenueLine('7 ngày', orderService.revenueSince(localDayStart(6)))}\n` +
        `${revenueLine('30 ngày', orderService.revenueSince(localDayStart(29)))}\n` +
        `Tổng: <b>${formatPrice(stats.totalRevenue)}</b>\n\n` +
        `<b>Vận hành</b>\n` +
        `Chờ thanh toán: ${stats.pendingOrders}\n` +
        `Chờ giao thủ công: ${stats.awaitingDelivery}\n` +
        `Tồn kho: ${stats.totalStock}\n` +
        `Khách hàng: ${stats.totalUsers} <i>(${stats.blockedUsers} đã chặn bot)</i>\n` +
        `Tổng số dư ví khách: ${formatPrice(stats.totalBalance)}`;

    if (top.length) msg += `\n\n<b>Bán chạy 30 ngày</b>\n${topList(top)}`;
    return msg;
}

function buildDailyReport() {
    const today = orderService.revenueSince(localDayStart(0));
    const stats = orderService.getStats();
    const top = orderService.topProducts(localDayStart(0), 3);

    let msg =
        `<b>🗓 Báo cáo ngày ${formatDay(new Date())}</b>\n\n` +
        `Doanh thu: <b>${formatPrice(today.s)}</b>\n` +
        `Số đơn: ${today.c}\n` +
        `Chờ thanh toán: ${stats.pendingOrders} · Chờ giao: ${stats.awaitingDelivery}\n` +
        `Tồn kho: ${stats.totalStock}`;
    if (top.length) msg += `\n\n<b>Bán chạy hôm nay</b>\n${topList(top)}`;
    return msg;
}

module.exports = { buildStatsMessage, buildDailyReport };
