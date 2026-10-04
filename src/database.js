const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const dbPath = config.DB_PATH || path.join(__dirname, '..', 'data', 'shop.db');
if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    telegram_id INTEGER PRIMARY KEY,
    username TEXT,
    full_name TEXT,
    balance INTEGER DEFAULT 0,
    is_blocked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    emoji TEXT DEFAULT '📦',
    sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    emoji TEXT DEFAULT '📦',
    promotion TEXT,
    contact_only INTEGER DEFAULT 0,
    contact_url TEXT,
    sheet_stock INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    is_deleted INTEGER DEFAULT 0,
    bonus_buy INTEGER DEFAULT 0,
    bonus_free INTEGER DEFAULT 0,
    delivery_note TEXT,
    source TEXT DEFAULT 'manual',
    FOREIGN KEY (category_id) REFERENCES categories(id)
  );

  CREATE TABLE IF NOT EXISTS stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    is_sold INTEGER DEFAULT 0,
    sold_to INTEGER,
    sold_at DATETIME,
    order_id INTEGER,
    import_batch_id INTEGER,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    bonus_qty INTEGER DEFAULT 0,
    total_price INTEGER NOT NULL,
    discount INTEGER DEFAULT 0,
    coupon_code TEXT,
    payment_code TEXT UNIQUE,
    payment_method TEXT DEFAULT 'qr',
    bank_name TEXT,
    paid_amount INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    delivery_data TEXT,
    qr_chat_id INTEGER,
    qr_message_id INTEGER,
    delivery_status TEXT DEFAULT 'not_sent',
    delivery_sent_at DATETIME,
    delivery_attempts INTEGER DEFAULT 0,
    delivery_error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    delivered_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS topups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    paid_amount INTEGER DEFAULT 0,
    payment_code TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'pending',
    qr_chat_id INTEGER,
    qr_message_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(telegram_id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    provider_txn_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    content TEXT,
    status TEXT DEFAULT 'received',
    matched_type TEXT,
    matched_id INTEGER,
    raw TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (provider, provider_txn_id)
  );

  CREATE TABLE IF NOT EXISTS coupons (
    code TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
    value INTEGER NOT NULL,
    min_order INTEGER DEFAULT 0,
    max_uses INTEGER DEFAULT 0,
    used_count INTEGER DEFAULT 0,
    expires_at DATETIME,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS warranty_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    message TEXT,
    status TEXT DEFAULT 'open',
    resolution TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    FOREIGN KEY (order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS user_states (
    user_id INTEGER PRIMARY KEY,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS stock_import_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    admin_email TEXT NOT NULL,
    total_lines INTEGER NOT NULL DEFAULT 0,
    added_lines INTEGER NOT NULL DEFAULT 0,
    duplicate_lines INTEGER NOT NULL DEFAULT 0,
    blank_lines INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_email TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    metadata TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Safe migrations for existing databases
function addColumn(table, column, definition) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

addColumn('users', 'is_blocked', 'INTEGER DEFAULT 0');
addColumn('products', 'contact_url', 'TEXT');
addColumn('products', 'sheet_stock', 'INTEGER DEFAULT 0');
addColumn('products', 'is_deleted', 'INTEGER DEFAULT 0');
addColumn('products', 'bonus_buy', 'INTEGER DEFAULT 0');
addColumn('products', 'bonus_free', 'INTEGER DEFAULT 0');
addColumn('products', 'delivery_note', 'TEXT');
addColumn('products', 'source', "TEXT DEFAULT 'manual'");
addColumn('products', 'icon_emoji_id', 'TEXT');
addColumn('categories', 'icon_emoji_id', 'TEXT');
addColumn('stock', 'order_id', 'INTEGER');
addColumn('stock', 'import_batch_id', 'INTEGER');
addColumn('orders', 'bonus_qty', 'INTEGER DEFAULT 0');
addColumn('orders', 'discount', 'INTEGER DEFAULT 0');
addColumn('orders', 'coupon_code', 'TEXT');
addColumn('orders', 'payment_method', "TEXT DEFAULT 'qr'");
addColumn('orders', 'bank_name', 'TEXT');
addColumn('orders', 'paid_amount', 'INTEGER DEFAULT 0');
addColumn('orders', 'delivery_data', 'TEXT');
addColumn('orders', 'qr_chat_id', 'INTEGER');
addColumn('orders', 'qr_message_id', 'INTEGER');
addColumn('orders', 'delivery_status', "TEXT DEFAULT 'not_sent'");
addColumn('orders', 'delivery_sent_at', 'DATETIME');
addColumn('orders', 'delivery_attempts', 'INTEGER DEFAULT 0');
addColumn('orders', 'delivery_error', 'TEXT');

// Indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_stock_product_sold ON stock(product_id, is_sold);
  CREATE INDEX IF NOT EXISTS idx_stock_order ON stock(order_id);
  CREATE INDEX IF NOT EXISTS idx_stock_import_batch ON stock(import_batch_id);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_product_status ON orders(product_id, status);
  CREATE INDEX IF NOT EXISTS idx_orders_paid_at ON orders(paid_at);
  CREATE INDEX IF NOT EXISTS idx_topups_user ON topups(user_id, status);
  CREATE INDEX IF NOT EXISTS idx_topups_status ON topups(status, created_at);
  CREATE INDEX IF NOT EXISTS idx_warranty_order ON warranty_claims(order_id, status);
  CREATE INDEX IF NOT EXISTS idx_stock_import_product ON stock_import_batches(product_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_logs(created_at);
`);

// Seed data - only if categories table is empty
const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
if (catCount.c === 0 && process.env.SKIP_SEED !== '1') {
  console.log('📦 Seeding initial data...');

  const insertCat = db.prepare('INSERT INTO categories (name, emoji, sort_order) VALUES (?, ?, ?)');
  insertCat.run('ChatGPT', '🤖', 1);
  insertCat.run('Capcut', '🎬', 2);
  insertCat.run('Dịch vụ nâng cấp', '⚡', 3);

  const insertProd = db.prepare(`
    INSERT INTO products (category_id, name, price, emoji, promotion, contact_only)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // ChatGPT category (id=1)
  insertProd.run(1, 'ChatGPT Plus 1 tháng bhf', 8000, '📦', '🎁 Mua 10 tặng 2', 0);
  insertProd.run(1, 'ChatGPT Business (5 slot) bhf', 20000, '📦', null, 0);
  insertProd.run(1, 'ChatGPT Plus 1thang full hotmail bhf', 8000, '📦', '🎁 Mua 10 tặng 2', 0);
  insertProd.run(1, 'CHAT GPT GO 1 năm ( KBH )', 55000, '📦', null, 0);
  insertProd.run(1, 'Nâng chính chủ ChatGPT Plus 1 tháng', 15000, '📦', null, 1);
  insertProd.run(1, 'Gia Hạn ChatGPT Plus 1 tháng', 60000, '📦', null, 1);
  insertProd.run(1, 'CDK GPT Plus 12 tháng', 650000, '📦', null, 1);

  // Capcut category (id=2)
  insertProd.run(2, 'Capcut Pro Team 35D bhf', 12000, '📦', null, 0);

  console.log('✅ Seed data created!');
}

require('./migrations/operations')(db);
module.exports = db;
