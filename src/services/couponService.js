const db = require('../database');
const { toDbDate } = require('../utils/format');

const CODE_RE = /^[A-Z0-9]{3,20}$/;

const stmts = {
    get: db.prepare('SELECT * FROM coupons WHERE code = ?'),
    insert: db.prepare(`
        INSERT OR REPLACE INTO coupons (code, type, value, min_order, max_uses, used_count, expires_at, is_active)
        VALUES (?, ?, ?, ?, ?, COALESCE((SELECT used_count FROM coupons WHERE code = ?), 0), ?, 1)
    `),
    list: db.prepare('SELECT * FROM coupons ORDER BY is_active DESC, created_at DESC LIMIT 50'),
    deactivate: db.prepare('UPDATE coupons SET is_active = 0 WHERE code = ?'),
    incUse: db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE code = ?'),
    usedByUser: db.prepare(`
        SELECT COUNT(*) AS c FROM orders
        WHERE user_id = ? AND coupon_code = ? AND status IN ('pending', 'paid', 'delivered')
    `),
};

const couponService = {
    normalize(code) {
        return String(code || '').trim().toUpperCase();
    },

    isValidCode(code) {
        return CODE_RE.test(code);
    },

    /**
     * Create or replace a coupon.
     * value: "10%" (percent) or "20000" (fixed VND)
     */
    create({ code, value, maxUses = 0, minOrder = 0, days = 0 }) {
        const c = this.normalize(code);
        if (!this.isValidCode(c)) throw new Error('Mã chỉ gồm 3-20 ký tự chữ/số');

        const raw = String(value).trim();
        const isPercent = raw.endsWith('%');
        const num = parseInt(raw.replace(/[%.\s]/g, ''), 10);
        if (!Number.isFinite(num) || num <= 0) throw new Error('Giá trị giảm không hợp lệ');
        if (isPercent && num > 100) throw new Error('Phần trăm tối đa 100%');

        const expiresAt = days > 0 ? toDbDate(new Date(Date.now() + days * 86400000)) : null;
        stmts.insert.run(c, isPercent ? 'percent' : 'fixed', num, minOrder, maxUses, c, expiresAt);
        return stmts.get.get(c);
    },

    get(code) {
        return stmts.get.get(this.normalize(code));
    },

    list() {
        return stmts.list.all();
    },

    deactivate(code) {
        return stmts.deactivate.run(this.normalize(code)).changes > 0;
    },

    incrementUse(code) {
        stmts.incUse.run(code);
    },

    calcDiscount(coupon, subtotal) {
        const raw = coupon.type === 'percent' ? Math.floor((subtotal * coupon.value) / 100) : coupon.value;
        return Math.min(raw, subtotal);
    },

    /**
     * Validate a coupon for a user and subtotal.
     * Returns { ok: true, coupon, discount } or { ok: false, reason }
     */
    validate(code, userId, subtotal) {
        const c = this.normalize(code);
        if (!this.isValidCode(c)) return { ok: false, reason: 'Mã giảm giá không hợp lệ' };

        const coupon = stmts.get.get(c);
        if (!coupon || !coupon.is_active) return { ok: false, reason: 'Mã giảm giá không tồn tại hoặc đã tắt' };
        if (coupon.expires_at && coupon.expires_at < toDbDate(new Date())) {
            return { ok: false, reason: 'Mã giảm giá đã hết hạn' };
        }
        if (coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses) {
            return { ok: false, reason: 'Mã giảm giá đã hết lượt sử dụng' };
        }
        if (subtotal < coupon.min_order) {
            return { ok: false, reason: `Đơn tối thiểu ${new Intl.NumberFormat('vi-VN').format(coupon.min_order)}đ để dùng mã này` };
        }
        if (stmts.usedByUser.get(userId, c).c > 0) {
            return { ok: false, reason: 'Bạn đã sử dụng mã này rồi' };
        }

        return { ok: true, coupon, discount: this.calcDiscount(coupon, subtotal) };
    },
};

module.exports = couponService;
