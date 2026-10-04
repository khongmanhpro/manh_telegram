const express = require('express');
const productService = require('./services/productService');
const orderService = require('./services/orderService');
const deliveryService = require('./services/deliveryService');
const adminAuditService = require('./services/adminAuditService');
const auth = require('./services/adminWebAuth');
const { toDbDate } = require('./utils/format');

const router = express.Router();
router.use(express.json({ limit: '8mb' }));

function ok(res, data) {
    return res.json({ ok: true, data });
}

function fail(res, status, code, message, details = undefined) {
    const body = { ok: false, error: { code, message } };
    if (details !== undefined) body.error.details = details;
    return res.status(status).json(body);
}

function sessionRequired(req, res, next) {
    const session = auth.getSessionFromRequest(req);
    if (!session) return fail(res, 401, 'AUTH_REQUIRED', 'Phiên đăng nhập đã hết hạn');
    req.adminSession = session;
    return next();
}

function writeSessionRequired(req, res, next) {
    const result = sessionRequired(req, res, () => {
        const csrf = req.get('x-csrf-token');
        if (!csrf || csrf !== req.adminSession.csrf) return fail(res, 403, 'CSRF_REQUIRED', 'Yêu cầu bảo vệ phiên không hợp lệ');
        return next();
    });
    return result;
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function intValue(value, fallback = null) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : fallback;
}

function dateRange(req) {
    const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '');
    if ((req.query.from && !isDate(req.query.from)) || (req.query.to && !isDate(req.query.to))) return null;
    const start = req.query.from && isDate(req.query.from) ? new Date(`${req.query.from}T00:00:00`) : new Date();
    if (!req.query.from) start.setHours(0, 0, 0, 0);
    const end = req.query.to && isDate(req.query.to) ? new Date(`${req.query.to}T00:00:00`) : new Date(start);
    if (!req.query.to) end.setDate(end.getDate() + 1);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null;
    return { from: toDbDate(start), to: toDbDate(end) };
}

function parseStockLines(body) {
    if (Array.isArray(body?.lines)) return body.lines.map((line) => String(line));
    if (typeof body?.text === 'string') return body.text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    return null;
}

function productFields(body) {
    const map = {
        name: 'name', price: 'price', description: 'description', categoryId: 'category_id',
        emoji: 'emoji', promotion: 'promotion', contactOnly: 'contact_only', contactUrl: 'contact_url',
        isActive: 'is_active', bonusBuy: 'bonus_buy', bonusFree: 'bonus_free', deliveryNote: 'delivery_note',
    };
    return Object.entries(map).reduce((fields, [input, output]) => {
        if (Object.prototype.hasOwnProperty.call(body || {}, input)) fields[output] = body[input];
        return fields;
    }, {});
}

function validateProductFields(fields, creating = false) {
    if (creating && (!String(fields.name || '').trim() || !Number.isInteger(Number(fields.price)) || Number(fields.price) < 0)) {
        return 'Tên sản phẩm và giá hợp lệ là bắt buộc';
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'name') && !String(fields.name || '').trim()) return 'Tên sản phẩm không được để trống';
    if (Object.prototype.hasOwnProperty.call(fields, 'price') && (!Number.isInteger(Number(fields.price)) || Number(fields.price) < 0)) return 'Giá sản phẩm không hợp lệ';
    for (const key of ['category_id', 'bonus_buy', 'bonus_free']) {
        if (Object.prototype.hasOwnProperty.call(fields, key) && fields[key] !== null && !Number.isInteger(Number(fields[key]))) return `${key} không hợp lệ`;
    }
    return null;
}

function mask(value) {
    const text = String(value || '');
    if (text.length <= 8) return '••••••';
    return `••••••${text.slice(-4)}`;
}

function sanitizeOrder(order, reveal = false) {
    if (!order) return null;
    const result = { ...order, delivery_data: undefined, deliveryDataAvailable: Boolean(order.delivery_data) };
    if (reveal && order.delivery_data) result.delivery_data = order.delivery_data;
    if (!reveal) delete result.delivery_data;
    return result;
}

function sanitizePreview(preview) {
    return {
        productId: preview.product.id,
        totalLines: preview.totalLines,
        added: preview.added,
        duplicates: preview.duplicates,
        blank: preview.blank,
        duplicateInBatch: preview.duplicateInBatch,
        duplicateInStock: preview.duplicateInStock,
    };
}

router.post('/auth/login', (req, res) => {
    const { email, password } = req.body || {};
    const result = auth.login(email, password, req.ip);
    if (result.ok) {
        res.set('Set-Cookie', auth.sessionCookie(result.token));
        return ok(res, auth.getPublicSession(result.session));
    }
    if (result.code === 'AUTH_NOT_CONFIGURED') return fail(res, 503, result.code, 'Admin web chưa được cấu hình');
    if (result.code === 'AUTH_LOCKED') return fail(res, 429, result.code, 'Đăng nhập tạm khóa, thử lại sau', { retryAfter: result.retryAfter });
    return fail(res, 401, 'AUTH_FAILED', 'Email hoặc mật khẩu không đúng');
});

router.get('/auth/session', sessionRequired, (req, res) => ok(res, auth.getPublicSession(req.adminSession)));

router.post('/auth/logout', (req, res) => {
    auth.destroyFromRequest(req);
    res.set('Set-Cookie', auth.cookieOptions(0));
    return ok(res, { loggedOut: true });
});

router.get('/dashboard', sessionRequired, (req, res) => {
    const range = dateRange(req);
    if (!range) return fail(res, 400, 'INVALID_DATE_RANGE', 'Khoảng ngày không hợp lệ');
    return ok(res, { range, ...orderService.dashboardStats(range.from, range.to) });
});

router.get('/categories', sessionRequired, (req, res) => {
    const products = productService.getAllForAdmin();
    const categories = productService.getCategories().map((category) => ({
        ...category,
        product_count: products.filter((product) => product.category_id === category.id).length,
    }));
    return ok(res, categories);
});

router.post('/categories', writeSessionRequired, (req, res) => {
    const name = String(req.body?.name || '').trim();
    if (!name) return fail(res, 400, 'VALIDATION_ERROR', 'Tên danh mục không được để trống');
    const id = productService.addCategory(name, req.body?.emoji || '📦');
    if (req.body?.sortOrder !== undefined) productService.updateCategory(id, { sort_order: intValue(req.body.sortOrder, 99) });
    adminAuditService.record(req.adminSession.email, 'category.create', 'category', id);
    return ok(res, productService.getCategory(id));
});

router.patch('/categories/:id', writeSessionRequired, (req, res) => {
    const id = intValue(req.params.id);
    if (!id || !productService.getCategory(id)) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy danh mục');
    const fields = {};
    if (req.body?.name !== undefined) fields.name = String(req.body.name).trim();
    if (req.body?.emoji !== undefined) fields.emoji = String(req.body.emoji);
    if (req.body?.sortOrder !== undefined) fields.sort_order = intValue(req.body.sortOrder, 0);
    if (req.body?.iconEmojiId !== undefined) fields.icon_emoji_id = req.body.iconEmojiId;
    if (fields.name === '') return fail(res, 400, 'VALIDATION_ERROR', 'Tên danh mục không được để trống');
    productService.updateCategory(id, fields);
    adminAuditService.record(req.adminSession.email, 'category.update', 'category', id, { fields: Object.keys(fields) });
    return ok(res, productService.getCategory(id));
});

router.get('/products', sessionRequired, (req, res) => ok(res, productService.getAdminList({
    query: req.query.q || '',
    categoryId: req.query.categoryId,
    source: req.query.source || null,
    isActive: req.query.isActive,
})));

router.post('/products', writeSessionRequired, (req, res) => {
    const fields = productFields(req.body);
    const error = validateProductFields(fields, true);
    if (error) return fail(res, 400, 'VALIDATION_ERROR', error);
    const id = productService.addAdminProduct({
        ...fields,
        name: String(fields.name).trim(),
        price: Number(fields.price),
    });
    adminAuditService.record(req.adminSession.email, 'product.create', 'product', id);
    return ok(res, productService.getById(id));
});

router.patch('/products/:id', writeSessionRequired, (req, res) => {
    const id = intValue(req.params.id);
    const fields = productFields(req.body);
    const error = validateProductFields(fields);
    if (!id) return fail(res, 400, 'VALIDATION_ERROR', 'ID sản phẩm không hợp lệ');
    if (error) return fail(res, 400, 'VALIDATION_ERROR', error);
    const result = productService.updateAdmin(id, fields);
    if (result.error) return fail(res, result.code === 'SHEET_OWNED_FIELD' ? 409 : 404, result.code || 'NOT_FOUND', result.error);
    adminAuditService.record(req.adminSession.email, 'product.update', 'product', id, { fields: Object.keys(fields) });
    return ok(res, result.product);
});

router.get('/products/:id/stock', sessionRequired, (req, res) => {
    const productId = intValue(req.params.id);
    if (!productId || !productService.getById(productId)) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
    const reveal = req.query.reveal === '1' || req.query.reveal === 'true';
    if (reveal) adminAuditService.record(req.adminSession.email, 'stock.reveal', 'product', productId);
    const rows = productService.getStockRows(productId, { limit: req.query.limit, offset: req.query.offset }).map((row) => ({
        ...row,
        data: reveal ? row.data : mask(row.data),
    }));
    return ok(res, { rows, revealed: reveal, batches: productService.getImportBatches(productId) });
});

router.post('/products/:id/stock/preview', writeSessionRequired, (req, res) => {
    const productId = intValue(req.params.id);
    const lines = parseStockLines(req.body);
    if (!productId || !lines) return fail(res, 400, 'VALIDATION_ERROR', 'Cần gửi nội dung nhập kho');
    if (lines.join('\n').length > 6 * 1024 * 1024) return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Tệp nhập kho vượt quá 6 MB');
    const preview = productService.previewStock(productId, lines);
    if (preview.error) return fail(res, 404, 'NOT_FOUND', preview.error);
    return ok(res, sanitizePreview(preview));
});

router.post('/products/:id/stock/import', writeSessionRequired, (req, res) => {
    const productId = intValue(req.params.id);
    const lines = parseStockLines(req.body);
    if (!productId || !lines) return fail(res, 400, 'VALIDATION_ERROR', 'Cần gửi nội dung nhập kho');
    if (lines.join('\n').length > 6 * 1024 * 1024) return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Tệp nhập kho vượt quá 6 MB');
    const result = productService.importStock(productId, lines, req.adminSession.email);
    if (result.error) return fail(res, 404, 'NOT_FOUND', result.error);
    adminAuditService.record(req.adminSession.email, 'stock.import', 'product', productId, {
        batchId: result.batchId, added: result.added, duplicates: result.duplicates, blank: result.blank.length,
    });
    return ok(res, { ...sanitizePreview(result), batchId: result.batchId });
});

router.get('/products/:id/stock/batches', sessionRequired, (req, res) => {
    const productId = intValue(req.params.id);
    if (!productId || !productService.getById(productId)) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy sản phẩm');
    return ok(res, productService.getImportBatches(productId));
});

router.get('/orders', sessionRequired, (req, res) => {
    const result = orderService.getAdminList({
        status: req.query.status || null,
        deliveryStatus: req.query.deliveryStatus || null,
        query: req.query.q || '',
        page: req.query.page,
        limit: req.query.limit,
    });
    return ok(res, { ...result, rows: result.rows.map((order) => sanitizeOrder(order)) });
});

router.get('/orders/:id', sessionRequired, (req, res) => {
    const id = intValue(req.params.id);
    const order = orderService.getById(id);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
    const reveal = req.query.reveal === '1' || req.query.reveal === 'true';
    if (reveal && order.delivery_data) adminAuditService.record(req.adminSession.email, 'order.delivery_reveal', 'order', id);
    return ok(res, sanitizeOrder(order, reveal));
});

router.post('/orders/:id/confirm-payment', writeSessionRequired, asyncRoute(async (req, res) => {
    const id = intValue(req.params.id);
    const order = orderService.getById(id);
    const amount = intValue(req.body?.amount);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
    if (order.status !== 'pending') return fail(res, 409, 'ORDER_STATE_CONFLICT', 'Đơn hàng không còn chờ thanh toán');
    if (!amount || amount <= 0) return fail(res, 400, 'VALIDATION_ERROR', 'Số tiền nhận phải lớn hơn 0');
    const payment = orderService.applyPayment(id, amount);
    let delivery = null;
    if (payment.state === 'complete') delivery = await deliveryService.fulfillOrder(req.app.locals.telegramBot, id, { method: 'admin xác nhận' });
    adminAuditService.record(req.adminSession.email, 'order.confirm_payment', 'order', id, { amount, state: payment.state });
    return ok(res, { payment, delivery, order: sanitizeOrder(orderService.getById(id)) });
}));

router.post('/orders/:id/deliver', writeSessionRequired, asyncRoute(async (req, res) => {
    const id = intValue(req.params.id);
    const order = orderService.getById(id);
    if (!order) return fail(res, 404, 'NOT_FOUND', 'Không tìm thấy đơn hàng');
    if (order.status !== 'paid' && !req.body?.markFullyPaid) return fail(res, 409, 'ORDER_STATE_CONFLICT', 'Đơn chưa ở trạng thái đã thanh toán');
    const manualLines = parseStockLines(req.body);
    let result;
    if (manualLines && manualLines.some((line) => line.trim())) {
        result = await deliveryService.manualDeliver(req.app.locals.telegramBot, id, manualLines.filter((line) => line.trim()));
    } else {
        result = await deliveryService.fulfillOrder(req.app.locals.telegramBot, id, { method: 'admin giao hàng', markFullyPaid: Boolean(req.body?.markFullyPaid) });
    }
    if (!result.success) return fail(res, 409, 'ORDER_STATE_CONFLICT', result.error);
    adminAuditService.record(req.adminSession.email, 'order.deliver', 'order', id, { manual: Boolean(manualLines) });
    return ok(res, { result, order: sanitizeOrder(orderService.getById(id)) });
}));

router.post('/orders/:id/resend', writeSessionRequired, asyncRoute(async (req, res) => {
    const id = intValue(req.params.id);
    const result = await deliveryService.resendOrder(req.app.locals.telegramBot, id);
    if (!result.success) return fail(res, 409, 'DELIVERY_NOT_AVAILABLE', result.error);
    adminAuditService.record(req.adminSession.email, 'order.delivery_resend', 'order', id);
    return ok(res, { ...result, order: sanitizeOrder(orderService.getById(id)) });
}));

router.post('/orders/:id/cancel', writeSessionRequired, (req, res) => {
    const id = intValue(req.params.id);
    const result = orderService.cancel(id, { allowPaid: true });
    if (!result.success) return fail(res, 409, 'ORDER_STATE_CONFLICT', result.error);
    adminAuditService.record(req.adminSession.email, 'order.cancel', 'order', id, { reason: String(req.body?.reason || '').slice(0, 500), refunded: result.refunded });
    return ok(res, { ...result, order: sanitizeOrder(result.order) });
});

router.use((err, req, res, _next) => {
    if (res.headersSent) return undefined;
    if (err?.type === 'entity.too.large') return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Nội dung gửi lên quá lớn');
    if (err instanceof SyntaxError && err.status === 400) return fail(res, 400, 'INVALID_JSON', 'Dữ liệu JSON không hợp lệ');
    return fail(res, 500, 'INTERNAL_ERROR', 'Đã xảy ra lỗi máy chủ');
});

module.exports = { router, sessionRequired, writeSessionRequired };
