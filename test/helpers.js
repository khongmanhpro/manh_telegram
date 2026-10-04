// Test environment — must be required before any src module
process.env.DB_PATH = ':memory:';
process.env.BOT_TOKEN = '123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz';
process.env.ADMIN_IDS = '1';
process.env.ADMIN_ID = '';
process.env.BANK_BIN = '970422';
process.env.BANK_ACCOUNT = '0123456789';
process.env.BANK_ACCOUNT_NAME = 'TEST SHOP';
process.env.SEPAY_API_KEY = 'test-sepay-key';
process.env.GOOGLE_SHEET_ID = '';
process.env.DAILY_REPORT_TIME = '';
process.env.BACKUP_TIME = '';

const sent = [];

/**
 * Minimal fake bot for services (records outgoing Telegram calls)
 */
function fakeBot() {
    sent.length = 0;
    let nextId = 100;
    return {
        sent,
        telegram: {
            sendMessage: async (chatId, text, extra) => {
                sent.push({ chatId, text, extra });
                return { message_id: nextId++, chat: { id: chatId } };
            },
            editMessageReplyMarkup: async () => true,
            deleteMessage: async () => true,
            sendDocument: async () => ({ message_id: nextId++ }),
            copyMessage: async () => ({ message_id: nextId++ }),
        },
    };
}

function seedProduct(overrides = {}) {
    const productService = require('../src/services/productService');
    const db = require('../src/database');
    const id = productService.addProduct(1, overrides.name || 'Test Product', overrides.price ?? 10000);
    if (overrides.bonus_buy) productService.update(id, { bonus_buy: overrides.bonus_buy, bonus_free: overrides.bonus_free });
    if (overrides.stock) productService.addStock(id, overrides.stock);
    if (overrides.sheet_stock) db.prepare('UPDATE products SET sheet_stock = ? WHERE id = ?').run(overrides.sheet_stock, id);
    return productService.getById(id);
}

function seedUser(id, balance = 0) {
    const userService = require('../src/services/userService');
    userService.findOrCreate({ id, first_name: `User${id}` });
    if (balance) userService.addBalance(id, balance);
    return userService.get(id);
}

module.exports = { fakeBot, seedProduct, seedUser, sent };
