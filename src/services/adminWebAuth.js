const crypto = require('crypto');
const config = require('../config');

const COOKIE_NAME = 'admin_session';
const sessions = new Map();
const failures = new Map();

function safeEqual(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function cookieSignature(token) {
    return crypto.createHmac('sha256', config.WEB_SESSION_SECRET).update(token).digest('base64url');
}

function cookieValue(token) {
    return `${token}.${cookieSignature(token)}`;
}

function parseCookies(header = '') {
    return header.split(';').reduce((cookies, part) => {
        const index = part.indexOf('=');
        if (index < 0) return cookies;
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key) cookies[key] = decodeURIComponent(value);
        return cookies;
    }, {});
}

function cookieOptions(maxAge) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

function sessionCookie(token) {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    return `${COOKIE_NAME}=${encodeURIComponent(cookieValue(token))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.WEB_SESSION_TTL}${secure}`;
}

function configured() {
    return Boolean(config.ADMIN_EMAIL && config.ADMIN_PASSWORD && config.WEB_SESSION_SECRET);
}

function attemptKey(email, ip) {
    return `${String(ip || 'unknown')}:${String(email || '').trim().toLowerCase()}`;
}

function login(email, password, ip) {
    if (!configured()) return { ok: false, code: 'AUTH_NOT_CONFIGURED' };

    const key = attemptKey(email, ip);
    const attempt = failures.get(key);
    const now = Date.now();
    if (attempt?.lockedUntil > now) {
        return { ok: false, code: 'AUTH_LOCKED', retryAfter: Math.ceil((attempt.lockedUntil - now) / 1000) };
    }

    const validEmail = safeEqual(String(email || '').trim().toLowerCase(), config.ADMIN_EMAIL.trim().toLowerCase());
    const validPassword = safeEqual(password || '', config.ADMIN_PASSWORD);
    if (!validEmail || !validPassword) {
        const count = (attempt?.count || 0) + 1;
        failures.set(key, { count, lockedUntil: count >= 3 ? now + 15000 : 0 });
        return { ok: false, code: count >= 3 ? 'AUTH_LOCKED' : 'AUTH_FAILED', retryAfter: count >= 3 ? 15 : 0 };
    }

    failures.delete(key);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { email: config.ADMIN_EMAIL, createdAt: now, lastSeenAt: now, csrf: crypto.randomBytes(24).toString('hex') });
    return { ok: true, token, session: sessions.get(token) };
}

function getSessionFromRequest(req) {
    if (!configured()) return null;
    const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    if (!raw) return null;
    const [token, signature] = raw.split('.');
    if (!token || !signature || !safeEqual(signature, cookieSignature(token))) return null;

    const session = sessions.get(token);
    if (!session) return null;
    const now = Date.now();
    if (now - session.createdAt > config.WEB_SESSION_TTL * 1000) {
        sessions.delete(token);
        return null;
    }
    session.lastSeenAt = now;
    return { ...session, token };
}

function destroyFromRequest(req) {
    const raw = parseCookies(req.headers.cookie || '')[COOKIE_NAME];
    const token = raw?.split('.')[0];
    if (token) sessions.delete(token);
}

function clearExpired() {
    const cutoff = Date.now() - config.WEB_SESSION_TTL * 1000;
    for (const [token, session] of sessions) {
        if (session.createdAt < cutoff) sessions.delete(token);
    }
}

function getPublicSession(session) {
    if (!session) return null;
    return { email: session.email, csrf: session.csrf, expiresIn: config.WEB_SESSION_TTL };
}

module.exports = {
    COOKIE_NAME,
    configured,
    login,
    getSessionFromRequest,
    destroyFromRequest,
    clearExpired,
    getPublicSession,
    sessionCookie,
    cookieOptions,
};
