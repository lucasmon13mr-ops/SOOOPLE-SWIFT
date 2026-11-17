'use strict';
/* ZOLMEA API — painel administrativo v2 (Português) */
const $ = id => document.getElementById(id);

/* ---------- Estado ---------- */
let loginChallengeId = null;
let setupChallengeId = null;
let deleteChallengeId = null;
let caches = { packages: [], licenses: [], devices: [], checks: [], audit: [], bans: [], stats: null, resellers: [] };
let currentTab = 'dashboard';
let sessionUser = null;
let projectBuildPollTimer = null;
let tableState = {
  packages: { q: '', sort: null, dir: 'asc', page: 1 },
  licenses: { q: '', sort: null, dir: 'asc', page: 1 },
  devices:  { q: '', sort: null, dir: 'asc', page: 1 },
  checks:   { q: '', sort: null, dir: 'asc', page: 1 },
  bans:     { q: '', sort: null, dir: 'asc', page: 1 },
  audit:    { q: '', sort: null, dir: 'asc', page: 1 }
};
const PAGE_SIZE = 15;

// O painel pode ser aberto pelo domínio do Render ou por um host estático.
// Em ambos os casos, a API deve ser a mesma para evitar credencial inválida
// e sessão expirada por chamadas relativas ao domínio errado.
const API_ORIGIN = window.ZOLMEA_API_ORIGIN || 'https://zolmea-api.onrender.com';
function apiURL(path) {
  return path && path.startsWith('/')
    ? API_ORIGIN.replace(/\/$/, '') + path
    : path;
}

/* ---------- Auxiliares ---------- */
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(v, short) {
  if (!v) return '—';
  const d = new Date(v.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return v.slice(0, short ? 10 : 19);
  return d.toLocaleString('pt-BR', { dateStyle: short ? 'medium' : 'medium', timeStyle: short ? undefined : 'short' });
}
function shortHash(v, n = 14) { return v ? v.slice(0, n) + '…' : '—'; }

/* ---------- Feedback sonoro do painel ---------- */
const AudioFx = (() => {
  const welcome = new Audio('/audio/welcome.mp3');
  const click = new Audio('/audio/click.wav');
  const success = new Audio('/audio/success.mp3');
  [welcome, click, success].forEach(audio => {
    audio.preload = 'auto';
    audio.setAttribute('aria-hidden', 'true');
  });
  // Começa a buscar o pequeno arquivo de clique imediatamente para que a primeira interação não seja atrasada.
  click.load();
  function play(audio, volume) {
    try {
      audio.volume = volume;
      audio.currentTime = 0;
      const promise = audio.play();
      if (promise && typeof promise.catch === 'function') promise.catch(() => {});
    } catch (_) {}
  }
  return {
    playWelcome: () => play(welcome, 0.92),
    playClick: () => play(click, 0.14),
    playSuccess: () => play(success, 0.42)
  };
})();

document.addEventListener('pointerdown', event => {
  const target = event.target.closest?.('button, input, select, textarea, a');
  if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
  AudioFx.playClick();
}, { capture: true, passive: true });

function toast(msg, type = 'info', ms = 3400) {
  if (type === 'success') AudioFx.playSuccess();
  const stack = $('toast-stack');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  const icon = type === 'success' ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2dd4a0" stroke-width="2.5" stroke-linecap="round"><path d="M20 7 9 18l-5-5"/></svg>'
    : type === 'error' ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff3b3b" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
  el.innerHTML = icon + '<span>' + esc(msg) + '</span>';
  stack.appendChild(el);
  clearTimeout(el._tm);
  el._tm = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  }, ms);
}

async function api(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const opts = { headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', method: body ? 'POST' : 'GET', signal: controller.signal };
  if (body) opts.body = JSON.stringify(body);
  try {
    opts.credentials = 'include';
    const res = await fetch(apiURL(url), opts);
    if (res.status === 401) { showLogin(); toast('Sessão expirada', 'error'); return null; }
    let data;
    try { data = await res.json(); } catch (e) { toast('Resposta inválida do servidor', 'error'); return null; }
    if (!res.ok) { toast('Erro: ' + (data.error || res.status), 'error'); return null; }
    return data;
  } catch (e) {
    toast(e.name === 'AbortError' ? 'Tempo de requisição esgotado' : 'Erro de rede', 'error');
    return null;
  } finally { clearTimeout(timeout); }
}

async function apiDetailed(url, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const options = {
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      method: body ? 'POST' : 'GET',
      signal: controller.signal
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(apiURL(url), options);
    let data = {};
    try { data = await response.json(); }
    catch (_) { data = { error: 'invalid_server_response' }; }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      data: { error: error.name === 'AbortError' ? 'request_timeout' : 'network_error' }
    };
  } finally {
    clearTimeout(timeout);
  }
}

/* ---------- Telas ---------- */
function showLogin() {
  $('screen-login').classList.remove('hidden');
  $('screen-main').classList.add('hidden');
  ['twofa-login-panel','phone-verify'].forEach(id => $(id)?.classList.add('hidden'));
  $('auth-mode-switch')?.classList.remove('hidden');
  $('form-login')?.classList.remove('hidden');
  $('signup-panel')?.classList.add('hidden');
  $('forgot-panel')?.classList.add('hidden');
  $('reset-panel')?.classList.add('hidden');
  if ($('twofa-login-code')) $('twofa-login-code').value = '';
  if ($('login-error')) $('login-error').textContent = '';
  if ($('twofa-login-error')) $('twofa-login-error').textContent = '';
  setAuthMode('login', false);
}
function showMain(user) {
  sessionUser = user;
  const owner = user.role === 'owner';
  const reseller = user.role === 'reseller';
  document.querySelectorAll('.owner-only').forEach(el => el.classList.toggle('hidden', !owner));
  document.querySelectorAll('.user-only').forEach(el => el.classList.toggle('hidden', owner));
  document.querySelectorAll('.reseller-edit-only').forEach(el => el.classList.toggle('hidden', reseller));
  document.querySelectorAll('.project-builder-nav').forEach(el => el.classList.toggle('hidden', reseller));
  $('screen-login').classList.add('hidden');
  $('screen-main').classList.remove('hidden');
  $('user-name').textContent = user.username;
  $('user-avatar').textContent = (user.username || 'U').slice(0, 1).toUpperCase();
  const roleLabel = document.querySelector('.user-meta .r');
  if (roleLabel) roleLabel.textContent = user.role === 'owner' ? 'Proprietário / Administrador' : user.role === 'reseller' ? 'Conta de Revendedor' : (user.plan === 'premium' ? 'Usuário Premium' : 'Usuário');
  switchTab('dashboard');
  loadPackages().then(() => refreshPackageFilters());
}

/* ---------- Barra lateral / navegação ---------- */
function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('hidden', p.id !== 'tab-' + name));
  closeSidebar();
  if (name === 'dashboard') loadDashboard();
  if (name === 'packages') loadPackages();
  if (name === 'sdk-files') loadSdkFiles();
  if (name === 'project-builder') loadProjectBuilder();
  if (name === 'licenses') { refreshPackageFilters(); loadLicenses(); }
  if (name === 'devices') loadDevices();
  if (name === 'checks') loadChecks();
  if (name === 'bans') loadBans();
  if (name === 'audit') loadAudit();
  if (name === 'users') loadUsers();
  if (name === 'resellers') loadResellers();
  if (name === 'statistics') loadOwnerStatistics();
}
function openSidebar() { $('sidebar').classList.add('open'); $('scrim').classList.add('on'); }
function closeSidebar() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('on'); }

$('hamburger').addEventListener('click', openSidebar);
$('scrim').addEventListener('click', closeSidebar);
document.querySelectorAll('.nav-item').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));

/* ---------- Login ---------- */
$('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('btn-login-submit');
  btn.disabled = true; btn.textContent = 'Entrando…';
  const username = $('in-user').value.trim();
  const password = $('in-pass').value;
  const res = await fetch(apiURL('/api/auth/login'), {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();
  if (data && data.twofa_required) { $('form-login').classList.add('hidden'); $('auth-mode-switch')?.classList.add('hidden'); $('twofa-login-panel')?.classList.remove('hidden'); loginChallengeId = data.challenge_id || null; $('twofa-login-method').textContent = 'Insira o código enviado via ' + (data.method === 'telegram' ? 'Telegram.' : 'e-mail.'); $('login-error').textContent = ''; btn.disabled = false; btn.textContent = 'Entrar'; return; }
  if (res.ok && data.ok) {
    $('in-pass').value = '';
    $('login-error').textContent = '';
    showMain(data.user);
    setTimeout(() => AudioFx.playWelcome(), 120);
  } else {
    $('login-error').textContent = data.error || 'Falha no login';
  }
  btn.disabled = false; btn.textContent = 'Entrar';
});
$('btn-delete-account')?.addEventListener('click',async()=>{
  if(!confirm('Isso excluirá permanentemente sua conta, pacotes, licenças e dispositivos. Continuar?')) return;
  const password=prompt('Informe sua senha atual:');
  if(password===null) return;
  const requested=await api('/api/auth/delete-account/request',{password});
  if(!requested||!requested.ok)return;
  deleteChallengeId=requested.challenge_id;
  const code=prompt('Informe o OTP de 6 dígitos enviado via '+(requested.method==='telegram'?'Telegram':'e-mail')+':');
  if(code===null)return;
  const confirmed=await api('/api/auth/delete-account/confirm',{challenge_id:deleteChallengeId,code:code.trim()});
  if(confirmed&&confirmed.ok){alert('Sua conta foi excluída.');location.href='/login.html?mode=login';}
});
$('btn-logout').addEventListener('click', async () => {
  await fetch(apiURL('/api/auth/logout'), { method: 'POST', credentials: 'include' });
  showLogin();
});

/* ---------- Painel (Dashboard) ---------- */
function animateNumber(el, target) {
  const dur = 600;
  const start = performance.now();
  const from = Number(el.textContent.replace(/[^0-9]/g, '')) || 0;
  function tick(now) {
    const p = Math.min((now - start) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (target - from) * ease).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

const STAT_CONFIG = [
  { key: 'packages',  label: 'Pacotes',       cls: 'stat--blue',   icon: 'box' },
  { key: 'licenses',  label: 'Licenças',       cls: 'stat--purple', icon: 'key' },
  { key: 'active_licenses', label: 'Chaves ativas', cls: 'stat--green', icon: 'check' },
  { key: 'devices',   label: 'Dispositivos',        cls: 'stat--amber',  icon: 'phone' },
  { key: 'checks_24h', label: 'Verificações · 24h',  cls: 'stat--blue',   icon: 'pulse' },
  { key: 'failed_24h', label: 'Falhas · 24h',  cls: 'stat--red',    icon: 'x' }
];
const ICONS = {
  box: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" x2="12" y1="22" y2="12"/></svg>',
  key: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><line x1="10.85" x2="21" y1="12.15" y2="2"/><line x1="18" x2="21" y1="5" y2="2"/><line x1="15" x2="18" y1="8" y2="5"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7 9 18l-5-5"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>',
  phone: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" x2="12.01" y1="18" y2="18"/></svg>',
  pulse: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" x2="19.07" y1="4.93" y2="19.07"/></svg>'
};

async function loadDashboard() {
  const s = await api('/api/stats');
  if (!s) return;
  caches.stats = s;
  $('stat-grid').innerHTML = STAT_CONFIG.map(c => `
    <div class="stat ${c.cls}">
      <div class="icon">${ICONS[c.icon]}</div>
      <div class="num" data-target="${s[c.key] ?? 0}">0</div>
      <div class="lbl">${c.label}</div>
    </div>`).join('');
  $('stat-grid').querySelectorAll('.num').forEach(el => animateNumber(el, Number(el.dataset.target)));
}
$('btn-refresh-stats').addEventListener('click', loadDashboard);

/* ---------- Modal ---------- */
function openModal(title, html, actions, wide) {
  $('modal-title').textContent = title;
  $('modal-body').innerHTML = html;
  $('modal-actions').innerHTML = '';
  if (wide) $('modal-box').classList.add('wide');
  (actions || []).forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn ' + (a.cls || '');
    if (a.disabled) b.disabled = true;
    b.textContent = a.label;
    b.onclick = a.fn;
    $('modal-actions').appendChild(b);
  });
  $('modal-overlay').classList.remove('hidden');
  const first = $('modal-body').querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
}
function closeModal() { $('modal-overlay').classList.add('hidden'); $('modal-box').classList.remove('wide'); }
$('modal-close').addEventListener('click', closeModal);
$('modal-overlay').addEventListener('click', e => { if (e.target === $('modal-overlay')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function modalField(label, inputHtml, id) {
  return `<div class="field"><label>${label}</label>${inputHtml}</div>`;
}
function inputHtml(attrs) {
  const a = Object.assign({ cls: 'input' }, attrs);
  return `<input class="${a.cls}" ${Object.entries(a).map(([k, v]) => k === 'cls' ? '' : `${k}="${esc(v)}"`).join(' ')}>`;
}

function copyRow(value, label) {
  return `<div class="copy-row">
    <span>${esc(value)}</span>
    <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(value)});toast('Copiado','success',1500)">Copiar</button>
  </div>`;
}
window.copyToast = () => toast('Copiado para a área de transferência', 'success', 1500);

/* ---------- Motor genérico de tabelas ---------- */
function sortRows(rows, sort, dir, fields) {
  if (!sort || !fields[sort]) return rows;
  const f = fields[sort];
  return rows.slice().sort((a, b) => {
    let va = f(a), vb = f(b);
    if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
    va = String(va ?? '').toLowerCase(); vb = String(vb ?? '').toLowerCase();
    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });
}
function filterRows(rows, q, fields) {
  if (!q) return rows;
  const needle = q.toLowerCase();
  return rows.filter(r => Object.values(fields).map(f => String(f(r) ?? '').toLowerCase()).some(v => v.includes(needle)));
}
function paginate(rows, page) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  page = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, total: rows.length };
}
function pagerHtml(state) {
  if (state.pages <= 1) return `<span class="info">${state.total} registro(s)</span><span></span>`;
  const nums = [];
  const start = Math.max(1, state.page - 2), end = Math.min(state.pages, start + 4);
  for (let i = end - 4; i <= end; i++) if (i >= 1) nums.push(i);
  return `<span class="info">${state.total} registro(s) · página ${state.page}/${state.pages}</span>
    <div class="pager">
      <button data-p="prev" ${state.page <= 1 ? 'disabled' : ''}>‹</button>
      ${nums.map(n => `<button data-p="${n}" class="${n === state.page ? 'active' : ''}">${n}</button>`).join('')}
      <button data-p="next" ${state.page >= state.pages ? 'disabled' : ''}>›</button>
    </div>`;
}
function handleSortAndPage(tbl, state, render) {
  tbl.querySelectorAll('th[data-sort]').forEach(th => th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.sort = key; state.dir = 'asc'; }
    state.page = 1;
    render();
  }));
}

/* ---------- Pacotes ---------- */
const PKG_FIELDS = {
  id: p => p.id, name: p => p.name, token: p => p.token_masked || p.token || '', max_devices: p => p.max_devices,
  allow_inject: p => p.allow_inject ? 1 : 0, max_dylibs: p => p.max_dylibs,
  active: p => p.status === 'active' ? 1 : 0, created_at: p => p.created_at
};
const PKG_STATUS_LABEL = { active: 'ativo', paused: 'pausado', banned: 'banido' };
function renderPackagesTable() {
  const s = tableState.packages;
  const rows = filterRows(sortRows(caches.packages, s.sort, s.dir, PKG_FIELDS), s.q, PKG_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  const thead = $('tbl-packages').querySelector('thead tr');
  thead.querySelectorAll('th').forEach(th => { th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim(); });
  thead.querySelectorAll('th[data-sort]').forEach(th => { th.innerHTML = th.textContent.trim() + arrow(th.dataset.sort); });
  $('tbl-packages').querySelector('tbody').innerHTML = p.rows.map(pk => `
    <tr>
      <td>${pk.id}</td><td><b>${esc(pk.name)}</b></td>
      <td class="hash"><span>${esc(pk.token_masked || '••••••••')}</span> <button class="btn btn-ghost btn-sm" onclick="showPackageToken(${pk.id})">Mostrar / Copiar</button></td><td>${pk.max_devices}</td>
      <td>${pk.allow_inject ? '<span class="tag tag-active"><span class="tag-dot"></span>Permitido</span>' : '<span class="tag tag-banned"><span class="tag-dot"></span>Desativado</span>'}</td>
      <td>${pk.max_dylibs}</td>
      <td><span class="tag ${pk.status === 'active' ? 'tag-active' : 'tag-inactive'}"><span class="tag-dot"></span>${esc(PKG_STATUS_LABEL[pk.status] || pk.status)}</span></td>
      <td>${fmtDate(pk.created_at, true)}</td>
      <td>
        ${sessionUser?.role === 'reseller' ? '<span class="hint">Pacote atribuído</span>' : `<button class="btn btn-ghost btn-sm" title="Alternar status" onclick="togglePackage(${pk.id})">${pk.status === 'active' ? 'Desativar' : 'Ativar'}</button>
        <button class="btn btn-sm" onclick="editPackage(${pk.id})">Configurações</button>
        <button class="btn btn-sm btn-danger" onclick="deletePackage(${pk.id})">Excluir</button>`}
      </td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="9">Nenhum pacote ainda — crie seu primeiro pacote para começar a emitir chaves de licença.</td></tr>';
  const pag = document.getElementById('pager-packages');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadPackages() {
  const d = await api('/api/packages');
  if (!d) return;
  caches.packages = d.packages;
  tableState.packages.page = 1;
  renderPackagesTable();
}
$('search-packages').addEventListener('input', e => { tableState.packages.q = e.target.value; tableState.packages.page = 1; renderPackagesTable(); });

/* ---------- Arquivos SDK ---------- */
function validBundleId(value) {
  return /^[A-Za-z0-9]+(?:[._-][A-Za-z0-9]+)+$/.test(String(value || '').trim()) && String(value || '').length <= 200;
}
function sdkFullZipCard(file) {
  const actionId = `sdk-download-action-${file.package_id}`;
  const statusLabel = file.status === 'active' ? 'ativo' : (file.status === 'banned' ? 'banido' : 'pausado');
  return `<div class="card" style="margin:0 0 16px">
    <h2>${esc(file.package_name)} <span class="tag ${file.status === 'active' ? 'tag-active' : (file.status === 'banned' ? 'tag-banned' : 'tag-inactive')}"><span class="tag-dot"></span>${esc(statusLabel)}</span></h2>
    <p class="hint">Informe o Bundle ID do aplicativo de destino. O ZIP completo do SDK e seu plist serão personalizados para este pacote e aplicativo.</p>
    <div class="field" style="max-width:560px;margin-top:12px">
      <label for="sdk-bundle-id-${file.package_id}">Bundle ID do Aplicativo</label>
      <input id="sdk-bundle-id-${file.package_id}" class="input sdk-bundle-id" data-package-id="${file.package_id}" autocomplete="off" spellcheck="false" placeholder="com.dts.freefireth" aria-describedby="sdk-bundle-help-${file.package_id}">
      <div id="sdk-bundle-help-${file.package_id}" class="hint" style="margin-top:7px">Exemplo: <code>com.dts.freefireth</code>. O botão de download aparece após inserir um Bundle ID válido.</div>
    </div>
    <div id="${actionId}" class="sdk-download-action" style="margin-top:12px"><span class="hint">Informe um Bundle ID válido para liberar o download completo do ZIP.</span></div>
  </div>`;
}
function updateSdkZipAction(input) {
  const packageId = input?.dataset.packageId;
  const action = packageId ? $(`sdk-download-action-${packageId}`) : null;
  if (!action) return;
  const bundleId = String(input.value || '').trim();
  if (!validBundleId(bundleId)) {
    action.innerHTML = '<span class="hint">Informe um Bundle ID válido para liberar o download completo do ZIP.</span>';
    return;
  }
  const href = `/api/sdk-files/${encodeURIComponent(packageId)}/full/download?bundle_id=${encodeURIComponent(bundleId)}`;
  action.innerHTML = `<a class="btn btn-primary btn-sm" href="${href}">Baixar ZIP Completo do SDK</a><span class="hint" style="margin-left:10px">Personalizado para <code>${esc(bundleId)}</code></span>`;
}
async function loadSdkFiles() {
  const body = $('sdk-files-body'); if (!body) return;
  body.innerHTML = '<p class="hint">Carregando arquivos SDK…</p>';
  const d = await api('/api/sdk-files'); if (!d) return;
  const select = $('sdk-package-filter');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Selecione um pacote</option>' + (d.files || []).map(f => `<option value="${f.package_id}">${esc(f.package_name)}</option>`).join('');
    select.value = current;
  }
  const chosen = select?.value || '';
  const all = d.files || [];
  const files = chosen ? all.filter(f => String(f.package_id) === String(chosen)) : all;
  body.innerHTML = files.length ? files.map(sdkFullZipCard).join('') : '<p class="hint">Nenhum pacote ainda — crie um pacote primeiro; o SDK dele aparecerá aqui.</p>';
  body.querySelectorAll('.sdk-bundle-id').forEach(input => {
    input.addEventListener('input', () => updateSdkZipAction(input));
  });
}
$('sdk-package-filter')?.addEventListener('change', loadSdkFiles);
$('btn-refresh-sdk-files')?.addEventListener('click', loadSdkFiles);

/* ---------- Licenças ---------- */
const LIC_FIELDS = {
  id: l => l.id, package_name: l => l.package_name, key: l => l.license_key, status: l => l.status,
  device_count: l => l.devices_used || 0, duration_days: l => l.duration_days || 0,
  expires_at: l => l.expires_at || '', note: l => l.note || ''
};
const STATUS_TAGS = {
  active: '<span class="tag tag-active"><span class="tag-dot"></span>ativa</span>',
  used: '<span class="tag tag-active"><span class="tag-dot"></span>usada</span>',
  expired: '<span class="tag tag-expired"><span class="tag-dot"></span>expirada</span>',
  banned: '<span class="tag tag-banned"><span class="tag-dot"></span>banida</span>'
};
function licStatusBadge(l) {
  if (l.status !== 'active') return STATUS_TAGS[l.status] || '<span class="tag tag-inactive">' + esc(l.status) + '</span>';
  const days = l.duration_days ? l.duration_days + ' dias' : 'Ilimitado';
  const used = Number(l.devices_used || 0) > 0;
  const label = used ? 'usada' : 'ativa';
  const sub = used ? ((l.devices_used || 0) + ' dispositivo(s) vinculado(s)') : 'ainda não ativada';
  return '<span class="tag tag-active" style="display:inline-flex;flex-direction:column;align-items:flex-start;line-height:1.4"><span><span class="tag-dot"></span>' + label + ' · ' + days + '</span><span style="color:var(--text-2);font-size:11px">' + sub + '</span></span>';
}
window.copyKey = el => { navigator.clipboard.writeText(el.title).then(() => toast('Chave copiada', 'success')).catch(() => {}); };
function renderLicensesTable() {
  const s = tableState.licenses;
  const rows = filterRows(sortRows(caches.licenses, s.sort, s.dir, LIC_FIELDS), s.q, LIC_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  $('tbl-licenses').querySelector('thead tr').querySelectorAll('th').forEach(th => {
    if (th.dataset.sort) th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim() + arrow(th.dataset.sort);
  });
  $('tbl-licenses').querySelector('tbody').innerHTML = p.rows.map(l => `
    <tr>
      <td>${l.id}</td><td>${esc(l.package_name)}</td>
      <td class="mono-key" title="${esc(l.license_key)}" onclick="copyKey(this)">${esc(l.license_key)} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.55;vertical-align:-1px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></td>
      <td>${licStatusBadge(l)}</td>
      <td><b>${l.devices_used || 0}/${l.max_devices ?? '-'}</b></td>
      <td>${l.expires_at ? fmtDate(l.expires_at, true) : '—'}</td>
      <td>${esc(l.note || '—')}</td>
      <td style="white-space:nowrap">
        ${l.status === 'active' ? `<button class="btn btn-sm" onclick="setLicenseStatus(${l.id},'paused')">Pausar</button>` : ''}
        ${l.status === 'active' ? `<button class="btn btn-sm btn-danger" onclick="setLicenseStatus(${l.id},'banned')">Banir</button>` : ''}
        ${l.status !== 'active' ? `<button class="btn btn-sm btn-success" onclick="setLicenseStatus(${l.id},'active')">${l.status === 'banned' ? 'Desbanir' : (l.status === 'paused' ? 'Retomar' : 'Reativar')}</button>` : ''}
        ${l.status !== 'banned' && l.status !== 'active' ? `<button class="btn btn-sm btn-danger" onclick="setLicenseStatus(${l.id},'banned')">Banir</button>` : ''}
        <button class="btn btn-sm" onclick="resetLicenseDevices(${l.id})">Redefinir</button>
        <button class="btn btn-sm btn-danger" onclick="deleteLicense(${l.id})">Excluir</button>
      </td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="9">Nenhuma licença ainda — crie chaves no pacote selecionado.</td></tr>';
  const pag = document.getElementById('pager-licenses');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadLicenses() {
  const pkg = $('filter-package').value;
  const d = await api('/api/licenses' + (pkg ? '?package_id=' + pkg : ''));
  if (!d) return;
  caches.licenses = d.licenses;
  tableState.licenses.page = 1;
  renderLicensesTable();
}
$('search-licenses').addEventListener('input', e => { tableState.licenses.q = e.target.value; tableState.licenses.page = 1; renderLicensesTable(); });

function refreshPackageFilters() {
  const sel = $('filter-package');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todos os pacotes</option>' + caches.packages.map(pk =>
    `<option value="${pk.id}" ${cur == pk.id ? 'selected' : ''}>${esc(pk.name)}</option>`).join('');
  sel.onchange = loadLicenses;
  const ds = $('filter-device-license');
  const cur2 = ds.value;
  ds.innerHTML = '<option value="">Todas as licenças</option>' + caches.licenses.map(l =>
    `<option value="${l.id}" ${cur2 == l.id ? 'selected' : ''}>${esc(l.license_key)} · ${esc(l.package_name)}</option>`).join('');
  ds.onchange = () => { tableState.devices.page = 1; loadDevices(); };
  const cs = $('filter-check-license');
  const cur3 = cs.value;
  cs.innerHTML = '<option value="">Todas as licenças</option>' + caches.licenses.map(l =>
    `<option value="${l.id}" ${cur3 == l.id ? 'selected' : ''}>${esc(l.license_key)} · ${esc(l.package_name)}</option>`).join('');
  cs.onchange = () => { tableState.checks.page = 1; loadChecks(); };
}

/* ---------- Dispositivos ---------- */
const DEV_FIELDS = {
  id: d => d.id, package_name: d => d.package_name, license_key: d => d.license_key,
  device_hash: d => d.device_id_hash || '', name_hash: d => d.device_name_hash || '',
  hwid_hash: d => d.hardware_hash || '', system_hash: d => d.system_hash || '',
  os_info: d => d.last_os_seen || '', last_ip: d => d.last_ip_seen || '',
  last_seen_at: d => d.last_seen_at || '', check_count: d => d.check_count || 0
};
function renderDevicesTable() {
  const s = tableState.devices;
  const rows = filterRows(sortRows(caches.devices, s.sort, s.dir, DEV_FIELDS), s.q, DEV_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  $('tbl-devices').querySelector('thead tr').querySelectorAll('th').forEach(th => {
    if (th.dataset.sort) th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim() + arrow(th.dataset.sort);
  });
  $('tbl-devices').querySelector('tbody').innerHTML = p.rows.map(dev => `
    <tr>
      <td>${dev.id}</td><td>${esc(dev.package_name)}</td>
      <td class="hash">${esc(dev.license_key)}</td>
      <td class="hash" title="${esc(dev.device_id_hash || '')}">${shortHash(dev.device_id_hash)}</td>
      <td class="hash">${dev.device_name_hash ? 'definido' : '—'}</td>
      <td class="hash">${dev.hardware_hash ? 'definido' : '—'}</td>
      <td class="hash">${dev.system_hash ? 'definido' : '—'}</td>
      <td>${esc(dev.last_os_seen || '—')}</td>
      <td>${esc(dev.last_ip_seen || '—')}</td>
      <td>${dev.last_seen_at ? fmtDate(dev.last_seen_at) : '—'}</td>
      <td>${dev.check_count}</td>
      <td>
        ${dev.ban_override !== 'banned' ? `<button class="btn btn-sm btn-danger" onclick="banDevice(${dev.id}, true)">Banir</button>` :
          `<button class="btn btn-sm btn-success" onclick="banDevice(${dev.id}, false)">Desbanir</button>`}
        <button class="btn btn-sm" onclick="resetDevice(${dev.license_id}, '${esc(dev.device_id_hash)}')">Desvincular</button>
      </td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="12">Nenhum dispositivo registrado ainda.</td></tr>';
  const pag = document.getElementById('pager-devices');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadDevices() {
  const lic = $('filter-device-license').value;
  const d = await api('/api/devices' + (lic ? '?license_id=' + lic : ''));
  if (!d) return;
  caches.devices = d.devices;
  tableState.devices.page = 1;
  renderDevicesTable();
}
$('search-devices').addEventListener('input', e => { tableState.devices.q = e.target.value; tableState.devices.page = 1; renderDevicesTable(); });

/* ---------- Verificar registro ---------- */
const CHK_FIELDS = {
  id: c => c.id, created_at: c => c.created_at || '', package_token: c => c.package_token || '',
  device_hash: c => c.device_hash || '', result: c => c.result || '', detail: c => c.detail || ''
};
function renderChecksTable() {
  const s = tableState.checks;
  const rows = filterRows(sortRows(caches.checks, s.sort, s.dir, CHK_FIELDS), s.q, CHK_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  $('tbl-checks').querySelector('thead tr').querySelectorAll('th').forEach(th => {
    if (th.dataset.sort) th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim() + arrow(th.dataset.sort);
  });
  $('tbl-checks').querySelector('tbody').innerHTML = p.rows.map(c => `
    <tr>
      <td>${c.id}</td>
      <td>${fmtDate(c.created_at)}</td>
      <td class="hash" title="${esc(c.package_token || '')}">${shortHash(c.package_token, 10)}</td>
      <td class="hash" title="${esc(c.device_hash || '')}">${shortHash(c.device_hash)}</td>
      <td><span class="tag ${c.result === 'valid' ? 'tag-active' : 'tag-banned'}"><span class="tag-dot"></span>${esc(c.result)}</span></td>
      <td style="white-space:normal;max-width:260px">${esc(c.detail || '—')}</td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma verificação de SDK registrada ainda.</td></tr>';
  const pag = document.getElementById('pager-checks');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadChecks() {
  const lic = $('filter-check-license').value;
  const d = await api('/api/check-log' + (lic ? '?license_id=' + lic : ''));
  if (!d) return;
  caches.checks = d.log;
  tableState.checks.page = 1;
  renderChecksTable();
}
$('search-checks').addEventListener('input', e => { tableState.checks.q = e.target.value; tableState.checks.page = 1; renderChecksTable(); });

/* ---------- Proibições de IP ---------- */
const BAN_FIELDS = {
  id: b => b.id, ip_hash: b => b.ip_hash || '', reason: b => b.reason || '',
  expires_at: b => b.expires_at || '', created_at: b => b.created_at || ''
};
function renderBansTable() {
  const s = tableState.bans;
  const rows = filterRows(sortRows(caches.bans, s.sort, s.dir, BAN_FIELDS), s.q, BAN_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  $('tbl-bans').querySelector('thead tr').querySelectorAll('th').forEach(th => {
    if (th.dataset.sort) th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim() + arrow(th.dataset.sort);
  });
  $('tbl-bans').querySelector('tbody').innerHTML = p.rows.map(b => `
    <tr>
      <td>${b.id}</td><td class="hash" title="${esc(b.ip_hash)}">${shortHash(b.ip_hash)}</td>
      <td>${esc(b.reason || '—')}</td>
      <td>${b.expires_at ? fmtDate(b.expires_at) : '<span class="tag tag-banned"><span class="tag-dot"></span>permanente</span>'}</td>
      <td>${fmtDate(b.created_at)}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteBan(${b.id})">Remover</button></td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma proibição de IP — a API pública está aberta.</td></tr>';
  const pag = document.getElementById('pager-bans');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadBans() {
  const d = await api('/api/ip-bans');
  if (!d) return;
  caches.bans = d.bans;
  tableState.bans.page = 1;
  renderBansTable();
}
$('search-bans').addEventListener('input', e => { tableState.bans.q = e.target.value; tableState.bans.page = 1; renderBansTable(); });

/* ---------- Auditoria ---------- */
const AUD_FIELDS = {
  created_at: a => a.created_at || '', actor: a => a.actor || '', action: a => a.action || '',
  target: a => (a.target_type || '') + (a.target_id ? '#' + a.target_id : ''), detail: a => a.detail || ''
};
function renderAuditTable() {
  const s = tableState.audit;
  const rows = filterRows(sortRows(caches.audit, s.sort, s.dir, AUD_FIELDS), s.q, AUD_FIELDS);
  const p = paginate(rows, s.page);
  const arrow = k => s.sort === k ? `<span class="sort-arrow">${s.dir === 'asc' ? '▲' : '▼'}</span>` : '';
  $('tbl-audit').querySelector('thead tr').querySelectorAll('th').forEach(th => {
    if (th.dataset.sort) th.innerHTML = th.textContent.replace(/[▲▼]/g, '').trim() + arrow(th.dataset.sort);
  });
  $('tbl-audit').querySelector('tbody').innerHTML = p.rows.map(a => `
    <tr>
      <td>${fmtDate(a.created_at)}</td>
      <td>${esc(a.actor || '—')}</td>
      <td><span class="tag tag-inactive">${esc(a.action)}</span></td>
      <td>${esc((a.target_type || '') + (a.target_id ? '#' + a.target_id : '') || '—')}</td>
      <td style="white-space:normal;max-width:280px">${esc(a.detail || '—')}</td>
    </tr>`).join('') || '<tr class="empty-row"><td colspan="5">Nenhuma entrada de auditoria ainda.</td></tr>';
  const pag = document.getElementById('pager-audit');
  if (pag) pag.innerHTML = pagerHtml(p);
}
async function loadAudit() {
  const d = await api('/api/audit');
  if (!d) return;
  caches.audit = d.log;
  tableState.audit.page = 1;
  renderAuditTable();
}
$('search-audit').addEventListener('input', e => { tableState.audit.q = e.target.value; tableState.audit.page = 1; renderAuditTable(); });

/* ---------- Cliques de paginação ---------- */
document.addEventListener('click', e => {
  const btn = e.target.closest('.pager button[data-p]');
  if (!btn) return;
  const wrap = btn.closest('.table-wrap');
  const tbl = wrap ? wrap.querySelector('.tbl') : null;
  if (!tbl) return;
  const which = { 'tbl-packages': 'packages', 'tbl-licenses': 'licenses', 'tbl-devices': 'devices',
                  'tbl-checks': 'checks', 'tbl-bans': 'bans', 'tbl-audit': 'audit' }[tbl.id];
  if (!which) return;
  const s = tableState[which];
  const v = btn.dataset.p;
  if (v === 'prev') s.page--; else if (v === 'next') s.page++; else s.page = parseInt(v);
  ({ packages: renderPackagesTable, licenses: renderLicensesTable, devices: renderDevicesTable,
     checks: renderChecksTable, bans: renderBansTable, audit: renderAuditTable })[which]();
});

/* ---------- Ações ---------- */

$('btn-new-package').addEventListener('click', () => {
  openModal('Novo Pacote',
    modalField('Nome do Pacote', inputHtml({ id: 'm-pkg-name', required: 'required', placeholder: 'por exemplo, Apex Tools' })) +
    modalField('Nome de usuário do Telegram (sem o @)', inputHtml({ id: 'm-pkg-telegram', placeholder: 'suporte ao proprietário' })) +
    
    modalField('Política de Injeção', `<select id="m-pkg-inject" class="input">
      <option value="1">Permitir injeção</option><option value="0">Desativar injeção</option></select>`) +
    modalField('Número máximo de dylibs permitido (com a injeção desativada)', inputHtml({ id: 'm-pkg-dylibs', type: 'number', min: '0', max: '64', value: '3' })) +
    `<p class="hint">Quando a opção <b>Desativar Injeção</b> está ativa, as verificações do SDK que relatam um número de dylibs superior ao permitido são rejeitadas como <code>injection_detected</code>.</p>`, [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Criar', cls: 'btn-primary', fn: async () => {
        const name = $('m-pkg-name').value.trim();
        if (!name) return toast('O nome do pacote é obrigatório', 'error');
        const d = await api('/api/packages', { name,
          allow_inject: parseInt($('m-pkg-inject').value),
          max_dylibs: Math.min(64, Math.max(0, parseInt($('m-pkg-dylibs').value) || 0)), telegram_username: $('m-pkg-telegram').value.trim() || null });
        if (d) {
          closeModal();
          openModal('Pacote Criado — Salve Seus Segredos',
            `<p style="color:var(--text-2);font-size:13.5px">Copie o <b>token</b> e o <b>segredo HMAC</b> agora — o segredo é exibido apenas uma vez.</p>
             <div class="field"><label>Token do pacote</label>${copyRow(d.token)}</div>
             <div class="field"><label>Segredo HMAC</label>${copyRow(d.hmac_secret)}</div>
             <p class="hint">O SDK verifica com <code>signature = HMAC-SHA256(secret, key|device_id)</code></p>`, [
              { label: 'Concluído', cls: 'btn-primary', fn: () => { closeModal(); loadPackages(); } }
            ], true);
          toast('Pacote criado', 'success');
        }
      } }
  ]);
});

window.showPackageToken=async id=>{const d=await api('/api/packages/token?id='+encodeURIComponent(id));if(!d||!d.token)return;openModal('Token do Pacote',`<p class="hint">Mantenha este token privado. Ele é exigido pelo SDK.</p><div class="copy-row"><code style="word-break:break-all">${esc(d.token)}</code><button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(${JSON.stringify(d.token)}).then(()=>toast('Token copiado','success'))">Copiar</button></div>`,[{label:'Fechar',cls:'btn-ghost',fn:closeModal}],true);};
window.togglePackage = async id => { const d = await api('/api/packages/toggle', { id }); if (d) { loadPackages(); toast('Status atualizado', 'success'); } };

window.copyPackageToken = async id => { const d = await api('/api/packages/token?id=' + encodeURIComponent(id)); if (d?.token) navigator.clipboard.writeText(d.token).then(() => toast('Token do pacote copiado', 'success')).catch(() => {}); };
window.editPackage = id => {
  const p = caches.packages.find(x => x.id === id); if (!p) return;
  const masked = p.token_masked || '••••••••••••••••';
  openModal('Editar Pacote — ' + p.name,
    `<div class="field"><label>Token do Pacote</label><div class="copy-row"><code style="flex:1;word-break:break-all">${esc(masked)}</code><button class="btn btn-ghost btn-sm" onclick="showPackageToken(${p.id})">Mostrar</button><button class="btn btn-primary btn-sm" onclick="copyPackageToken(${p.id})">Copiar</button></div></div>` +
    `<div class="field"><label>Nome do Pacote</label>${inputHtml({ id: 'm-edit-name', value: p.name })}</div>` +
    modalField('Nome de usuário do Telegram (sem o @)', inputHtml({ id: 'm-edit-telegram', value: p.telegram_username || '', placeholder: 'suporte ao proprietário' })) +
    modalField('Status', `<select id="m-edit-status" class="input"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Ativo</option><option value="paused" ${p.status === 'paused' ? 'selected' : ''}>Pausado</option><option value="banned" ${p.status === 'banned' ? 'selected' : ''}>Banido</option></select>`) +
    modalField('Permitir Injeção de Dylib', `<select id="m-edit-inject" class="input"><option value="1" ${p.allow_inject ? 'selected' : ''}>Permitir</option><option value="0" ${!p.allow_inject ? 'selected' : ''}>Bloquear</option></select>`) +
    modalField('Modo de ID do Dispositivo', `<select id="m-edit-device-mode" class="input"><option value="container" selected>ID de Instância (persistente no Keychain)</option></select>`) +
    modalField('Máximo de Dylibs Permitido', inputHtml({ id: 'm-edit-dylibs', type: 'number', min: '0', max: '64', value: String(p.max_dylibs ?? 3) })) +
    modalField('Última Versão', inputHtml({ id: 'm-edit-version', value: p.latest_version || '' })) +
    modalField('URL de Atualização', inputHtml({ id: 'm-edit-update-url', value: p.update_url || '', placeholder: 'https://...' })) +
    modalField('Nota', inputHtml({ id: 'm-edit-note', value: esc(p.note || '') })) +
    '<p class="hint">Pacotes pausados/banidos falham na verificação. Bloquear a injeção aplica a política de máximo de dylibs.</p>', [
      { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
      { label: 'Salvar Alterações', cls: 'btn-primary', fn: async () => {
        const inject = parseInt($('m-edit-inject').value);
        const d = await api('/api/packages/update', { id: p.id, name: $('m-edit-name').value.trim() || undefined, status: $('m-edit-status').value, allow_inject: inject, max_dylibs: Math.min(64, Math.max(0, parseInt($('m-edit-dylibs').value) || 0)), device_id_mode: $('m-edit-device-mode').value, latest_version: $('m-edit-version').value.trim() || null, update_url: $('m-edit-update-url').value.trim() || null, note: $('m-edit-note').value || null, telegram_username: $('m-edit-telegram').value.trim() || null });
        if (d) { closeModal(); loadPackages(); loadLicenses(); toast('Configurações do pacote salvas', 'success'); }
      } }
    ]);
};
window.deletePackage = id => {
  const p = caches.packages.find(x => x.id === id);
  if (!p) return;
  openModal('Excluir Pacote',
    `<p style="color:var(--danger)">Isso excluirá permanentemente <b>${esc(p.name)}</b> e <b>todas as suas licenças e registros de dispositivos</b>.</p>
     <p style="color:var(--text-2);font-size:13px">Esta ação não pode ser desfeita. Tem certeza?</p>`, [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Excluir pacote', cls: 'btn-danger', fn: async () => {
        const d = await api('/api/packages/delete', { id });
        if (!d) return;
        closeModal(); loadPackages(); loadDashboard();
        toast('Pacote excluído', 'success');
      } }
  ]);
};

$('btn-create-keys').addEventListener('click', () => {
  if (!caches.packages.length) return toast('Crie um pacote primeiro', 'error');
  openModal('Criar Chave de Licença',
    modalField('Pacote', `<select id="m-key-pkg" class="input">${caches.packages.map(pk =>
      `<option value="${pk.id}">${esc(pk.name)}</option>`).join('')}</select>`) +
    modalField('Número de Chaves', inputHtml({ id: 'm-key-count', type: 'number', min: '1', max: '500', value: '1' })) +
    modalField('Número Máximo de Dispositivos para Cada Chave', inputHtml({ id: 'm-key-devices', type: 'number', min: '1', max: '100', value: '1' })) +
    modalField('Duração', `<select id="m-key-duration" class="input"><option value="1">Dia</option><option value="7">Semana</option><option value="30" selected>Mês</option></select>`) +
    '<p style="color:var(--text-2);font-size:12.5px;margin:6px 0 0">Cada chave possui 16 caracteres (ex.: <span class="mono-key" style="font-size:12px">GJWJ95D85ZXP878T</span>). Selecione o período de validade acima.</p>', [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Criar', cls: 'btn-primary', fn: async () => {
        const d = await api('/api/licenses/create', {
          package_id: parseInt($('m-key-pkg').value),
          count: parseInt($('m-key-count').value) || 1,
          max_devices: parseInt($('m-key-devices').value) || 1,
          duration_days: parseInt($('m-key-duration').value) || 30
        });
        if (d) {
          closeModal();
          if (d.created <= 20) {
            openModal(`${d.created} Chave(s) Criada(s)`,
              `<p style="color:var(--text-2);font-size:13px">Copie estas chaves agora e entregue-as com segurança — elas não serão mostradas novamente por completo.</p>
               <textarea readonly rows="${Math.min(24, d.created + 2)}" style="width:100%;font-family:var(--mono);font-size:12px;background:var(--bg-2);border:1px solid var(--border);border-radius:10px;padding:12px;color:var(--text)" onclick="this.select()">${d.keys.join('\n')}</textarea>`, [
                { label: 'Concluído', cls: 'btn-primary', fn: () => { closeModal(); loadLicenses(); } }
              ], true);
          } else {
            toast(`${d.created} chaves criadas`, 'success');
            loadLicenses();
          }
        }
      } }
  ]);
});

window.resetLicenseDevices = id => {
  openModal('Redefinir Dispositivo da Licença',
    '<p style="color:var(--text-2)">Remover todas as vinculações de dispositivos desta licença? A chave permanece ativa e pode vincular novamente se o limite de dispositivos permitir.</p>', [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Redefinir dispositivo', cls: 'btn-primary', fn: async () => { const d = await api('/api/licenses/reset-device', { license_id: id }); if (!d) return; closeModal(); loadLicenses(); loadDevices(); toast('Todos os dispositivos foram redefinidos', 'success'); } }
  ]);
};
window.deleteLicense = id => {
  openModal('Excluir Licença',
    '<p style="color:var(--danger)">Excluir permanentemente esta chave, seus dispositivos e seu histórico de verificações? Isso não pode ser desfeito.</p>', [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Excluir chave', cls: 'btn-danger', fn: async () => { const d = await api('/api/licenses/delete', { id }); if (!d) return; closeModal(); loadLicenses(); loadDevices(); loadDashboard(); toast('Licença excluída', 'success'); } }
  ]);
};
window.setLicenseStatus = (id, status) => {
  if (status === 'banned') {
    openModal('Banir Licença',
      modalField('Motivo (opcional)', inputHtml({ id: 'm-status-reason', placeholder: 'ex.: violação dos termos' })), [
      { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
      { label: 'Banir', cls: 'btn-danger', fn: async () => {
          const d = await api('/api/licenses/set-status', { id, status, reason: $('m-status-reason').value || null });
          if (!d) return;
          closeModal(); loadLicenses(); toast('Licença banida', 'success');
        } }
    ]);
  } else {
    api('/api/licenses/set-status', { id, status }).then(d => { if (d) { loadLicenses(); toast('Status atualizado', 'success'); } });
  }
};

window.banDevice = async (id, ban) => { const d = await api('/api/devices/ban', { id, ban }); if (d) { loadDevices(); toast(ban ? 'Dispositivo banido' : 'Dispositivo desbanido', 'success'); } };

window.resetDevice = async (license_id, device_id) => {
  openModal('Desvincular Dispositivo',
    `<p style="color:var(--text-2);font-size:13.5px">Remover este dispositivo da licença? Ele pode se registrar novamente na próxima verificação — <b>se houver vagas de dispositivo disponíveis</b>.</p>`, [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Desvincular dispositivo', cls: 'btn-danger', fn: async () => {
        await api('/api/licenses/reset-device', { license_id, device_id });
        closeModal(); loadDevices(); loadLicenses();
        toast('Dispositivo desvinculado', 'success');
      } }
  ]);
};

$('btn-new-ban').addEventListener('click', () => {
  openModal('Banir Endereço IP',
    modalField('Endereço IP', inputHtml({ id: 'm-ban-ip', placeholder: '1.2.3.4' })) +
    modalField('Motivo (opcional)', inputHtml({ id: 'm-ban-reason', placeholder: 'ex.: tentativas de força bruta' })) +
    modalField('Duração em horas (em branco = permanente)', inputHtml({ id: 'm-ban-hours', type: 'number', min: '1' })), [
    { label: 'Cancelar', cls: 'btn-ghost', fn: closeModal },
    { label: 'Banir IP', cls: 'btn-danger', fn: async () => {
        const ip = $('m-ban-ip').value.trim();
        if (!ip) return toast('O endereço IP é obrigatório', 'error');
        const d = await api('/api/ip-bans', { ip,
          reason: $('m-ban-reason').value || null,
          duration_hours: $('m-ban-hours').value ? parseInt($('m-ban-hours').value) : null });
        if (d) { closeModal(); loadBans(); toast('IP banido', 'success'); }
      } }
  ]);
});

window.deleteBan = async id => { await api('/api/ip-bans/delete', { id }); loadBans(); toast('Proibição removida', 'success'); };


function resellerStatusLabel(status) { return status === 'active' ? '<span class="tag tag-active"><span class="tag-dot"></span>Ativo</span>' : '<span class="tag tag-inactive"><span class="tag-dot"></span>Desativado</span>'; }
function resellerError(error) {
  return ({ reseller_parent_only: 'Contas de revendedor não podem criar outras contas de revendedor.', invalid_reseller_username: 'O nome de usuário deve ter de 3 a 32 letras, números, pontos, sublinhados ou hífens.', invalid_reseller_password: 'A senha deve conter pelo menos 8 caracteres.', invalid_reseller_quota: 'Informe uma cota de chaves válida.', invalid_reseller_packages: 'Escolha pelo menos um pacote válido.', username_in_use: 'Esse nome de usuário já está em uso.', reseller_quota_exceeds_parent_limit: 'A cota do revendedor excede o limite disponível da sua conta.' })[error] || error || 'Operação falhou.';
}
async function loadResellers() {
  const notice = $('reseller-notice');
  const body = $('tbl-resellers-body');
  if (!notice || !body) return;
  const d = await apiDetailed('/api/resellers');
  if (!d.ok) {
    caches.resellers = [];
    body.innerHTML = '<tr class="empty-row"><td colspan="6">O gerenciamento de revendedores não está disponível para esta conta.</td></tr>';
    notice.textContent = resellerError(d.data?.error);
    $('btn-new-reseller')?.classList.toggle('hidden', d.status === 403);
    return;
  }
  $('btn-new-reseller')?.classList.remove('hidden');
  notice.textContent = sessionUser?.role === 'owner' ? 'Crie contas de revendedor para qualquer pacote.' : 'Revendedores podem acessar apenas os pacotes que você atribuir a eles.';
  caches.resellers = d.data?.resellers || [];
  body.innerHTML = caches.resellers.map(r => `<tr>
    <td><b>${esc(r.username)}</b><div class="hint">${esc(r.email || 'Sem e-mail')}</div></td>
    <td>${(r.packages || []).map(p => `<span class="badge badge-blue" style="margin:2px">${esc(p.name)}</span>`).join('') || '—'}</td>
    <td>${r.created_keys || 0}</td><td>${r.max_keys}</td><td>${resellerStatusLabel(r.account_status)}</td>
    <td><button class="btn btn-primary btn-sm" onclick="viewResellerLicenses(${r.id})">Ver chaves</button>
      <button class="btn btn-ghost btn-sm" onclick="editReseller(${r.id})">Editar</button>
      <button class="btn btn-ghost btn-sm" onclick="resetResellerPassword(${r.id})">Senha</button>
      <button class="btn btn-sm" onclick="toggleReseller(${r.id})">${r.account_status === 'active' ? 'Desativar' : 'Ativar'}</button>
      <button class="btn btn-sm btn-danger" onclick="deleteReseller(${r.id})">Excluir</button></td>
  </tr>`).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma conta de revendedor ainda. Crie uma para começar a revender os pacotes selecionados.</td></tr>';
}
window.viewResellerLicenses = async id => {
  const r = caches.resellers.find(x => x.id === id); if (!r) return;
  const d = await apiDetailed('/api/licenses?reseller_id=' + encodeURIComponent(id));
  if (!d.ok) return toast(resellerError(d.data?.error), 'error');
  const rows = d.data?.licenses || [];
  const render = () => `<div class="page-desc" style="margin-bottom:12px">Chaves criadas para <b>${esc(r.username)}</b>. Você pode criar, redefinir, banir ou excluir estas chaves por aqui.</div><div class="table-wrap"><table class="tbl"><thead><tr><th>Chave</th><th>Pacote</th><th>Status</th><th>Dispositivos</th><th>Expira</th><th>Ações</th></tr></thead><tbody>${rows.map(l => `<tr><td class="mono-key">${esc(l.license_key)}</td><td>${esc(l.package_name)}</td><td>${licStatusBadge(l)}</td><td>${l.devices_used || 0} / ${l.max_devices || 0}</td><td>${esc(l.expires_at || '—')}</td><td><button class="btn btn-ghost btn-sm" onclick="resetLicenseDevices(${l.id}); viewResellerLicenses(${id})">Redefinir</button> <button class="btn btn-ghost btn-sm" onclick="setLicenseStatus(${l.id},'${l.status === 'banned' ? 'active' : 'banned'}'); setTimeout(()=>viewResellerLicenses(${id}),450)">${l.status === 'banned' ? 'Desbanir' : 'Banir'}</button> <button class="btn btn-sm btn-danger" onclick="deleteLicense(${l.id}); setTimeout(()=>viewResellerLicenses(${id}),350)">Excluir</button></td></tr>`).join('') || '<tr class="empty-row"><td colspan="6">Nenhuma chave criada para este revendedor ainda.</td></tr>'}</tbody></table></div>`;
  openModal('Chaves — ' + r.username, render() + '<div id="reseller-key-create" style="margin-top:18px"></div>', [{ label: 'Criar chaves para revendedor', cls: 'btn-primary', fn: async () => { const packages = (r.packages || []); if (!packages.length) return toast('Atribua um pacote primeiro', 'error'); openModal('Criar Chaves para ' + r.username, modalField('Pacote', `<select id="m-reseller-key-pkg" class="input">${packages.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>`) + modalField('Número de chaves', inputHtml({ id: 'm-reseller-key-count', type: 'number', min: '1', max: '500', value: '1' })) + modalField('Máximo de dispositivos por chave', inputHtml({ id: 'm-reseller-key-devices', type: 'number', min: '1', max: '100', value: '1' })) + modalField('Duração', `<select id="m-reseller-key-duration" class="input"><option value="1">Dia</option><option value="7">Semana</option><option value="30" selected>Mês</option></select>`), [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal }, { label: 'Criar chaves', cls: 'btn-primary', fn: async () => { const out = await apiDetailed('/api/licenses/create', { reseller_id: id, package_id: Number($('m-reseller-key-pkg').value), count: Number($('m-reseller-key-count').value), max_devices: Number($('m-reseller-key-devices').value), duration_days: Number($('m-reseller-key-duration').value) }); if (!out.ok) return toast(resellerError(out.data?.error), 'error'); closeModal(); toast('Chaves criadas para o revendedor', 'success'); viewResellerLicenses(id); } }], true); } }, { label: 'Fechar', cls: 'btn-ghost', fn: closeModal }], true);
};

async function availableResellerPackages() {
  const d = await apiDetailed('/api/resellers/available-packages');
  if (!d.ok) { toast(resellerError(d.data?.error), 'error'); return null; }
  return d.data.packages || [];
}
function resellerPackageFields(packages, selected) {
  const ids = new Set((selected || []).map(Number));
  return `<div class="field"><label>Pacotes disponíveis para este revendedor</label><div class="card" style="padding:10px;max-height:220px;overflow:auto">${packages.map(p => `<label style="display:flex;gap:8px;align-items:center;padding:7px 3px"><input class="reseller-package-check" type="checkbox" value="${p.id}" ${ids.has(Number(p.id)) ? 'checked' : ''}> <span>${esc(p.name)}</span><span class="hint">${esc(p.status)}</span></label>`).join('') || '<span class="hint">Crie um pacote primeiro.</span>'}</div></div>`;
}
function selectedResellerPackages() { return [...document.querySelectorAll('.reseller-package-check:checked')].map(x => Number(x.value)); }
window.openResellerForm = async () => {
  const packages = await availableResellerPackages();
  if (!packages) return;
  openModal('Criar Revendedor', modalField('Nome de usuário', inputHtml({ id: 'm-reseller-username', required: 'required', placeholder: 'por exemplo, parceiro_01' })) + modalField('Senha', inputHtml({ id: 'm-reseller-password', type: 'password', minlength: '8', required: 'required', placeholder: 'Pelo menos 8 caracteres' })) + modalField('Número máximo de chaves', inputHtml({ id: 'm-reseller-quota', type: 'number', min: '1', max: '100000', value: '100' })) + resellerPackageFields(packages), [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal }, { label: 'Criar revendedor', cls: 'btn-primary', fn: async () => { const body = { username: $('m-reseller-username').value.trim(), password: $('m-reseller-password').value, max_keys: parseInt($('m-reseller-quota').value, 10), package_ids: selectedResellerPackages() }; const r = await apiDetailed('/api/resellers', body); if (!r.ok) return toast(resellerError(r.data?.error), 'error'); closeModal(); toast('Conta de revendedor criada', 'success'); loadResellers(); } }], true);
};
window.editReseller = async id => {
  const r = caches.resellers.find(x => x.id === id); if (!r) return;
  const packages = await availableResellerPackages(); if (!packages) return;
  openModal('Editar Revendedor — ' + r.username, modalField('Nome de usuário', inputHtml({ id: 'm-reseller-username', value: r.username, disabled: 'disabled' })) + modalField('Número máximo de chaves', inputHtml({ id: 'm-reseller-quota', type: 'number', min: String(r.created_keys || 0), max: '100000', value: String(r.max_keys) })) + modalField('Status da conta', `<select id="m-reseller-status" class="input"><option value="active" ${r.account_status === 'active' ? 'selected' : ''}>Ativo</option><option value="disabled" ${r.account_status !== 'active' ? 'selected' : ''}>Desativado</option></select>`) + resellerPackageFields(packages, (r.packages || []).map(p => p.id)), [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal }, { label: 'Salvar revendedor', cls: 'btn-primary', fn: async () => { const d = await apiDetailed('/api/resellers/update', { id, max_keys: parseInt($('m-reseller-quota').value, 10), account_status: $('m-reseller-status').value, package_ids: selectedResellerPackages() }); if (!d.ok) return toast(resellerError(d.data?.error), 'error'); closeModal(); toast('Revendedor atualizado', 'success'); loadResellers(); } }], true);
};
window.toggleReseller = async id => { const r = caches.resellers.find(x => x.id === id); if (!r) return; const packages = (r.packages || []).map(p => p.id); const d = await apiDetailed('/api/resellers/update', { id, max_keys: r.max_keys, account_status: r.account_status === 'active' ? 'disabled' : 'active', package_ids: packages }); if (!d.ok) return toast(resellerError(d.data?.error), 'error'); toast('Status do revendedor atualizado', 'success'); loadResellers(); };
window.resetResellerPassword = id => { const r = caches.resellers.find(x => x.id === id); if (!r) return; openModal('Redefinir Senha do Revendedor', modalField('Nova senha', inputHtml({ id: 'm-reseller-new-password', type: 'password', minlength: '8', placeholder: 'Pelo menos 8 caracteres' })), [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal }, { label: 'Redefinir senha', cls: 'btn-primary', fn: async () => { const d = await apiDetailed('/api/resellers/reset-password', { id, password: $('m-reseller-new-password').value }); if (!d.ok) return toast(resellerError(d.data?.error), 'error'); closeModal(); toast('Senha do revendedor redefinida', 'success'); } }]); };
window.deleteReseller = id => { const r = caches.resellers.find(x => x.id === id); if (!r) return; openModal('Excluir Revendedor', `<p style="color:var(--danger)">Excluir o revendedor <b>${esc(r.username)}</b>? A conta dele será removida, mas as licenças já criadas permanecem nos pacotes atribuídos.</p>`, [{ label: 'Cancelar', cls: 'btn-ghost', fn: closeModal }, { label: 'Excluir revendedor', cls: 'btn-danger', fn: async () => { const d = await apiDetailed('/api/resellers/delete', { id }); if (!d.ok) return toast(resellerError(d.data?.error), 'error'); closeModal(); toast('Revendedor excluído', 'success'); loadResellers(); } }]); };
$('btn-new-reseller')?.addEventListener('click', openResellerForm);
$('btn-refresh-resellers')?.addEventListener('click', loadResellers);

async function loadUsers() {
  const d=await api('/api/admin/users'); if(!d) return;
  $('tbl-users-body').innerHTML=d.users.map(u=>`<tr><td>${esc(u.username)}</td><td>${esc(u.email||'—')}</td><td><span class="badge ${u.plan==='premium'?'badge-green':u.plan==='owner'?'badge-blue':''}">${esc(u.plan)}</span></td><td>${u.plan==='owner'?'∞':u.max_packages}</td><td>${u.plan==='owner'?'∞':u.max_keys}</td><td>${u.plan==='owner'?'<span class="hint">Proprietário</span>':`<button class="btn btn-primary btn-sm" onclick="window.changePlan(${u.id},'${u.plan==='premium'?'free':'premium'}')">${u.plan==='premium'?'Rebaixar para Gratuito':'Fazer Upgrade para Premium'}</button>`}</td></tr>`).join('');
}
window.changePlan=async(id,plan)=>{const d=await api('/api/admin/users/plan',{user_id:id,plan});if(d){toast('Plano atualizado','success');loadUsers();}};
async function loadOwnerStatistics(){const d=await api('/api/admin/statistics');if(!d)return;const cfg=[['users','Usuários'],['free_users','Usuários gratuitos'],['premium_users','Usuários premium'],['packages','Pacotes'],['licenses','Chaves de licença'],['active_licenses','Chaves ativas'],['devices','Dispositivos'],['checks_24h','Verificações · 24h']];$('owner-stat-grid').innerHTML=cfg.map(([k,l])=>`<div class="stat stat--blue"><div class="num">${d[k]??0}</div><div class="lbl">${l}</div></div>`).join('');}
$('btn-owner-upgrade')?.addEventListener('click',async()=>{const identity=$('owner-plan-identity').value.trim();const m=$('owner-plan-message');if(!identity){m.textContent='Informe um nome de usuário ou e-mail.';return;}const body=identity.includes('@')?{email:identity,plan:'premium'}:{username:identity,plan:'premium'};const d=await api('/api/admin/users/plan',body);if(d){m.textContent='Usuário promovido para Premium.';toast('Plano atualizado','success');loadUsers();}else m.textContent='Usuário não encontrado ou falha na atualização.';});
$('btn-refresh-users')?.addEventListener('click',loadUsers); $('btn-refresh-owner-stats')?.addEventListener('click',loadOwnerStatistics);


async function checkGooglePhonePending(){const d=await api('/api/auth/pending');if(d&&d.pending){$('form-login').classList.add('hidden');$('phone-verify').classList.remove('hidden');}}
$('form-phone')?.addEventListener('submit',async e=>{e.preventDefault();const r=await api('/api/auth/phone/request',{phone:$('in-phone').value.trim()});if(r){$('otp-step').classList.remove('hidden');toast('Código SMS enviado','success');}});
$('btn-verify-otp')?.addEventListener('click',async()=>{const r=await api('/api/auth/phone/verify',{code:$('in-otp').value.trim()});if(r&&r.ok){location.href='/';}});

$('btn-telegram-bot')?.addEventListener('click',e=>{e.preventDefault();toast('A vinculação de conta do Telegram está desativada no momento.','error');});

function setAuthMode(mode, updateUrl=true){
  const requestedSignup=mode==='signup';
  const signup=requestedSignup && !!$('signup-panel');
  if (requestedSignup && !signup && updateUrl) history.replaceState({authMode:'login'},'', '/index.html?mode=login');
  $('form-login')?.classList.toggle('hidden',signup);
  $('signup-panel')?.classList.toggle('hidden',!signup);
  $('forgot-panel')?.classList.add('hidden');
  $('reset-panel')?.classList.add('hidden');
  $('twofa-login-panel')?.classList.add('hidden');
  $('auth-mode-switch')?.classList.remove('hidden');
  $('tab-login-btn')?.classList.toggle('btn-primary',!signup);
  $('tab-login-btn')?.classList.toggle('btn-ghost',signup);
  $('tab-signup-btn')?.classList.toggle('btn-primary',signup);
  $('tab-signup-btn')?.classList.toggle('btn-ghost',!signup);
  if(updateUrl) history.pushState({authMode:mode},'', '/login.html?mode='+mode);
}
$('tab-login-btn')?.addEventListener('click',()=>setAuthMode('login'));
$('tab-signup-btn')?.addEventListener('click',()=>setAuthMode('signup'));
window.addEventListener('popstate',()=>{const mode=new URLSearchParams(location.search).get('mode')||'login';setAuthMode(mode,false);});
$('btn-twofa-back')?.addEventListener('click',()=>showLogin());


function showPasswordPanel(which){['form-login','signup-panel','forgot-panel','reset-panel'].forEach(id=>$(id)?.classList.toggle('hidden',id!==which));$('auth-mode-switch')?.classList.toggle('hidden',which==='forgot-panel'||which==='reset-panel');}
$('forgot-password-link')?.addEventListener('click',e=>{e.preventDefault();showPasswordPanel('forgot-panel');history.pushState({authMode:'forgot'},'', '/login.html?mode=forgot');});$('back-to-login')?.addEventListener('click',e=>{e.preventDefault();showLogin();history.pushState({authMode:'login'},'', '/login.html?mode=login');});
$('btn-send-reset')?.addEventListener('click',async()=>{const d=await api('/api/auth/password/forgot',{email:$('forgot-email').value.trim()});if(d)$('forgot-message').textContent=d.message;});
$('btn-reset-password')?.addEventListener('click',async()=>{const p=$('reset-password').value;if(p!==$('reset-password2').value)return $('reset-message').textContent='As senhas não coincidem';const token=new URLSearchParams(location.search).get('reset');const d=await api('/api/auth/password/reset',{token,password:p});if(d&&d.ok){$('reset-message').textContent='Senha atualizada. Agora você pode entrar.';setTimeout(()=>{history.replaceState({},'', '/login.html?mode=login');showPasswordPanel('form-login');},900);}});


async function load2FAStatus(){const d=await api('/api/2fa/status');if(!d)return;$('twofa-status').textContent=d.enabled?`Ativado via ${d.method}`:'Não ativado';$('twofa-method').value=d.method||'email';$('btn-2fa-enable').classList.toggle('hidden',!!d.enabled);$('btn-2fa-disable').classList.toggle('hidden',!d.enabled);}
$('btn-2fa-enable')?.addEventListener('click',async()=>{const d=await api('/api/2fa/setup',{method:$('twofa-method').value});if(d){ setupChallengeId=d.challenge_id||null;$('twofa-setup-step').classList.remove('hidden');$('twofa-status').textContent=d.delivered?'Código enviado. Verifique o canal selecionado.':'Não foi possível enviar o código.';}});$('btn-2fa-confirm')?.addEventListener('click',async()=>{const d=await api('/api/2fa/confirm',{challenge_id:setupChallengeId,code:$('twofa-setup-code').value.trim()});if(d&&d.ok){$('twofa-setup-step').classList.add('hidden');$('twofa-recovery').classList.remove('hidden');$('twofa-recovery').textContent='Salve estes códigos de recuperação em um local seguro:\n\n'+d.recovery_codes.join('\n');load2FAStatus();}});$('btn-2fa-disable')?.addEventListener('click',async()=>{const d=await api('/api/2fa/disable',{});if(d)load2FAStatus();});$('btn-twofa-login')?.addEventListener('click',async()=>{const b=$('btn-twofa-login');const e=$('twofa-login-error');b.disabled=true;b.textContent='Verificando…';e.textContent='';const r=await apiDetailed('/api/auth/2fa/verify',{challenge_id:loginChallengeId,code:$('twofa-login-code').value.trim()});if(r.ok&&r.data.ok){sessionStorage.setItem('zolmeaWelcomePending','1');location.href='/';}else{e.textContent=r.data.error==='twofa_session_expired'?'Esta sessão de verificação expirou. Faça login novamente.':(r.data.error||'Código de segurança inválido');b.disabled=false;b.textContent='Verificar código de segurança';}});


$('btn-signup-request')?.addEventListener('click',async()=>{const p=$('signup-password').value;if(p!==$('signup-password2').value)return $('signup-message').textContent='As senhas não coincidem';const b=$('btn-signup-request');const m=$('signup-message');b.disabled=true;b.textContent='Criando conta…';m.textContent='';const r=await apiDetailed('/api/auth/signup/request',{username:$('signup-username').value.trim(),email:$('signup-email').value.trim(),password:p});if(r.ok&&r.data.ok){$('signup-otp-step').classList.remove('hidden');m.textContent='Código de verificação enviado para seu e-mail.';}else{m.textContent=r.data.error==='email_delivery_failed'?'Não foi possível enviar o e-mail de verificação. Tente novamente mais tarde.':(r.data.error||'Não foi possível criar a conta.');b.disabled=false;b.textContent='Criar Conta';}});$('btn-signup-verify')?.addEventListener('click',async()=>{
  const button=$('btn-signup-verify');
  const message=$('signup-message');
  const code=$('signup-code').value.trim();
  if(!/^\d{6}$/.test(code)){
    message.textContent='Informe o código de verificação de 6 dígitos.';
    return;
  }
  button.disabled=true;
  button.textContent='Verificando…';
  message.textContent='';
  const result=await apiDetailed('/api/auth/signup/verify',{code});
  if(result.ok&&result.data.ok){
    location.href='/';
  } else {
    message.textContent=result.data.error==='signup_session_expired'
      ? 'Esta sessão de verificação expirou. Crie a conta novamente.'
      : (result.data.error||'Falha na verificação');
    button.disabled=false;
    button.textContent='Verificar e-mail e continuar';
  }
});

/* ---------- Construtor de Projetos (Compilador Theos) ---------- */
function projectBuilderMessage(text, type = 'info') {
  const el = $('project-builder-message');
  if (el) { el.textContent = text || ''; el.style.color = type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : ''; }
}
function renderProjectQuota(quota) {
  const el = $('project-builder-quota');
  if (!el || !quota) return;
  if (quota.unlimited) {
    el.innerHTML = '<b>Cota diária de compilação:</b> Ilimitada <span class="badge badge-blue" style="margin-left:6px">Proprietário</span>';
    return;
  }
  const planLabel = quota.plan === 'premium' ? 'Premium' : 'Usuário';
  el.innerHTML = `<b>Cota diária de compilação:</b> ${Number(quota.used || 0)} / ${Number(quota.limit || 0)} usadas hoje · <b>${Number(quota.remaining || 0)} restantes</b> <span class="badge ${quota.plan === 'premium' ? 'badge-green' : 'badge-blue'}" style="margin-left:6px">${planLabel}</span>`;
}
const PROJECT_STATUS_LABEL = { succeeded: 'concluído', failed: 'falhou', building: 'compilando', queued: 'na fila', ready: 'pronto', uploaded: 'enviado', unknown: 'desconhecido' };
function projectStatusBadge(status) {
  const tone = status === 'succeeded' ? 'green' : status === 'failed' ? 'red' : status === 'building' || status === 'queued' ? 'yellow' : 'blue';
  return `<span class="badge badge-${tone}">${esc(PROJECT_STATUS_LABEL[status] || status || 'desconhecido')}</span>`;
}
function renderProjectBuilds(rows) {
  const body = $('project-builds-body');
  if (!body) return;
  if (!rows.length) { body.innerHTML = '<tr><td colspan="7" class="hint">Nenhum projeto enviado ainda.</td></tr>'; return; }
  body.innerHTML = rows.map(r => {
    const artifacts = Array.isArray(r.artifacts) ? r.artifacts : [];
    const links = r.storage_status === 'cleaned' ? '<span class="hint">Enviado ao Telegram do proprietário · limpo</span>' : artifacts.map(a => `<a class="btn btn-ghost btn-sm" href="/api/project-builder/${encodeURIComponent(r.id)}/artifacts/${encodeURIComponent(a.name)}">${esc(a.type === 'log' ? 'Log' : 'Baixar ' + a.type)}</a>`).join(' ');
    const build = r.storage_status !== 'cleaned' && ['ready','failed','uploaded','succeeded'].includes(r.status) ? `<button class="btn btn-primary btn-sm" onclick="startProjectBuild(${Number(r.id)})">Compilar</button>` : '';
    const log = r.status === 'building' || r.status === 'queued' ? `<span class="hint">${esc(r.message || 'Processando…')}</span>` : '';
    const notify = r.status === 'succeeded' ? `<div class="hint" style="color:${r.telegram_status === 'sent' ? 'var(--success)' : 'var(--danger)'}">Telegram: ${esc(r.telegram_status || 'pendente')}</div>` : '';
    return `<tr><td><b>${esc(r.project_name)}</b><div class="hint">${esc(r.original_filename)}</div></td><td>${esc(r.package_name)}</td><td><code>${esc(r.bundle_id)}</code></td><td>${projectStatusBadge(r.status)}</td><td>${esc(r.stage || '—')}<div class="hint">${esc(r.message || '')}</div>${notify}</td><td>${links || '—'}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap">${build}${log}<button class="btn btn-danger btn-sm" onclick="deleteProjectBuild(${Number(r.id)})">Excluir</button></div></td></tr>`;
  }).join('');
}
function renderGithubActionsNotice(configured) {
  const el = $('project-builder-github-notice');
  if (!el) return;
  if (configured) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.innerHTML = `⚠ A compilação real (botão <b>Compilar</b>) ainda não está ligada neste servidor — falta configurar <code>GITHUB_TOKEN</code> e <code>GITHUB_REPO</code> no <code>.env</code> do backend. O upload/preparo do projeto (com o SDK já embutido) funciona normalmente. Veja o passo a passo em <code>backend/README.md</code>, seção 3.`;
}
async function loadProjectBuilder() {
  if (!sessionUser || sessionUser.role === 'reseller') return;
  const select = $('project-package');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Selecione um pacote</option>' + (caches.packages || []).map(p => `<option value="${Number(p.id)}">${esc(p.name)}${p.status !== 'active' ? ' (' + esc(PKG_STATUS_LABEL[p.status] || p.status) + ')' : ''}</option>`).join('');
    if (current) select.value = current;
  }
  const d = await api('/api/project-builder');
  if (!d) return;
  renderProjectQuota(d.quota);
  renderGithubActionsNotice(d.github_configured);
  renderProjectBuilds(d.builds || []);
  const running = (d.builds || []).some(r => ['queued','building'].includes(r.status));
  if (running && !projectBuildPollTimer) projectBuildPollTimer = setInterval(() => { if (currentTab === 'project-builder') loadProjectBuilder(); }, 2500);
  if (!running && projectBuildPollTimer) { clearInterval(projectBuildPollTimer); projectBuildPollTimer = null; }
}
$('btn-refresh-project-builds')?.addEventListener('click', loadProjectBuilder);
$('btn-upload-project')?.addEventListener('click', async () => {
  const file = $('project-zip')?.files?.[0];
  const packageId = $('project-package')?.value;
  const bundleId = $('project-bundle-id')?.value.trim();
  const projectName = $('project-name')?.value.trim() || file?.name?.replace(/\.zip$/i, '') || 'theos-project';
  if (!file) return projectBuilderMessage('Escolha um arquivo ZIP do Theos primeiro.', 'error');
  if (!packageId) return projectBuilderMessage('Selecione um pacote primeiro.', 'error');
  if (!bundleId) return projectBuilderMessage('Informe o Bundle ID de destino.', 'error');
  if (file.size > 20 * 1024 * 1024) return projectBuilderMessage('O arquivo ZIP deve ter no máximo 20 MB.', 'error');
  const button = $('btn-upload-project'); button.disabled = true; button.textContent = 'Enviando…'; projectBuilderMessage('Enviando e validando o projeto…');
  try {
    const response = await fetch('/api/project-builder/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/zip', 'X-Package-ID': packageId, 'X-Bundle-ID': bundleId, 'X-Project-Name': projectName, 'X-Original-Filename': file.name }, body: file });
    let data = {}; try { data = await response.json(); } catch (_) {}
    if (!response.ok) { projectBuilderMessage(data.error || 'Falha no envio do projeto.', 'error'); return; }
    projectBuilderMessage('Projeto enviado e pronto para compilar.', 'success');
    $('project-zip').value = ''; await loadProjectBuilder();
  } catch (e) { projectBuilderMessage('Erro de rede ao enviar o projeto.', 'error'); }
  finally { button.disabled = false; button.textContent = 'Faça o upload e prepare'; }
});
window.startProjectBuild = async id => {
  const response = await apiDetailed('/api/project-builder/' + encodeURIComponent(id) + '/build', {});
  if (!response.ok) {
    if (response.data?.quota) renderProjectQuota(response.data.quota);
    const friendly = {
      daily_build_limit_reached: 'Limite diário de compilações atingido. Tente novamente amanhã.',
      github_actions_not_configured: 'A compilação real ainda não está configurada neste servidor — falta ligar o GitHub Actions (veja backend/README.md, seção 3).',
      not_found: 'Projeto não encontrado.',
      not_available_for_reseller: 'Contas de revendedor não podem compilar projetos.'
    };
    projectBuilderMessage(response.data?.message || friendly[response.data?.error] || response.data?.error || 'Não foi possível enfileirar a compilação.', 'error');
    return;
  }
  renderProjectQuota(response.data?.quota);
  projectBuilderMessage('Compilação enfileirada. A página será atualizada automaticamente.', 'success');
  loadProjectBuilder();
};
window.deleteProjectBuild = async id => {
  if (!confirm('Excluir este projeto e seus artefatos de compilação?')) return;
  const d = await api('/api/project-builder/' + encodeURIComponent(id) + '/delete', {});
  if (d) { projectBuilderMessage('Projeto excluído.', 'success'); loadProjectBuilder(); }
};

/* ---------- Inicialização ---------- */
/* ---------- Perfil e upgrade Premium ---------- */
function profileMessage(error) {
  const map = { otp_delivery_failed:'Não foi possível enviar o OTP. Tente novamente mais tarde.', email_in_use:'Este e-mail já está em uso.', invalid_email:'Informe um endereço de e-mail válido.', password_too_short:'A senha deve ter pelo menos 8 caracteres.', invalid_otp:'OTP inválido ou expirado.', profile_change_expired:'Esta alteração de perfil expirou. Comece novamente.' };
  return map[error] || error || 'Algo deu errado.';
}
window.openUpgrade = () => {
  openModal('Upgrade para Premium', `<div class="upgrade-card"><div class="hint">Plano Premium ZOLMEA API</div><div class="upgrade-price">$12 <small>/ plano</small></div><div class="upgrade-features"><div class="upgrade-feature"><b>10</b><span>Pacotes</span></div><div class="upgrade-feature"><b>2500</b><span>Chaves de licença</span></div></div><p class="hint">O Premium libera limites maiores de pacotes e chaves para sua conta. Entre em contato com o suporte para ativar o plano.</p></div>`, [{ label:'Falar com o suporte', cls:'btn-primary', fn:()=>window.open('https://t.me/zolmeaffxx','_blank','noopener,noreferrer') }, { label:'Fechar', cls:'btn-ghost', fn:closeModal }], true);
};
window.openProfile = async () => {
  const d = await api('/api/profile'); if (!d?.user) return;
  const u = d.user, lim = u.limits || {};
  openModal('Perfil', `<div class="profile-summary"><div class="profile-avatar">${esc((u.username || 'U').slice(0,1).toUpperCase())}</div><div><strong>${esc(u.username)}</strong><span>${esc(u.role === 'owner' ? 'Proprietário / Administrador' : (u.plan === 'premium' ? 'Usuário Premium' : 'Usuário'))}</span></div></div><div class="profile-grid"><div class="field"><label>Nome de usuário</label><input class="input" value="${esc(u.username)}" disabled></div><div class="field"><label>E-mail atual</label><input class="input" value="${esc(u.email || 'Não definido')}" disabled></div><div class="field"><label>Limite de pacotes</label><input class="input" value="${esc(u.plan === 'owner' ? 'Ilimitado' : (lim.max_packages ?? u.max_packages ?? '—'))}" disabled></div><div class="field"><label>Limite de chaves</label><input class="input" value="${esc(u.plan === 'owner' ? 'Ilimitado' : (lim.max_keys ?? u.max_keys ?? '—'))}" disabled></div></div><hr class="modal-rule"><p class="hint">Para alterar seu e-mail ou senha, informe o novo valor abaixo. Enviaremos um OTP para o seu canal de segurança configurado.</p><div class="field"><label>Novo e-mail</label><input class="input" id="profile-new-email" type="email" placeholder="Deixe em branco para manter o e-mail atual"></div><div class="field"><label>Nova senha</label><input class="input" id="profile-new-password" type="password" minlength="8" placeholder="Deixe em branco para manter a senha atual"></div><div id="profile-otp-step" class="hidden"><div class="field"><label>Código OTP</label><input class="input" id="profile-otp-code" inputmode="numeric" maxlength="6" placeholder="Código de 6 dígitos"></div><p id="profile-message" class="hint"></p></div>`, [{ label:'Upgrade', cls:'btn-primary', fn:window.openUpgrade }, { label:'Enviar OTP', cls:'btn-primary', fn:async()=>{ const email=$('profile-new-email').value.trim(), password=$('profile-new-password').value; if(!email&&!password){$('profile-message').textContent='Informe um novo e-mail ou senha primeiro.';return;} const r=await apiDetailed('/api/profile/change/request',{email,password}); if(!r.ok){$('profile-message').textContent=profileMessage(r.data?.error);return;} $('profile-otp-step').classList.remove('hidden'); $('profile-message').textContent='OTP enviado. Ele expira em 5 minutos.'; const buttons=$('modal-actions').querySelectorAll('button'); buttons.forEach(b=>{if(b.textContent==='Enviar OTP') {b.textContent='Confirmar OTP'; b.onclick=async()=>{const c=$('profile-otp-code').value.trim(); const v=await apiDetailed('/api/profile/change/confirm',{challenge_id:r.data.challenge_id,code:c}); if(v.ok){closeModal();toast('Perfil atualizado. Faça login novamente.','success');setTimeout(()=>location.href='/index.html?mode=login',900);} else $('profile-message').textContent=profileMessage(v.data?.error);};}}); } }, { label:'Fechar', cls:'btn-ghost', fn:closeModal }], true);
};
$('btn-profile')?.addEventListener('click', window.openProfile);
(async () => {
  const mode=new URLSearchParams(location.search).get('mode'); if(mode) setAuthMode(mode); if(new URLSearchParams(location.search).get('reset')) showPasswordPanel('reset-panel'); const me = await api('/api/me');
  if (me && me.user) {
    showMain(me.user);
    load2FAStatus();
    if (sessionStorage.getItem('zolmeaWelcomePending') === '1') {
      sessionStorage.removeItem('zolmeaWelcomePending');
      setTimeout(() => AudioFx.playWelcome(), 120);
    }
  } else { showLogin(); await checkGooglePhonePending(); if(new URLSearchParams(location.search).get('phone_required')) { $('form-login').classList.add('hidden'); $('auth-mode-switch').classList.add('hidden'); $('phone-verify').classList.remove('hidden'); } }
})();
