// Generate and inject manifest dynamically
const manifestData = {
  name: "Hana Memoria Admin",
  short_name: "Hana Mem",
  description: "Dashboard admin Hana Memoria",
  start_url: "./",
  display: "standalone",
  background_color: "#2a1f14",
  theme_color: "#2a1f14",
  orientation: "portrait-primary",
  icons: [
    { src: "https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png", sizes: "192x192", type: "image/png" },
    { src: "https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png", sizes: "512x512", type: "image/png" }
  ]
};
const manifestBlob = new Blob([JSON.stringify(manifestData)], {type: 'application/json'});
const manifestUrl = URL.createObjectURL(manifestBlob);
document.querySelector('link[rel="manifest"]').href = manifestUrl;

/* ===== CONFIG ===== */
const BASE_AR_URL  = 'https://hanamemoria-project.github.io/HMproject/';
const WORKER_URL   = 'https://hm-backend.hanamemoria.workers.dev/';
const SUPABASE_URL = 'https://ujnuvlrdxzqtfppbhioo.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqbnV2bHJkeHpxdGZwcGJoaW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNjU2OTYsImV4cCI6MjA5MDY0MTY5Nn0.slqPc8v7QZXxHzvMkOlXWAAYebX-sqUIiKZvA9DJkl0';
const LOGO_URL     = 'https://pub-02d853231cff4efa92ee6754c646a898.r2.dev/Logo_HM.png';

/* Supabase Auth Client */
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===== AUTH HELPERS ===== */
async function getAuthHeaders(extra = {}) {
  const { data: { session } } = await supabaseClient.auth.getSession();
  const token = session ? session.access_token : SUPABASE_KEY;
  return {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${token}`,
    ...extra
  };
}

/* ===== AUTH FUNCTIONS ===== */
async function cekLogin() {
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return !!session;
  } catch {
    return false;
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const btn   = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  errEl.textContent = '';
  if (!email || !pass) { errEl.textContent = '⚠️ Isi email dan password terlebih dahulu.'; return; }

  btn.disabled = true;
  btn.textContent = 'Masuk...';

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    document.getElementById('login-screen').classList.remove('show');
    await muatDashboard();
  } catch (e) {
    errEl.textContent = '⚠️ Email atau password salah.';
    btn.disabled = false;
    btn.textContent = 'Masuk ke Dashboard';
  }
}

async function doLogout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

async function muatDashboard() {
  try {
    await ambilDataPesanan();
  } catch (e) {
    console.error('Gagal memuat pesanan', e);
  }
  try {
    await ambilDataKeuangan();
  } catch (e) {
    console.error('Gagal memuat keuangan', e);
  }
  try { if (typeof window.__hideInstantLoading === 'function') window.__hideInstantLoading(); } catch(e) {}
  try { hideLoading(); } catch(e) {}
}

/* Helper: build QR URL — SINGLE SOURCE OF TRUTH for all QR codes */
function buildQRUrl(id_pesanan, size = 400) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(BASE_AR_URL+'?id='+id_pesanan)}&ecc=H`;
}

/* ===== STATE ===== */
let dataPesanan = [];
let idAktif = '', linkFotoAktif = '';
let cbTerpilih = [];
let currentPage = 1;
let sortKey = 'created_at', sortDir = 'desc';
let grafikVisual = null;
let lastKnownIds = new Set();
let notifikasi = [];
let unreadCount = 0;
let deferredInstallPrompt = null;

/* ===== LOADING SCREEN ===== */
function hideLoading() {
  const screen = document.getElementById('loading-screen');
  if (!screen) return;
  screen.classList.add('fade-out');
  setTimeout(() => { if (screen.parentNode) screen.parentNode.removeChild(screen); }, 700);
}

/* ===== JAM SIDEBAR ===== */
function updateJam() {
  const el = document.getElementById('jam-sidebar');
  if (!el) return;
  el.textContent = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
setInterval(updateJam, 1000);
document.addEventListener('DOMContentLoaded', updateJam);

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = ''; }, 3200);
}

/* ===== SIDEBAR TOGGLE (mobile) ===== */
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}
function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('show');
}

/* ===== SECTION SWITCHING ===== */
function showSection(s, el) {
  ['dashboard', 'orders', 'keuangan'].forEach(name => {
    const sec = document.getElementById('section-' + name);
    if (sec) sec.style.display = 'none';
  });
  const target = document.getElementById('section-' + s);
  if (target) target.style.display = 'block';

  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-item').forEach(i => i.classList.remove('active'));
  if (el) el.classList.add('active');

  const titles = { dashboard: 'Command Center', orders: 'Pesanan', keuangan: 'Keuangan' };
  const h1 = document.querySelector('#topbar .topbar-left h1');
  if (h1 && titles[s]) h1.textContent = titles[s];

  closeSidebar();

  // Re-render grafik saat section ditampilkan (canvas hanya bisa dirender saat visible)
  if (s === 'keuangan' && typeof renderKeuangan === 'function' && dataKeuangan.length > 0) {
    setTimeout(() => {
      renderKeuangan();
      if (typeof renderTabelKeuangan === 'function') renderTabelKeuangan();
    }, 50);
  }
  if (s === 'dashboard' && typeof buatGrafikDeadline === 'function' && dataPesanan.length > 0) {
    setTimeout(() => {
      buatGrafikDeadline(dataPesanan);
      buatGrafikProdukDash(dataPesanan);
      renderDashRecent(dataPesanan);
      if (typeof buatDiagram === 'function') {
        const counts = { p:0, pa:0, pr:0, s:0 };
        dataPesanan.forEach(p => {
          const st = normaliseStatus(p.status_pesanan);
          if (st==='pending_payment') counts.p++;
          else if (st==='paid') counts.pa++;
          else if (st==='processing') counts.pr++;
          else if (st==='completed') counts.s++;
        });
        buatDiagram(counts.p, counts.pa, counts.pr, counts.s, 0);
      }
    }, 50);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  ['orders', 'keuangan'].forEach(name => {
    const sec = document.getElementById('section-' + name);
    if (sec) sec.style.display = 'none';
  });
  const dash = document.getElementById('section-dashboard');
  if (dash) dash.style.display = 'block';
});

/* ===== NOTIFIKASI ===== */
function addNotifikasi(pesanan) {
  const notif = {
    id: pesanan.id_pesanan,
    title: `📦 Pesanan Baru: #${pesanan.id_pesanan}`,
    body: `${pesanan.nama_pelanggan || 'Pelanggan'} · ${pesanan.jenis_pesanan || 'Produk'} × ${pesanan.jumlah || 1}`,
    time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
    unread: true
  };
  notifikasi.unshift(notif);
  if (notifikasi.length > 20) notifikasi.pop();
  unreadCount++;
  renderNotifDropdown();
  updateNotifBadge();

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('🌸 Hana Memoria – Pesanan Baru!', {
      body: `#${pesanan.id_pesanan} · ${pesanan.nama_pelanggan || ''} · ${pesanan.jenis_pesanan || ''}`,
      icon: LOGO_URL,
      badge: LOGO_URL,
      tag: pesanan.id_pesanan
    });
  }
  document.getElementById('sidebar-notif-dot').classList.add('show');
}

function updateNotifBadge() {
  const badge = document.getElementById('notif-count');
  if (unreadCount > 0) {
    badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
    badge.classList.add('show');
  } else {
    badge.classList.remove('show');
  }
}

function renderNotifDropdown() {
  const list = document.getElementById('notif-list');
  if (!notifikasi.length) {
    list.innerHTML = '<div class="notif-empty">Belum ada notifikasi</div>';
    return;
  }
  list.innerHTML = notifikasi.map(n => `
    <div class="notif-item ${n.unread ? 'unread' : ''}" onclick="bukaDetail('${n.id}');tutupNotifDropdown()">
      <div class="notif-title">${n.title}</div>
      <div class="notif-body">${n.body}</div>
      <div class="notif-time">${n.time}</div>
    </div>
  `).join('');
}

function toggleNotifDropdown() {
  document.getElementById('notif-dropdown').classList.toggle('show');
}
function tutupNotifDropdown() {
  document.getElementById('notif-dropdown').classList.remove('show');
}
function markAllRead() {
  notifikasi.forEach(n => n.unread = false);
  unreadCount = 0;
  document.getElementById('sidebar-notif-dot').classList.remove('show');
  updateNotifBadge();
  renderNotifDropdown();
}

document.addEventListener('click', e => {
  if (!e.target.closest('.notif-bell-wrap')) tutupNotifDropdown();
});

function requestNotifPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/* ===== DATA ===== */
async function ambilDataPesanan(isRefresh = false) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Pesanan?order=created_at.desc`, {
      headers: await getAuthHeaders()
    });
    if (!r.ok) throw new Error();
    const fresh = await r.json();

    if (lastKnownIds.size > 0 && isRefresh) {
      fresh.forEach(p => {
        if (!lastKnownIds.has(p.id_pesanan)) {
          addNotifikasi(p);
        }
      });
    }

    lastKnownIds = new Set(fresh.map(p => p.id_pesanan));
    dataPesanan = fresh;
    renderTabel();
    updateTopbarSub();
    if (typeof buatGrafikProduk === 'function') buatGrafikProduk();
  } catch {
    showToast('⚠️ Gagal memuat data dari server', 'error');
  }
}

async function refreshData() {
  const btn = document.getElementById('btn-refresh');
  btn.classList.add('loading');
  await ambilDataPesanan(true);
  btn.classList.remove('loading');
  showToast('✅ Data diperbarui', 'success');
}

function updateTopbarSub() {
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  document.getElementById('topbar-sub').textContent = `${dataPesanan.length} pesanan · Diperbarui ${now}`;
}

async function perbaruiStatus(id, status) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/Pesanan?id_pesanan=eq.${id}`, {
      method: 'PATCH',
      headers: await getAuthHeaders({'Content-Type': 'application/json', 'Prefer': 'return=minimal'}),
      body: JSON.stringify({ status_pesanan: status })
    });
    const idx = dataPesanan.findIndex(x => x.id_pesanan === id);
    if (idx !== -1) dataPesanan[idx].status_pesanan = status;
    renderTabel();
    showToast('✅ Status diperbarui', 'success');
  } catch { showToast('⚠️ Gagal update status', 'error'); }
}

/* ===== SORTING ===== */
function sortBy(key) {
  if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
  else { sortKey = key; sortDir = 'asc'; }
  currentPage = 1;
  renderTabel();
}

/* ===== NORMALISE STATUS ===== */
function normaliseStatus(s) {
  if (!s || s === 'Pending') return 'pending_payment';
  if (s === 'Proses') return 'processing';
  if (s === 'Selesai') return 'completed';
  return s;
}

/* ===== RENDER TABLE ===== */
function renderTabel() {
  if (!Array.isArray(dataPesanan)) return;

  const query    = document.getElementById('search-input') ? document.getElementById('search-input').value.toLowerCase() : '';
  const produk   = document.getElementById('filter-produk')   ? document.getElementById('filter-produk').value   : 'Semua';
  const status   = document.getElementById('filter-status')   ? document.getElementById('filter-status').value   : 'Semua';
  const deadline = document.getElementById('filter-deadline') ? document.getElementById('filter-deadline').value : 'Semua';
  const perPage  = parseInt(document.getElementById('per-page') ? document.getElementById('per-page').value : 10) || 10;
  const now      = new Date();

  let counts = { pending_payment: 0, paid: 0, processing: 0, completed: 0, mindar: 0 };

  let filtered = dataPesanan.map(p => {
    const s = normaliseStatus(p.status_pesanan);
    const mindar = !p.link_target || p.link_target.trim() === '';
    if (s === 'pending_payment') counts.pending_payment++;
    else if (s === 'paid') counts.paid++;
    else if (s === 'processing') counts.processing++;
    else if (s === 'completed') counts.completed++;
    if (mindar) counts.mindar++;
    const _tglDl = new Date(new Date(p.created_at).getTime() + 3*86400000);
    const _sisa  = Math.ceil((_tglDl - new Date()) / 86400000);
    return { ...p, _status: s, _mindar: mindar, _sisaHari: _sisa, _tglDeadline: _tglDl };
  }).filter(p => {
    if (produk !== 'Semua' && p.jenis_pesanan !== produk) return false;
    if (status !== 'Semua' && p._status !== status) return false;
    if (query) {
      const hay = `${p.id_pesanan} ${p.nama_pelanggan} ${p.jenis_pesanan}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    if (deadline !== 'Semua') {
      if (p._status === 'completed') return false;
      if (deadline === 'terlambat'  && p._sisaHari >= 0) return false;
      if (deadline === 'hari_ini'   && p._sisaHari !== 0) return false;
      if (deadline === 'besok'      && p._sisaHari !== 1) return false;
      if (deadline === 'minggu_ini' && (p._sisaHari < 0 || p._sisaHari > 7)) return false;
      if (deadline === 'lebih'      && p._sisaHari <= 7) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    let av = a[sortKey] || '', bv = b[sortKey] || '';
    if (sortKey === 'deadline') {
      av = new Date(a.created_at).getTime() + 3 * 86400000;
      bv = new Date(b.created_at).getTime() + 3 * 86400000;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  document.getElementById('c-pending').textContent  = counts.pending_payment;
  document.getElementById('c-paid').textContent     = counts.paid;
  document.getElementById('c-proses').textContent   = counts.processing;
  document.getElementById('c-selesai').textContent  = counts.completed;
  document.getElementById('c-mindar').textContent   = counts.mindar;
  buatDiagram(counts.pending_payment, counts.paid, counts.processing, counts.completed, counts.mindar);
  buatGrafikDeadline(dataPesanan);
  buatGrafikProdukDash(dataPesanan);
  renderDashRecent(dataPesanan);

  document.querySelectorAll('thead th').forEach(th => th.classList.remove('sort-asc', 'sort-desc'));

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * perPage;
  const page  = filtered.slice(start, start + perPage);

  document.getElementById('total-label').textContent = `${total} pesanan`;
  document.getElementById('paging-info').textContent =
    total === 0 ? '' : `${start + 1}–${Math.min(start + perPage, total)} / ${total}`;

  const tbody = document.getElementById('tabel-pesanan');
  tbody.innerHTML = '';

  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="big">🔍</div><p>Tidak ada pesanan ditemukan</p></div></td></tr>`;
  } else {
    page.forEach(p => {
      const tglDeadline = p._tglDeadline || new Date(new Date(p.created_at).getTime()+3*86400000);
      const sisaHari    = p._sisaHari !== undefined ? p._sisaHari : Math.ceil((tglDeadline - now)/86400000);

      let teksDeadline, kelasDeadline;
      if (p._status === 'completed') { teksDeadline = '✨ Selesai'; kelasDeadline = 'deadline-ok'; }
      else if (sisaHari < 0)  { teksDeadline = `TERLAMBAT ${Math.abs(sisaHari)}h`; kelasDeadline = 'deadline-warn'; }
      else if (sisaHari === 0){ teksDeadline = 'HARI INI!'; kelasDeadline = 'deadline-warn'; }
      else if (sisaHari === 1){ teksDeadline = 'BESOK!'; kelasDeadline = 'deadline-warn'; }
      else { teksDeadline = `${sisaHari} hari lagi`; kelasDeadline = 'deadline-ok'; }

      const statusLabels = {
        pending_payment: ['⏳', 'Belum Bayar', 'status-pending'],
        paid:            ['💳', 'Sudah Bayar', 'status-paid'],
        processing:      ['⚙️', 'Diproses',    'status-processing'],
        completed:       ['✨', 'Selesai',      'status-completed'],
      };
      const [sIcon, sLabel, sCls] = statusLabels[p._status] || ['?', p._status, ''];

      const waLabels = { pending_payment: '💬 Tagihan', paid: '💬 Resi', processing: '💬 Update', completed: '💬 Selesai' };
      const waLabel = waLabels[p._status] || '💬 WA';

      const tr = document.createElement('tr');
      tr.className = 'order-row';
      tr.innerHTML = `
        <td><input type="checkbox" class="check-pesanan" value="${p.id_pesanan}" onchange="updateSelectedBadge()"></td>
        <td><strong style="font-size:11px;font-family:monospace;letter-spacing:0.5px;">${p.id_pesanan}</strong></td>
        <td>
          <div style="font-weight:600;font-size:13px;">${p.nama_pelanggan || '–'}</div>
          <div style="font-size:11px;color:var(--ink-muted);margin-top:2px;">${formatPhone(p.whatsapp)}</div>
        </td>
        <td>
          <div style="font-size:13px;">${p.jenis_pesanan || '–'}</div>
          <div style="font-size:11px;color:var(--ink-muted);">Qty: ${p.jumlah || 1}</div>
        </td>
        <td>
          <span class="${kelasDeadline}">${teksDeadline}</span>
          <div style="font-size:10px;color:var(--ink-muted);margin-top:2px;">${tglDeadline.toLocaleDateString('id-ID',{day:'numeric',month:'short'})}</div>
        </td>
        <td>
          <div class="status-dropdown" style="position:relative;display:inline-block;">
            <button class="status-badge ${sCls}" onclick="toggleStatusMenu('${p.id_pesanan}')">${sIcon} ${sLabel} ▾</button>
            <div class="status-menu" id="smenu-${p.id_pesanan}" style="display:none;position:absolute;top:110%;left:0;background:white;border:1px solid var(--sand);border-radius:var(--radius-sm);box-shadow:var(--shadow-md);z-index:200;min-width:160px;overflow:hidden;">
              <div class="smenu-item" onclick="pilihStatus('${p.id_pesanan}','pending_payment')" style="padding:10px 14px;font-size:13px;cursor:pointer;display:flex;gap:8px;align-items:center;" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">⏳ Belum Bayar</div>
              <div class="smenu-item" onclick="pilihStatus('${p.id_pesanan}','paid')" style="padding:10px 14px;font-size:13px;cursor:pointer;display:flex;gap:8px;align-items:center;" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">💳 Sudah Bayar</div>
              <div class="smenu-item" onclick="pilihStatus('${p.id_pesanan}','processing')" style="padding:10px 14px;font-size:13px;cursor:pointer;display:flex;gap:8px;align-items:center;" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">⚙️ Diproses</div>
              <div class="smenu-item" onclick="pilihStatus('${p.id_pesanan}','completed')" style="padding:10px 14px;font-size:13px;cursor:pointer;display:flex;gap:8px;align-items:center;" onmouseover="this.style.background='var(--cream)'" onmouseout="this.style.background=''">✨ Selesai</div>
            </div>
          </div>
          ${p._mindar ? '<div class="badge-mindar">⚠️ Belum MindAR</div>' : ''}
        </td>
        <td>
          <div class="action-row">
            <button class="btn btn-ghost btn-sm" onclick="bukaDetail('${p.id_pesanan}')">Detail</button>
            <a href="${getWaLink(p, p._status)}" target="_blank" class="btn btn-sm" style="background:#dcfce7;color:#166534;border:1px solid #86efac;">${waLabel}</a>
            <button class="btn btn-danger btn-sm" onclick="hapusPesanan('${p.id_pesanan}')">Hapus</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  renderPagination(totalPages);
  document.getElementById('check-all').checked = false;
}

function toggleStatusMenu(id) {
  const menu = document.getElementById('smenu-' + id);
  const isOpen = menu.style.display === 'block';
  document.querySelectorAll('.status-menu').forEach(m => m.style.display = 'none');
  if (!isOpen) menu.style.display = 'block';
}

function pilihStatus(id, status) {
  document.getElementById('smenu-' + id).style.display = 'none';
  perbaruiStatus(id, status);
}

function renderPagination(totalPages) {
  const bar = document.getElementById('page-btns');
  bar.innerHTML = '';

  const prev = document.createElement('button');
  prev.className = 'page-btn';
  prev.textContent = '←';
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderTabel(); };
  bar.appendChild(prev);

  const maxBtns = 5;
  let startP = Math.max(1, currentPage - 2);
  let endP   = Math.min(totalPages, startP + maxBtns - 1);
  if (endP - startP < maxBtns - 1) startP = Math.max(1, endP - maxBtns + 1);

  for (let i = startP; i <= endP; i++) {
    const btn = document.createElement('button');
    btn.className = 'page-btn' + (i === currentPage ? ' active' : '');
    btn.textContent = i;
    btn.onclick = ((pg) => () => { currentPage = pg; renderTabel(); })(i);
    bar.appendChild(btn);
  }

  const next = document.createElement('button');
  next.className = 'page-btn';
  next.textContent = '→';
  next.disabled = currentPage === totalPages;
  next.onclick = () => { currentPage++; renderTabel(); };
  bar.appendChild(next);
}

function togglePilihSemua(source) {
  document.querySelectorAll('.check-pesanan').forEach(cb => cb.checked = source.checked);
  updateSelectedBadge();
}

function updateSelectedBadge() {
  const count = document.querySelectorAll('.check-pesanan:checked').length;
  const badge = document.getElementById('selected-badge');
  badge.textContent = `${count} dipilih`;
  badge.className = 'selected-badge' + (count > 0 ? ' show' : '');
  document.querySelectorAll('.order-row').forEach(tr => {
    const cb = tr.querySelector('.check-pesanan');
    tr.classList.toggle('selected-row', cb && cb.checked);
  });
}

function buatDiagram(pending, paid, proses, selesai, mindar) {
  if (typeof Chart === 'undefined') return;
  try {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('grafikStatus').getContext('2d');
    if (grafikVisual) grafikVisual.destroy();
    grafikVisual = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Belum Bayar','Sudah Bayar','Diproses','Selesai','Belum MindAR'],
        datasets: [{
          data: [pending, paid, proses, selesai, mindar],
          backgroundColor: ['#c9a884','#8bb8cc','#e8b8b0','#98c4a5','#c4857a'],
          borderWidth: 0,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { size: 10, family: 'DM Sans' }, padding: 8, boxWidth: 10 } }
        }
      }
    });
  } catch(e) {}
}

/* ===== GRAFIK DEADLINE (Dashboard) ===== */
let grafikDeadlineChart = null;
function buatGrafikDeadline(data) {
  const el = document.getElementById('grafikDeadline');
  if (!el || typeof Chart === 'undefined') return;
  const now = new Date();
  let terlambat=0, hariIni=0, besok=0, mingguIni=0, lebih=0;
  (data||[]).forEach(p => {
    if (normaliseStatus(p.status_pesanan) === 'completed') return;
    const sisa = Math.ceil((new Date(p.created_at).getTime()+3*86400000 - now) / 86400000);
    if (sisa < 0) terlambat++;
    else if (sisa === 0) hariIni++;
    else if (sisa === 1) besok++;
    else if (sisa <= 7) mingguIni++;
    else lebih++;
  });
  if (grafikDeadlineChart) grafikDeadlineChart.destroy();
  grafikDeadlineChart = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels: ['Terlambat','Hari Ini','Besok','Minggu Ini','> 7 Hari'],
      datasets: [{ data: [terlambat,hariIni,besok,mingguIni,lebih],
        backgroundColor: ['#d64040','#e8a598','#c9a84c','#8bb8cc','#98c4a5'], borderWidth:0, borderRadius:6 }] },
    options: { responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,ticks:{stepSize:1,font:{size:10}},grid:{color:'rgba(42,31,20,0.06)'}},
              x:{ticks:{font:{size:10}},grid:{display:false}}} }
  });
}

/* ===== GRAFIK PRODUK DASHBOARD ===== */
let grafikProdukDashChart = null;
function buatGrafikProdukDash(data) {
  const el = document.getElementById('grafikProdukDash');
  if (!el || typeof Chart === 'undefined') return;
  const map = {};
  (data||[]).forEach(p => { map[p.jenis_pesanan||'Lainnya'] = (map[p.jenis_pesanan||'Lainnya']||0)+1; });
  const labels = Object.keys(map), vals = Object.values(map);
  if (!labels.length) return;
  if (grafikProdukDashChart) grafikProdukDashChart.destroy();
  grafikProdukDashChart = new Chart(el.getContext('2d'), {
    type: 'doughnut',
    data: { labels, datasets: [{ data:vals, backgroundColor:['#c9a884','#8bb8cc','#e8b8b0','#98c4a5'], borderWidth:0, hoverOffset:5 }] },
    options: { responsive:true, maintainAspectRatio:false, cutout:'62%',
      plugins:{legend:{position:'bottom',labels:{font:{size:10},padding:8,boxWidth:10}}} }
  });
}

/* ===== PESANAN TERBARU (Dashboard) ===== */
function renderDashRecent(data) {
  const el = document.getElementById('dash-recent-list');
  if (!el) return;
  const recent = [...(data||[])].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
  if (!recent.length) { el.innerHTML='<div style="padding:20px;text-align:center;color:var(--ink-muted);font-size:13px;">Belum ada pesanan</div>'; return; }
  const lbl = {pending_payment:['⏳','status-pending'],paid:['💳','status-paid'],processing:['⚙️','status-processing'],completed:['✨','status-completed']};
  el.innerHTML = recent.map(p => {
    const s = normaliseStatus(p.status_pesanan);
    const [ico,cls] = lbl[s]||['?',''];
    const tgl = new Date(p.created_at).toLocaleDateString('id-ID',{day:'numeric',month:'short'});
    const label = s==='pending_payment'?'Belum Bayar':s==='paid'?'Sudah Bayar':s==='processing'?'Diproses':'Selesai';
    return `<div onclick="bukaDetail('${p.id_pesanan}')" style="display:flex;align-items:center;gap:12px;padding:10px 16px;border-bottom:1px solid var(--sand);cursor:pointer;" onmouseover="this.style.background='var(--cream2)'" onmouseout="this.style.background=''">
      <div style="flex:1;min-width:0;"><div style="font-weight:600;font-size:13px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.nama_pelanggan||'–'}</div>
      <div style="font-size:11px;color:var(--ink-muted);">${p.jenis_pesanan||'–'} · ${tgl}</div></div>
      <span class="status-badge ${cls}" style="font-size:11px;padding:3px 8px;">${ico} ${label}</span></div>`;
  }).join('');
}

function formatPhone(p) {
  if (!p) return '';
  return p.startsWith('0') ? '+62' + p.slice(1) : '+' + p;
}

function getWaLink(p, type) {
  let phone = p.whatsapp || '';
  if (phone.startsWith('0')) phone = '62' + phone.slice(1);
  const alamat = `${p.alamat_detail || ''}, ${p.kecamatan || ''}, ${p.kota || ''}`;
  const total  = p.total_harga ? p.total_harga.toLocaleString('id-ID') : '0';
  const msgs = {
    pending_payment: `Halo Kak 😊\nTerima kasih sudah memesan di Hanamemoria 🤍\n\n📦 ID Pesanan: ${p.id_pesanan}\n🧸 Produk: ${p.jenis_pesanan}\n📍 Alamat: ${alamat}\n💰 Total Tagihan: Rp${total}\n\nSilakan lakukan pembayaran ke:\n🏦 BCA: 807683252\na.n Nuzulul Laila Khoirul Alfia\n\nSetelah transfer, mohon kirim bukti pembayaran ya 📩`,
    paid:            `Halo Kak 😊\nPembayaran untuk pesanan ${p.id_pesanan} sudah kami terima 🤍\nEstimasi pengerjaan: ±3 hari kerja ✨`,
    processing:      `Halo Kak 😊\nPesanan ${p.id_pesanan} saat ini sedang dalam proses pengerjaan ✨`,
    completed:       `Halo Kak 😊\nKabar baik! 🎉\nPesanan ${p.id_pesanan} sudah selesai dan siap dikirim 🚚✨`
  };
  return `https://wa.me/${phone}?text=${encodeURIComponent(msgs[type] || '')}`;
}

function bukaDetail(id) {
  idAktif = id;
  const p = dataPesanan.find(x => x.id_pesanan === id);
  if (!p) return;
  const s = normaliseStatus(p.status_pesanan);
  document.getElementById('m-id').textContent = `Pesanan #${id}`;
  document.getElementById('m-sub').textContent = `${p.jenis_pesanan || '–'} · ${new Date(p.created_at).toLocaleDateString('id-ID',{dateStyle:'long'})}`;
  document.getElementById('m-alamat').textContent = `${p.alamat_detail || ''}, ${p.kecamatan || ''}, ${p.kota || ''}`;
  document.getElementById('m-produk').textContent = p.jenis_pesanan || '–';
  document.getElementById('m-jumlah').textContent = `${p.jumlah || 1} pcs`;
  document.getElementById('m-ucapan').textContent = (p.slides && p.slides[1]) ? p.slides[1].b : '–';
  linkFotoAktif = p.link_foto;
  document.getElementById('m-video').href = p.link_video || '#';

  const qrUrl = buildQRUrl(id, 200);
  document.getElementById('qr-preview-img').src = qrUrl;
  document.getElementById('qr-preview-id').textContent = `#${id}`;
  document.getElementById('qr-preview-wrap').style.display = 'flex';

  document.getElementById('modal-detail').classList.add('show');
}

function tutupDetail() {
  document.getElementById('modal-detail').classList.remove('show');
}

async function downloadFoto() { if (linkFotoAktif) window.open(linkFotoAktif, '_blank'); }

function bukaQRModal() {
  if (!idAktif) return;
  downloadQRCode();
}

async function downloadQRCode() {
  if (!idAktif) return;
  showToast('⏳ Membuat QR dengan desain...', '');

  const W           = 800;           
  const H           = 920;           
  const outerPad    = 36;            
  const scanMeH     = 72;            
  const bottomH     = 96;            
  const innerGap    = 18;            
  const qrMargin    = 16;            

  const cardX  = outerPad;
  const cardY  = outerPad;
  const cardW  = W - outerPad * 2;
  const cardH  = H - outerPad * 2;

  const qrTop  = cardY + scanMeH + innerGap + qrMargin;
  const qrBot  = cardY + cardH - bottomH - innerGap - qrMargin;
  const qrSize = Math.min(cardW - (innerGap + qrMargin) * 2, qrBot - qrTop);
  const qrX    = cardX + (cardW - qrSize) / 2;
  const qrY    = qrTop;

  const qrUrl  = buildQRUrl(idAktif, 600);
  const logoUrl = LOGO_URL;

  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }

  try {
    const [qrImg, logoImg] = await Promise.all([loadImg(qrUrl), loadImg(logoUrl)]);

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#fdfaf4';
    roundRect(ctx, cardX, cardY, cardW, cardH, 28);
    ctx.fill();

    ctx.save();
    ctx.setLineDash([12, 7]);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2.5;
    roundRect(ctx, cardX + 4, cardY + 4, cardW - 8, cardH - 8, 24);
    ctx.stroke();
    ctx.restore();

    const ib = {
      x: cardX + innerGap,
      y: cardY + scanMeH,
      w: cardW - innerGap * 2,
      h: cardH - scanMeH - innerGap
    };
    ctx.strokeStyle = '#b88663';
    ctx.lineWidth = 2.5;
    roundRect(ctx, ib.x, ib.y, ib.w, ib.h, 14);
    ctx.stroke();

    const scanText = 'SCAN ME';
    ctx.font = 'italic 800 38px "Georgia", "DM Serif Display", serif';
    const scanMetrics = ctx.measureText(scanText);
    const scanW = scanMetrics.width + 40;
    const scanCY = cardY + scanMeH / 2 + 2;  

    ctx.fillStyle = '#fdfaf4';
    roundRect(ctx, W/2 - scanW/2, scanCY - 26, scanW, 40, 8);
    ctx.fill();

    ctx.fillStyle = '#8a6a53';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '3px';
    ctx.fillText(scanText, W/2, scanCY);
    ctx.letterSpacing = '0px';

    ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

    const logoSize = qrSize * 0.20;
    const logoX    = qrX + qrSize / 2 - logoSize / 2;
    const logoY2   = qrY + qrSize / 2 - logoSize / 2;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, logoX - 8, logoY2 - 8, logoSize + 16, logoSize + 16, 10);
    ctx.fill();
    ctx.drawImage(logoImg, logoX, logoY2, logoSize, logoSize);

    const textZoneY = qrY + qrSize + qrMargin + innerGap;

    ctx.fillStyle = '#8a6a53';
    ctx.font = 'bold 28px "DM Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`Order ID: ${idAktif}`, W/2, textZoneY + 36);

    ctx.fillStyle = '#c9a84c';
    ctx.font = '22px "DM Sans", Arial, sans-serif';
    ctx.fillText('✨  Hana Memoria  ✨', W/2, textZoneY + 68);

    canvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `QR_HanaMem_${idAktif}.png`;
      a.click();
      showToast('✅ QR berhasil didownload!', 'success');
    }, 'image/png');

  } catch(e) {
    showToast('⚠️ Gagal membuat QR, coba lagi', 'error');
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function uploadKeR2() {
  const file = document.getElementById('file-mindar').files[0];
  if (!file) return showToast('⚠️ Pilih file terlebih dahulu', 'error');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const res = await fetch(WORKER_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'UPLOAD_MINDAR', id_pesanan: idAktif, file_base64: e.target.result.split(',')[1] })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Upload berhasil!', 'success');
        perbaruiStatus(idAktif, 'processing');
        tutupDetail();
      } else showToast('⚠️ Upload gagal', 'error');
    } catch { showToast('⚠️ Upload gagal', 'error'); }
  };
  reader.readAsDataURL(file);
}

async function hapusPesanan(id) {
  if (!confirm(`Hapus pesanan ${id}?\n\nFile foto dan video di R2 juga akan terhapus.`)) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Pesanan?id_pesanan=eq.${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders({'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    });
    if (!r.ok) throw new Error();
    showToast(`✅ Pesanan ${id} dihapus`, 'success');
    dataPesanan = dataPesanan.filter(x => x.id_pesanan !== id);
    lastKnownIds.delete(id);
    renderTabel();
  } catch { showToast('⚠️ Gagal menghapus', 'error'); }
}

async function hapusMassal() {
  const cbs = document.querySelectorAll('.check-pesanan:checked');
  if (!cbs.length) return showToast('⚠️ Centang pesanan terlebih dahulu', 'error');
  if (!confirm(`Hapus ${cbs.length} pesanan sekaligus?\n\nFile di R2 juga akan terhapus.`)) return;

  let ok = 0, fail = 0;
  for (const cb of cbs) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Pesanan?id_pesanan=eq.${cb.value}`, {
      method: 'DELETE',
      headers: await getAuthHeaders({'Content-Type': 'application/json', 'Prefer': 'return=minimal'})
    });
    if (r.ok) { ok++; dataPesanan = dataPesanan.filter(x => x.id_pesanan !== cb.value); lastKnownIds.delete(cb.value); }
    else fail++;
  }
  showToast(fail ? `✅ ${ok} berhasil, ${fail} gagal` : `✅ ${ok} pesanan dihapus`, fail ? 'error' : 'success');
  document.getElementById('check-all').checked = false;
  renderTabel();
  updateSelectedBadge();
}

function cetakMassal() {
  const cbs = document.querySelectorAll('.check-pesanan:checked');
  if (!cbs.length) return showToast('⚠️ Centang pesanan terlebih dahulu', 'error');
  cbTerpilih = Array.from(cbs);
  document.getElementById('modal-orientasi').classList.add('show');
}

function tutupModalOrientasi() { document.getElementById('modal-orientasi').classList.remove('show'); }

async function jalankanCetak(orientasi) {
  tutupModalOrientasi();
  let styleTag = document.getElementById('page-style');
  if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'page-style'; document.head.appendChild(styleTag); }
  styleTag.textContent = `@media print { @page { size: A4 ${orientasi}; margin: 10mm; } }`;

  const lebarItem = orientasi === 'landscape' ? '220px' : '260px';
  const grid = document.getElementById('grid-cetak');
  grid.innerHTML = '';

  document.getElementById('print-info-text').textContent =
    `${cbTerpilih.length} label · Orientasi: ${orientasi === 'portrait' ? 'Portrait (Tegak)' : 'Landscape (Melebar)'}`;

  for (const cb of cbTerpilih) {
    const p = dataPesanan.find(x => x.id_pesanan === cb.value);
    if (!p) continue;
    const qty = parseInt(p.jumlah) || 1;
    const qrUrl = buildQRUrl(p.id_pesanan, 400);

    for (let i = 0; i < qty; i++) {
      const item = document.createElement('div');
      item.className = orientasi === 'landscape' ? 'item-cetak landscape-mode' : 'item-cetak';
      item.style.width = lebarItem;
      item.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;gap:0;">
          <img src="${p.link_foto}" crossorigin="anonymous"
               style="width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;display:block;box-sizing:border-box;">
          <div style="position:relative;width:100%;border:1px dashed #94a3b8;border-radius:8px;background:#fdfaf4;box-sizing:border-box;margin-top:18px;">
            <div style="position:absolute;top:14px;left:8px;right:8px;bottom:8px;border:2px solid #b88663;border-radius:10px;z-index:1;pointer-events:none;"></div>
            <div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);background:#fdfaf4;padding:0 10px;z-index:2;white-space:nowrap;">
              <span style="font-family:'DM Serif Display',serif;font-weight:400;font-size:14px;color:#8a6a53;letter-spacing:1px;">SCAN ME</span>
            </div>
            <img src="${p.link_foto}" crossorigin="anonymous"
                 style="width:100%;height:auto;visibility:hidden;display:block;pointer-events:none;padding:2px;">
            <div style="position:absolute;top:25px;left:0;right:0;bottom:10px;display:flex;flex-direction:column;justify-content:center;align-items:center;z-index:3;">
              <div style="position:relative;width:72%;max-width:130px;aspect-ratio:1/1;background:white;padding:4px;border-radius:8px;box-shadow:inset 0 0 5px rgba(0,0,0,0.06);">
                <img src="${qrUrl}" crossorigin="anonymous" style="width:100%;height:100%;object-fit:contain;display:block;">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:24%;aspect-ratio:1/1;background:white;border-radius:3px;display:flex;justify-content:center;align-items:center;padding:2px;">
                  <img src="${LOGO_URL}" crossorigin="anonymous" style="width:100%;height:auto;display:block;">
                </div>
              </div>
              <p style="font-family:'DM Sans',sans-serif;font-size:10px;font-weight:700;color:#8a6a53;margin:7px 0 0;text-align:center;">Order ID: ${p.id_pesanan}</p>
              <p style="font-family:'DM Sans',sans-serif;font-size:8px;color:#d8a07c;margin:2px 0 0;text-align:center;">✨ Hana Memoria ✨</p>
            </div>
          </div>
        </div>`;
      grid.appendChild(item);
    }
  }

  document.getElementById('main').style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('area-cetak').style.display = 'block';

  const imgs = Array.from(grid.querySelectorAll('img'));
  await Promise.race([
    Promise.all(imgs.map(img => new Promise(res => {
      if (img.complete && img.naturalWidth > 0) res();
      else { img.onload = res; img.onerror = res; }
    }))),
    new Promise(res => setTimeout(res, 20000))
  ]);

  await new Promise(res => setTimeout(res, 500));
  window.print();
}

/* ===== KEUANGAN ===== */
// Pastikan variabel-variabel ini dideklarasikan di bagian atas 
// sebelum fungsi-fungsi keuangan lainnya dipanggil:

let dataKeuangan = [];
let grafikKeuangan = null;
let grafikKategori = null;
let grafikProduk = null; // <--- INI ADALAH KUNCI PERBAIKANNYA

function rupiahFormat(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(n);
}

// Setelah menambahkan variabel di atas, fungsi pemuat data keuangan Anda 
// akan berjalan dengan lancar tanpa terhenti karena variabel tidak ditemukan.

async function ambilDataKeuangan() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Keuangan?order=tanggal.desc,created_at.desc`, {
      headers: await getAuthHeaders()
    });
    if (!r.ok) throw new Error();
    dataKeuangan = await r.json();
    renderKeuangan();
    renderTabelKeuangan();
  } catch {
    showToast('⚠️ Gagal memuat data keuangan', 'error');
  }
}

function renderKeuangan() {
  const now = new Date();
  const bulanIni = now.getMonth();
  const tahunIni = now.getFullYear();

  let totalMasuk = 0, totalKeluar = 0, cntMasuk = 0, cntKeluar = 0;
  dataKeuangan.forEach(t => {
    const d = new Date(t.tanggal);
    if (d.getMonth() === bulanIni && d.getFullYear() === tahunIni) {
      if (t.jenis === 'pemasukan')   { totalMasuk  += Number(t.nominal); cntMasuk++; }
      if (t.jenis === 'pengeluaran') { totalKeluar += Number(t.nominal); cntKeluar++; }
    }
  });
  const laba = totalMasuk - totalKeluar;
  document.getElementById('keu-masuk').textContent  = rupiahFormat(totalMasuk);
  document.getElementById('keu-keluar').textContent = rupiahFormat(totalKeluar);
  document.getElementById('keu-laba').textContent   = rupiahFormat(laba);
  document.getElementById('keu-masuk-count').textContent  = `${cntMasuk} transaksi`;
  document.getElementById('keu-keluar-count').textContent = `${cntKeluar} transaksi`;
  document.getElementById('keu-laba-info').textContent    = laba >= 0 ? '✅ Untung' : '⚠️ Rugi';

  buatGrafikKeuangan();
  buatGrafikKategori();
  buatGrafikProduk();
}

function buatGrafikProduk() {
  if (typeof Chart === 'undefined') return;
  const type = document.getElementById('produk-chart-type') ? document.getElementById('produk-chart-type').value : 'bar';
  const produkMap = { 'Gantungan Kunci': 0, 'Figura': 0, 'Frame 12 Bulan': 0 };
  dataPesanan.forEach(p => {
    if (p.jenis_pesanan && produkMap.hasOwnProperty(p.jenis_pesanan)) {
      produkMap[p.jenis_pesanan] += parseInt(p.jumlah) || 1;
    }
  });
  const labels = Object.keys(produkMap);
  const vals   = Object.values(produkMap);
  const total  = vals.reduce((a, b) => a + b, 0) || 1;

  const gk  = produkMap['Gantungan Kunci'];
  const fig = produkMap['Figura'];
  const f12 = produkMap['Frame 12 Bulan'];
  if (document.getElementById('prod-stat-gk'))  document.getElementById('prod-stat-gk').textContent  = gk + ' pcs';
  if (document.getElementById('prod-stat-fig')) document.getElementById('prod-stat-fig').textContent = fig + ' pcs';
  if (document.getElementById('prod-stat-f12')) document.getElementById('prod-stat-f12').textContent = f12 + ' pcs';
  if (document.getElementById('prod-stat-gk-pct'))  document.getElementById('prod-stat-gk-pct').textContent  = Math.round(gk/total*100) + '% dari total pesanan';
  if (document.getElementById('prod-stat-fig-pct')) document.getElementById('prod-stat-fig-pct').textContent = Math.round(fig/total*100) + '% dari total pesanan';
  if (document.getElementById('prod-stat-f12-pct')) document.getElementById('prod-stat-f12-pct').textContent = Math.round(f12/total*100) + '% dari total pesanan';

  const softColors = ['#c9a884', '#98c4a5', '#8bb8cc'];
  const softHover  = ['#b8946e', '#7aae8c', '#6aa0b5'];

  const _elProd = document.getElementById('grafikProduk'); if (!_elProd) return;
  const ctx = _elProd.getContext('2d');
  if (grafikProduk) grafikProduk.destroy();

  if (type === 'doughnut') {
    grafikProduk = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: vals, backgroundColor: softColors, hoverBackgroundColor: softHover, borderWidth: 0, hoverOffset: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'bottom', labels: { font: { size: 11, family: 'DM Sans' }, padding: 10, boxWidth: 12 } } } }
    });
  } else {
    grafikProduk = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: 'Jumlah Terjual (pcs)', data: vals, backgroundColor: softColors, hoverBackgroundColor: softHover, borderRadius: 8, borderSkipped: false }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { ticks: { font: { size: 10 } }, grid: { display: false } }
        }
      }
    });
  }
}

function buatGrafikKeuangan() {
  if (typeof Chart === 'undefined') return;
  const bulanCount = parseInt(document.getElementById('keu-filter-bulan') ? document.getElementById('keu-filter-bulan').value : 6) || 6;
  const labels = [], masukData = [], keluarData = [];
  const now = new Date();

  for (let i = bulanCount - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth(), y = d.getFullYear();
    labels.push(d.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }));
    let masuk = 0, keluar = 0;
    dataKeuangan.forEach(t => {
      const td = new Date(t.tanggal);
      if (td.getMonth() === m && td.getFullYear() === y) {
        if (t.jenis === 'pemasukan')   masuk  += Number(t.nominal);
        if (t.jenis === 'pengeluaran') keluar += Number(t.nominal);
      }
    });
    masukData.push(masuk);
    keluarData.push(keluar);
  }

  const _elKeu = document.getElementById('grafikKeuangan'); if (!_elKeu) return;
  const ctx = _elKeu.getContext('2d');
  if (grafikKeuangan) grafikKeuangan.destroy();
  grafikKeuangan = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: masukData, backgroundColor: '#98c4a5', borderRadius: 6 },
        { label: 'Pengeluaran', data: keluarData, backgroundColor: '#e8b8b0', borderRadius: 6 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 10, family: 'DM Sans' }, padding: 8, boxWidth: 10 } } },
      scales: {
        y: { ticks: { callback: v => 'Rp ' + (v/1000).toFixed(0) + 'rb', font: { size: 10 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
        x: { ticks: { font: { size: 10 } }, grid: { display: false } }
      }
    }
  });
}

function buatGrafikKategori() {
  if (typeof Chart === 'undefined') return;
  const now = new Date();
  const bulanIni = now.getMonth(), tahunIni = now.getFullYear();
  const katMap = {};
  dataKeuangan.forEach(t => {
    const d = new Date(t.tanggal);
    if (t.jenis === 'pengeluaran' && d.getMonth() === bulanIni && d.getFullYear() === tahunIni) {
      katMap[t.kategori] = (katMap[t.kategori] || 0) + Number(t.nominal);
    }
  });
  const labels = Object.keys(katMap);
  const vals   = Object.values(katMap);
  const colors = ['#c9a884','#e8b8b0','#8bb8cc','#98c4a5','#e8d5a8','#b8a0c8'];

  const _elKat = document.getElementById('grafikKategori'); if (!_elKat) return;
  const ctx = _elKat.getContext('2d');
  if (grafikKategori) grafikKategori.destroy();
  if (!labels.length) {
    grafikKategori = new Chart(ctx, { type: 'doughnut', data: { labels: ['Tidak ada data'], datasets: [{ data: [1], backgroundColor: ['#e8d9c5'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, padding: 8, boxWidth: 10 } } } } });
    return;
  }
  grafikKategori = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: colors.slice(0, labels.length), borderWidth: 0, hoverOffset: 5 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10, family: 'DM Sans' }, padding: 8, boxWidth: 10 } } } }
  });
}

function renderTabelKeuangan() {
  const jenis = document.getElementById('keu-filter-jenis') ? document.getElementById('keu-filter-jenis').value : 'Semua';
  const kat   = document.getElementById('keu-filter-kat')   ? document.getElementById('keu-filter-kat').value   : 'Semua';
  const query = (document.getElementById('keu-search') ? document.getElementById('keu-search').value : '').toLowerCase().trim();
  const waktu = document.getElementById('keu-filter-waktu') ? document.getElementById('keu-filter-waktu').value : 'semua';
  const tbody = document.getElementById('tabel-keuangan');
  if (!tbody) return;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const dateFrom = document.getElementById('keu-date-from') ? document.getElementById('keu-date-from').value : '';
  const dateTo   = document.getElementById('keu-date-to')   ? document.getElementById('keu-date-to').value   : '';

  let filtered = dataKeuangan.filter(t => {
    if (jenis !== 'Semua' && t.jenis !== jenis) return false;
    if (kat   !== 'Semua' && t.kategori !== kat) return false;
    if (query) {
      const hay = `${t.keterangan || ''} ${t.kategori || ''} ${t.jenis || ''}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    const td = new Date(t.tanggal);
    if (waktu === 'bulan_ini' && td < startOfMonth) return false;
    if (waktu === 'minggu_ini' && td < startOfWeek) return false;
    if (waktu === 'kustom') {
      if (dateFrom && td < new Date(dateFrom)) return false;
      if (dateTo   && td > new Date(dateTo + 'T23:59:59')) return false;
    }
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="big">💸</div><p>Belum ada transaksi</p></div></td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(t => `
    <tr>
      <td style="white-space:nowrap;">${new Date(t.tanggal).toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'})}</td>
      <td><span class="badge-${t.jenis}">${t.jenis === 'pemasukan' ? '💚 Pemasukan' : '❤️ Pengeluaran'}</span></td>
      <td style="text-transform:capitalize;">${t.kategori || '–'}</td>
      <td style="color:var(--ink-soft);">${t.keterangan || '–'}</td>
      <td style="font-weight:700;font-variant-numeric:tabular-nums;color:${t.jenis==='pemasukan'?'var(--sage)':'var(--danger)'};">${rupiahFormat(t.nominal)}</td>
      <td>
        <div class="action-row">
          <button class="btn btn-ghost btn-sm" onclick="editTransaksi('${t.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="hapusTransaksi('${t.id}')">Hapus</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterTransaksi() {
  const waktu = document.getElementById('keu-filter-waktu').value;
  const dateRange = document.getElementById('keu-date-range');
  if (dateRange) dateRange.style.display = waktu === 'kustom' ? 'flex' : 'none';
  renderTabelKeuangan();
}

function updateKategoriOptions() {
  const jenis = document.getElementById('keu-jenis').value;
  const sel = document.getElementById('keu-kategori');
  const opts = jenis === 'pemasukan'
    ? [['penjualan','Penjualan'],['deposit','Deposit'],['refund_masuk','Refund Masuk'],['lain-lain','Lain-lain']]
    : [['bahan baku','Bahan Baku'],['ongkos kirim','Ongkos Kirim'],['operasional','Operasional'],['marketing','Marketing'],['lain-lain','Lain-lain']];
  sel.innerHTML = opts.map(([v,l]) => `<option value="${v}">${l}</option>`).join('');
}

function bukaModalKeuangan(id) {
  document.getElementById('keu-modal-title').textContent = '💰 Tambah Transaksi';
  document.getElementById('keu-edit-id').value = '';
  document.getElementById('keu-jenis').value = 'pemasukan';
  updateKategoriOptions();
  document.getElementById('keu-nominal').value = '';
  document.getElementById('keu-tanggal').value = new Date().toISOString().split('T')[0];
  document.getElementById('keu-keterangan').value = '';
  document.getElementById('modal-keuangan').classList.add('show');
}

function editTransaksi(id) {
  const t = dataKeuangan.find(x => x.id === id);
  if (!t) return;
  document.getElementById('keu-modal-title').textContent = '✏️ Edit Transaksi';
  document.getElementById('keu-edit-id').value = id;
  document.getElementById('keu-jenis').value = t.jenis;
  updateKategoriOptions();
  document.getElementById('keu-kategori').value = t.kategori;
  document.getElementById('keu-nominal').value = t.nominal;
  document.getElementById('keu-tanggal').value = t.tanggal;
  document.getElementById('keu-keterangan').value = t.keterangan || '';
  document.getElementById('modal-keuangan').classList.add('show');
}

function tutupModalKeuangan() {
  document.getElementById('modal-keuangan').classList.remove('show');
}

async function simpanTransaksi() {
  const editId   = document.getElementById('keu-edit-id').value;
  const jenis    = document.getElementById('keu-jenis').value;
  const kategori = document.getElementById('keu-kategori').value;
  const nominal  = parseFloat(document.getElementById('keu-nominal').value);
  const tanggal  = document.getElementById('keu-tanggal').value;
  const keterangan = document.getElementById('keu-keterangan').value.trim();

  if (!nominal || isNaN(nominal) || nominal <= 0) return showToast('⚠️ Nominal harus diisi', 'error');
  if (!tanggal) return showToast('⚠️ Tanggal harus diisi', 'error');

  const body = { jenis, kategori, nominal, tanggal, keterangan: keterangan || null };

  try {
    let r;
    if (editId) {
      r = await fetch(`${SUPABASE_URL}/rest/v1/Keuangan?id=eq.${editId}`, {
        method: 'PATCH',
        headers: await getAuthHeaders({'Content-Type': 'application/json', 'Prefer': 'return=minimal'}),
        body: JSON.stringify(body)
      });
    } else {
      r = await fetch(`${SUPABASE_URL}/rest/v1/Keuangan`, {
        method: 'POST',
        headers: await getAuthHeaders({'Content-Type': 'application/json', 'Prefer': 'return=minimal'}),
        body: JSON.stringify(body)
      });
    }
    if (!r.ok) throw new Error();
    tutupModalKeuangan();
    showToast(editId ? '✅ Transaksi diperbarui' : '✅ Transaksi ditambahkan', 'success');
    await ambilDataKeuangan();
  } catch {
    showToast('⚠️ Gagal menyimpan transaksi', 'error');
  }
}

async function hapusTransaksi(id) {
  if (!confirm('Hapus transaksi ini?')) return;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/Keuangan?id=eq.${id}`, {
      method: 'DELETE',
      headers: await getAuthHeaders({'Prefer': 'return=minimal'})
    });
    if (!r.ok) throw new Error();
    showToast('✅ Transaksi dihapus', 'success');
    dataKeuangan = dataKeuangan.filter(x => x.id !== id);
    renderKeuangan();
    filterTransaksi();
  } catch {
    showToast('⚠️ Gagal menghapus', 'error');
  }
}

/* ===== PWA INSTALL ===== */
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (!localStorage.getItem('pwa-install-dismissed')) {
    document.getElementById('install-banner').classList.add('show');
  }
});

document.getElementById('btn-install-pwa').addEventListener('click', async () => {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt = null;
  }
  document.getElementById('install-banner').classList.remove('show');
});

function dismissInstall() {
  localStorage.setItem('pwa-install-dismissed', 'true');
  document.getElementById('install-banner').classList.remove('show');
}

// ===== INISIALISASI DATA AWAL =====
window.onload = async () => {
  const sudahLogin = await cekLogin();
  if (!sudahLogin) {
    if (typeof window.__hideInstantLoading === 'function') window.__hideInstantLoading();
    hideLoading();
    document.getElementById('login-screen').classList.add('show');
    return;
  }
  await muatDashboard();
};
