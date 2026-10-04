const crypto = require('crypto');
const db = require('../database');

function change(userId, amount, { reason = 'Điều chỉnh số dư', actor = 'system', reference = null, operationKey = crypto.randomUUID() } = {}) {
    if (!Number.isSafeInteger(amount) || !reason.trim()) throw new Error('Số tiền hoặc lý do không hợp lệ');
    return db.transaction(() => {
        const previous = db.prepare('SELECT * FROM wallet_ledger WHERE operation_key=?').get(operationKey);
        if (previous) {
            if (previous.user_id !== userId || previous.amount !== amount || previous.reason !== reason) throw new Error('Khóa thao tác đã dùng cho yêu cầu khác');
            return previous;
        }
        const user = db.prepare('SELECT balance FROM users WHERE telegram_id=?').get(userId);
        if (!user) throw new Error('Không tìm thấy khách hàng');
        const after = user.balance + amount;
        if (!Number.isSafeInteger(after) || after < 0) throw new Error('Số dư không đủ hoặc vượt giới hạn');
        db.prepare('UPDATE users SET balance=? WHERE telegram_id=?').run(after, userId);
        const id = db.prepare(`INSERT INTO wallet_ledger(user_id,amount,balance_before,balance_after,reason,actor,reference,operation_key) VALUES(?,?,?,?,?,?,?,?)`).run(userId,amount,user.balance,after,reason,actor,reference,operationKey).lastInsertRowid;
        return db.prepare('SELECT * FROM wallet_ledger WHERE id=?').get(id);
    })();
}

function get(userId, page = 1) {
    const user = db.prepare('SELECT telegram_id,full_name,username,balance FROM users WHERE telegram_id=?').get(userId);
    if (!user) return null;
    const offset = (Math.max(1, Math.floor(Number(page) || 1)) - 1) * 50;
    return { user, currency: 'VND', entries: db.prepare('SELECT * FROM wallet_ledger WHERE user_id=? ORDER BY id DESC LIMIT 50 OFFSET ?').all(userId, offset), total: db.prepare('SELECT COUNT(*) AS n FROM wallet_ledger WHERE user_id=?').get(userId).n };
}
module.exports = { change, get };
