const db = require('../database');

// stock_count  = unsold accounts in the stock table
// reserved     = quantity held by orders awaiting payment / manual delivery
// display_stock = sellable quantity (real stock, or sheet_stock for manual products) minus reserved
const BASE_SELECT = `
  SELECT p.*,
    c.name AS cat_name, c.emoji AS cat_emoji,
    COALESCE(s.cnt, 0) AS stock_count,
    COALESCE(r.reserved, 0) AS reserved,
    MAX(
      (CASE WHEN COALESCE(s.cnt, 0) > 0 THEN s.cnt ELSE COALESCE(p.sheet_stock, 0) END)
        - COALESCE(r.reserved, 0),
      0
    ) AS display_stock
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN (
    SELECT product_id, COUNT(*) AS cnt FROM stock WHERE is_sold = 0 GROUP BY product_id
  ) s ON s.product_id = p.id
  LEFT JOIN (
    SELECT product_id, SUM(quantity + COALESCE(bonus_qty, 0)) AS reserved
    FROM orders WHERE status IN ('pending', 'paid') GROUP BY product_id
  ) r ON r.product_id = p.id
`;

const stmts = {
    allActive: db.prepare(`${BASE_SELECT} WHERE p.is_active = 1 AND p.is_deleted = 0 ORDER BY c.sort_order, p.category_id, p.id`),
    allAdmin: db.prepare(`${BASE_SELECT} WHERE p.is_deleted = 0 ORDER BY c.sort_order, p.category_id, p.id`),
    byId: db.prepare(`${BASE_SELECT} WHERE p.id = ?`),
    byCategory: db.prepare(`${BASE_SELECT} WHERE p.category_id = ? AND p.is_active = 1 AND p.is_deleted = 0 ORDER BY p.id`),
    categories: db.prepare('SELECT * FROM categories ORDER BY sort_order, id'),
    activeCategories: db.prepare(`
        SELECT c.*, COUNT(p.id) AS product_count FROM categories c
        JOIN products p ON p.category_id = c.id AND p.is_active = 1 AND p.is_deleted = 0
        GROUP BY c.id ORDER BY c.sort_order, c.id
    `),
    uncategorizedCount: db.prepare(`
        SELECT COUNT(*) AS c FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.is_active = 1 AND p.is_deleted = 0 AND c.id IS NULL
    `),
    uncategorized: db.prepare(`${BASE_SELECT} WHERE p.is_active = 1 AND p.is_deleted = 0 AND c.id IS NULL ORDER BY p.id`),
    unsoldData: db.prepare('SELECT data FROM stock WHERE product_id = ? AND is_sold = 0'),
    insertStock: db.prepare('INSERT INTO stock (product_id, data) VALUES (?, ?)'),
    insertStockBatch: db.prepare('INSERT INTO stock (product_id, data, import_batch_id) VALUES (?, ?, ?)'),
    createImportBatch: db.prepare(`
        INSERT INTO stock_import_batches
            (product_id, admin_email, total_lines, added_lines, duplicate_lines, blank_lines)
        VALUES (?, ?, ?, ?, ?, ?)
    `),
    importBatches: db.prepare(`
        SELECT b.*, p.name AS product_name
        FROM stock_import_batches b JOIN products p ON p.id = b.product_id
        WHERE b.product_id = ? ORDER BY b.id DESC LIMIT ?
    `),
    stockRows: db.prepare(`
        SELECT s.id, s.product_id, s.data, s.is_sold, s.sold_to, s.sold_at, s.order_id,
               s.import_batch_id, b.created_at AS imported_at
        FROM stock s LEFT JOIN stock_import_batches b ON b.id = s.import_batch_id
        WHERE s.product_id = ? ORDER BY s.id DESC LIMIT ? OFFSET ?
    `),
    available: db.prepare('SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT ?'),
    countUnsold: db.prepare('SELECT COUNT(*) AS c FROM stock WHERE product_id = ? AND is_sold = 0'),
    markSold: db.prepare('UPDATE stock SET is_sold = 1, sold_to = ?, sold_at = CURRENT_TIMESTAMP, order_id = ? WHERE id = ? AND is_sold = 0'),
    clearUnsold: db.prepare('DELETE FROM stock WHERE product_id = ? AND is_sold = 0'),
    viewUnsold: db.prepare('SELECT * FROM stock WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT ?'),
    insertProduct: db.prepare('INSERT INTO products (category_id, name, price, emoji, promotion, contact_only) VALUES (?, ?, ?, ?, ?, ?)'),
    insertProductAdmin: db.prepare(`
        INSERT INTO products
            (category_id, name, price, description, emoji, promotion, contact_only, contact_url,
             is_active, bonus_buy, bonus_free, delivery_note, stars_price, source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
    `),
    insertCategory: db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)'),
    categoryById: db.prepare('SELECT * FROM categories WHERE id = ?'),
    searchStock: db.prepare(`
        SELECT s.*, p.name AS product_name FROM stock s
        JOIN products p ON p.id = s.product_id
        WHERE s.data LIKE ? ESCAPE '\\' ORDER BY s.id DESC LIMIT ?
    `),
    decSheetStock: db.prepare('UPDATE products SET sheet_stock = MAX(COALESCE(sheet_stock, 0) - ?, 0) WHERE id = ?'),
};

const productService = {
    getAll() {
        return stmts.allActive.all();
    },

    getAllForAdmin() {
        return stmts.allAdmin.all();
    },

    getAdminList({ query = '', categoryId = null, source = null, isActive = null } = {}) {
        const conditions = ['p.is_deleted = 0'];
        const params = [];
        if (query.trim()) {
            conditions.push('(p.name LIKE ? OR COALESCE(p.description, \'\') LIKE ?)');
            const like = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
            params.push(like, like);
        }
        if (categoryId !== null && categoryId !== undefined && categoryId !== '') {
            conditions.push('p.category_id = ?');
            params.push(Number(categoryId));
        }
        if (source) {
            conditions.push('p.source = ?');
            params.push(source);
        }
        if (isActive !== null && isActive !== undefined && isActive !== '') {
            conditions.push('p.is_active = ?');
            params.push(Number(isActive) ? 1 : 0);
        }
        return db.prepare(`${BASE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY c.sort_order, p.category_id, p.id`).all(...params);
    },

    getById(id) {
        return stmts.byId.get(id);
    },

    getByCategory(categoryId) {
        return categoryId === 0 ? stmts.uncategorized.all() : stmts.byCategory.all(categoryId);
    },

    getCategories() {
        return stmts.categories.all();
    },

    getCategory(id) {
        return stmts.categoryById.get(id);
    },

    /**
     * Categories that currently have active products (id 0 = uncategorized)
     */
    getActiveCategories() {
        const cats = stmts.activeCategories.all();
        const loose = stmts.uncategorizedCount.get().c;
        if (loose > 0) cats.push({ id: 0, name: 'Khác', emoji: '📦', product_count: loose });
        return cats;
    },

    /**
     * Active categories with availability counts (for colored shop buttons)
     * available = products with sellable stock, contact = contact-only products
     */
    getShopCategories() {
        const products = this.getAll();
        return this.getActiveCategories().map((c) => {
            const items = products.filter((p) => (c.id === 0 ? !p.cat_name : p.category_id === c.id));
            return {
                ...c,
                available: items.filter((p) => p.display_stock > 0).length,
                contact: items.filter((p) => p.contact_only && p.display_stock === 0).length,
            };
        });
    },

    updateCategory(categoryId, fields) {
        const allowed = ['name', 'emoji', 'icon_emoji_id', 'sort_order'];
        const keys = Object.keys(fields).filter((k) => allowed.includes(k));
        if (keys.length === 0) return 0;
        const sql = `UPDATE categories SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
        return db.prepare(sql).run(...keys.map((k) => fields[k]), categoryId).changes;
    },

    addCategory(name, emoji = '📦') {
        return stmts.insertCategory.run(name, emoji, 99).lastInsertRowid;
    },

    /**
     * Add stock lines, skipping blanks and duplicates (within batch and existing unsold stock)
     */
    addStock(productId, dataLines) {
        const run = db.transaction((lines) => {
            const existing = new Set(stmts.unsoldData.all(productId).map((r) => r.data));
            let added = 0;
            let duplicates = 0;
            for (const raw of lines) {
                const line = String(raw).trim();
                if (!line) continue;
                if (existing.has(line)) {
                    duplicates++;
                    continue;
                }
                existing.add(line);
                stmts.insertStock.run(productId, line);
                added++;
            }
            return { added, duplicates };
        });
        return run(dataLines);
    },

    getAvailableStock(productId, quantity) {
        return stmts.available.all(productId, quantity);
    },

    countUnsold(productId) {
        return stmts.countUnsold.get(productId).c;
    },

    /**
     * Mark stock sold. Must be called inside a transaction by the caller.
     * Returns number of rows actually marked.
     */
    markSold(stockIds, userId, orderId = null) {
        let changed = 0;
        for (const id of stockIds) changed += stmts.markSold.run(userId, orderId, id).changes;
        return changed;
    },

    /**
     * Take `quantity` unsold accounts atomically. Returns account strings or null if not enough.
     */
    takeStock(productId, quantity, userId, orderId = null) {
        const run = db.transaction(() => {
            const rows = stmts.available.all(productId, quantity);
            if (rows.length < quantity) return null;
            if (this.markSold(rows.map((r) => r.id), userId, orderId) !== quantity) {
                throw new Error('Stock changed concurrently');
            }
            return rows.map((r) => r.data);
        });
        return run();
    },

    viewUnsold(productId, limit = 50) {
        return stmts.viewUnsold.all(productId, limit);
    },

    clearUnsold(productId) {
        return stmts.clearUnsold.run(productId).changes;
    },

    decrementSheetStock(productId, quantity) {
        stmts.decSheetStock.run(quantity, productId);
    },

    addProduct(categoryId, name, price, emoji = '📦', promotion = null, contactOnly = false) {
        return stmts.insertProduct.run(categoryId, name, price, emoji, promotion, contactOnly ? 1 : 0).lastInsertRowid;
    },

    addAdminProduct(fields) {
        return stmts.insertProductAdmin.run(
            fields.category_id ?? null,
            fields.name,
            fields.price,
            fields.description ?? null,
            fields.emoji || '📦',
            fields.promotion ?? null,
            fields.contact_only ? 1 : 0,
            fields.contact_url ?? null,
            fields.is_active === false ? 0 : 1,
            fields.bonus_buy || 0,
            fields.bonus_free || 0,
            fields.delivery_note ?? null,
            fields.stars_price ?? null
        ).lastInsertRowid;
    },

    updateAdmin(productId, fields) {
        const product = this.getById(productId);
        if (!product) return { error: 'Sản phẩm không tồn tại' };
        const sheetOwned = ['name', 'category_id', 'price', 'description'];
        if (product.source === 'sheet' && sheetOwned.some((field) => Object.prototype.hasOwnProperty.call(fields, field))) {
            return { error: 'Sản phẩm từ Google Sheet đang khóa trường do Sheet quản lý', code: 'SHEET_OWNED_FIELD' };
        }
        this.update(productId, fields);
        return { product: this.getById(productId) };
    },

    update(productId, fields) {
        const allowed = ['name', 'price', 'stars_price', 'description', 'is_active', 'is_deleted', 'bonus_buy', 'bonus_free', 'delivery_note', 'category_id', 'promotion', 'icon_emoji_id', 'emoji', 'contact_only', 'contact_url'];
        const keys = Object.keys(fields).filter((k) => allowed.includes(k));
        if (keys.length === 0) return 0;
        const sql = `UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
        return db.prepare(sql).run(...keys.map((k) => typeof fields[k] === 'boolean' ? Number(fields[k]) : fields[k]), productId).changes;
    },

    searchStock(keyword, limit = 15) {
        const escaped = keyword.replace(/[\\%_]/g, (c) => `\\${c}`);
        return stmts.searchStock.all(`%${escaped}%`, limit);
    },

    /**
     * Preview web imports without changing the database. A valid line is stored
     * exactly as received; trim is only used to identify blank lines.
     */
    previewStock(productId, lines) {
        const product = this.getById(productId);
        if (!product) return { error: 'Sản phẩm không tồn tại' };
        const rawLines = Array.isArray(lines) ? lines.map((line) => String(line)) : [];
        const existing = new Set(stmts.unsoldData.all(productId).map((row) => row.data));
        const seen = new Set();
        const valid = [];
        const blank = [];
        const duplicateInBatch = [];
        const duplicateInStock = [];

        rawLines.forEach((line, index) => {
            if (!line.trim()) {
                blank.push(index + 1);
            } else if (seen.has(line)) {
                duplicateInBatch.push(index + 1);
            } else if (existing.has(line)) {
                duplicateInStock.push(index + 1);
            } else {
                seen.add(line);
                valid.push(line);
            }
        });

        return {
            product,
            totalLines: rawLines.length,
            validLines: valid,
            added: valid.length,
            blank,
            duplicateInBatch,
            duplicateInStock,
            duplicates: duplicateInBatch.length + duplicateInStock.length,
        };
    },

    importStock(productId, lines, adminEmail) {
        const run = db.transaction(() => {
            const preview = this.previewStock(productId, lines);
            if (preview.error) return preview;
            const batchId = stmts.createImportBatch.run(
                productId,
                adminEmail,
                preview.totalLines,
                preview.added,
                preview.duplicates,
                preview.blank.length
            ).lastInsertRowid;
            preview.validLines.forEach((line) => stmts.insertStockBatch.run(productId, line, batchId));
            return { ...preview, batchId, validLines: undefined };
        });
        return run();
    },

    getStockRows(productId, { limit = 100, offset = 0 } = {}) {
        return stmts.stockRows.all(productId, Math.min(Math.max(Number(limit) || 100, 1), 500), Math.max(Number(offset) || 0, 0));
    },

    getImportBatches(productId, limit = 50) {
        return stmts.importBatches.all(productId, Math.min(Math.max(Number(limit) || 50, 1), 200));
    },
};

module.exports = productService;
