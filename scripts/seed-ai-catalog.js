#!/usr/bin/env node
/**
 * Import the AI software catalog as categories + one product each (sold out, price "Liên hệ").
 * Idempotent: re-running updates names/emoji/order and never duplicates.
 *
 *   node scripts/seed-ai-catalog.js
 */
const db = require('../src/database');
const catalog = require('./ai-catalog');

const findCategory = db.prepare('SELECT * FROM categories WHERE lower(name) = lower(?)');
const insertCategory = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)');
const updateCategory = db.prepare('UPDATE categories SET name = ?, emoji = ?, sort_order = ? WHERE id = ?');
const findProduct = db.prepare('SELECT * FROM products WHERE category_id = ? AND lower(name) = lower(?)');
const insertProduct = db.prepare(`
    INSERT INTO products (category_id, name, price, emoji, contact_only, sheet_stock, is_active, source)
    VALUES (?, ?, 0, ?, 0, 0, 1, 'manual')
`);
const countProducts = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ? AND is_deleted = 0');

const run = db.transaction(() => {
    const report = [];
    catalog.forEach((item, index) => {
        const sort = index + 1;
        const existing = [item.name, ...(item.aliases || [])].map((n) => findCategory.get(n)).find(Boolean);

        let categoryId;
        if (existing) {
            updateCategory.run(item.name, item.emoji, sort, existing.id);
            categoryId = existing.id;
        } else {
            categoryId = insertCategory.run(item.name, item.emoji, sort).lastInsertRowid;
        }

        // Only add a placeholder product when the category is empty
        let added = false;
        if (countProducts.get(categoryId).c === 0) {
            const productName = `Tài khoản ${item.name}`;
            if (!findProduct.get(categoryId, productName)) {
                insertProduct.run(categoryId, productName, item.emoji);
                added = true;
            }
        }
        report.push(`${String(sort).padStart(2)}. ${item.emoji} ${item.name} (cat #${categoryId})${existing ? ' — cập nhật' : ' — mới'}${added ? ' + 1 sản phẩm' : ''}`);
    });

    // Push leftover categories after the catalog
    db.prepare(`UPDATE categories SET sort_order = 100 WHERE lower(name) NOT IN (${catalog.map(() => 'lower(?)').join(',')})`).run(
        ...catalog.map((c) => c.name)
    );
    return report;
});

console.log(run().join('\n'));
console.log('✅ Xong. Sản phẩm mới ở trạng thái hết hàng, giá "Liên hệ" — sửa bằng /editprice, thêm hàng bằng /addstock.');
