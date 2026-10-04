const { fakeBot, seedProduct, seedUser } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const orderService = require('../src/services/orderService');
const topupService = require('../src/services/topupService');
const userService = require('../src/services/userService');
const paymentService = require('../src/services/paymentService');
const { handleTransaction } = require('../src/services/paymentProcessor');
const { createApp } = require('../src/server');

let txnSeq = 0;
const txn = (content, amount) => ({ provider: 'test', txnId: ++txnSeq, amount, content });

function newOrder(product, userId, quantity) {
    return orderService.create({
        userId,
        productId: product.id,
        quantity,
        totalPrice: product.price * quantity,
        paymentCode: paymentService.generatePaymentCode('order'),
    });
}

test('bank transfer delivers the order with HTML-escaped accounts', async () => {
    const bot = fakeBot();
    const p = seedProduct({ price: 10000, stock: ['mail@x.com|p<a&ss>|z'] });
    seedUser(30);
    const order = newOrder(p, 30, 1);

    const res = await handleTransaction(bot, txn(`IBFT ${order.payment_code.toLowerCase()} FT123`, 10000));
    assert.equal(res.status, 'paid');
    assert.equal(orderService.getById(order.id).status, 'delivered');

    const delivery = bot.sent.find((m) => m.chatId === 30 && m.text.includes('Giao hàng thành công'));
    assert.ok(delivery, 'customer receives delivery');
    assert.ok(delivery.text.includes('p&lt;a&amp;ss&gt;'), 'account data is escaped');
    assert.ok(bot.sent.some((m) => m.chatId === 1 && m.text.includes('Đã giao tự động')), 'admin notified');
});

test('transactions are idempotent', async () => {
    const bot = fakeBot();
    seedUser(31);
    const topup = topupService.create(31, 50000, paymentService.generatePaymentCode('topup'));
    const t = txn(topup.payment_code, 50000);
    assert.equal((await handleTransaction(bot, t)).status, 'topup');
    assert.equal((await handleTransaction(bot, t)).status, 'duplicate');
    assert.equal(userService.get(31).balance, 50000);
});

test('unmatched transfer alerts admins', async () => {
    const bot = fakeBot();
    const res = await handleTransaction(bot, txn('random content', 12345));
    assert.equal(res.status, 'unmatched');
    assert.ok(bot.sent.some((m) => m.chatId === 1 && m.text.includes('không khớp')));
});

test('underpayment asks for the remainder, then completes', async () => {
    const bot = fakeBot();
    const p = seedProduct({ price: 20000, stock: ['u1'] });
    seedUser(32);
    const order = newOrder(p, 32, 1);

    assert.equal((await handleTransaction(bot, txn(order.payment_code, 15000))).status, 'partial');
    assert.ok(bot.sent.some((m) => m.chatId === 32 && m.text.includes('Còn thiếu')));
    assert.equal((await handleTransaction(bot, txn(order.payment_code, 5000))).status, 'paid');
    assert.equal(orderService.getById(order.id).status, 'delivered');
});

test('payment after expiry goes to balance', async () => {
    const bot = fakeBot();
    const p = seedProduct({ stock: ['ex'] });
    seedUser(33);
    const order = newOrder(p, 33, 1);
    orderService.cancel(order.id, { status: 'expired' });
    assert.equal((await handleTransaction(bot, txn(order.payment_code, 10000))).status, 'credited');
    assert.equal(userService.get(33).balance, 10000);
});

test('out of stock after payment → manual delivery requested from admins', async () => {
    const bot = fakeBot();
    const p = seedProduct({ sheet_stock: 3 });
    seedUser(34);
    const order = newOrder(p, 34, 1);
    await handleTransaction(bot, txn(order.payment_code, 10000));
    assert.equal(orderService.getById(order.id).status, 'paid');
    const adminMsg = bot.sent.find((m) => m.chatId === 1 && m.text.includes('Cần giao thủ công'));
    assert.ok(adminMsg);
    assert.equal(adminMsg.extra.reply_markup.inline_keyboard[0][0].callback_data, `adm_deliver_${order.id}`);
});

test('SePay webhook: auth, ignore outgoing, process incoming', async () => {
    const bot = fakeBot();
    const server = createApp(bot).listen(0);
    const port = server.address().port;
    const post = (body, auth = 'Apikey test-sepay-key') =>
        fetch(`http://127.0.0.1:${port}/webhook/sepay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: auth },
            body: JSON.stringify(body),
        });

    try {
        assert.equal((await post({ id: 1, transferAmount: 1000 }, 'Apikey wrong')).status, 401);

        const out = await (await post({ id: 2, transferType: 'out', transferAmount: 1000 })).json();
        assert.equal(out.status, 'ignored');

        seedUser(35);
        const topup = topupService.create(35, 20000, paymentService.generatePaymentCode('topup'));
        const res = await post({ id: 3, transferType: 'in', transferAmount: 20000, content: `${topup.payment_code} chuyen tien` });
        assert.equal(res.status, 200);
        assert.equal((await res.json()).status, 'topup');
        assert.equal(userService.get(35).balance, 20000);

        const health = await fetch(`http://127.0.0.1:${port}/health`);
        assert.equal(health.status, 200);
    } finally {
        server.close();
    }
});
