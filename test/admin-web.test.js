process.env.DB_PATH = ':memory:';
process.env.BOT_TOKEN = '123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz';
process.env.ADMIN_IDS = '1';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'test-password';
process.env.WEB_SESSION_SECRET = 'test-session-secret';
process.env.SEPAY_API_KEY = 'test-sepay-key';
process.env.DAILY_REPORT_TIME = '';
process.env.BACKUP_TIME = '';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/server');
const { fakeBot, seedProduct, seedUser } = require('./helpers');
const db = require('../src/database');
const productService = require('../src/services/productService');
const orderService = require('../src/services/orderService');
const deliveryService = require('../src/services/deliveryService');
const paymentService = require('../src/services/paymentService');

let server;
let base;
let cookie;
let csrf;
let bot;

async function jsonRequest(path, options = {}) {
    const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(options.headers || {}) };
    const response = await fetch(`${base}${path}`, { ...options, headers, body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body });
    return { response, body: await response.json() };
}

test.before(async () => {
    bot = fakeBot();
    server = createApp(bot).listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => server.close());

test('admin web authenticates and protects API routes', async () => {
    const unauthenticated = await fetch(`${base}/api/admin/v1/categories`);
    assert.equal(unauthenticated.status, 401);

    const login = await jsonRequest('/api/admin/v1/auth/login', { method: 'POST', body: { email: 'admin@example.com', password: 'test-password' } });
    assert.equal(login.response.status, 200);
    assert.equal(login.body.ok, true);
    cookie = login.response.headers.get('set-cookie').split(';')[0];
    csrf = login.body.data.csrf;

    const session = await jsonRequest('/api/admin/v1/auth/session');
    assert.equal(session.response.status, 200);
    assert.equal(session.body.data.email, 'admin@example.com');
});

test('admin product and stock import preserve valid lines and report duplicates', async () => {
    const product = await jsonRequest('/api/admin/v1/products', { method: 'POST', body: { name: 'Web import product', price: 12000 } });
    assert.equal(product.response.status, 200);
    const id = product.body.data.id;
    const text = 'account|pass\naccount|pass\n\n  keep spaces  ';

    const preview = await jsonRequest(`/api/admin/v1/products/${id}/stock/preview`, { method: 'POST', body: { text } });
    assert.equal(preview.response.status, 200);
    assert.deepEqual(preview.body.data, {
        productId: id,
        totalLines: 4,
        added: 2,
        duplicates: 1,
        blank: [3],
        duplicateInBatch: [2],
        duplicateInStock: [],
    });

    const imported = await jsonRequest(`/api/admin/v1/products/${id}/stock/import`, { method: 'POST', body: { text } });
    assert.equal(imported.response.status, 200);
    assert.equal(imported.body.data.added, 2);
    assert.equal(imported.body.data.batchId > 0, true);

    const stock = await jsonRequest(`/api/admin/v1/products/${id}/stock?reveal=1`);
    assert.equal(stock.response.status, 200);
    assert.deepEqual(stock.body.data.rows.map((row) => row.data).sort(), ['  keep spaces  ', 'account|pass'].sort());
    assert.equal(stock.body.data.batches[0].added_lines, 2);
});

test('sheet products reject edits to sheet-owned fields', async () => {
    const product = await jsonRequest('/api/admin/v1/products', { method: 'POST', body: { name: 'Sheet product', price: 5000 } });
    const id = product.body.data.id;
    db.prepare("UPDATE products SET source = 'sheet' WHERE id = ?").run(id);
    const update = await jsonRequest(`/api/admin/v1/products/${id}`, { method: 'PATCH', body: { name: 'Changed from web' } });
    assert.equal(update.response.status, 409);
    assert.equal(update.body.error.code, 'SHEET_OWNED_FIELD');
});

test('resend uses existing delivery data without taking more stock', async () => {
    const product = seedProduct({ name: 'Resend product', stock: ['delivered-account'] });
    seedUser(9001);
    const order = orderService.create({
        userId: 9001,
        productId: product.id,
        quantity: 1,
        totalPrice: product.price,
        paymentCode: paymentService.generatePaymentCode('order'),
    });
    orderService.applyPayment(order.id, order.total_price);
    const delivered = await deliveryService.fulfillOrder(bot, order.id, { method: 'test' });
    assert.equal(delivered.sent, true);
    assert.equal(productService.countUnsold(product.id), 0);

    bot.telegram.sendMessage = async () => { throw new Error('blocked'); };
    const resend = await jsonRequest(`/api/admin/v1/orders/${order.id}/resend`, { method: 'POST', body: {} });
    assert.equal(resend.response.status, 409);
    assert.equal(productService.countUnsold(product.id), 0);
    assert.equal(orderService.getById(order.id).delivery_status, 'failed');
});
