/**
 * Parse CSV text into rows (RFC 4180): quoted fields may contain commas,
 * escaped quotes ("") and line breaks.
 */
function parseCSV(text) {
    const src = String(text).replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < src.length; i++) {
        const char = src[i];

        if (inQuotes) {
            if (char === '"') {
                if (src[i + 1] === '"') {
                    field += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            row.push(field.trim());
            field = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && src[i + 1] === '\n') i++;
            row.push(field.trim());
            field = '';
            if (row.some((f) => f !== '')) rows.push(row);
            row = [];
        } else {
            field += char;
        }
    }

    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);
    return rows;
}

/**
 * Build CSV text from rows
 */
function toCSV(rows) {
    return rows
        .map((row) =>
            row
                .map((value) => {
                    const s = String(value ?? '');
                    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                })
                .join(',')
        )
        .join('\r\n');
}

module.exports = { parseCSV, toCSV };
