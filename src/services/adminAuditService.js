const db = require('../database');

const insert = db.prepare(`
    INSERT INTO admin_audit_logs (admin_email, action, target_type, target_id, metadata)
    VALUES (?, ?, ?, ?, ?)
`);
const recent = db.prepare(`
    SELECT id, admin_email, action, target_type, target_id, metadata, created_at
    FROM admin_audit_logs ORDER BY id DESC LIMIT ?
`);

function safeMetadata(metadata) {
    if (!metadata) return null;
    try {
        return JSON.stringify(metadata);
    } catch {
        return null;
    }
}

const adminAuditService = {
    record(adminEmail, action, targetType = null, targetId = null, metadata = null) {
        return insert.run(adminEmail, action, targetType, targetId === null ? null : String(targetId), safeMetadata(metadata)).lastInsertRowid;
    },

    recent(limit = 50) {
        return recent.all(Math.max(1, Math.min(Number(limit) || 50, 200))).map((row) => ({
            ...row,
            metadata: row.metadata ? JSON.parse(row.metadata) : null,
        }));
    },
};

module.exports = adminAuditService;
