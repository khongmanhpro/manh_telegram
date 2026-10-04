const { seedProduct, seedUser } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBot } = require('../src/app');
const orderService = require('../src/services/orderService');
const productService = require('../src/services/productService');
const userService = require('../src/services/userService');
const couponService = require('../src/services/couponService');
const { handleTransaction } = require('../src/services/paymentProcessor');

const bot = createBot();
bot.botInfo = { id: 999, is_bot: true, first_name: 'Test', username: 'test_bot' };

const calls = [];
let msgId = 1000;
// Telegraf creates a Telegram client per update → stub the prototype (no network)
require('telegraf').Telegram.prototype.callApi = async (method, payload) => {
    calls.push({ method, payload });
    if (['sendMessage', 'sendPhoto', 'copyMessage', 'sendDocument'].includes(method)) {
        return { message_id: ++msgId, chat: { id: payload.chat_id, type: 'private' }, date: 0, text: payload.text };
    }
    return true;
};

// QR images are downloaded by the bot — keep tests offline
require('../src/services/paymentService').fetchQrImage = async () => Buffer.from('fake-png');

let updateId = 0;
const user = (id) => ({ id, is_bot: false, first_name: `U${id}` });

function sendText(from, text) {
    const entities = text.startsWith('/') ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }] : undefined;
    return bot.handleUpdate({
        update_id: ++updateId,
        message: { message_id: ++msgId, from: user(from), chat: { id: from, type: 'private' }, date: 0, text, entities },
    });
}

function press(from, data, { photo = false } = {}) {
    const message = { message_id: ++msgId, chat: { id: from, type: 'private' }, date: 0 };
    if (photo) message.photo = [{ file_id: 'x' }];
    else message.text = 'prev';
    return bot.handleUpdate({
        update_id: ++updateId,
        callback_query: { id: String(updateId), from: user(from), message, chat_instance: '1', data },
    });
}

const lastCall = (method, chatId) => [...calls].reverse().find((c) => c.method === method && (chatId === undefined || c.payload.chat_id === chatId));
const cbAnswers = () => calls.filter((c) => c.method === 'answerCallbackQuery').map((c) => c.payload.text || '');

test('full purchase flow: product → quantity → QR → bank transfer → delivery', async () => {
    const p = seedProduct({ name: 'Flow <Pro>', price: 10000, stock: ['f1', 'f2', 'f3'] });
    calls.length = 0;

    await sendText(50, '/start');
    assert.ok(lastCall('sendMessage', 50).payload.text.includes('Chào mừng'));

    await press(50, `product_${p.id}`);
    const qtyMsg = lastCall('editMessageText');
    assert.ok(qtyMsg.payload.text.includes('Flow &lt;Pro&gt;'), 'product name escaped');

    await press(50, `qty_${p.id}_2`);
    assert.ok(lastCall('editMessageText').payload.text.includes('Xác nhận đơn hàng'));

    await press(50, `pq_${p.id}_2_0_-`);
    const photo = lastCall('sendPhoto', 50);
    assert.ok(photo, 'QR photo sent');
    const order = orderService.getRecentByUser(50, 1)[0];
    assert.equal(order.status, 'pending');
    assert.ok(order.qr_message_id, 'QR message id stored for later cleanup');
    assert.ok(lastCall('sendMessage', 1).payload.text.includes(`Đơn mới #${order.id}`));

    const res = await handleTransaction(bot, { provider: 't', txnId: 'flow1', amount: 20000, content: order.payment_code });
    assert.equal(res.status, 'paid');
    const delivered = calls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === 50 && c.payload.text.includes('Giao hàng thành công'));
    assert.ok(delivered.payload.text.includes('<code>f1</code>'));
    assert.equal(productService.countUnsold(p.id), 1);
});

test('customers cannot cancel other people\'s orders', async () => {
    const p = seedProduct({ stock: ['c1'] });
    seedUser(51);
    const order = orderService.create({ userId: 51, productId: p.id, quantity: 1, totalPrice: 10000, paymentCode: 'DHCANCEL01' });
    calls.length = 0;

    await press(52, `cancel_order_${order.id}`);
    assert.equal(orderService.getById(order.id).status, 'pending');
    assert.ok(cbAnswers().some((t) => t.includes('không có quyền')));

    await press(51, `cancel_order_${order.id}`, { photo: true });
    assert.equal(orderService.getById(order.id).status, 'cancelled');
    assert.ok(lastCall('deleteMessage'));
});

test('pending order limit blocks spam', async () => {
    const p = seedProduct({ stock: ['s1', 's2', 's3', 's4', 's5'] });
    for (let i = 0; i < 3; i++) await press(53, `pq_${p.id}_1_0_-`);
    assert.equal(orderService.countPendingByUser(53), 3);
    calls.length = 0;
    await press(53, `pq_${p.id}_1_0_-`);
    assert.equal(orderService.countPendingByUser(53), 3);
    assert.ok(lastCall('sendMessage', 53).payload.text.includes('đơn chờ thanh toán'));
});

test('coupon via text input + pay with balance delivers instantly', async () => {
    const p = seedProduct({ price: 20000, stock: ['cp1'] });
    couponService.create({ code: 'GIAM5K', value: '5000' });
    seedUser(54, 15000);

    await press(54, `cp_${p.id}_1`);
    await sendText(54, 'giam5k');
    const summary = lastCall('sendMessage', 54).payload;
    assert.ok(summary.text.includes('-5.000đ'));
    const buttons = summary.reply_markup.inline_keyboard.flat().map((b) => b.callback_data);
    assert.ok(buttons.includes(`pb_${p.id}_1_GIAM5K`));

    calls.length = 0;
    await press(54, `pb_${p.id}_1_GIAM5K`);
    assert.equal(userService.get(54).balance, 0);
    const order = orderService.getRecentByUser(54, 1)[0];
    assert.equal(order.status, 'delivered');
    assert.equal(order.discount, 5000);
    assert.ok(calls.some((c) => c.method === 'sendMessage' && c.payload.text?.includes('<code>cp1</code>')));
});

test('bonus quantity "mua 2 tặng 1" is delivered', async () => {
    const p = seedProduct({ price: 1000, stock: ['b1', 'b2', 'b3', 'b4'], bonus_buy: 2, bonus_free: 1 });
    seedUser(55, 2000);
    await press(55, `pb_${p.id}_2_-`);
    const order = orderService.getRecentByUser(55, 1)[0];
    assert.equal(order.bonus_qty, 1);
    assert.equal(order.delivery_data.split('\n').length, 3);
});

test('admin commands are protected and addstock works via state', async () => {
    calls.length = 0;
    await sendText(56, '/admin');
    assert.ok(lastCall('sendMessage', 56).payload.text.includes('không có quyền'));

    const p = seedProduct({});
    await sendText(1, `/addstock ${p.id}`);
    await sendText(1, 'n1\nn2\nn1');
    assert.equal(productService.countUnsold(p.id), 2);
    assert.ok(lastCall('sendMessage', 1).payload.text.includes('Bỏ qua 1'));
});

test('manual delivery flow for out-of-stock product', async () => {
    const p = seedProduct({ sheet_stock: 2 });
    seedUser(57);
    const order = orderService.create({ userId: 57, productId: p.id, quantity: 1, totalPrice: 10000, paymentCode: 'DHMANUAL01' });

    await press(1, `admin_confirm_${order.id}`);
    assert.equal(orderService.getById(order.id).status, 'paid');
    await sendText(1, 'manual|acc<1>');
    assert.equal(orderService.getById(order.id).status, 'delivered');
    assert.ok(calls.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 57 && c.payload.text.includes('manual|acc&lt;1&gt;')));
});

test('warranty: customer reports, admin replaces from stock', async () => {
    const p = seedProduct({ stock: ['w1', 'w2'] });
    seedUser(58, 10000);
    await press(58, `pb_${p.id}_1_-`);
    const order = orderService.getRecentByUser(58, 1)[0];
    assert.equal(order.status, 'delivered');

    await press(58, `wr_${order.id}`);
    await sendText(58, 'Tài khoản bị khóa');
    const adminMsg = lastCall('sendMessage', 1).payload;
    const claimBtn = adminMsg.reply_markup.inline_keyboard[0][0].callback_data;
    assert.match(claimBtn, /^wra_\d+$/);

    calls.length = 0;
    await press(1, claimBtn);
    assert.ok(calls.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 58 && c.payload.text.includes('<code>w2</code>')));
});

test('/start shows the shop grid immediately', async () => {
    calls.length = 0;
    await sendText(60, '/start');
    const welcome = lastCall('sendMessage', 60).payload;
    const buttons = welcome.reply_markup.inline_keyboard.flat();
    assert.ok(buttons.some((b) => /^(cat|product)_/.test(b.callback_data)), 'shop buttons on welcome');
    assert.ok(buttons.some((b) => b.style), 'buttons are colored');
    assert.ok(calls.some((c) => c.method === 'sendMessage' && c.payload.reply_markup?.remove_keyboard), 'legacy keyboard removed');
});

test('/setwelcome stores a custom welcome with entities and {name}', async () => {
    await sendText(1, '/setwelcome');
    await bot.handleUpdate({
        update_id: ++updateId,
        message: {
            message_id: ++msgId, from: user(1), chat: { id: 1, type: 'private' }, date: 0,
            text: 'HELLO {name} 🔥', entities: [{ type: 'bold', offset: 0, length: 5 }, { type: 'custom_emoji', offset: 13, length: 2, custom_emoji_id: '99' }],
        },
    });
    calls.length = 0;
    await sendText(61, '/start');
    const msg = lastCall('sendMessage', 61).payload;
    assert.equal(msg.text, 'HELLO U61 🔥');
    assert.deepEqual(msg.entities.find((e) => e.type === 'custom_emoji'), { type: 'custom_emoji', offset: 10, length: 2, custom_emoji_id: '99' });
    assert.ok(msg.reply_markup.inline_keyboard.length > 0);

    await sendText(1, '/setwelcome reset');
    await sendText(61, '/start');
    assert.ok(lastCall('sendMessage', 61).payload.text.includes('Chào mừng'));
});

test('/seticon sets a custom emoji icon on a category button', async () => {
    await sendText(1, '/seticon cat 1');
    await bot.handleUpdate({
        update_id: ++updateId,
        message: {
            message_id: ++msgId, from: user(1), chat: { id: 1, type: 'private' }, date: 0,
            text: '🤖', entities: [{ type: 'custom_emoji', offset: 0, length: 2, custom_emoji_id: '777' }],
        },
    });
    assert.equal(productService.getCategory(1).icon_emoji_id, '777');
});

test('without a configured bank: no QR option, admins alerted, QR callback refused', async () => {
    const config = require('../src/config');
    const saved = config.BANK.ACCOUNT;
    config.BANK.ACCOUNT = '';
    try {
        const p = seedProduct({ stock: ['nb1'] });
        calls.length = 0;
        await press(62, `qty_${p.id}_1`);
        const screen = lastCall('editMessageText').payload;
        assert.ok(screen.text.includes('đang được cập nhật'));
        assert.ok(!screen.reply_markup.inline_keyboard.flat().some((b) => b.callback_data.startsWith('pq_')));
        assert.ok(calls.some((c) => c.method === 'sendMessage' && c.payload.chat_id === 1 && c.payload.text.includes('Chưa cấu hình tài khoản')));

        await press(62, `pq_${p.id}_1_0_-`);
        assert.equal(orderService.countPendingByUser(62), 0);
    } finally {
        config.BANK.ACCOUNT = saved;
    }
});
