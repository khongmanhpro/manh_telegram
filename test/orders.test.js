const { seedProduct, seedUser } = require('./helpers');
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/database');
const orderService = require('../src/services/orderService');
const productService = require('../src/services/productService');
const userService = require('../src/services/userService');
const couponService = require('../src/services/couponService');
const paymentService = require('../src/services/paymentService');

let codeSeq = 0;
function newOrder(product, userId, quantity, extra = {}) {
    return orderService.create({
        userId,
        productId: product.id,
        quantity,
        totalPrice: product.price * quantity,
        paymentCode: `DHTEST${String(++codeSeq).padStart(4, '0')}`,
        ...extra,
    });
}

test('pending orders reserve stock', () => {
    const p = seedProduct({ stock: ['a1', 'a2', 'a3'] });
    seedUser(10);
    assert.equal(productService.getById(p.id).display_stock, 3);
    newOrder(p, 10, 2);
    assert.equal(productService.getById(p.id).display_stock, 1);
});

test('addStock skips blanks and duplicates', () => {
    const p = seedProduct({ stock: ['x1'] });
    const res = productService.addStock(p.id, ['x1', 'x2', ' x2 ', '', 'x3']);
    assert.deepEqual(res, { added: 2, duplicates: 2 });
    assert.equal(productService.countUnsold(p.id), 3);
});

test('partial then full payment delivers, credits excess and links stock to order', () => {
    const p = seedProduct({ price: 10000, stock: ['acc1', 'acc2'] });
    seedUser(11);
    const order = newOrder(p, 11, 2);

    const partial = orderService.applyPayment(order.id, 5000);
    assert.equal(partial.state, 'partial');
    assert.equal(partial.remaining, 15000);

    const complete = orderService.applyPayment(order.id, 20000);
    assert.equal(complete.state, 'complete');
    assert.equal(complete.excess, 5000);
    assert.equal(userService.get(11).balance, 5000);

    const res = orderService.fulfill(order.id);
    assert.equal(res.delivered, true);
    assert.deepEqual(res.accounts, ['acc1', 'acc2']);
    assert.equal(res.order.status, 'delivered');
    assert.equal(res.order.delivery_data, 'acc1\nacc2');
    const linked = db.prepare('SELECT COUNT(*) AS c FROM stock WHERE order_id = ? AND sold_to = 11').get(order.id).c;
    assert.equal(linked, 2);

    // second fulfill must not deliver again
    assert.equal(orderService.fulfill(order.id).success, false);
});

test('payment to a non-pending order is credited to balance', () => {
    const p = seedProduct({ stock: ['z'] });
    seedUser(12);
    const order = newOrder(p, 12, 1);
    orderService.cancel(order.id, { userId: 12 });
    const res = orderService.applyPayment(order.id, 10000);
    assert.equal(res.state, 'not_pending');
    assert.equal(userService.get(12).balance, 10000);
});

test('without stock the order becomes paid (manual delivery) and manualDeliver completes it', () => {
    const p = seedProduct({ sheet_stock: 5 });
    seedUser(13);
    const order = newOrder(p, 13, 2);
    orderService.applyPayment(order.id, order.total_price);
    const res = orderService.fulfill(order.id);
    assert.equal(res.delivered, false);
    assert.equal(res.order.status, 'paid');

    const done = orderService.manualDeliver(order.id, ['m1', 'm2']);
    assert.equal(done.success, true);
    assert.equal(done.order.status, 'delivered');
    assert.equal(productService.getById(p.id).sheet_stock, 3);
});

test('only the owner can cancel; paid amount is refunded', () => {
    const p = seedProduct({ stock: ['c1'] });
    seedUser(14);
    seedUser(15);
    const order = newOrder(p, 14, 1);
    orderService.applyPayment(order.id, 4000);

    assert.equal(orderService.cancel(order.id, { userId: 15 }).success, false);
    const res = orderService.cancel(order.id, { userId: 14 });
    assert.equal(res.success, true);
    assert.equal(res.refunded, 4000);
    assert.equal(userService.get(14).balance, 4000);
    assert.equal(orderService.cancel(order.id, { userId: 14 }).success, false);
});

test('admin can cancel a paid order with full refund', () => {
    const p = seedProduct({ sheet_stock: 1 });
    seedUser(16);
    const order = newOrder(p, 16, 1);
    orderService.fulfill(order.id, { markFullyPaid: true });
    assert.equal(orderService.cancel(order.id).success, false);
    const res = orderService.cancel(order.id, { allowPaid: true });
    assert.equal(res.refunded, p.price);
});

test('expireOld expires stale QR orders only', () => {
    const p = seedProduct({ stock: ['e1', 'e2'] });
    seedUser(17);
    const old = newOrder(p, 17, 1);
    const fresh = newOrder(p, 17, 1);
    db.prepare("UPDATE orders SET created_at = datetime('now', '-30 minutes') WHERE id = ?").run(old.id);

    const expired = orderService.expireOld(15);
    assert.deepEqual(expired.map((r) => r.order.id), [old.id]);
    assert.equal(orderService.getById(old.id).status, 'expired');
    assert.equal(orderService.getById(fresh.id).status, 'pending');
});

test('payWithBalance is atomic', () => {
    const p = seedProduct({ price: 10000, stock: ['b1'] });
    seedUser(18, 5000);
    const params = { userId: 18, productId: p.id, quantity: 1, totalPrice: 10000, paymentCode: paymentService.generatePaymentCode() };
    assert.equal(orderService.payWithBalance(params).success, false);
    assert.equal(orderService.countByUser(18), 0);

    userService.addBalance(18, 5000);
    const res = orderService.payWithBalance({ ...params, paymentCode: paymentService.generatePaymentCode() });
    assert.equal(res.success, true);
    assert.equal(userService.get(18).balance, 0);
    assert.equal(orderService.fulfill(res.order.id).delivered, true);
});

test('coupons: validation, per-user limit, usage counted on payment', () => {
    const p = seedProduct({ price: 20000, stock: ['k1', 'k2'] });
    seedUser(19);
    couponService.create({ code: 'sale10', value: '10%', maxUses: 1, minOrder: 15000 });

    assert.equal(couponService.validate('SALE10', 19, 10000).ok, false); // below min order
    const v = couponService.validate('SALE10', 19, 20000);
    assert.equal(v.ok, true);
    assert.equal(v.discount, 2000);

    const order = newOrder(p, 19, 1, { totalPrice: 18000, discount: 2000, couponCode: 'SALE10' });
    assert.equal(couponService.validate('SALE10', 19, 20000).ok, false); // already used by this user

    orderService.applyPayment(order.id, 18000);
    orderService.fulfill(order.id);
    assert.equal(couponService.get('SALE10').used_count, 1);
    seedUser(20);
    assert.equal(couponService.validate('SALE10', 20, 20000).ok, false); // max uses reached

    couponService.create({ code: 'FREE', value: '100%' });
    assert.equal(couponService.validate('FREE', 20, 20000).discount, 20000);
    assert.throws(() => couponService.create({ code: 'x', value: '10' }));
});

test('stats revenue counts paid and delivered orders', () => {
    const stats = orderService.getStats();
    assert.ok(stats.totalRevenue > 0);
    assert.ok(orderService.revenueSince('2000-01-01 00:00:00').c > 0);
});
