require('dotenv').config();

// Timezone phải được set trước khi dùng Date ở bất kỳ đâu
const TZ = process.env.TZ || 'Asia/Ho_Chi_Minh';
process.env.TZ = TZ;

function int(name, def) {
    const v = parseInt(process.env[name], 10);
    return Number.isFinite(v) ? v : def;
}

function parseIds(...values) {
    const ids = values
        .filter(Boolean)
        .join(',')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    return [...new Set(ids)];
}

function bankFromEnv(prefix, defaults) {
    return {
        BIN: process.env[`${prefix}_BIN`] || defaults.BIN,
        ACCOUNT: process.env[`${prefix}_ACCOUNT`] || '',
        ACCOUNT_NAME: process.env[`${prefix}_ACCOUNT_NAME`] || '',
        NAME: process.env[`${prefix}_NAME`] || defaults.NAME,
    };
}

const config = {
    BOT_TOKEN: process.env.BOT_TOKEN,
    // ADMIN_IDS=1,2,3 (ADMIN_ID vẫn được hỗ trợ cho cấu hình cũ)
    ADMIN_IDS: parseIds(process.env.ADMIN_IDS, process.env.ADMIN_ID),

    // Bank config for VietQR (có thể ghi đè bằng /setbank, lưu trong DB)
    BANK: bankFromEnv('BANK', { BIN: '970422', NAME: 'MB' }),
    BANK2: process.env.BANK2_ACCOUNT ? bankFromEnv('BANK2', { BIN: '970436', NAME: 'VCB' }) : null,

    // Thanh toán tự động (SePay)
    SEPAY_API_KEY: process.env.SEPAY_API_KEY || '',
    WEBHOOK_PORT: int('WEBHOOK_PORT', 3000),
    // Opt-in: enabling Stars stops new VND purchases/topups, never converts balances.
    PAYMENT_MODE: process.env.PAYMENT_MODE || 'legacy',
    TELEGRAM_TEST_ENV: process.env.TELEGRAM_TEST_ENV === '1',

    // Telegram webhook (để trống = long polling)
    TELEGRAM_WEBHOOK_DOMAIN: process.env.TELEGRAM_WEBHOOK_DOMAIN || '',
    TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || '',

    // Admin web (để trống = không cho đăng nhập web)
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
    WEB_SESSION_SECRET: process.env.WEB_SESSION_SECRET || '',
    WEB_SESSION_TTL: int('WEB_SESSION_TTL', 8 * 60 * 60),

    // Shop (có thể ghi đè bằng /setshop)
    SHOP_NAME: process.env.SHOP_NAME || 'Starizzi Shop',
    SUPPORT_CONTACT: process.env.SUPPORT_CONTACT || '@starizzi_support',
    SUPPORT_ZALO: process.env.SUPPORT_ZALO || '', // số điện thoại hoặc link zalo.me
    SHOP_TAGLINE: process.env.SHOP_TAGLINE || 'Uy tín tạo nên thương hiệu',
    DEFAULT_DELIVERY_NOTE:
        process.env.DEFAULT_DELIVERY_NOTE ??
        'maill | passmail | passchatgpt\nlog vào outlook.com để lấy code nha các bạn',

    // Đơn hàng
    ORDER_EXPIRE_MINUTES: int('ORDER_EXPIRE_MINUTES', 15),
    MAX_PENDING_ORDERS: int('MAX_PENDING_ORDERS', 3),
    MAX_QTY: int('MAX_QTY', 50),
    LOW_STOCK_THRESHOLD: int('LOW_STOCK_THRESHOLD', 3),

    // Nạp tiền
    NAP_MIN: int('NAP_MIN', 10000),
    NAP_MAX: int('NAP_MAX', 50000000),

    // Báo cáo & backup (HH:MM, để trống để tắt)
    DAILY_REPORT_TIME: process.env.DAILY_REPORT_TIME ?? '22:00',
    BACKUP_TIME: process.env.BACKUP_TIME ?? '03:00',
    BACKUP_KEEP: int('BACKUP_KEEP', 7),

    // Google Sheet
    GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID || '',
    SHEET_SYNC_INTERVAL: int('SHEET_SYNC_INTERVAL', 5),

    DB_PATH: process.env.DB_PATH || '',
    TZ,
};

Object.defineProperty(config, 'ADMIN_ID', {
    get: () => config.ADMIN_IDS[0] || 0,
    enumerable: true,
});

/**
 * Kiểm tra cấu hình bắt buộc. Trả về { errors, warnings }.
 */
config.validate = () => {
    const errors = [];
    const warnings = [];
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!config.BOT_TOKEN || !/^\d+:[\w-]{30,}$/.test(config.BOT_TOKEN)) {
        errors.push('BOT_TOKEN chưa được cấu hình hoặc sai định dạng (lấy từ @BotFather)');
    }
    if (!['legacy', 'stars'].includes(config.PAYMENT_MODE)) errors.push('PAYMENT_MODE phải là legacy hoặc stars');
    if (config.ADMIN_IDS.length === 0) {
        // Not fatal: the bot must run so the owner can send /myid to get their ID
        warnings.push('ADMIN_IDS chưa được cấu hình — gửi /myid cho bot để lấy ID, điền vào .env rồi restart');
    }
    for (const [key, bank] of [['BANK', config.BANK], ['BANK2', config.BANK2]]) {
        if (!bank) continue;
        if (!/^\d{6}$/.test(bank.BIN)) errors.push(`${key}_BIN phải là mã BIN 6 chữ số`);
        if (!bank.ACCOUNT) warnings.push(`${key}_ACCOUNT chưa được cấu hình — QR thanh toán sẽ không hợp lệ`);
    }
    for (const key of ['DAILY_REPORT_TIME', 'BACKUP_TIME']) {
        if (config[key] && !timeRe.test(config[key])) errors.push(`${key} phải có dạng HH:MM`);
    }
    if (config.TELEGRAM_WEBHOOK_DOMAIN && !config.TELEGRAM_WEBHOOK_SECRET) {
        warnings.push('Nên đặt TELEGRAM_WEBHOOK_SECRET khi dùng TELEGRAM_WEBHOOK_DOMAIN');
    }
    if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD || !config.WEB_SESSION_SECRET) {
        warnings.push('Admin web chưa cấu hình đủ ADMIN_EMAIL, ADMIN_PASSWORD và WEB_SESSION_SECRET');
    }
    if (!config.SEPAY_API_KEY) {
        warnings.push('SEPAY_API_KEY chưa cấu hình — thanh toán cần admin xác nhận thủ công');
    }
    return { errors, warnings };
};

module.exports = config;
