const config = require('../config');

/**
 * Escape text before inserting into Telegram HTML messages
 */
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Format price in VND
 */
function formatPrice(amount, currency = 'VND') {
    return new Intl.NumberFormat('vi-VN').format(amount || 0) + (currency === 'XTR' ? ' ⭐' : 'đ');
}

/**
 * SQLite CURRENT_TIMESTAMP (UTC) <-> JS Date
 */
function parseDbDate(value) {
    if (!value) return null;
    const d = new Date(String(value).replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? null : d;
}

function toDbDate(date) {
    return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Format a DB timestamp in the shop timezone: "03/10/2026 14:05"
 */
function formatDate(value) {
    const d = parseDbDate(value);
    if (!d) return value ? String(value) : '';
    return `${formatDay(d)} ${formatTime(d)}`;
}

/**
 * "03/10/2026" in the shop timezone (accepts Date or DB timestamp)
 */
function formatDay(value) {
    const d = value instanceof Date ? value : parseDbDate(value);
    if (!d) return '';
    return d.toLocaleDateString('vi-VN', { timeZone: config.TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * "14:35" in the shop timezone (accepts Date or DB timestamp)
 */
function formatTime(value) {
    const d = value instanceof Date ? value : parseDbDate(value);
    if (!d) return '';
    return d.toLocaleTimeString('vi-VN', { timeZone: config.TZ, hour12: false, hour: '2-digit', minute: '2-digit' });
}

/**
 * Shorten text for button labels
 */
function truncate(text, max) {
    const s = String(text ?? '').trim();
    return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * Start of the local day (shop timezone) `daysAgo` days ago, as a DB timestamp
 */
function localDayStart(daysAgo = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - daysAgo);
    return toDbDate(d);
}

/**
 * Group lines so a multi-line <blockquote>…</blockquote> stays in one unit
 */
function splitUnits(text) {
    const units = [];
    let open = null;
    for (const line of String(text).split('\n')) {
        if (open !== null) {
            open += `\n${line}`;
            if (line.includes('</blockquote>')) {
                units.push(open);
                open = null;
            }
        } else if (line.includes('<blockquote') && !line.includes('</blockquote>')) {
            open = line;
        } else {
            units.push(line);
        }
    }
    if (open !== null) units.push(open);
    return units;
}

/**
 * Split a long message into chunks under Telegram's 4096 limit.
 * Splits on line boundaries (never inside a blockquote) so HTML tags stay intact.
 */
function chunkText(text, limit = 4000) {
    const chunks = [];
    let current = '';
    for (const line of splitUnits(text)) {
        let piece = line;
        while (piece.length > limit) {
            if (current) {
                chunks.push(current);
                current = '';
            }
            chunks.push(piece.slice(0, limit));
            piece = piece.slice(limit);
        }
        const candidate = current ? `${current}\n${piece}` : piece;
        if (candidate.length > limit) {
            chunks.push(current);
            current = piece;
        } else {
            current = candidate;
        }
    }
    if (current.trim()) chunks.push(current);
    return chunks;
}

/**
 * Bonus quantity for "Mua X tặng Y" promotion
 */
function bonusFor(product, quantity) {
    const buy = product.bonus_buy || 0;
    const free = product.bonus_free || 0;
    if (buy <= 0 || free <= 0) return 0;
    return Math.floor(quantity / buy) * free;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = {
    escapeHtml,
    h: escapeHtml,
    formatPrice,
    formatDate,
    formatTime,
    formatDay,
    truncate,
    parseDbDate,
    toDbDate,
    localDayStart,
    chunkText,
    bonusFor,
    sleep,
};
