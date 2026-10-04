const config = require('../config');
const { h, formatPrice, formatDate, formatDay, formatTime, parseDbDate, truncate } = require('./format');

/*
 * Design rules
 * - Title: one icon + bold sentence case. Body: "Label: <b>value</b>", no icon per line.
 * - Things to copy are <code> (tap to copy). Secondary info in <i>, notes in <blockquote>.
 * - No ASCII separators / tree characters; whitespace creates structure.
 */

const STATUS = {
    pending: 'Chờ thanh toán',
    paid: 'Đang chuẩn bị hàng',
    delivered: 'Đã giao',
    cancelled: 'Đã hủy',
    expired: 'Hết hạn',
};

const STATUS_EMOJI = { pending: '🕐', paid: '📦', delivered: '✅', cancelled: '✖️', expired: '⌛' };

const CLAIM_STATUS = { open: 'Đang xử lý', replaced: 'Đã đổi tài khoản', rejected: 'Từ chối' };

function qtyText(order) {
    return order.bonus_qty > 0 ? `${order.quantity} + ${order.bonus_qty} tặng` : `${order.quantity}`;
}

function statusLine(status) {
    return `${STATUS_EMOJI[status] || '•'} ${STATUS[status] || h(status)}`;
}

function accountsBlock(accounts) {
    return accounts.map((acc, i) => `${i + 1}. <code>${h(acc)}</code>`).join('\n');
}

function noteBlock(note) {
    const text = note ?? config.DEFAULT_DELIVERY_NOTE;
    return text ? `\n\n<blockquote expandable><b>Hướng dẫn sử dụng</b>\n${h(text)}</blockquote>` : '';
}

function expiresAt(createdAt, minutes) {
    const created = parseDbDate(createdAt) || new Date();
    return formatTime(new Date(created.getTime() + minutes * 60000));
}

function bankLines(payment) {
    return (
        `Ngân hàng: ${h(payment.bankName)}\n` +
        `Số tài khoản: <code>${h(payment.accountNumber)}</code>\n` +
        `Chủ tài khoản: ${h(payment.accountName)}`
    );
}

// Price 0 = not priced yet → "Liên hệ"
function priceLabel(product) {
    return product.price > 0 ? formatPrice(product.price) : 'Liên hệ';
}

function stockLabel(product) {
    if (product.contact_only && product.display_stock === 0) return 'Liên hệ';
    if (product.display_stock === 0) return 'Hết hàng';
    return `Còn ${product.display_stock}`;
}

function promoLabel(product) {
    if (product.bonus_buy > 0 && product.bonus_free > 0) return `🎁 Mua ${product.bonus_buy} tặng ${product.bonus_free}`;
    return product.promotion ? h(truncate(product.promotion, 40)) : '';
}

const LEGEND = '<i>🟢 Còn hàng · 🔵 Liên hệ · 🔴 Hết hàng</i>';

function fullName(from) {
    return h([from.first_name, from.last_name].filter(Boolean).join(' '));
}

const messages = {
    STATUS,
    STATUS_EMOJI,
    qtyText,
    stockLabel,
    priceLabel,

    // ── Khách hàng ──

    welcome: (name) => {
        const contacts = [];
        if (config.SUPPORT_ZALO) contacts.push(`📱 Zalo: <code>${h(config.SUPPORT_ZALO)}</code>`);
        if (config.SUPPORT_CONTACT) contacts.push(`✈️ Telegram: ${h(config.SUPPORT_CONTACT)}`);
        return (
            `🔥 <b>𝗪𝗘𝗟𝗖𝗢𝗠𝗘</b> 🔥\n` +
            `👋 Chào mừng <b>${h(name)}</b> đến với <b>${h(config.SHOP_NAME)}</b>\n` +
            (config.SHOP_TAGLINE ? `<b>✨ ${h(config.SHOP_TAGLINE.toUpperCase())} ✨</b>\n` : '') +
            `\nCảm ơn bạn đã tin tưởng hệ thống mua hàng tự động của chúng tôi.\n\n` +
            `⚡ Mua hàng <b>tự động 24/7</b>\n` +
            `💳 Thanh toán QR — <b>xác nhận tức thì</b>\n` +
            `📦 Nhận tài khoản <b>ngay sau khi thanh toán</b>\n` +
            `🛡 Bảo hành rõ ràng ngay trong bot\n` +
            (contacts.length ? `\n${contacts.join('\n')}\n` : '') +
            `\n👇 <b>Vui lòng chọn sản phẩm bên dưới</b> 👇\n${LEGEND}`
        );
    },

    homeHeader: () => `<b>🛍 ${h(config.SHOP_NAME)}</b>\n\n👇 <b>Chọn sản phẩm bên dưới</b>\n${LEGEND}`,

    accountInfo: (user, orderCount = 0) =>
        `<b>👤 Tài khoản của bạn</b>\n\n` +
        `Tên: ${h(user.full_name)}\n` +
        `ID: <code>${user.telegram_id}</code>\n` +
        `Số dư: <b>${formatPrice(user.balance)}</b>\n` +
        `Đơn đã mua: ${orderCount}\n` +
        `Thành viên từ: ${formatDay(user.created_at)}`,

    get categoryHeader() {
        return `<b>🛍 Sản phẩm</b>\n${LEGEND}\n\nChọn danh mục bạn quan tâm:`;
    },

    productCatalog: (products, title = '🛍 Sản phẩm') => {
        const header = `<b>${h(title)}</b>`;
        const lines = products.map((p) => {
            const meta = [priceLabel(p), stockLabel(p), promoLabel(p)].filter(Boolean).join(' · ');
            return `<b>${h(p.name)}</b>\n<i>${meta}</i>`;
        });
        const full = `${header}\n\n${lines.join('\n\n')}\n\n👇 Chọn sản phẩm bên dưới\n${LEGEND}`;
        return full.length <= 3800 ? full : `${header}\n\n👇 Chọn sản phẩm bên dưới\n${LEGEND}`;
    },

    noProducts: `<b>🛍 Sản phẩm</b>\n\nHiện chưa có sản phẩm nào. Vui lòng quay lại sau.`,

    selectQuantity: (product) => {
        const promo = promoLabel(product);
        return (
            `<b>${h(product.name)}</b>\n` +
            (product.description ? `<i>${h(product.description)}</i>\n` : '') +
            `\nGiá: <b>${priceLabel(product)}</b>\n` +
            `Tình trạng: còn ${product.display_stock} sản phẩm\n` +
            (promo ? `Ưu đãi: ${promo}\n` : '') +
            `\nChọn số lượng:`
        );
    },

    askCustomQuantity: (product, max) =>
        `<b>Nhập số lượng</b>\n\n` +
        `${h(product.name)}\n` +
        `Gửi một số từ <b>1</b> đến <b>${max}</b>.\n\n` +
        `<i>Gõ /cancel để hủy.</i>`,

    contactOnly: (product) =>
        `<b>${h(product.name)}</b>\n` +
        (product.description ? `<i>${h(product.description)}</i>\n` : '') +
        `\nGiá: <b>${priceLabel(product)}</b>\n` +
        (product.promotion ? `Ưu đãi: ${h(product.promotion)}\n` : '') +
        `\nSản phẩm này được xử lý riêng theo yêu cầu. Nhấn <b>Liên hệ mua</b> để được tư vấn ngay.`,

    noStock: 'Sản phẩm tạm hết hàng. Vui lòng quay lại sau.',

    checkoutSummary: ({ product, quantity, bonus, subtotal, discount, couponCode, total, balance }) =>
        `<b>🧾 Xác nhận đơn hàng</b>\n\n` +
        `<b>${h(product.name)}</b>\n` +
        `Số lượng: ${quantity}${bonus > 0 ? ` + ${bonus} tặng` : ''}\n` +
        `Đơn giá: ${formatPrice(product.price)}\n` +
        (discount > 0
            ? `Tạm tính: ${formatPrice(subtotal)}\n` + `Mã ${h(couponCode)}: -${formatPrice(discount)}\n`
            : '') +
        `\nTổng thanh toán: <b>${formatPrice(total)}</b>\n` +
        `Số dư ví: ${formatPrice(balance)}\n\n` +
        `<i>Chọn phương thức thanh toán bên dưới.</i>`,

    askCoupon: `<b>🎟 Mã giảm giá</b>\n\nGửi mã giảm giá của bạn.\n\n<i>Gõ /cancel để hủy.</i>`,

    tooManyPending: (max) =>
        `<b>Bạn đang có ${max} đơn chờ thanh toán</b>\n\n` +
        `Vui lòng thanh toán hoặc hủy bớt trong mục <b>Đơn hàng</b> trước khi tạo đơn mới.`,

    paymentQR: ({ order, product, payment, expireMinutes, autoPay }) =>
        `<b>Thanh toán đơn #${order.id}</b>\n` +
        `${h(product.name)} × ${qtyText(order)}\n\n` +
        `Số tiền: <b>${formatPrice(order.total_price)}</b>\n` +
        `Nội dung CK: <code>${h(payment.paymentCode)}</code>\n` +
        `${bankLines(payment)}\n\n` +
        `⏳ Hết hạn lúc <b>${expiresAt(order.created_at, expireMinutes)}</b>\n` +
        `<blockquote>Quét QR bằng app ngân hàng và <b>giữ nguyên nội dung chuyển khoản</b>. ` +
        (autoPay ? 'Hàng được giao tự động ngay khi nhận tiền.' : 'Đơn được giao ngay sau khi shop xác nhận.') +
        `</blockquote>`,

    orderDelivered: (order, accounts) =>
        `<b>✅ Giao hàng thành công</b>\n` +
        `Đơn #${order.id} · ${h(order.product_name)} × ${qtyText(order)}\n\n` +
        `<b>Tài khoản của bạn</b> <i>(chạm để sao chép)</i>\n` +
        accountsBlock(accounts) +
        noteBlock(order.delivery_note) +
        `\n\n<i>Xem lại bất cứ lúc nào trong mục Đơn hàng.</i>`,

    orderPaidAwaiting: (order) =>
        `<b>💳 Đã nhận thanh toán</b>\n` +
        `Đơn #${order.id} · ${h(order.product_name)} × ${qtyText(order)}\n\n` +
        `Shop đang chuẩn bị tài khoản cho bạn, thường chỉ mất vài phút. Bot sẽ gửi ngay khi xong.`,

    partialPayment: (order, remaining) =>
        `<b>⚠️ Chuyển khoản chưa đủ</b>\n` +
        `Đơn #${order.id} · đã nhận ${formatPrice(order.paid_amount)}\n\n` +
        `Còn thiếu: <b>${formatPrice(remaining)}</b>\n` +
        `Vui lòng chuyển thêm với nội dung <code>${h(order.payment_code)}</code>.`,

    creditedToBalance: (amount, reason, balance) =>
        `<b>👛 +${formatPrice(amount)} vào số dư</b>\n` +
        `${reason}\n\n` +
        `Số dư hiện tại: <b>${formatPrice(balance)}</b>`,

    orderExpired: (order, refunded) =>
        `<b>⌛ Đơn #${order.id} đã hết hạn</b>\n\n` +
        `Đơn chưa được thanh toán đúng hạn nên đã tự hủy.` +
        (refunded > 0 ? `\nSố tiền đã chuyển <b>${formatPrice(refunded)}</b> được cộng vào số dư.` : '') +
        `\n\n<i>Bạn có thể đặt lại bất cứ lúc nào.</i>`,

    orderCancelled: (order, refunded) =>
        `<b>Đã hủy đơn #${order.id}</b>` +
        (refunded > 0 ? `\n\nĐã hoàn <b>${formatPrice(refunded)}</b> vào số dư.` : ''),

    orderList: (orders) =>
        `<b>🧾 Đơn hàng của bạn</b>\n\n` +
        orders
            .map(
                (o) =>
                    `${STATUS_EMOJI[o.status] || '•'} <b>#${o.id}</b> · ${h(truncate(o.product_name, 40))} × ${qtyText(o)}\n` +
                    `<i>${formatPrice(o.total_price)} · ${STATUS[o.status] || h(o.status)} · ${formatDate(o.created_at)}</i>`
            )
            .join('\n\n') +
        `\n\n<i>Chọn mã đơn để xem chi tiết.</i>`,

    noOrders: `<b>🧾 Đơn hàng của bạn</b>\n\nBạn chưa có đơn hàng nào.`,

    orderDetail: (order, claims = []) => {
        let msg =
            `<b>Đơn hàng #${order.id}</b>\n` +
            `${statusLine(order.status)}\n\n` +
            `Sản phẩm: ${h(order.product_name)}\n` +
            `Số lượng: ${qtyText(order)}\n` +
            (order.discount > 0 ? `Giảm giá: -${formatPrice(order.discount)}\n` : '') +
            `Tổng tiền: <b>${formatPrice(order.total_price)}</b>\n` +
            `Thanh toán: ${order.payment_method === 'balance' ? 'Số dư ví' : 'Chuyển khoản'}\n` +
            `Ngày đặt: ${formatDate(order.created_at)}`;

        if (order.status === 'pending') {
            msg += `\n\nNội dung CK: <code>${h(order.payment_code)}</code>`;
            if (order.paid_amount > 0) {
                msg += `\nĐã nhận: ${formatPrice(order.paid_amount)} · còn thiếu <b>${formatPrice(order.total_price - order.paid_amount)}</b>`;
            }
        }

        if (order.status === 'delivered') {
            const accounts = (order.delivery_data || '').split('\n').filter(Boolean);
            msg += `\nGiao lúc: ${formatDate(order.delivered_at)}\n\n`;
            msg += accounts.length
                ? `<b>Tài khoản</b> <i>(chạm để sao chép)</i>\n${accountsBlock(accounts)}${noteBlock(order.delivery_note)}`
                : `Liên hệ ${h(config.SUPPORT_CONTACT)} để nhận lại thông tin tài khoản.`;
        }

        for (const c of claims) {
            msg += `\n\n<b>🛠 Bảo hành #${c.id}</b> · ${CLAIM_STATUS[c.status] || h(c.status)}`;
            if (c.status === 'replaced' && c.resolution) {
                msg += `\n${accountsBlock(c.resolution.split('\n').filter(Boolean))}`;
            }
        }
        return msg;
    },

    topupUsage: () =>
        `<b>👛 Nạp tiền vào ví</b>\n\n` +
        `Số dư dùng để mua hàng tức thì, không cần chuyển khoản mỗi lần mua.\n\n` +
        `Chọn nhanh số tiền bên dưới, hoặc gõ <code>/nap 150000</code>\n` +
        `<i>Tối thiểu ${formatPrice(config.NAP_MIN)} · tối đa ${formatPrice(config.NAP_MAX)}</i>`,

    topupQR: ({ topup, payment, expireMinutes, autoPay }) =>
        `<b>Nạp ${formatPrice(topup.amount)} vào ví</b>\n\n` +
        `Số tiền: <b>${formatPrice(topup.amount)}</b>\n` +
        `Nội dung CK: <code>${h(topup.payment_code)}</code>\n` +
        `${bankLines(payment)}\n\n` +
        `⏳ Hết hạn lúc <b>${expiresAt(topup.created_at, expireMinutes)}</b>\n` +
        `<blockquote>Giữ nguyên nội dung chuyển khoản. ` +
        (autoPay ? 'Số dư được cộng tự động ngay khi nhận tiền.' : 'Số dư được cộng sau khi shop xác nhận.') +
        `</blockquote>`,

    topupSuccess: (amount, balance) =>
        `<b>✅ Nạp tiền thành công</b>\n\n` +
        `Đã cộng: <b>+${formatPrice(amount)}</b>\n` +
        `Số dư hiện tại: <b>${formatPrice(balance)}</b>`,

    supportInfo: () =>
        `<b>💬 Hỗ trợ khách hàng</b>\n\n` +
        `Telegram: ${h(config.SUPPORT_CONTACT)}\n` +
        (config.SUPPORT_ZALO ? `Zalo: ${h(config.SUPPORT_ZALO)}\n` : '') +
        `Thời gian: 24/7\n\n` +
        `<blockquote>Tài khoản gặp lỗi? Vào <b>Đơn hàng</b> → chọn đơn → <b>Báo lỗi / Bảo hành</b> để được xử lý nhanh nhất.</blockquote>`,

    myId: (id) => `<b>🆔 Telegram ID của bạn</b>\n\n<code>${id}</code>`,

    askWarranty: (order) =>
        `<b>🛠 Bảo hành đơn #${order.id}</b>\n\n` +
        `Mô tả lỗi bạn gặp: tài khoản nào, lỗi gì, ảnh hưởng ra sao.\n\n` +
        `<i>Gõ /cancel để hủy.</i>`,

    warrantySubmitted: (claim) =>
        `<b>✅ Đã gửi yêu cầu bảo hành #${claim.id}</b>\n\n` +
        `Shop sẽ phản hồi sớm nhất. Hỗ trợ trực tiếp: ${h(config.SUPPORT_CONTACT)}`,

    warrantyReplaced: (claim, accounts) =>
        `<b>🛠 Bảo hành #${claim.id} hoàn tất</b>\n` +
        `Đơn #${claim.order_id}\n\n` +
        `<b>Tài khoản mới</b> <i>(chạm để sao chép)</i>\n` +
        accountsBlock(accounts),

    warrantyRejected: (claim) =>
        `<b>Yêu cầu bảo hành #${claim.id} chưa được chấp nhận</b>\n` +
        `Đơn #${claim.order_id}\n\n` +
        `Liên hệ ${h(config.SUPPORT_CONTACT)} để được giải đáp chi tiết.`,

    cancelledCheckout: 'Đã hủy. Bạn có thể tiếp tục mua sắm bất cứ lúc nào.',

    rateLimited: '⏳ Bạn thao tác quá nhanh, vui lòng chờ vài giây.',

    // ── Admin ──

    adminNewOrder: (order, from, autoPay) =>
        `<b>🔔 Đơn mới #${order.id}</b>\n\n` +
        `${h(order.product_name)} × ${qtyText(order)}\n` +
        `Tổng: <b>${formatPrice(order.total_price)}</b>` +
        (order.discount > 0 ? ` <i>(mã ${h(order.coupon_code)} -${formatPrice(order.discount)})</i>` : '') +
        `\nKhách: ${fullName(from)}${from.username ? ` (@${h(from.username)})` : ''} · <code>${from.id}</code>\n` +
        `Chuyển khoản: ${h(order.bank_name)} · <code>${h(order.payment_code)}</code>\n\n` +
        `<i>${autoPay ? 'Hệ thống tự giao khi nhận tiền.' : 'Bấm Xác nhận sau khi nhận được tiền.'}</i>`,

    adminDelivered: (order, method) =>
        `<b>✅ Đã giao tự động · #${order.id}</b>\n` +
        `${h(order.product_name)} × ${qtyText(order)} · ${formatPrice(order.total_price)} · ${h(method)}\n` +
        `Khách: ${h(order.user_name || '')} · <code>${order.user_id}</code>`,

    adminNeedManual: (order) =>
        `<b>📝 Cần giao thủ công · #${order.id}</b>\n\n` +
        `${h(order.product_name)} × ${qtyText(order)} · ${formatPrice(order.total_price)}\n` +
        `Khách: ${h(order.user_name || '')} · <code>${order.user_id}</code>\n\n` +
        `<i>Khách đã thanh toán nhưng kho không đủ hàng.</i>`,

    adminManualPrompt: (order) =>
        `<b>📝 Giao hàng thủ công · #${order.id}</b>\n` +
        `${h(order.product_name)} × ${qtyText(order)}\n\n` +
        `Gửi thông tin tài khoản, mỗi dòng 1 tài khoản:\n` +
        `<code>email@outlook.com|passmail|pass</code>\n\n` +
        `<i>Gõ /cancel để hủy.</i>`,

    adminLowStock: (product, count) =>
        `<b>⚠️ Sắp hết hàng</b>\n\n` +
        `${h(product.name)} <i>(ID ${product.id})</i>\n` +
        `Còn lại: <b>${count}</b>\n\n` +
        `Thêm kho: <code>/addstock ${product.id}</code>`,

    adminDeliveryFailed: (order, error) =>
        `<b>🚨 Không gửi được hàng · #${order.id}</b>\n` +
        `Khách: <code>${order.user_id}</code>\n` +
        `Lỗi: ${h(error)}\n\n` +
        `<i>Đơn đã giao trong hệ thống — khách xem lại được trong mục Đơn hàng.</i>`,

    adminWarranty: (claim, order, from) =>
        `<b>🛠 Yêu cầu bảo hành #${claim.id}</b>\n\n` +
        `Đơn #${order.id} · ${h(order.product_name)} × ${qtyText(order)}\n` +
        `Khách: ${fullName(from)}${from.username ? ` (@${h(from.username)})` : ''} · <code>${from.id}</code>\n\n` +
        `<blockquote>${h(claim.message)}</blockquote>\n\n` +
        `<b>Đã giao</b>\n${accountsBlock((order.delivery_data || '').split('\n').filter(Boolean).slice(0, 20))}`,
};

module.exports = messages;
