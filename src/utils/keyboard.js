const { Markup } = require('telegraf');
const config = require('../config');
const { formatPrice, truncate } = require('./format');
const { STATUS_EMOJI, stockLabel, priceLabel } = require('./messages');

const btn = Markup.button.callback;
const url = Markup.button.url;

// Button rules: short labels (mobile shows ~30 chars), one leading icon at most,
// navigation ("‹ Quay lại", "Hủy") always on the last row.
const NAME_MAX = 26;

/**
 * Split buttons into rows of `size`
 */
function grid(buttons, size) {
    const rows = [];
    for (let i = 0; i < buttons.length; i += size) rows.push(buttons.slice(i, i + size));
    return rows;
}

/**
 * Add Bot API button color ("success" green, "primary" blue, "danger" red)
 * and an optional custom emoji icon (needs a Premium bot owner).
 */
function styled(button, style, iconEmojiId) {
    const b = { ...button };
    if (style) b.style = style;
    if (iconEmojiId && iconsEnabled()) b.icon_custom_emoji_id = iconEmojiId;
    return b;
}

/**
 * Custom emoji icons only work when the bot owner has Telegram Premium; they are
 * enabled after a successful test-send (/seticon) so a failure never breaks menus.
 */
function iconsEnabled() {
    return require('../services/settingsService').get('custom_icons') === '1';
}

function hasIcon(item) {
    return !!(item.icon_emoji_id && iconsEnabled());
}

// Green = can buy now, blue = contact to buy, red = sold out
function availabilityStyle({ available, contact }) {
    if (available > 0) return 'success';
    if (contact > 0) return 'primary';
    return 'danger';
}

function productStyle(p) {
    return availabilityStyle({ available: p.display_stock > 0 ? 1 : 0, contact: p.contact_only ? 1 : 0 });
}

function supportUrl() {
    const username = String(config.SUPPORT_CONTACT || '').replace(/^@/, '');
    return /^[A-Za-z0-9_]{5,32}$/.test(username) ? `https://t.me/${username}` : null;
}

function zaloUrl(value = config.SUPPORT_ZALO) {
    const v = String(value || '').trim();
    if (/^https?:\/\//i.test(v)) return v;
    const digits = v.replace(/[^\d]/g, '');
    return digits.length >= 9 ? `https://zalo.me/${digits}` : null;
}

// Bottom navigation shared by home / shop screens
function navRows() {
    return [
        [btn('🧾 Đơn hàng', 'my_orders'), btn('👛 Nạp tiền', 'topup_menu')],
        [btn('👤 Tài khoản', 'account'), btn('💬 Hỗ trợ', 'support')],
    ];
}

/**
 * Columns that keep labels readable on phones (3 columns cut off around 10 chars)
 */
/**
 * Approximate on-screen width: emoji ≈ 2 letters, joiners/variation selectors ≈ 0
 */
function visualWidth(label) {
    let w = 0;
    for (const ch of String(label)) {
        if (ch === '\u200d' || ch === '\ufe0f') continue;
        w += /\p{Extended_Pictographic}/u.test(ch) ? 2 : 1;
    }
    return w;
}

// Max buttons per row a label allows (3 columns cut off around 13 letters on phones)
function capacityFor(label, iconExtra = 0) {
    const w = visualWidth(label) + iconExtra;
    if (w <= 13) return 3;
    if (w <= 20) return 2;
    return 1;
}

/**
 * Pack buttons in order: short labels 3 per row, longer ones 2 per row, very long alone
 */
function packRows(buttons, capacities) {
    const rows = [];
    let row = [];
    let cap = 3;
    buttons.forEach((b, i) => {
        const nextCap = Math.min(cap, capacities[i]);
        if (row.length > 0 && row.length >= nextCap) {
            rows.push(row);
            row = [];
            cap = 3;
        }
        row.push(b);
        cap = Math.min(row.length === 1 ? 3 : cap, capacities[i]);
    });
    if (row.length) rows.push(row);
    return rows;
}

function productRows(products) {
    return products.map((p) => {
        const right = p.display_stock > 0 ? priceLabel(p) : stockLabel(p);
        const name = hasIcon(p) ? p.name : `${p.emoji && p.emoji !== '📦' ? `${p.emoji} ` : ''}${p.name}`;
        return [styled(btn(`${truncate(name, NAME_MAX)} · ${right}`, `product_${p.id}`), productStyle(p), p.icon_emoji_id)];
    });
}

function productListKeyboard(products, { backToCategories = false } = {}) {
    const rows = productRows(products);
    rows.push(backToCategories ? [btn('‹ Danh mục', 'categories'), btn('↻ Làm mới', 'refresh_products')] : [btn('↻ Làm mới', 'refresh_products')]);
    return Markup.inlineKeyboard(rows);
}

function categoryRows(categories) {
    const labels = categories.map((c) => (hasIcon(c) ? c.name : `${c.emoji || '📂'} ${c.name}`));
    const capacities = categories.map((c, i) => capacityFor(labels[i], hasIcon(c) ? 2 : 0));
    const buttons = categories.map((c, i) => styled(btn(truncate(labels[i], 24), `cat_${c.id}`), availabilityStyle(c), c.icon_emoji_id));
    return packRows(buttons, capacities);
}

function categoryKeyboard(categories) {
    return Markup.inlineKeyboard([...categoryRows(categories), [btn('↻ Làm mới', 'refresh_products')]]);
}

/**
 * Home screen: the shop (categories or products) right away + navigation
 */
function homeKeyboard({ categories, products }) {
    const shop = categories.length > 1 ? categoryRows(categories) : productRows(products);
    return Markup.inlineKeyboard([...shop, [btn('↻ Làm mới', 'home_refresh')], ...navRows()]);
}

function quantityKeyboard(productId, maxQty) {
    const quick = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((n) => n <= maxQty);
    const rows = grid(quick.map((n) => btn(`${n}`, `qty_${productId}_${n}`)), 5);
    if (maxQty > 10) rows.push([btn('Số lượng khác…', `qtyc_${productId}`)]);
    rows.push([btn('‹ Quay lại', 'refresh_products')]);
    return Markup.inlineKeyboard(rows);
}

function contactKeyboard(product) {
    const rows = [];
    const support = supportUrl();
    if (support) rows.push([styled(url('💬 Liên hệ mua qua Telegram', support), 'success')]);
    const zalo = product.contact_url && /^https?:\/\//i.test(product.contact_url) ? product.contact_url : zaloUrl();
    if (zalo) rows.push([styled(url('📱 Liên hệ qua Zalo', zalo), 'primary')]);
    rows.push([btn('‹ Quay lại', 'refresh_products')]);
    return Markup.inlineKeyboard(rows);
}

/**
 * Checkout options. Coupon code (or "-") is embedded in callback data so old buttons stay valid.
 */
function checkoutKeyboard({ productId, quantity, couponCode, total, balance, banks }) {
    const c = couponCode || '-';
    const rows = [];
    if (total > 0) {
        const label = (b) => (banks.length > 1 ? `🏦 Chuyển khoản · ${b.NAME}` : '🏦 Chuyển khoản (QR)');
        banks.forEach((b, i) => rows.push([styled(btn(label(b), `pq_${productId}_${quantity}_${b.index ?? i}_${c}`), 'success')]));
    }
    if (balance >= total) {
        rows.push([styled(btn(total > 0 ? '👛 Thanh toán bằng số dư' : '🎁 Nhận miễn phí', `pb_${productId}_${quantity}_${c}`), 'primary')]);
    }
    rows.push([
        couponCode ? btn(`Bỏ mã ${couponCode}`, `qty_${productId}_${quantity}`) : btn('🎟 Mã giảm giá', `cp_${productId}_${quantity}`),
    ]);
    rows.push([btn('‹ Quay lại', `product_${productId}`), styled(btn('Hủy', 'cancel_order'), 'danger')]);
    return Markup.inlineKeyboard(rows);
}

function qrPaymentKeyboard(orderId) {
    return Markup.inlineKeyboard([[btn('🧾 Xem đơn', `ov_${orderId}`), styled(btn('Hủy đơn', `cancel_order_${orderId}`), 'danger')]]);
}

function postDeliveryKeyboard(orderId) {
    return Markup.inlineKeyboard([
        [btn('🛠 Báo lỗi / Bảo hành', `wr_${orderId}`)],
        [btn('🧾 Đơn hàng', 'my_orders'), styled(btn('🛍 Mua tiếp', 'refresh_products'), 'success')],
    ]);
}

function orderListKeyboard(orders) {
    return Markup.inlineKeyboard(grid(orders.map((o) => btn(`${STATUS_EMOJI[o.status] || '•'} #${o.id}`, `ov_${o.id}`)), 3));
}

function orderViewKeyboard(order, { canWarranty = false } = {}) {
    const rows = [];
    if (order.status === 'pending') rows.push([styled(btn('Hủy đơn', `cancel_order_${order.id}`), 'danger')]);
    if (canWarranty) rows.push([btn('🛠 Báo lỗi / Bảo hành', `wr_${order.id}`)]);
    rows.push([btn('‹ Danh sách đơn', 'my_orders')]);
    return Markup.inlineKeyboard(rows);
}

function shopKeyboard() {
    return Markup.inlineKeyboard([[styled(btn('🛍 Mua sắm ngay', 'refresh_products'), 'success')]]);
}

function accountKeyboard() {
    return Markup.inlineKeyboard([[btn('👛 Nạp tiền', 'topup_menu'), btn('🧾 Đơn hàng', 'my_orders')]]);
}

const TOPUP_AMOUNTS = [20000, 50000, 100000, 200000, 500000, 1000000];

function topupKeyboard() {
    const amounts = TOPUP_AMOUNTS.filter((a) => a >= config.NAP_MIN && a <= config.NAP_MAX);
    return Markup.inlineKeyboard(grid(amounts.map((a) => styled(btn(formatPrice(a), `topup_${a}`), 'success')), 3));
}

function supportKeyboard() {
    const row = [];
    const support = supportUrl();
    const zalo = zaloUrl();
    if (support) row.push(styled(url('💬 Telegram', support), 'success'));
    if (zalo) row.push(styled(url('📱 Zalo', zalo), 'primary'));
    return row.length ? Markup.inlineKeyboard([row]) : {};
}

// Reply-keyboard labels from earlier versions — still handled so old keyboards keep working
const MENU = {
    products: '🛍 Sản phẩm',
    orders: '🧾 Đơn hàng',
    topup: '👛 Nạp tiền',
    account: '👤 Tài khoản',
    support: '💬 Hỗ trợ',
};
const LEGACY_MENU = {
    products: '📦 Sản phẩm',
    topup: '💰 Nạp tiền',
    support: '🆘 Hỗ trợ',
};

// ── Admin ──
function adminOrderKeyboard(orderId) {
    return Markup.inlineKeyboard([
        [styled(btn('✅ Xác nhận đã nhận tiền', `admin_confirm_${orderId}`), 'success')],
        [styled(btn('Hủy đơn', `admin_cancel_${orderId}`), 'danger')],
    ]);
}

function adminDeliverKeyboard(orderId) {
    return Markup.inlineKeyboard([[styled(btn('📝 Nhập tài khoản để giao', `adm_deliver_${orderId}`), 'primary')]]);
}

function adminTopupKeyboard(topupId) {
    return Markup.inlineKeyboard([[styled(btn('✅ Xác nhận đã nhận tiền', `adm_topup_${topupId}`), 'success')]]);
}

function adminWarrantyKeyboard(claimId) {
    return Markup.inlineKeyboard([
        [styled(btn('🔄 Đổi 1 TK từ kho', `wra_${claimId}`), 'success'), styled(btn('✍️ Nhập TK thay thế', `wrm_${claimId}`), 'primary')],
        [styled(btn('Từ chối', `wrr_${claimId}`), 'danger')],
    ]);
}

module.exports = {
    grid,
    packRows,
    visualWidth,
    styled,
    zaloUrl,
    homeKeyboard,
    productListKeyboard,
    categoryKeyboard,
    quantityKeyboard,
    contactKeyboard,
    checkoutKeyboard,
    qrPaymentKeyboard,
    postDeliveryKeyboard,
    orderListKeyboard,
    orderViewKeyboard,
    shopKeyboard,
    accountKeyboard,
    topupKeyboard,
    supportKeyboard,
    MENU,
    LEGACY_MENU,
    adminOrderKeyboard,
    adminDeliverKeyboard,
    adminTopupKeyboard,
    adminWarrantyKeyboard,
};
