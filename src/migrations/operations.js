// Additive migrations. Never reconstruct historical payments from current balances.
module.exports = function migrate(db) {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP)');
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE version = 1').get()) return;
    db.transaction(() => {
        const add = (table, name, type) => {
            if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
        };
        add('products', 'stars_price', 'INTEGER');
        for (const [name, type] of Object.entries({ currency: "TEXT NOT NULL DEFAULT 'VND'", product_name_snapshot: 'TEXT', unit_price_snapshot: 'INTEGER', delivery_note_snapshot: 'TEXT', invoice_payload: 'TEXT', expires_at: 'TEXT', terms_version: 'TEXT', payment_charge_id: 'TEXT', refund_status: "TEXT NOT NULL DEFAULT 'none'" })) add('orders', name, type);
        db.exec(`
          CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payload ON orders(invoice_payload) WHERE invoice_payload IS NOT NULL;
          CREATE UNIQUE INDEX IF NOT EXISTS idx_order_charge ON orders(payment_charge_id) WHERE payment_charge_id IS NOT NULL;
          CREATE TABLE wallet_ledger (
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(telegram_id), currency TEXT NOT NULL DEFAULT 'VND' CHECK(currency='VND'),
            amount INTEGER NOT NULL, balance_before INTEGER NOT NULL, balance_after INTEGER NOT NULL CHECK(balance_after>=0),
            reason TEXT NOT NULL, actor TEXT NOT NULL, reference TEXT, operation_key TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX idx_wallet_user ON wallet_ledger(user_id,id);
          CREATE TRIGGER wallet_ledger_no_update BEFORE UPDATE ON wallet_ledger BEGIN SELECT RAISE(ABORT, 'Immutable ledger'); END;
          CREATE TRIGGER wallet_ledger_no_delete BEFORE DELETE ON wallet_ledger BEGIN SELECT RAISE(ABORT, 'Immutable ledger'); END;
          CREATE TABLE payment_events (
            id INTEGER PRIMARY KEY, provider TEXT NOT NULL, provider_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'payment',
            currency TEXT NOT NULL, amount INTEGER NOT NULL, user_id INTEGER, order_id INTEGER, topup_id INTEGER,
            payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', result TEXT, error TEXT, attempts INTEGER DEFAULT 0,
            next_attempt_at INTEGER DEFAULT 0, legacy INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, processed_at TEXT,
            UNIQUE(provider,provider_id,kind)
          );
          CREATE INDEX idx_events_status ON payment_events(status,next_attempt_at);
          CREATE TABLE delivery_jobs (
            id INTEGER PRIMARY KEY, job_key TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, order_id INTEGER, chat_id INTEGER,
            payload TEXT, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
            next_attempt_at INTEGER NOT NULL DEFAULT 0, locked_at INTEGER, last_error TEXT,
            progress INTEGER NOT NULL DEFAULT 0, message_ids TEXT NOT NULL DEFAULT '[]', created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
          );
          CREATE INDEX idx_jobs_status ON delivery_jobs(status,next_attempt_at);
          CREATE TABLE payment_refunds (
            id INTEGER PRIMARY KEY, charge_id TEXT NOT NULL UNIQUE, order_id INTEGER, user_id INTEGER NOT NULL, amount INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL, actor TEXT NOT NULL,
            attempts INTEGER DEFAULT 0, last_error TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
          );
          CREATE TABLE admin_operations (
            operation_key TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL, status_code INTEGER NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE notification_versions (
            id INTEGER PRIMARY KEY, template_key TEXT NOT NULL, body TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE notification_templates (template_key TEXT PRIMARY KEY, version_id INTEGER NOT NULL REFERENCES notification_versions(id));
          INSERT INTO wallet_ledger(user_id,amount,balance_before,balance_after,reason,actor,operation_key)
            SELECT telegram_id,balance,0,balance,'Số dư đầu kỳ','migration','opening:'||telegram_id FROM users;
          INSERT INTO payment_events(provider,provider_id,currency,amount,payload,status,legacy,order_id,topup_id)
            SELECT provider,provider_txn_id,'VND',amount,COALESCE(raw,'{}'),'needs_review',1,
              CASE WHEN matched_type='order' THEN matched_id END, CASE WHEN matched_type='topup' THEN matched_id END FROM transactions;
          INSERT INTO schema_migrations(version) VALUES(1);
        `);
    })();
};
