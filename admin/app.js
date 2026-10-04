import { api, formatDate, formatMoney } from './api.js';

const app = document.querySelector('#app');
const state = {
    session: null,
    page: 'dashboard',
    loading: false,
    error: null,
    dashboard: null,
    products: [],
    categories: [],
    selectedProduct: null,
    stock: null,
    orders: null,
    selectedOrder: null,
    revealStock: false,
    revealOrder: false,
    productFilters: { q: '', categoryId: '', source: '', isActive: '' },
    orderFilters: { status: '', deliveryStatus: '', q: '' },
};

const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const statusLabel = { pending: 'Chờ thanh toán', paid: 'Đã thanh toán · chờ giao', delivered: 'Đã giao', cancelled: 'Đã hủy', expired: 'Hết hạn' };
const deliveryLabel = { not_sent: 'Chưa gửi', sent: 'Gửi thành công', failed: 'Gửi thất bại' };
const navItems = [
    ['dashboard', '⌂', 'Tổng quan'], ['products', '▦', 'Sản phẩm'], ['inventory', '▤', 'Kho hàng'], ['orders', '▣', 'Đơn hàng'],
    ['notifications', '◌', 'Thông báo'], ['reports', '◒', 'Báo cáo'], ['users', '♙', 'Khách hàng'], ['warranty', '↺', 'Bảo hành'], ['settings', '⚙', 'Cài đặt'],
];

function toast(message, kind = '') {
    let region = document.querySelector('.toast-region');
    if (!region) { region = document.createElement('div'); region.className = 'toast-region'; document.body.append(region); }
    const item = document.createElement('div'); item.className = `toast ${kind}`; item.textContent = message; region.append(item);
    setTimeout(() => item.remove(), 4000);
}

function errorMessage(error) { return error?.message || 'Không thể hoàn tất yêu cầu'; }

function layout(content) {
    return `<div class="app-shell">
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-brand"><span>✦</span><div>Shop Admin</div></div>
        <nav aria-label="Điều hướng chính">
          <div class="nav-label">Vận hành</div>
          <div class="nav-group">${navItems.slice(0, 4).map(([id, icon, label]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-nav="${id}"><span>${icon}</span>${label}</button>`).join('')}</div>
          <div class="nav-label">Mở rộng</div>
          <div class="nav-group">${navItems.slice(4).map(([id, icon, label]) => `<button class="nav-item ${state.page === id ? 'active' : ''}" data-nav="${id}"><span>${icon}</span>${label}<span class="soon">Soon</span></button>`).join('')}</div>
        </nav>
        <div class="sidebar-footer"><div class="user-chip">${esc(state.session?.email || '')}</div><button class="button ghost small" data-action="logout">Đăng xuất</button></div>
      </aside>
      <main class="main"><div class="topbar"><button class="button ghost mobile-menu" data-action="toggle-menu" aria-label="Mở menu">☰</button><div class="eyebrow">Quản trị bot Telegram</div><div class="topbar-actions"><span class="badge ok">● Đang kết nối</span></div></div>${content}</main>
    </div>`;
}

function loadingView() { return `<div class="card"><div class="skeleton" style="width:30%;margin-bottom:18px"></div><div class="skeleton" style="height:80px"></div></div>`; }

function lockedView(title) {
    return `<section class="view"><div class="view-header"><div><div class="eyebrow">Chưa kết nối backend</div><h1>${esc(title)}</h1><p>Màn này đã có trong bản thiết kế và sẽ được nối ở đợt tiếp theo.</p></div></div><div class="section-card locked"><div><div class="locked-icon">◌</div><h2>Chức năng đang khóa</h2><p class="muted">Không có thao tác giả hoặc dữ liệu demo. Dữ liệu thật sẽ được bật sau khi API tương ứng hoàn tất.</p></div></div></section>`;
}

function metric(label, value, foot) { return `<div class="card"><div class="metric-label">${esc(label)}</div><div class="metric-value">${value}</div><div class="metric-foot">${esc(foot || '')}</div></div>`; }
function badge(value, map = {}) { const kind = map[value] || ''; return `<span class="badge ${kind}">${esc(value)}</span>`; }

async function loadDashboard() {
    state.loading = true; state.error = null; render();
    try { state.dashboard = await api.dashboard(); } catch (error) { state.error = errorMessage(error); } finally { state.loading = false; render(); }
}

async function loadProducts() {
    state.loading = true; state.error = null; render();
    try {
        const params = new URLSearchParams();
        if (state.productFilters.q) params.set('q', state.productFilters.q);
        if (state.productFilters.categoryId) params.set('categoryId', state.productFilters.categoryId);
        if (state.productFilters.source) params.set('source', state.productFilters.source);
        if (state.productFilters.isActive !== '') params.set('isActive', state.productFilters.isActive);
        [state.products, state.categories] = await Promise.all([api.products(params.toString()), api.categories()]);
    } catch (error) { state.error = errorMessage(error); } finally { state.loading = false; render(); }
}

async function loadInventory(productId = state.selectedProduct?.id) {
    if (!productId) return;
    state.loading = true; state.error = null; render();
    try { state.stock = await api.stock(productId, state.revealStock); } catch (error) { state.error = errorMessage(error); } finally { state.loading = false; render(); }
}

async function loadOrders() {
    state.loading = true; state.error = null; render();
    try {
        const params = new URLSearchParams();
        Object.entries(state.orderFilters).forEach(([key, value]) => { if (value) params.set(key === 'q' ? 'q' : key, value); });
        state.orders = await api.orders(params.toString());
    } catch (error) { state.error = errorMessage(error); } finally { state.loading = false; render(); }
}

function dashboardView() {
    const d = state.dashboard;
    if (state.loading) return `<section class="view"><div class="view-header"><div><div class="eyebrow">Tổng quan</div><h1>Đang tải dữ liệu</h1></div></div>${loadingView()}</section>`;
    if (state.error) return `<section class="view"><div class="view-header"><div><div class="eyebrow">Tổng quan</div><h1>Không tải được dữ liệu</h1></div></div><div class="error-box">${esc(state.error)} <button class="button link" data-action="reload-dashboard">Thử lại</button></div></section>`;
    const inventory = d?.inventory || { real: 0, reserved: 0, sellable: 0 };
    const counts = d?.counts || {};
    const issues = d?.issues || {};
    return `<section class="view"><div class="view-header"><div><div class="eyebrow">Tổng quan</div><h1>Điều hành shop</h1><p>Doanh thu tính theo thời điểm thanh toán.</p></div><div class="button-row"><button class="button ghost" data-action="reload-dashboard">↻ Làm mới</button></div></div>
      <div class="cards">${metric('Doanh thu kỳ này', formatMoney(d?.revenue?.revenue), `${d?.revenue?.count || 0} đơn đã thanh toán`)}${metric('Đơn chờ thanh toán', counts.pending || 0, 'Cần kiểm tra tiền chuyển')}${metric('Đơn chờ giao', counts.paid || 0, 'Đã nhận tiền, chưa giao đủ')}${metric('Còn bán được', inventory.sellable, `${inventory.real} thực · ${inventory.reserved} tạm giữ`)}</div>
      <div class="grid-2"><div class="section-card"><div class="section-head"><h2>Cần xử lý</h2><button class="button link" data-nav="orders">Xem đơn hàng</button></div><div class="section-body"><div class="detail-list"><div><dt>Chờ thanh toán</dt><dd>${issues.pendingPayment || 0}</dd></div><div><dt>Chờ giao thủ công</dt><dd>${issues.awaitingDelivery || 0}</dd></div><div><dt>Gửi Telegram thất bại</dt><dd>${issues.deliveryFailed || 0}</dd></div><div><dt>Đơn đang thiếu tiền</dt><dd>${issues.underpaid || 0}</dd></div></div></div></div>
      <div class="section-card"><div class="section-head"><h2>Tồn kho</h2><button class="button link" data-nav="inventory">Mở kho</button></div><div class="section-body"><div class="detail-list"><div><dt>Tồn kho thực</dt><dd>${inventory.real}</dd></div><div><dt>Tạm giữ</dt><dd>${inventory.reserved}</dd></div><div><dt>Còn bán được</dt><dd>${inventory.sellable}</dd></div></div></div></div></div></section>`;
}

function productForm(product = {}) {
    const sheet = product.source === 'sheet';
    return `<form id="product-form" class="form-stack" data-product-id="${product.id || ''}"><div class="form-grid">
      <div class="field wide"><label for="product-name">Tên sản phẩm</label><input id="product-name" name="name" value="${esc(product.name || '')}" required ${sheet ? 'disabled' : ''}></div>
      <div class="field"><label for="product-price">Giá (VNĐ)</label><input id="product-price" name="price" type="number" min="0" value="${product.price || 0}" required ${sheet ? 'disabled' : ''}></div>
      <div class="field"><label for="product-category">Danh mục</label><select id="product-category" name="categoryId" ${sheet ? 'disabled' : ''}><option value="">Chưa phân loại</option>${state.categories.map((c) => `<option value="${c.id}" ${Number(product.category_id) === Number(c.id) ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field wide"><label for="product-description">Mô tả</label><textarea id="product-description" name="description" ${sheet ? 'disabled' : ''}>${esc(product.description || '')}</textarea>${sheet ? '<small>Trường này do Google Sheet quản lý.</small>' : ''}</div>
      <div class="field"><label for="product-promotion">Khuyến mãi</label><input id="product-promotion" name="promotion" value="${esc(product.promotion || '')}"></div>
      <div class="field"><label for="product-note">Ghi chú giao hàng</label><input id="product-note" name="deliveryNote" value="${esc(product.delivery_note || '')}"></div>
      <div class="field"><label for="product-bonus-buy">Mua X</label><input id="product-bonus-buy" name="bonusBuy" type="number" min="0" value="${product.bonus_buy || 0}"></div>
      <div class="field"><label for="product-bonus-free">Tặng Y</label><input id="product-bonus-free" name="bonusFree" type="number" min="0" value="${product.bonus_free || 0}"></div>
      <div class="field"><label><input name="isActive" type="checkbox" ${product.id === undefined || product.is_active ? 'checked' : ''}> Đang bán trên bot</label></div>
      </div><div class="button-row"><button class="button primary" type="submit">${product.id ? 'Lưu thay đổi' : 'Tạo sản phẩm'}</button>${product.id ? `<button class="button ghost" type="button" data-action="close-detail">Đóng</button>` : ''}</div></form>`;
}

function productsView() {
    if (state.loading) return `<section class="view"><div class="view-header"><div><div class="eyebrow">Sản phẩm</div><h1>Đang tải</h1></div></div>${loadingView()}</section>`;
    if (state.error) return `<section class="view"><div class="error-box">${esc(state.error)} <button class="button link" data-action="reload-products">Thử lại</button></div></section>`;
    const rows = state.products || [];
    return `<section class="view"><div class="view-header"><div><div class="eyebrow">Danh mục & sản phẩm</div><h1>Sản phẩm</h1><p>Quản lý nguồn Sheet và sản phẩm nhập thủ công.</p></div><button class="button primary" data-action="new-product">+ Thêm sản phẩm</button></div>
      <div class="toolbar"><input data-filter="product-q" value="${esc(state.productFilters.q)}" placeholder="Tìm sản phẩm…"><select data-filter="product-category"><option value="">Tất cả danh mục</option>${state.categories.map((c) => `<option value="${c.id}" ${String(state.productFilters.categoryId) === String(c.id) ? 'selected' : ''}>${esc(c.emoji)} ${esc(c.name)}</option>`).join('')}</select><select data-filter="product-source"><option value="">Tất cả nguồn</option><option value="manual" ${state.productFilters.source === 'manual' ? 'selected' : ''}>Nhập thủ công</option><option value="sheet" ${state.productFilters.source === 'sheet' ? 'selected' : ''}>Google Sheet</option></select><select data-filter="product-active"><option value="">Mọi trạng thái</option><option value="1" ${state.productFilters.isActive === '1' ? 'selected' : ''}>Đang bán</option><option value="0" ${state.productFilters.isActive === '0' ? 'selected' : ''}>Đã tắt</option></select></div>
      <div class="split"><div class="section-card"><div class="section-head"><h2>${rows.length} sản phẩm</h2><span class="muted">Chọn một dòng để sửa</span></div><div class="table-wrap"><table><thead><tr><th>Sản phẩm</th><th>Danh mục</th><th>Nguồn</th><th>Giá</th><th>Kho bán được</th><th></th></tr></thead><tbody>${rows.length ? rows.map((p) => `<tr class="clickable" data-product="${p.id}"><td><strong>${esc(p.emoji || '📦')} ${esc(p.name)}</strong><br><span class="muted">#${p.id}</span></td><td>${esc(p.cat_name || 'Chưa phân loại')}</td><td>${badge(p.source === 'sheet' ? 'Google Sheet' : 'Nhập thủ công', p.source === 'sheet' ? { 'Google Sheet': 'info' } : { 'Nhập thủ công': 'ok' })}</td><td>${formatMoney(p.price)}</td><td><strong>${p.display_stock}</strong><br><span class="muted">${p.stock_count} thực · ${p.reserved} giữ</span></td><td>${p.is_active ? badge('Đang bán', { 'Đang bán': 'ok' }) : badge('Đã tắt', { 'Đã tắt': 'warn' })}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">Chưa có sản phẩm phù hợp.</div></td></tr>'}</tbody></table></div></div>
      <div class="section-card detail-card"><div class="section-head"><h2>${state.selectedProduct ? 'Chỉnh sửa sản phẩm' : 'Danh mục'}</h2></div><div class="section-body">${state.selectedProduct ? productForm(state.selectedProduct) : `<form id="category-form" class="button-row"><input name="name" placeholder="Tên danh mục" required><input name="emoji" value="📦" aria-label="Emoji"><button class="button ghost" type="submit">Thêm</button></form><div style="margin-top:16px;display:grid;gap:8px">${state.categories.map((c) => `<div class="button-row" style="justify-content:space-between"><span>${esc(c.emoji)} ${esc(c.name)} <span class="muted">· ${c.product_count}</span></span><button class="button link" data-category-edit="${c.id}" data-category-name="${esc(c.name)}">Sửa</button></div>`).join('')}</div>`}</div></div></div></section>`;
}

function inventoryView() {
    const product = state.selectedProduct || state.products[0];
    if (!product && !state.loading) return `<section class="view"><div class="view-header"><div><div class="eyebrow">Kho hàng</div><h1>Chưa có sản phẩm</h1></div></div><div class="empty section-card">Tạo sản phẩm trước khi nhập kho.</div></section>`;
    const rows = state.stock?.rows || [];
    return `<section class="view"><div class="view-header"><div><div class="eyebrow">Tồn kho & nhập kho</div><h1>Kho hàng</h1><p>Mỗi dòng là một nội dung giao hàng nguyên văn.</p></div><div class="button-row"><button class="button ghost" data-action="reveal-stock">${state.revealStock ? 'Ẩn nội dung' : 'Hiện nội dung'}</button></div></div>
      <div class="toolbar"><select data-filter="inventory-product">${state.products.map((p) => `<option value="${p.id}" ${Number(product?.id) === Number(p.id) ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select><span class="badge info">Thực: ${product?.stock_count || 0}</span><span class="badge warn">Tạm giữ: ${product?.reserved || 0}</span><span class="badge ok">Còn bán: ${product?.display_stock || 0}</span></div>
      <div class="grid-2"><div class="section-card"><div class="section-head"><h2>Nội dung trong kho</h2><span class="muted">${state.stock?.revealed ? 'Đã hiện' : 'Đang che'}</span></div><div class="table-wrap"><table><thead><tr><th>ID</th><th>Nội dung</th><th>Trạng thái</th><th>Nhập lúc</th></tr></thead><tbody>${state.loading ? '<tr><td colspan="4"><div class="empty">Đang tải…</div></td></tr>' : rows.length ? rows.map((row) => `<tr><td class="mono">${row.id}</td><td class="mono">${esc(row.data)}</td><td>${row.is_sold ? badge('Đã cấp', { 'Đã cấp': 'info' }) : badge('Chưa cấp', { 'Chưa cấp': 'ok' })}</td><td>${formatDate(row.imported_at)}</td></tr>`).join('') : '<tr><td colspan="4"><div class="empty">Kho chưa có dữ liệu.</div></td></tr>'}</tbody></table></div></div>
      <div class="section-card"><div class="section-head"><h2>Nhập kho</h2></div><div class="section-body"><form id="stock-form" class="form-stack"><div class="field"><label for="stock-file">Tải tệp hoặc dán nội dung</label><input id="stock-file" type="file" accept=".txt,.csv,text/plain,text/csv"><textarea id="stock-text" placeholder="Mỗi dòng một nội dung giao hàng"></textarea><small>Không tự cắt hoặc đổi nội dung hợp lệ. Dòng trắng và dòng trùng sẽ bị loại khi xem trước.</small></div><div id="stock-preview"></div><div class="button-row"><button class="button ghost" type="button" data-action="preview-stock">Xem trước</button><button class="button primary" type="submit">Nhập vào kho</button></div></form><hr style="border:0;border-top:1px solid var(--line);margin:22px 0"><h3>Lịch sử lô nhập</h3><div style="margin-top:10px">${(state.stock?.batches || []).length ? state.stock.batches.map((b) => `<div class="button-row" style="justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--line);font-size:12px"><span><strong>#${b.id}</strong> · ${formatDate(b.created_at)}</span><span class="muted">${b.added_lines} thêm · ${b.duplicate_lines} trùng · ${b.blank_lines} trắng</span></div>`).join('') : '<div class="muted" style="font-size:13px;margin-top:10px">Chưa có lô nhập.</div>'}</div></div></div></section>`;
}

function orderDetail(order) {
    if (!order) return '<div class="empty">Chọn một đơn để xem chi tiết.</div>';
    const canPay = order.status === 'pending';
    const canDeliver = order.status === 'paid';
    const canResend = order.status === 'delivered' && order.deliveryDataAvailable;
    return `<div class="section-head"><div><h2>Đơn #${order.id}</h2><span class="muted">${formatDate(order.created_at)}</span></div><button class="button ghost small" data-action="close-order">Đóng</button></div><div class="section-body"><div class="button-row" style="margin-bottom:14px">${badge(statusLabel[order.status] || order.status, { [statusLabel.pending]: 'warn', [statusLabel.paid]: 'info', [statusLabel.delivered]: 'ok', [statusLabel.cancelled]: 'bad', [statusLabel.expired]: 'bad' })}${badge(deliveryLabel[order.delivery_status || 'not_sent'], { 'Gửi thành công': 'ok', 'Gửi thất bại': 'bad', 'Chưa gửi': 'warn' })}</div><dl class="detail-list"><div><dt>Sản phẩm</dt><dd>${esc(order.product_name)}</dd></div><div><dt>Khách hàng</dt><dd>${esc(order.user_name || order.username || order.user_id)}</dd></div><div><dt>Tổng tiền</dt><dd>${formatMoney(order.total_price)}</dd></div><div><dt>Đã nhận</dt><dd>${formatMoney(order.paid_amount)}</dd></div><div><dt>Số lượng</dt><dd>${order.quantity} + ${order.bonus_qty || 0} tặng</dd></div><div><dt>Số lần gửi</dt><dd>${order.delivery_attempts || 0}</dd></div></dl>${order.delivery_error ? `<div class="error-box" style="margin-top:14px">Lần gửi gần nhất lỗi: ${esc(order.delivery_error)}</div>` : ''}<div style="margin-top:16px">${order.deliveryDataAvailable ? (state.revealOrder ? `<div class="text-content">${esc(order.delivery_data)}</div>` : '<div class="notice">Đơn đã có dữ liệu giao hàng đang được che.</div>') : '<div class="muted">Chưa có dữ liệu giao hàng.</div>'}</div><div class="button-row" style="margin-top:17px">${order.deliveryDataAvailable ? `<button class="button ghost small" data-action="reveal-order">${state.revealOrder ? 'Ẩn hàng đã cấp' : 'Hiện hàng đã cấp'}</button>` : ''}${canPay ? '<button class="button primary small" data-action="confirm-payment">Xác nhận đã nhận tiền</button>' : ''}${canDeliver ? '<button class="button primary small" data-action="deliver-order">Giao hàng</button>' : ''}${canResend ? '<button class="button ghost small" data-action="resend-order">Gửi lại thông tin đơn</button>' : ''}${canPay || canDeliver ? '<button class="button danger small" data-action="cancel-order">Hủy đơn</button>' : ''}</div></div>`;
}

function ordersView() {
    if (state.loading && !state.orders) return `<section class="view"><div class="view-header"><div><div class="eyebrow">Vận hành</div><h1>Đơn hàng</h1></div></div>${loadingView()}</section>`;
    if (state.error) return `<section class="view"><div class="error-box">${esc(state.error)} <button class="button link" data-action="reload-orders">Thử lại</button></div></section>`;
    const rows = state.orders?.rows || [];
    return `<section class="view"><div class="view-header"><div><div class="eyebrow">Thanh toán & giao hàng</div><h1>Đơn hàng</h1><p>Phân biệt trạng thái đơn và trạng thái gửi Telegram.</p></div><button class="button ghost" data-action="reload-orders">↻ Làm mới</button></div><div class="toolbar"><input data-filter="order-q" value="${esc(state.orderFilters.q)}" placeholder="Tìm mã đơn, khách, sản phẩm…"><select data-filter="order-status"><option value="">Mọi trạng thái đơn</option>${Object.entries(statusLabel).map(([value, label]) => `<option value="${value}" ${state.orderFilters.status === value ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-filter="order-delivery"><option value="">Mọi trạng thái gửi</option>${Object.entries(deliveryLabel).map(([value, label]) => `<option value="${value}" ${state.orderFilters.deliveryStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="split"><div class="section-card"><div class="section-head"><h2>${state.orders?.total || 0} đơn hàng</h2></div><div class="table-wrap"><table><thead><tr><th>Mã</th><th>Khách hàng</th><th>Sản phẩm</th><th>Trạng thái đơn</th><th>Gửi Telegram</th><th>Tổng</th></tr></thead><tbody>${rows.length ? rows.map((o) => `<tr class="clickable" data-order="${o.id}"><td class="mono">#${o.id}</td><td>${esc(o.user_name || o.username || o.user_id)}</td><td>${esc(o.product_name)}<br><span class="muted">x${o.quantity}</span></td><td>${badge(statusLabel[o.status] || o.status, { [statusLabel.pending]: 'warn', [statusLabel.paid]: 'info', [statusLabel.delivered]: 'ok', [statusLabel.cancelled]: 'bad', [statusLabel.expired]: 'bad' })}</td><td>${badge(deliveryLabel[o.delivery_status || 'not_sent'], { 'Gửi thành công': 'ok', 'Gửi thất bại': 'bad', 'Chưa gửi': 'warn' })}</td><td>${formatMoney(o.total_price)}</td></tr>`).join('') : '<tr><td colspan="6"><div class="empty">Chưa có đơn hàng phù hợp.</div></td></tr>'}</tbody></table></div></div><div class="section-card detail-card">${orderDetail(state.selectedOrder)}</div></div></section>`;
}

function render() {
    if (!state.session) { app.innerHTML = loginView(); wireForms(); return; }
    const content = state.page === 'dashboard' ? dashboardView() : state.page === 'products' ? productsView() : state.page === 'inventory' ? inventoryView() : state.page === 'orders' ? ordersView() : lockedView(navItems.find((item) => item[0] === state.page)?.[2] || 'Chức năng');
    app.innerHTML = layout(content);
    wireForms();
}

function wireForms() {
    app.querySelectorAll('form').forEach((form) => form.addEventListener('submit', handleSubmit));
}

function loginView(message = '') {
    return `<main class="login-page"><section class="login-card"><div class="brand-mark">✦</div><div class="eyebrow">Telegram Shop Bot</div><h1>Đăng nhập quản trị</h1><p class="muted">Quản lý sản phẩm, kho và đơn hàng từ một nơi.</p>${message ? `<div class="error-box" style="margin:18px 0">${esc(message)}</div>` : ''}<form id="login-form" class="form-stack"><div class="field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="username" required></div><div class="field"><label for="login-password">Mật khẩu</label><input id="login-password" name="password" type="password" autocomplete="current-password" required></div><button class="button primary" type="submit">Đăng nhập</button></form></section></main>`;
}

async function openPage(page) {
    state.page = page; state.selectedProduct = null; state.selectedOrder = null; state.stock = null; state.error = null;
    document.querySelector('#sidebar')?.classList.remove('open');
    render();
    if (page === 'dashboard') await loadDashboard();
    if (page === 'products' || page === 'inventory') { await loadProducts(); if (page === 'inventory') { state.selectedProduct = state.products[0] || null; await loadInventory(); } }
    if (page === 'orders') await loadOrders();
}

async function handleSubmit(event) {
    const form = event.target;
    if (!['login-form', 'category-form', 'product-form', 'stock-form'].includes(form.id)) return;
    event.preventDefault();
    if (form.id === 'login-form') {
        const data = new FormData(form);
        try { state.session = await api.login(data.get('email'), data.get('password')); render(); await openPage('dashboard'); } catch (error) { app.innerHTML = loginView(errorMessage(error)); wireForms(); }
    }
    if (form.id === 'category-form') {
        const data = new FormData(form);
        try { await api.createCategory({ name: data.get('name'), emoji: data.get('emoji') }); toast('Đã thêm danh mục', 'ok'); await loadProducts(); } catch (error) { toast(errorMessage(error), 'bad'); }
    }
    if (form.id === 'product-form') {
        const data = new FormData(form); const body = Object.fromEntries(data.entries());
        ['price', 'categoryId', 'bonusBuy', 'bonusFree'].forEach((key) => { if (body[key] !== undefined && body[key] !== '') body[key] = Number(body[key]); });
        if (body.categoryId === '') delete body.categoryId;
        body.isActive = form.querySelector('[name="isActive"]')?.checked !== false;
        try { if (form.dataset.productId) await api.updateProduct(form.dataset.productId, body); else await api.createProduct(body); toast('Đã lưu sản phẩm', 'ok'); state.selectedProduct = null; await loadProducts(); } catch (error) { toast(errorMessage(error), 'bad'); }
    }
    if (form.id === 'stock-form') {
        const text = form.querySelector('#stock-text').value; if (!text.trim()) return toast('Hãy dán nội dung hoặc chọn tệp', 'bad');
        try { const result = await api.stockImport(state.selectedProduct.id, text); toast(`Đã nhập ${result.added} dòng vào kho`, 'ok'); form.querySelector('#stock-preview').innerHTML = ''; await loadInventory(); } catch (error) { toast(errorMessage(error), 'bad'); }
    }
}

async function handleClick(event) {
    const nav = event.target.closest('[data-nav]'); if (nav) return openPage(nav.dataset.nav);
    const category = event.target.closest('[data-category-edit]');
    if (category) {
        const name = window.prompt('Tên danh mục mới:', category.dataset.categoryName);
        if (name === null) return;
        try { await api.updateCategory(category.dataset.categoryEdit, { name }); toast('Đã cập nhật danh mục', 'ok'); await loadProducts(); } catch (error) { toast(errorMessage(error), 'bad'); }
        return;
    }
    const productRow = event.target.closest('[data-product]'); if (productRow) { state.selectedProduct = state.products.find((p) => Number(p.id) === Number(productRow.dataset.product)); if (state.page === 'inventory') await loadInventory(); else render(); return; }
    const orderRow = event.target.closest('[data-order]'); if (orderRow) { try { state.selectedOrder = await api.order(orderRow.dataset.order, false); state.revealOrder = false; render(); } catch (error) { toast(errorMessage(error), 'bad'); } return; }
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'toggle-menu') return document.querySelector('#sidebar')?.classList.toggle('open');
    if (action === 'logout') { await api.logout().catch(() => {}); state.session = null; render(); return; }
    if (action === 'reload-dashboard') return loadDashboard();
    if (action === 'reload-products') return loadProducts();
    if (action === 'reload-orders') return loadOrders();
    if (action === 'new-product') { state.selectedProduct = {}; return render(); }
    if (action === 'close-detail') { state.selectedProduct = null; return render(); }
    if (action === 'reveal-stock') { state.revealStock = !state.revealStock; return loadInventory(); }
    if (action === 'preview-stock') { const text = document.querySelector('#stock-text')?.value || ''; if (!text.trim()) return toast('Hãy dán nội dung trước', 'bad'); try { const result = await api.stockPreview(state.selectedProduct.id, text); document.querySelector('#stock-preview').innerHTML = `<div class="notice">Sẽ nhập <strong>${result.added}</strong> dòng · ${result.duplicates} dòng trùng · ${result.blank.length} dòng trắng.</div>`; } catch (error) { toast(errorMessage(error), 'bad'); } return; }
    if (action === 'close-order') { state.selectedOrder = null; return render(); }
    if (action === 'reveal-order') { state.revealOrder = !state.revealOrder; if (state.revealOrder) state.selectedOrder = await api.order(state.selectedOrder.id, true); else state.selectedOrder = await api.order(state.selectedOrder.id, false); return render(); }
    if (action === 'confirm-payment') { const amount = window.prompt('Số tiền nhận thêm (VNĐ):'); if (!amount) return; try { await api.confirmPayment(state.selectedOrder.id, Number(amount)); toast('Đã cập nhật thanh toán', 'ok'); state.selectedOrder = await api.order(state.selectedOrder.id, state.revealOrder); await loadOrders(); } catch (error) { toast(errorMessage(error), 'bad'); } return; }
    if (action === 'deliver-order') { const manual = window.prompt('Dán nội dung giao thủ công (để trống để lấy từ kho):', ''); try { await api.deliver(state.selectedOrder.id, manual ? { text: manual } : {}); toast('Đã xử lý giao hàng', 'ok'); state.selectedOrder = await api.order(state.selectedOrder.id, state.revealOrder); await loadOrders(); } catch (error) { toast(errorMessage(error), 'bad'); } return; }
    if (action === 'resend-order') { try { await api.resend(state.selectedOrder.id); toast('Đã gửi lại thông tin đơn', 'ok'); state.selectedOrder = await api.order(state.selectedOrder.id, state.revealOrder); await loadOrders(); } catch (error) { toast(errorMessage(error), 'bad'); } return; }
    if (action === 'cancel-order') { const reason = window.prompt('Lý do hủy đơn:'); if (reason === null) return; try { await api.cancel(state.selectedOrder.id, reason); toast('Đã hủy đơn và hoàn tiền nếu có', 'ok'); state.selectedOrder = await api.order(state.selectedOrder.id, state.revealOrder); await loadOrders(); } catch (error) { toast(errorMessage(error), 'bad'); } }
}

function handleChange(event) {
    const filter = event.target.dataset.filter;
    if (filter === 'product-category') { state.productFilters.categoryId = event.target.value; loadProducts(); }
    if (filter === 'product-source') { state.productFilters.source = event.target.value; loadProducts(); }
    if (filter === 'product-active') { state.productFilters.isActive = event.target.value; loadProducts(); }
    if (filter === 'inventory-product') { state.selectedProduct = state.products.find((p) => Number(p.id) === Number(event.target.value)); loadInventory(); }
    if (filter === 'order-status') { state.orderFilters.status = event.target.value; loadOrders(); }
    if (filter === 'order-delivery') { state.orderFilters.deliveryStatus = event.target.value; loadOrders(); }
    if (event.target.id === 'stock-file' && event.target.files?.[0]) event.target.files[0].text().then((text) => { const input = document.querySelector('#stock-text'); if (input) input.value = text; });
}

function handleInput(event) {
    if (event.target.dataset.filter === 'product-q') { state.productFilters.q = event.target.value; clearTimeout(handleInput.timer); handleInput.timer = setTimeout(loadProducts, 250); }
    if (event.target.dataset.filter === 'order-q') { state.orderFilters.q = event.target.value; clearTimeout(handleInput.orderTimer); handleInput.orderTimer = setTimeout(loadOrders, 250); }
}

window.addEventListener('admin:session-expired', () => { if (!state.session) return; state.session = null; state.error = null; render(); toast('Phiên đăng nhập đã hết hạn', 'bad'); });
app.addEventListener('click', handleClick);
app.addEventListener('change', handleChange);
app.addEventListener('input', handleInput);

async function start() {
    try { state.session = await api.session(); } catch { state.session = null; }
    render();
    if (state.session) await openPage('dashboard');
}

start();
