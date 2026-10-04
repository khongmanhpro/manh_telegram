const state = { csrf: null };

async function request(path, options = {}) {
    const headers = { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
    if (options.method && options.method !== 'GET' && state.csrf) headers['X-CSRF-Token'] = state.csrf;
    const response = await fetch(`/api/admin/v1${path}`, { credentials: 'same-origin', ...options, headers });
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = { ok: false, error: { code: 'INVALID_RESPONSE', message: 'Máy chủ trả về dữ liệu không hợp lệ' } };
    }
    if (body.ok && body.data?.csrf) state.csrf = body.data.csrf;
    if (response.status === 401) {
        state.csrf = null;
        window.dispatchEvent(new CustomEvent('admin:session-expired'));
    }
    if (!response.ok || !body.ok) {
        const error = new Error(body.error?.message || 'Không thể hoàn tất yêu cầu');
        error.code = body.error?.code;
        error.status = response.status;
        error.details = body.error?.details;
        throw error;
    }
    return body.data;
}

export const api = {
    login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    session: () => request('/auth/session'),
    logout: () => request('/auth/logout', { method: 'POST' }),
    dashboard: (params = '') => request(`/dashboard${params ? `?${params}` : ''}`),
    categories: () => request('/categories'),
    createCategory: (body) => request('/categories', { method: 'POST', body: JSON.stringify(body) }),
    updateCategory: (id, body) => request(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    products: (params = '') => request(`/products${params ? `?${params}` : ''}`),
    createProduct: (body) => request('/products', { method: 'POST', body: JSON.stringify(body) }),
    updateProduct: (id, body) => request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    stock: (id, reveal = false) => request(`/products/${id}/stock?reveal=${reveal ? '1' : '0'}`),
    stockPreview: (id, text) => request(`/products/${id}/stock/preview`, { method: 'POST', body: JSON.stringify({ text }) }),
    stockImport: (id, text) => request(`/products/${id}/stock/import`, { method: 'POST', body: JSON.stringify({ text }) }),
    batches: (id) => request(`/products/${id}/stock/batches`),
    orders: (params = '') => request(`/orders${params ? `?${params}` : ''}`),
    order: (id, reveal = false) => request(`/orders/${id}?reveal=${reveal ? '1' : '0'}`),
    confirmPayment: (id, amount) => request(`/orders/${id}/confirm-payment`, { method: 'POST', body: JSON.stringify({ amount }) }),
    deliver: (id, body) => request(`/orders/${id}/deliver`, { method: 'POST', body: JSON.stringify(body) }),
    resend: (id) => request(`/orders/${id}/resend`, { method: 'POST', body: JSON.stringify({}) }),
    cancel: (id, reason) => request(`/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
};

export function formatMoney(value) {
    return `${new Intl.NumberFormat('vi-VN').format(Number(value) || 0)}đ`;
}

export function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
