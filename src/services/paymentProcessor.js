const db = require('../database');
const orderService = require('./orderService');
const topupService = require('./topupService');
const paymentService = require('./paymentService');
const userService = require('./userService');
const deliveryService = require('./deliveryService');
const { safeSend, notifyAdmins, clearQrMessage } = require('./notifier');
const messages = require('../utils/messages');
const { shopKeyboard } = require('../utils/keyboard');
const { h, formatPrice } = require('../utils/format');
const logger = require('../utils/logger');

const stmts = {
    insert: db.prepare(`
        INSERT OR IGNORE INTO transactions (provider, provider_txn_id, amount, content, raw)
        VALUES (?, ?, ?, ?, ?)
    `),
    mark: db.prepare('UPDATE transactions SET status = ?, matched_type = ?, matched_id = ? WHERE id = ?'),
};

function findTarget(text) {
    for (const code of paymentService.extractCodes(text)) {
        const order = orderService.getByPaymentCode(code);
        if (order) return { type: 'order', record: order };
        const topup = topupService.getByCode(code);
        if (topup) return { type: 'topup', record: topup };
    }
    return null;
}

async function handleOrder(bot, order, amount) {
    const res = orderService.applyPayment(order.id, amount);

    if (res.state === 'complete') {
        if (res.excess > 0) {
            const balance = userService.get(order.user_id).balance;
            await safeSend(bot, order.user_id, messages.creditedToBalance(res.excess, 'Số tiền chuyển dư so với đơn hàng.', balance));
        }
        await deliveryService.fulfillOrder(bot, order.id, { method: 'chuyển khoản' });
        return 'paid';
    }

    if (res.state === 'partial') {
        await safeSend(bot, order.user_id, messages.partialPayment(res.order, res.remaining));
        await notifyAdmins(bot, `⚠️ Đơn #${order.id} nhận thiếu: ${formatPrice(res.order.paid_amount)}/${formatPrice(order.total_price)}`);
        return 'partial';
    }

    // Order no longer pending (expired/cancelled/already paid) → money goes to balance
    const balance = userService.get(order.user_id).balance;
    await safeSend(
        bot,
        order.user_id,
        messages.creditedToBalance(amount, `Đơn #${order.id} không còn chờ thanh toán (${messages.STATUS[order.status] || order.status}).`, balance)
    );
    await notifyAdmins(bot, `ℹ️ Nhận ${formatPrice(amount)} cho đơn #${order.id} (${h(order.status)}) → đã cộng vào số dư khách <code>${order.user_id}</code>`);
    return 'credited';
}

async function handleTopup(bot, topup, amount) {
    const res = topupService.credit(topup.id, amount);
    if (!res.success) return 'error';
    await clearQrMessage(bot, topup.qr_chat_id, topup.qr_message_id);
    await safeSend(bot, topup.user_id, messages.topupSuccess(amount, res.balance), shopKeyboard());
    await notifyAdmins(bot, `💰 Nạp tiền #${topup.id}: +${formatPrice(amount)} cho <code>${topup.user_id}</code>`);
    return 'topup';
}

/**
 * Process an incoming bank transfer (idempotent by provider + txnId).
 * txn: { provider, txnId, amount, content, raw }
 * Returns { status } — duplicate | ignored | unmatched | paid | partial | credited | topup
 */
async function handleTransaction(bot, txn) {
    const amount = Math.round(Number(txn.amount));
    if (!Number.isFinite(amount) || amount <= 0) return { status: 'ignored' };

    const inserted = stmts.insert.run(
        txn.provider,
        String(txn.txnId),
        amount,
        txn.content || '',
        txn.raw ? JSON.stringify(txn.raw) : null
    );
    if (inserted.changes === 0) return { status: 'duplicate' };
    const rowId = inserted.lastInsertRowid;

    const target = findTarget(txn.content);
    if (!target) {
        stmts.mark.run('unmatched', null, null, rowId);
        await notifyAdmins(
            bot,
            `❓ <b>Giao dịch không khớp đơn nào</b>\n` +
            `💰 ${formatPrice(amount)}\n` +
            `📝 ${h(txn.content || '(trống)')}\n` +
            `🆔 ${h(txn.provider)} #${h(txn.txnId)}`
        );
        return { status: 'unmatched' };
    }

    stmts.mark.run('matched', target.type, target.record.id, rowId);

    try {
        const status = target.type === 'order'
            ? await handleOrder(bot, target.record, amount)
            : await handleTopup(bot, target.record, amount);
        return { status, type: target.type, id: target.record.id };
    } catch (err) {
        logger.error(`Processing transaction ${txn.provider}#${txn.txnId} failed:`, err);
        await notifyAdmins(bot, `🚨 Lỗi xử lý giao dịch ${h(txn.provider)} #${h(txn.txnId)}: ${h(err.message)}`);
        return { status: 'error' };
    }
}

module.exports = { handleTransaction, findTarget };
