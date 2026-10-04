const db = require('../database');

// Multi-step input state (admin & customer), persisted so restarts don't lose it
const STATE_TTL_MS = 60 * 60 * 1000;

const stmts = {
    get: db.prepare('SELECT data, updated_at FROM user_states WHERE user_id = ?'),
    set: db.prepare('INSERT OR REPLACE INTO user_states (user_id, data, updated_at) VALUES (?, ?, ?)'),
    clear: db.prepare('DELETE FROM user_states WHERE user_id = ?'),
    purge: db.prepare('DELETE FROM user_states WHERE updated_at < ?'),
};

const stateService = {
    get(userId) {
        const row = stmts.get.get(userId);
        if (!row) return null;
        if (Date.now() - row.updated_at > STATE_TTL_MS) {
            stmts.clear.run(userId);
            return null;
        }
        try {
            return JSON.parse(row.data);
        } catch {
            stmts.clear.run(userId);
            return null;
        }
    },

    set(userId, data) {
        stmts.set.run(userId, JSON.stringify(data), Date.now());
    },

    clear(userId) {
        return stmts.clear.run(userId).changes > 0;
    },

    purgeExpired() {
        stmts.purge.run(Date.now() - STATE_TTL_MS);
    },
};

module.exports = stateService;
