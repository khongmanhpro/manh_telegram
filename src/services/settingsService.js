const db = require('../database');
const config = require('../config');

// Runtime settings changed by admin commands override .env values
const stmts = {
    get: db.prepare('SELECT value FROM settings WHERE key = ?'),
    set: db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'),
    del: db.prepare('DELETE FROM settings WHERE key = ?'),
};

const settingsService = {
    get(key) {
        const row = stmts.get.get(key);
        return row ? row.value : null;
    },

    set(key, value) {
        stmts.set.run(key, value === null ? null : String(value));
    },

    delete(key) {
        stmts.del.run(key);
    },

    getJSON(key) {
        const v = this.get(key);
        if (v === null) return undefined;
        try {
            return JSON.parse(v);
        } catch {
            return undefined;
        }
    },

    setJSON(key, value) {
        this.set(key, JSON.stringify(value));
    },

    /**
     * Apply stored overrides to the in-memory config (call once at startup)
     */
    applyToConfig() {
        const overrides = {
            shop_name: 'SHOP_NAME',
            support_contact: 'SUPPORT_CONTACT',
            support_zalo: 'SUPPORT_ZALO',
            shop_tagline: 'SHOP_TAGLINE',
        };
        for (const [key, configKey] of Object.entries(overrides)) {
            const value = this.get(key);
            if (value !== null) config[configKey] = value;
        }

        const bank1 = this.getJSON('bank1');
        if (bank1) config.BANK = bank1;
        const bank2 = this.getJSON('bank2');
        if (bank2 !== undefined) config.BANK2 = bank2; // null = disabled
    },

    /**
     * Update shop info; undefined fields are left unchanged, '' clears optional ones
     */
    setShop({ name, support, zalo, tagline }) {
        const fields = [
            ['shop_name', 'SHOP_NAME', name],
            ['support_contact', 'SUPPORT_CONTACT', support],
            ['support_zalo', 'SUPPORT_ZALO', zalo],
            ['shop_tagline', 'SHOP_TAGLINE', tagline],
        ];
        for (const [key, configKey, value] of fields) {
            if (value === undefined) continue;
            this.set(key, value);
            config[configKey] = value;
        }
    },

    /**
     * Custom welcome message: { kind: 'text' | 'photo', text, entities, fileId }
     */
    getWelcome() {
        return this.getJSON('welcome') || null;
    },

    setWelcome(welcome) {
        require('./notificationService').saveValue('welcome', welcome, 'telegram-admin');
    },

    setBank(index, bank) {
        if (index === 1) {
            this.setJSON('bank1', bank);
            config.BANK = bank;
        } else {
            this.setJSON('bank2', bank);
            config.BANK2 = bank;
        }
    },
};

module.exports = settingsService;
