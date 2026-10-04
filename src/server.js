const crypto = require('crypto');
const express = require('express');
const path = require('path');
const config = require('./config');
const { handleTransaction } = require('./services/paymentProcessor');
const { router: adminRouter } = require('./adminApi');
const logger = require('./utils/logger');

function safeEqual(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * HTTP server: health check, SePay payment webhook and (optionally) Telegram webhook
 */
function createApp(bot, { telegramMiddleware = null } = {}) {
    const app = express();
    app.disable('x-powered-by');
    app.locals.telegramBot = bot;

    app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

    app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'admin', 'index.html')));
    app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
    app.use('/api/admin/v1', adminRouter);

    if (config.SEPAY_API_KEY) {
        // SePay sends: Authorization: Apikey <API_KEY>
        app.post('/webhook/sepay', express.json({ limit: '100kb' }), async (req, res) => {
            if (!safeEqual(req.get('authorization') || '', `Apikey ${config.SEPAY_API_KEY}`)) {
                logger.warn(`SePay webhook rejected: bad auth from ${req.ip}`);
                return res.status(401).json({ success: false });
            }

            const b = req.body || {};
            if (b.transferType && b.transferType !== 'in') return res.json({ success: true, status: 'ignored' });
            if (!b.id || !b.transferAmount) return res.status(400).json({ success: false, message: 'Missing id/transferAmount' });

            try {
                const result = await handleTransaction(bot, {
                    provider: 'sepay',
                    txnId: b.id,
                    amount: b.transferAmount,
                    content: [b.code, b.content, b.description].filter(Boolean).join(' '),
                    raw: b,
                });
                logger.info(`SePay #${b.id} ${b.transferAmount}đ → ${result.status}`);
                return res.json({ success: true, status: result.status });
            } catch (err) {
                // Transaction not recorded → let SePay retry
                logger.error('SePay webhook error:', err);
                return res.status(500).json({ success: false });
            }
        });
    }

    if (telegramMiddleware) app.use(telegramMiddleware);

    app.use((req, res) => res.status(404).json({ ok: false }));
    return app;
}

function startServer(bot, opts = {}) {
    const app = createApp(bot, opts);
    return app.listen(config.WEBHOOK_PORT, () => {
        const routes = [config.SEPAY_API_KEY ? 'SePay webhook: POST /webhook/sepay' : '', config.ADMIN_EMAIL ? 'Admin web: GET /admin' : ''].filter(Boolean);
        logger.info(`HTTP server listening on :${config.WEBHOOK_PORT}` + (routes.length ? ` (${routes.join(' · ')})` : ''));
    });
}

module.exports = { createApp, startServer };
