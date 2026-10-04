const fs = require('fs');
const path = require('path');
const db = require('../database');
const config = require('../config');
const logger = require('../utils/logger');

const backupDir = path.join(__dirname, '..', '..', 'data', 'backups');

/**
 * Create an online, consistent SQLite backup and prune old files.
 * Returns the backup file path.
 */
async function createBackup() {
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = path.join(backupDir, `shop-${stamp}.db`);
    await db.backup(file);

    const files = fs
        .readdirSync(backupDir)
        .filter((f) => /^shop-.*\.db$/.test(f))
        .sort();
    for (const old of files.slice(0, Math.max(files.length - config.BACKUP_KEEP, 0))) {
        fs.unlinkSync(path.join(backupDir, old));
    }
    return file;
}

/**
 * Backup and send the file to the primary admin only (it contains account data)
 */
async function backupAndSend(bot) {
    const file = await createBackup();
    if (!config.ADMIN_ID) return file; // no admin configured yet → keep local copy only
    try {
        await bot.telegram.sendDocument(
            config.ADMIN_ID,
            { source: file, filename: path.basename(file) },
            { caption: '💾 Backup database tự động. Lưu trữ cẩn thận — file chứa dữ liệu tài khoản khách.' }
        );
    } catch (err) {
        logger.error('Send backup failed:', err.message);
    }
    return file;
}

module.exports = { createBackup, backupAndSend, backupDir };
