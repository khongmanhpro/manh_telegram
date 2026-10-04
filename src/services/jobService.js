const db = require('../database');
const crypto = require('crypto');
const { chunkText } = require('../utils/format');

function enqueue(kind, { key, orderId = null, chatId = null, payload = null } = {}) {
    const jobKey = key || crypto.randomUUID();
    db.prepare('INSERT OR IGNORE INTO delivery_jobs(job_key,kind,order_id,chat_id,payload) VALUES(?,?,?,?,?)').run(jobKey,kind,orderId,chatId,payload === null ? null : JSON.stringify(payload));
    return db.prepare('SELECT * FROM delivery_jobs WHERE job_key=?').get(jobKey);
}
function notify(order, template, key, extra = '') {
    const text = require('./notificationService').render(template,order) + `\n\nĐơn #${order.id}` + (extra ? `\n${extra}` : '');
    return enqueue('notification',{key,orderId:order.id,chatId:order.user_id,payload:{text}});
}
function delivery(order, key = `deliver:${order.id}`) {
    const text = require('./utilsBridge').deliveryText(order);
    return enqueue('delivery',{key,orderId:order.id,chatId:order.user_id,payload:{chunks:chunkText(text)}});
}
function recover() {
    db.prepare("UPDATE delivery_jobs SET status=CASE WHEN kind='refund' THEN 'needs_review' ELSE 'pending' END,locked_at=NULL WHERE status='running'").run();
    db.prepare("UPDATE payment_refunds SET status='needs_review',last_error='Tiến trình dừng khi đang hoàn tiền; cần đối soát' WHERE status='processing'").run();
    db.prepare("UPDATE orders SET refund_status='needs_review' WHERE refund_status='pending' AND payment_charge_id IN (SELECT charge_id FROM payment_refunds WHERE status='needs_review')").run();
}
function finish(id, status, error = null) {
    db.prepare("UPDATE delivery_jobs SET status=?,last_error=?,locked_at=NULL,completed_at=CASE WHEN ?='done' THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=?").run(status,error,status,id);
}
async function runOne(bot,id) {
    const acquired = db.prepare("UPDATE delivery_jobs SET status='running',locked_at=?,attempts=attempts+1 WHERE id=? AND status IN ('pending','retry') AND next_attempt_at<=?").run(Date.now(),id,Date.now());
    if (!acquired.changes) return null;
    const job = db.prepare('SELECT * FROM delivery_jobs WHERE id=?').get(id);
    try {
        if (job.kind === 'refund') return await require('./starsService').executeRefund(bot,job);
        const orders = require('./orderService');
        const order = job.order_id ? orders.getById(job.order_id) : null;
        if (['fulfill','delivery'].includes(job.kind) && (!order || order.refund_status !== 'none')) { finish(id,'cancelled'); return { sent:false }; }
        if (job.kind === 'fulfill') {
            const result = db.transaction(() => {
                const res = orders.fulfill(order.id);
                if (!res.success) { finish(id,'needs_review',res.error); return res; }
                if (res.delivered) delivery(res.order);
                else notify(res.order,'awaiting_delivery',`awaiting:${order.id}`);
                finish(id,'done');
                return res;
            })();
            return result;
        }
        const payload = JSON.parse(job.payload || '{}');
        const chunks = payload.chunks || chunkText(payload.text || '');
        const ids = JSON.parse(job.message_ids);
        for (let i = job.progress; i < chunks.length; i++) {
            if (job.kind === 'delivery' && orders.getById(job.order_id)?.refund_status !== 'none') { finish(id,'cancelled'); return {sent:false}; }
            const message = await bot.telegram.sendMessage(job.chat_id,chunks[i],{parse_mode:'HTML',disable_web_page_preview:true,...(job.kind === 'delivery' && i === chunks.length-1 ? require('../utils/keyboard').postDeliveryKeyboard(job.order_id) : {})});
            ids.push(message.message_id);
            db.prepare('UPDATE delivery_jobs SET progress=?,message_ids=? WHERE id=?').run(i+1,JSON.stringify(ids),id);
        }
        db.transaction(() => {
            finish(id,'done');
            if (job.kind === 'delivery') orders.recordDeliveryAttempt(job.order_id,true);
        })();
        return {sent:true};
    } catch (err) {
        const code = err.response?.error_code ?? err.code;
        // Do not retain request bodies (which can contain stock secrets) in job errors.
        const error = code === 403 ? 'Khách đã chặn bot' : code === 400 ? 'Telegram từ chối nội dung tin nhắn' : 'Không gửi được tin; kiểm tra kết nối Telegram';
        const permanent = code === 403 || code === 400 || job.attempts >= 5;
        const retrySeconds = Math.max(Number(err.response?.parameters?.retry_after || 0),[5,30,120,600,1800][Math.min(job.attempts-1,4)]);
        db.prepare('UPDATE delivery_jobs SET status=?,last_error=?,locked_at=NULL,next_attempt_at=? WHERE id=?').run(permanent?'needs_review':'retry',error,Date.now()+retrySeconds*1000,id);
        if (job.kind === 'delivery') require('./orderService').recordDeliveryAttempt(job.order_id,false,error);
        if (code === 403) require('./userService').setBlocked(job.chat_id,true);
        return {sent:false,error};
    }
}
let running = false;
async function tick(bot) {
    if (running) return;
    running = true;
    try {
        require('./paymentInbox').processPending();
        const jobs = db.prepare("SELECT id FROM delivery_jobs WHERE status IN ('pending','retry') AND next_attempt_at<=? ORDER BY id LIMIT 30").all(Date.now());
        for (const job of jobs) await runOne(bot,job.id);
    } finally { running=false; }
}
function start(bot) {
    recover();
    const logger = require('../utils/logger');
    const work = () => tick(bot).catch(() => logger.error('Operations worker failed; pending work remains in database'));
    const timer = setInterval(work,5000); timer.unref(); work();
    return () => clearInterval(timer);
}
module.exports = { enqueue,notify,delivery,recover,finish,runOne,tick,start };
