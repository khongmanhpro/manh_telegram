const db = require('../database');
const wallet = require('./walletService');

const stmts = {
    upsert: db.prepare(`
        INSERT INTO users (telegram_id, username, full_name) VALUES (?, ?, ?)
        ON CONFLICT(telegram_id) DO UPDATE SET
            username = excluded.username,
            full_name = excluded.full_name,
            is_blocked = 0
    `),
    get: db.prepare('SELECT * FROM users WHERE telegram_id = ?'),
    addBalance: db.prepare('UPDATE users SET balance = balance + ? WHERE telegram_id = ?'),
    deduct: db.prepare('UPDATE users SET balance = balance - ? WHERE telegram_id = ? AND balance >= ?'),
    setBlocked: db.prepare('UPDATE users SET is_blocked = ? WHERE telegram_id = ?'),
    activeIds: db.prepare('SELECT telegram_id FROM users WHERE is_blocked = 0'),
    recent: db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT ?'),
};

const userService = {
    /**
     * Create the user or refresh their name; also clears the blocked flag
     */
    findOrCreate(telegramUser) {
        const fullName = [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ');
        stmts.upsert.run(telegramUser.id, telegramUser.username || null, fullName);
        return stmts.get.get(telegramUser.id);
    },

    get(telegramId) {
        return stmts.get.get(telegramId);
    },

    /**
     * Add (or subtract with a negative amount) balance. Returns false if user not found.
     */
    addBalance(telegramId, amount, context) {
        if (!this.get(telegramId)) return false;
        wallet.change(telegramId, amount, context);
        return true;
    },

    /**
     * Atomically deduct balance. Returns false if insufficient.
     */
    deductBalance(telegramId, amount, context) {
        if (!Number.isSafeInteger(amount) || amount < 0) return false;
        const user = this.get(telegramId);
        if (!user || user.balance < amount) return false;
        wallet.change(telegramId, -amount, context);
        return true;
    },

    setBlocked(telegramId, blocked) {
        stmts.setBlocked.run(blocked ? 1 : 0, telegramId);
    },

    getActiveIds() {
        return stmts.activeIds.all().map((u) => u.telegram_id);
    },

    getRecent(limit = 30) {
        return stmts.recent.all(limit);
    },
};

module.exports = userService;
