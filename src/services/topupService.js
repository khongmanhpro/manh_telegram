const db = require('../database');
const userService = require('./userService');
const { toDbDate } = require('../utils/format');

const stmts = {
    insert: db.prepare('INSERT INTO topups (user_id, amount, payment_code) VALUES (?, ?, ?)'),
    byId: db.prepare('SELECT * FROM topups WHERE id = ?'),
    byCode: db.prepare('SELECT * FROM topups WHERE payment_code = ?'),
    pendingByUser: db.prepare("SELECT * FROM topups WHERE user_id = ? AND status = 'pending'"),
    setStatus: db.prepare('UPDATE topups SET status = ? WHERE id = ? AND status = ?'),
    setQr: db.prepare('UPDATE topups SET qr_chat_id = ?, qr_message_id = ? WHERE id = ?'),
    credit: db.prepare(`
        UPDATE topups SET status = 'paid', paid_amount = paid_amount + ?, paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
        WHERE id = ?
    `),
    expired: db.prepare("SELECT * FROM topups WHERE status = 'pending' AND created_at < ?"),
};

const topupService = {
    create(userId, amount, paymentCode) {
        const id = stmts.insert.run(userId, amount, paymentCode).lastInsertRowid;
        return this.getById(id);
    },

    getById(id) {
        return stmts.byId.get(id);
    },

    getByCode(code) {
        return stmts.byCode.get(code);
    },

    setQrMessage(id, chatId, messageId) {
        stmts.setQr.run(chatId, messageId, id);
    },

    /**
     * Cancel previous pending top-ups of a user (a late payment is still credited)
     */
    cancelPendingByUser(userId) {
        const rows = stmts.pendingByUser.all(userId);
        for (const t of rows) stmts.setStatus.run('cancelled', t.id, 'pending');
        return rows;
    },

    /**
     * Credit money received for a top-up. Always credits: the money has arrived,
     * even if the top-up was cancelled/expired or already paid once.
     */
    credit(topupId, amount) {
        const run = db.transaction(() => {
            const topup = this.getById(topupId);
            if (!topup) return { success: false, error: 'Không tìm thấy yêu cầu nạp' };
            const firstPayment = topup.status !== 'paid';
            stmts.credit.run(amount, topupId);
            userService.addBalance(topup.user_id, amount,{reason:'Nạp tiền VND',reference:`topup:${topupId}`});
            return {
                success: true,
                firstPayment,
                topup: this.getById(topupId),
                balance: userService.get(topup.user_id).balance,
            };
        });
        return run();
    },

    /**
     * Admin confirms a pending top-up manually (no payment gateway)
     */
    confirmManual(topupId) {
        const topup = this.getById(topupId);
        if (!topup) return { success: false, error: 'Không tìm thấy yêu cầu nạp' };
        if (topup.status === 'paid') return { success: false, error: 'Yêu cầu nạp đã được xử lý' };
        return this.credit(topupId, topup.amount);
    },

    expireOld(minutes) {
        const cutoff = toDbDate(new Date(Date.now() - minutes * 60000));
        const rows = stmts.expired.all(cutoff);
        return rows.filter((t) => stmts.setStatus.run('expired', t.id, 'pending').changes === 1);
    },
};

module.exports = topupService;
