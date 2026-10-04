const db = require('../database');
const productService = require('./productService');
const userService = require('./userService');
const couponService = require('./couponService');
const { toDbDate } = require('../utils/format');
const config = require('../config');

const SELECT = `
  SELECT o.*, COALESCE(o.product_name_snapshot,p.name) AS product_name,
    CASE WHEN o.product_name_snapshot IS NOT NULL THEN o.delivery_note_snapshot ELSE p.delivery_note END AS delivery_note,
    u.full_name AS user_name, u.username
  FROM orders o
  JOIN products p ON p.id = o.product_id
  LEFT JOIN users u ON u.telegram_id = o.user_id
`;

const stmts = {
  insert: db.prepare(`
    INSERT INTO orders (user_id, product_id, quantity, bonus_qty, total_price, discount, coupon_code,
      payment_code, payment_method, bank_name, paid_amount, status, currency,product_name_snapshot,unit_price_snapshot,delivery_note_snapshot,invoice_payload,expires_at,terms_version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?,?,?,?,?,?,?)
  `),
  byId: db.prepare(`${SELECT} WHERE o.id = ?`),
  byCode: db.prepare(`${SELECT} WHERE o.payment_code = ?`),
  recentByUser: db.prepare(`${SELECT} WHERE o.user_id = ? ORDER BY o.id DESC LIMIT ?`),
  countPendingByUser: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id = ? AND status = 'pending'"),
  countByUser: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id = ? AND status IN ('paid', 'delivered')"),
  allPending: db.prepare(`${SELECT} WHERE o.status = 'pending' ORDER BY o.id ASC`),
  awaiting: db.prepare(`${SELECT} WHERE o.status = 'paid' ORDER BY o.id ASC`),
  recent: db.prepare(`${SELECT} ORDER BY o.id DESC LIMIT ?`),
  statusCounts: db.prepare(`
    SELECT status, COUNT(*) AS count FROM orders GROUP BY status
  `),
  revenueRange: db.prepare(`
    SELECT COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS revenue
    FROM orders
    WHERE status IN ('paid', 'delivered') AND currency='VND' AND refund_status='none' AND paid_at >= ? AND paid_at < ?
  `),
  setQr: db.prepare('UPDATE orders SET qr_chat_id = ?, qr_message_id = ? WHERE id = ?'),
  setPaidAmount: db.prepare('UPDATE orders SET paid_amount = ? WHERE id = ?'),
  recordDelivery: db.prepare(`
    UPDATE orders SET delivery_status = ?, delivery_sent_at = CASE WHEN ? = 'sent' THEN CURRENT_TIMESTAMP ELSE delivery_sent_at END,
      delivery_attempts = COALESCE(delivery_attempts, 0) + 1, delivery_error = ?
    WHERE id = ?
  `),
  deliver: db.prepare(`
    UPDATE orders SET status = 'delivered', paid_amount = ?, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP),
      delivered_at = CURRENT_TIMESTAMP, delivery_data = ?
    WHERE id = ? AND status IN ('pending', 'paid')
  `),
  markPaid: db.prepare(`
    UPDATE orders SET status = 'paid', paid_amount = ?, paid_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `),
  manualDeliver: db.prepare(`
    UPDATE orders SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, delivery_data = ?
    WHERE id = ? AND status = 'paid'
  `),
  setStatus: db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?'),
  expiredIds: db.prepare(`
    SELECT id FROM orders WHERE status = 'pending' AND payment_method IN ('qr','stars') AND created_at < ?
  `),
  stats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE status = 'delivered') AS totalOrders,
      (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status IN ('paid', 'delivered') AND currency='VND' AND refund_status='none') AS totalRevenue,
      (SELECT COALESCE(SUM(total_price), 0) FROM orders WHERE status IN ('paid', 'delivered') AND currency='XTR' AND refund_status='none') AS totalStars,
      (SELECT COUNT(*) FROM orders WHERE status = 'pending') AS pendingOrders,
      (SELECT COUNT(*) FROM orders WHERE status = 'paid') AS awaitingDelivery,
      (SELECT COUNT(*) FROM stock WHERE is_sold = 0) AS totalStock,
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM users WHERE is_blocked = 1) AS blockedUsers,
      (SELECT COALESCE(SUM(balance), 0) FROM users) AS totalBalance
  `),
  revenueSince: db.prepare(`
    SELECT COUNT(*) AS c, COALESCE(SUM(total_price), 0) AS s FROM orders
    WHERE status IN ('paid', 'delivered') AND currency='VND' AND refund_status='none' AND paid_at >= ?
  `),
  topProducts: db.prepare(`
    SELECT p.name, SUM(o.quantity) AS qty, SUM(o.total_price) AS revenue
    FROM orders o JOIN products p ON p.id = o.product_id
    WHERE o.status IN ('paid', 'delivered') AND o.currency='VND' AND o.refund_status='none' AND o.paid_at >= ?
    GROUP BY o.product_id ORDER BY revenue DESC LIMIT ?
  `),
  exportSince: db.prepare(`${SELECT} WHERE o.created_at >= ? ORDER BY o.id ASC`),
};

const orderService = {
  create({
    userId, productId, quantity, bonusQty = 0, totalPrice, discount = 0, couponCode = null,
    paymentCode, paymentMethod = 'qr', bankName = null, paidAmount = 0,
    currency = 'VND', invoicePayload = null, termsVersion = null,
  }) {
    const product = productService.getById(productId);
    if (!product) throw new Error('Không tìm thấy sản phẩm');
    const result = stmts.insert.run(
      userId, productId, quantity, bonusQty, totalPrice, discount, couponCode,
      paymentCode, paymentMethod, bankName, paidAmount, currency, product.name,
      currency === 'XTR' ? product.stars_price : product.price, product.delivery_note,
      invoicePayload, toDbDate(new Date(Date.now()+config.ORDER_EXPIRE_MINUTES*60000)), termsVersion
    );
    return this.getById(result.lastInsertRowid);
  },

  getById(id) {
    return stmts.byId.get(id);
  },

  getByPaymentCode(code) {
    return stmts.byCode.get(code);
  },

  getRecentByUser(userId, limit = 10) {
    return stmts.recentByUser.all(userId, limit);
  },

  countPendingByUser(userId) {
    return stmts.countPendingByUser.get(userId).c;
  },

  countByUser(userId) {
    return stmts.countByUser.get(userId).c;
  },

  getAllPending() {
    return stmts.allPending.all();
  },

  getAwaitingDelivery() {
    return stmts.awaiting.all();
  },

  getRecent(limit = 30) {
    return stmts.recent.all(limit);
  },

  getAdminList({ status = null, deliveryStatus = null, query = '', page = 1, limit = 30 } = {}) {
    const conditions = [];
    const params = [];
    if (status) {
      conditions.push('o.status = ?');
      params.push(status);
    }
    if (deliveryStatus) {
      conditions.push('COALESCE(o.delivery_status, \'not_sent\') = ?');
      params.push(deliveryStatus);
    }
    if (query.trim()) {
      conditions.push('(CAST(o.id AS TEXT) LIKE ? OR CAST(o.user_id AS TEXT) LIKE ? OR COALESCE(u.username, \'\') LIKE ? OR COALESCE(u.full_name, \'\') LIKE ? OR COALESCE(p.name, \'\') LIKE ?)');
      const like = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      params.push(like, like, like, like, like);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    const safePage = Math.max(Number(page) || 1, 1);
    const offset = (safePage - 1) * safeLimit;
    const rows = db.prepare(`${SELECT} ${where} ORDER BY o.id DESC LIMIT ? OFFSET ?`).all(...params, safeLimit, offset);
    const total = db.prepare(`SELECT COUNT(*) AS count FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN users u ON u.telegram_id = o.user_id ${where}`).get(...params).count;
    return { rows, total, page: safePage, limit: safeLimit };
  },

  dashboardStats(from, to) {
    const counts = Object.fromEntries(stmts.statusCounts.all().map((row) => [row.status, row.count]));
    const revenue = stmts.revenueRange.get(from, to);
    const stars = db.prepare("SELECT COUNT(*) AS count, COALESCE(SUM(total_price),0) AS revenue FROM orders WHERE currency='XTR' AND status IN ('paid','delivered') AND refund_status='none' AND paid_at>=? AND paid_at<?").get(from,to);
    const products = productService.getAllForAdmin();
    const inventory = products.reduce((sum, product) => ({
      real: sum.real + Number(product.stock_count || 0),
      reserved: sum.reserved + Number(product.reserved || 0),
      sellable: sum.sellable + Number(product.display_stock || 0),
    }), { real: 0, reserved: 0, sellable: 0 });
    const issues = {
      pendingPayment: counts.pending || 0,
      awaitingDelivery: counts.paid || 0,
      deliveryFailed: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE delivery_status = 'failed'").get().count,
      underpaid: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'pending' AND paid_amount > 0 AND paid_amount < total_price").get().count,
      outOfStock: db.prepare("SELECT COUNT(*) AS count FROM orders WHERE status = 'paid'").get().count,
    };
    issues.paymentReview = db.prepare("SELECT COUNT(*) AS n FROM payment_events WHERE status IN ('needs_review','error')").get().n;
    issues.refundReview = db.prepare("SELECT COUNT(*) AS n FROM payment_refunds WHERE status IN ('needs_review','failed')").get().n;
    issues.deliveryReview = db.prepare("SELECT COUNT(*) AS n FROM delivery_jobs WHERE status='needs_review'").get().n;
    return { revenue, revenueByCurrency: {VND:revenue,XTR:stars}, counts, inventory, issues };
  },

  setQrMessage(orderId, chatId, messageId) {
    stmts.setQr.run(chatId, messageId, orderId);
  },

  recordDeliveryAttempt(orderId, sent, error = null) {
    stmts.recordDelivery.run(sent ? 'sent' : 'failed', sent ? 'sent' : 'failed', error ? String(error).slice(0, 500) : null, orderId);
    return this.getById(orderId);
  },

  /**
   * Pay an order from the user's balance (atomic). Creates the order already paid.
   */
  payWithBalance(params) {
    if (config.PAYMENT_MODE === 'stars') return {success:false,error:'Đơn mới thanh toán bằng Telegram Stars'};
    const run = db.transaction(() => {
      if (!userService.deductBalance(params.userId, params.totalPrice, {reason:'Thanh toán đơn hàng',reference:params.paymentCode})) {
        return { success: false, error: 'Số dư không đủ' };
      }
      const order = this.create({ ...params, paymentMethod: 'balance', paidAmount: params.totalPrice });
      return { success: true, order };
    });
    return run();
  },

  /**
   * Record an incoming bank payment for an order.
   * - pending + enough  → { state: 'complete', excess } (excess credited to balance)
   * - pending + partial → { state: 'partial', remaining }
   * - not pending       → { state: 'not_pending', credited } (whole amount credited to balance)
   */
  applyPayment(orderId, amount, context = {}) {
    const run = db.transaction(() => {
      const order = this.getById(orderId);
      if (!order) return { state: 'not_found' };
      if (order.currency !== 'VND' || !Number.isSafeInteger(amount) || amount <= 0) throw new Error('Thanh toán VND không hợp lệ');

      if (order.status !== 'pending') {
        userService.addBalance(order.user_id, amount, {reason:'Chuyển tiền vào đơn không còn chờ thanh toán',reference:`order:${orderId}`,...context});
        return { state: 'not_pending', credited: amount, order };
      }

      const paid = (order.paid_amount || 0) + amount;
      if (paid >= order.total_price) {
        const excess = paid - order.total_price;
        stmts.setPaidAmount.run(order.total_price, orderId);
        stmts.markPaid.run(order.total_price,orderId);
        if (order.coupon_code) couponService.incrementUse(order.coupon_code);
        if (excess > 0) userService.addBalance(order.user_id, excess, {reason:'Tiền chuyển dư',reference:`order:${orderId}`,...context});
        return { state: 'complete', excess, order: this.getById(orderId) };
      }

      stmts.setPaidAmount.run(paid, orderId);
      return { state: 'partial', remaining: order.total_price - paid, order: this.getById(orderId) };
    });
    return run();
  },

  /**
   * Mark a paid order and deliver from stock if available (atomic).
   * Returns:
   *  { success: true, delivered: true, accounts, order, stockAfter }
   *  { success: true, delivered: false, order }   → needs manual delivery
   *  { success: false, error }
   */
  fulfill(orderId, { markFullyPaid = false } = {}) {
    const run = db.transaction(() => {
      const order = this.getById(orderId);
      if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
      if (order.refund_status !== 'none') return {success:false,error:'Đơn đang hoàn tiền hoặc đã hoàn'};
      if (order.currency === 'XTR' && (!order.payment_charge_id || order.status !== 'paid')) return {success:false,error:'Chưa nhận xác nhận thanh toán Stars'};
      if (!['pending', 'paid'].includes(order.status)) {
        return { success: false, error: `Đơn hàng đã được xử lý (${order.status})` };
      }

      const wasPending = order.status === 'pending';
      const paidAmount = markFullyPaid ? order.total_price : order.paid_amount || 0;
      if (paidAmount < order.total_price) return {success:false,error:'Đơn chưa thanh toán đủ'};
      const qty = order.quantity + (order.bonus_qty || 0);

      if (wasPending && order.coupon_code) couponService.incrementUse(order.coupon_code);

      const accounts = productService.takeStock(order.product_id, qty, order.user_id, order.id);
      if (accounts) {
        stmts.deliver.run(paidAmount, accounts.join('\n'), orderId);
        return {
          success: true,
          delivered: true,
          accounts,
          order: this.getById(orderId),
          stockAfter: productService.countUnsold(order.product_id),
        };
      }

      if (wasPending) stmts.markPaid.run(paidAmount, orderId);
      return { success: true, delivered: false, order: this.getById(orderId) };
    });
    return run();
  },

  /**
   * Admin delivers account info manually for a paid order (atomic)
   */
  manualDeliver(orderId, accounts) {
    const run = db.transaction(() => {
      const order = this.getById(orderId);
      if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
      if (order.status !== 'paid') return { success: false, error: `Đơn không ở trạng thái chờ giao (${order.status})` };
      if (order.refund_status !== 'none') return {success:false,error:'Đơn đang hoàn tiền hoặc đã hoàn'};
      if (!accounts.length || accounts.some((line)=>!String(line).trim())) return {success:false,error:'Nội dung giao không hợp lệ'};

      stmts.manualDeliver.run(accounts.join('\n'), orderId);
      productService.decrementSheetStock(order.product_id, order.quantity + (order.bonus_qty || 0));
      return { success: true, order: this.getById(orderId) };
    });
    return run();
  },

  /**
   * Cancel/expire an order; any amount already paid is refunded to the user's balance.
   * userId: if given, only the owner may cancel. allowPaid: admin may cancel paid orders.
   */
  cancel(orderId, { userId = null, status = 'cancelled', allowPaid = false } = {}) {
    const run = db.transaction(() => {
      const order = this.getById(orderId);
      if (!order) return { success: false, error: 'Đơn hàng không tồn tại' };
      if (userId !== null && order.user_id !== userId) return { success: false, error: 'Bạn không có quyền với đơn này' };
      if (order.currency === 'XTR' && order.paid_amount > 0) return {success:false,error:'Đơn Stars đã trả tiền cần dùng chức năng hoàn tiền'};

      const allowed = allowPaid ? ['pending', 'paid'] : ['pending'];
      if (!allowed.includes(order.status)) {
        return { success: false, error: `Không thể hủy đơn ở trạng thái "${order.status}"` };
      }

      if (stmts.setStatus.run(status, orderId, order.status).changes !== 1) {
        return { success: false, error: 'Đơn hàng vừa thay đổi trạng thái' };
      }

      const refunded = order.paid_amount || 0;
      if (refunded > 0) userService.addBalance(order.user_id, refunded,{reason:'Hoàn tiền hủy đơn',reference:`order:${orderId}`,operationKey:`cancel:${orderId}`});
      return { success: true, refunded, order: this.getById(orderId) };
    });
    return run();
  },

  /**
   * Expire pending QR orders older than `minutes`. Returns cancel results.
   */
  expireOld(minutes) {
    const cutoff = toDbDate(new Date(Date.now() - minutes * 60000));
    return stmts.expiredIds
      .all(cutoff)
      .map((row) => this.cancel(row.id, { status: 'expired' }))
      .filter((r) => r.success);
  },

  getStats() {
    return stmts.stats.get();
  },

  revenueSince(since) {
    return stmts.revenueSince.get(since);
  },

  topProducts(since, limit = 5) {
    return stmts.topProducts.all(since, limit);
  },

  exportSince(since) {
    return stmts.exportSince.all(since);
  },
};

module.exports = orderService;
