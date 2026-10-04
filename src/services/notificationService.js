const db = require('../database');
const { h, formatPrice } = require('../utils/format');
const definitions = {
    welcome: { title: 'Chào mừng', body: 'Chào {name}, chào mừng đến với {shop}.' },
    payment_received: { title: 'Đã nhận thanh toán', body: 'Shop đã nhận thanh toán cho đơn {order_id}.' },
    awaiting_delivery: { title: 'Chờ giao hàng', body: 'Shop đang chuẩn bị hàng cho đơn {order_id}. Bạn có thể liên hệ hỗ trợ nếu cần.' },
    delivered: { title: 'Giao hàng', body: 'Cảm ơn bạn đã mua hàng tại {shop}.' },
    expired: { title: 'Đơn hết hạn', body: 'Đơn {order_id} đã hết hạn. Bạn có thể đặt lại trong danh sách sản phẩm.' },
    cancelled: { title: 'Hủy đơn', body: 'Đơn {order_id} đã được hủy.' },
    refunded: { title: 'Hoàn tiền', body: 'Khoản thanh toán của đơn {order_id} đã được hoàn.' },
};
const variables = ['name', 'shop', 'order_id', 'product', 'amount'];
function validate(key, body) {
    if (!definitions[key]) throw new Error('Không tìm thấy mẫu thông báo');
    if (typeof body !== 'string' || !body.trim() || body.length > 1000) throw new Error('Nội dung cần từ 1 đến 1000 ký tự');
    if (/[<>]/.test(body)) throw new Error('Dùng văn bản thuần và biến; không nhập thẻ HTML');
    for (const match of body.matchAll(/\{([^{}]*)\}/g)) if (!variables.includes(match[1])) throw new Error(`Biến không hỗ trợ: {${match[1]}}`);
    if (/[{}]/.test(body.replace(/\{(?:name|shop|order_id|product|amount)\}/g, ''))) throw new Error('Biến trong mẫu chưa đúng định dạng');
}
function welcome() { return JSON.parse(db.prepare("SELECT value FROM settings WHERE key='welcome'").get()?.value || 'null'); }
function current(key) {
    const row = db.prepare('SELECT v.* FROM notification_templates t JOIN notification_versions v ON v.id=t.version_id WHERE t.template_key=?').get(key);
    return row ? { ...row, value: JSON.parse(row.body) } : null;
}
function saveValue(key, value, actor) {
    return db.transaction(() => {
        const id = db.prepare('INSERT INTO notification_versions(template_key,body,actor) VALUES(?,?,?)').run(key, JSON.stringify(value), actor).lastInsertRowid;
        db.prepare('INSERT INTO notification_templates(template_key,version_id) VALUES(?,?) ON CONFLICT(template_key) DO UPDATE SET version_id=excluded.version_id').run(key,id);
        if (key === 'welcome') db.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('welcome',?)").run(JSON.stringify(value));
        return get(key);
    })();
}
function get(key) {
    if (!definitions[key]) return null;
    const row = current(key);
    const value = key === 'welcome' ? welcome() : row?.value;
    return { key, title: definitions[key].title, body: value?.text ?? definitions[key].body, version: row?.id ?? null, hasMedia: value?.kind === 'photo', variables, versions: db.prepare('SELECT id,actor,created_at FROM notification_versions WHERE template_key=? ORDER BY id DESC LIMIT 30').all(key) };
}
function save(key, text, actor) {
    validate(key,text);
    if (key === 'welcome') {
        const old = welcome();
        if (old && !current(key)) saveValue(key,old,'legacy');
        return saveValue(key,{ ...old, kind: old?.kind || 'text', text, entities: old?.text === text ? old.entities : [] },actor);
    }
    return saveValue(key,{text},actor);
}
function restore(key, version, actor) {
    const row = db.prepare('SELECT * FROM notification_versions WHERE id=? AND template_key=?').get(version,key);
    if (!row) throw new Error('Không tìm thấy phiên bản của mẫu');
    return saveValue(key,JSON.parse(row.body),actor);
}
function render(key, context = {}, override) {
    const body = override ?? current(key)?.value?.text ?? definitions[key]?.body ?? '';
    const config = require('../config');
    const values = { name: context.user_name || context.name || 'bạn', shop: config.SHOP_NAME, order_id: context.id ? `#${context.id}` : '—', product: context.product_name || '', amount: formatPrice(context.total_price || 0, context.currency || 'VND') };
    return h(body).replace(/\{(name|shop|order_id|product|amount)\}/g, (_, key) => h(values[key]));
}
module.exports = { definitions, variables, get, save, saveValue, restore, render, validate };
