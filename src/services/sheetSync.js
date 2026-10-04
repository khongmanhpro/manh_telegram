const db = require('../database');
const config = require('../config');
const { parseCSV } = require('../utils/csv');
const logger = require('../utils/logger');

const SYNC_INTERVAL = config.SHEET_SYNC_INTERVAL;

/**
 * Fetch CSV from a published Google Sheet (fetch follows redirects)
 */
async function fetchSheetCSV(sheetId) {
    const url = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=0`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'TelegramShopBot/1.0' },
        signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (/^\s*<(!doctype|html)/i.test(text)) {
        throw new Error('Sheet chưa được chia sẻ công khai (nhận về trang HTML)');
    }
    return text;
}

/**
 * Parse price string like "8.000đ" or "8000" into integer
 */
function parsePrice(priceStr) {
    if (!priceStr) return 0;
    return parseInt(String(priceStr).replace(/[^\d]/g, ''), 10) || 0;
}

function parseBool(value) {
    const v = String(value || '').trim().toUpperCase();
    return ['TRUE', '✓', '☑', '✔', 'X', 'YES', 'CÓ', '1'].includes(v);
}

/**
 * Sync Google Sheet data to database
 * Columns: A=ID, B=Sản phẩm, C=Giá bán, D=Đơn vị tính, E=Số lượng trong kho,
 *          F=Tình trạng còn hàng, G=Liên hệ đặt hàng, H=Ghi chú, I=Danh mục (tùy chọn)
 * Sheet products missing from the sheet are deactivated.
 */
function syncToDatabase(rows) {
    const dataRows = rows.slice(1).filter((r) => r.length >= 3 && parseInt(r[0], 10) > 0 && r[1]);
    if (dataRows.length === 0) {
        throw new Error('Sheet không có dòng dữ liệu hợp lệ — bỏ qua để tránh tắt toàn bộ sản phẩm');
    }

    let updated = 0;
    let added = 0;
    let deactivated = 0;

    const getProduct = db.prepare('SELECT * FROM products WHERE id = ?');
    const updateProduct = db.prepare(`
        UPDATE products SET name = ?, price = ?, description = ?, is_active = ?,
          contact_only = ?, contact_url = ?, sheet_stock = ?, promotion = ?,
          category_id = COALESCE(?, category_id), source = 'sheet'
        WHERE id = ?
    `);
    const insertProduct = db.prepare(`
        INSERT INTO products (id, category_id, name, price, emoji, description,
          contact_only, contact_url, sheet_stock, promotion, is_active, source)
        VALUES (?, ?, ?, ?, '📦', ?, ?, ?, ?, ?, ?, 'sheet')
    `);
    const getRealStock = db.prepare('SELECT COUNT(*) AS c FROM stock WHERE product_id = ? AND is_sold = 0');
    const findCategory = db.prepare('SELECT id FROM categories WHERE lower(name) = lower(?)');
    const insertCategory = db.prepare("INSERT INTO categories (name, emoji, sort_order) VALUES (?, '📂', 99)");
    const firstCategory = db.prepare('SELECT id FROM categories ORDER BY sort_order, id LIMIT 1');
    const deactivateMissing = db.prepare(`
        UPDATE products SET is_active = 0
        WHERE source = 'sheet' AND is_active = 1 AND is_deleted = 0
          AND id NOT IN (SELECT value FROM json_each(?))
    `);

    const categoryId = (name) => {
        if (!name) return null;
        const found = findCategory.get(name);
        return found ? found.id : insertCategory.run(name).lastInsertRowid;
    };

    const syncAll = db.transaction(() => {
        const seen = [];
        for (const row of dataRows) {
            const id = parseInt(row[0], 10);
            const name = row[1];
            const price = parsePrice(row[2]);
            const unit = row[3] || '';
            const sheetStock = parseInt(row[4], 10) || 0;
            const inStock = parseBool(row[5]);
            const contactUrl = (row[6] || '').trim() || null;
            const notes = row[7] || '';
            const catId = categoryId((row[8] || '').trim());

            seen.push(id);
            const desc = [unit, notes].filter(Boolean).join(' | ') || null;
            const hasRealStock = getRealStock.get(id).c > 0;
            const contactOnly = !hasRealStock && sheetStock === 0 ? 1 : 0;
            const promotion = notes || null;

            const existing = getProduct.get(id);
            if (existing) {
                if (existing.is_deleted) continue; // admin deleted it — don't resurrect
                updateProduct.run(name, price, desc, inStock ? 1 : 0, contactOnly, contactUrl, sheetStock, promotion, catId, id);
                updated++;
            } else {
                const fallbackCat = catId ?? firstCategory.get()?.id ?? null;
                insertProduct.run(id, fallbackCat, name, price, desc, contactOnly, contactUrl, sheetStock, promotion, inStock ? 1 : 0);
                added++;
            }
        }
        deactivated = deactivateMissing.run(JSON.stringify(seen)).changes;
    });

    syncAll();
    return { updated, added, deactivated, total: dataRows.length };
}

let syncing = false;

/**
 * Run full sync from Google Sheet
 */
async function syncFromSheet() {
    const sheetId = config.GOOGLE_SHEET_ID;
    if (!sheetId) return null;
    if (syncing) return { error: 'Đang đồng bộ, vui lòng thử lại sau' };

    syncing = true;
    try {
        const csv = await fetchSheetCSV(sheetId);
        const result = syncToDatabase(parseCSV(csv));
        logger.info(`Sheet sync: ${result.updated} updated, ${result.added} added, ${result.deactivated} deactivated (${result.total} rows)`);
        return result;
    } catch (err) {
        logger.error('Sheet sync failed:', err.message);
        return { error: err.message };
    } finally {
        syncing = false;
    }
}

function startAutoSync() {
    if (!config.GOOGLE_SHEET_ID) {
        logger.info('Google Sheet sync disabled (no GOOGLE_SHEET_ID)');
        return;
    }
    logger.info(`Google Sheet auto-sync enabled (every ${SYNC_INTERVAL} min)`);
    setTimeout(syncFromSheet, 5000);
    setInterval(syncFromSheet, SYNC_INTERVAL * 60 * 1000);
}

module.exports = {
    syncFromSheet,
    syncToDatabase,
    startAutoSync,
    fetchSheetCSV,
    parsePrice,
    SYNC_INTERVAL,
};
