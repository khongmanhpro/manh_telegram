const db = require('../database');

const stmts = {
    insert: db.prepare('INSERT INTO warranty_claims (order_id, user_id, message) VALUES (?, ?, ?)'),
    byId: db.prepare(`
        SELECT w.*, o.product_id, o.quantity, o.bonus_qty, p.name AS product_name
        FROM warranty_claims w
        JOIN orders o ON o.id = w.order_id
        JOIN products p ON p.id = o.product_id
        WHERE w.id = ?
    `),
    openByOrder: db.prepare("SELECT * FROM warranty_claims WHERE order_id = ? AND status = 'open'"),
    byOrder: db.prepare('SELECT * FROM warranty_claims WHERE order_id = ? ORDER BY id'),
    open: db.prepare(`
        SELECT w.*, p.name AS product_name FROM warranty_claims w
        JOIN orders o ON o.id = w.order_id JOIN products p ON p.id = o.product_id
        WHERE w.status = 'open' ORDER BY w.id
    `),
    resolve: db.prepare(`
        UPDATE warranty_claims SET status = ?, resolution = ?, resolved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'open'
    `),
};

const warrantyService = {
    create(orderId, userId, message) {
        const id = stmts.insert.run(orderId, userId, message).lastInsertRowid;
        return this.getById(id);
    },

    getById(id) {
        return stmts.byId.get(id);
    },

    getOpenByOrder(orderId) {
        return stmts.openByOrder.get(orderId);
    },

    getByOrder(orderId) {
        return stmts.byOrder.all(orderId);
    },

    getOpen() {
        return stmts.open.all();
    },

    /**
     * status: 'replaced' | 'rejected'. Returns true if this call resolved it.
     */
    resolve(id, status, resolution = null) {
        return stmts.resolve.run(status, resolution, id).changes === 1;
    },
};

module.exports = warrantyService;
