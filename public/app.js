// Interfaz web de Instagram Remover. Habla únicamente con /api (adaptador HTTP).
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  tab: 'followers',
  page: 1,
  pageSize: 100,
  total: 0,
  items: [],
  selected: new Set(),
  months: [],
  queueTimer: null,
};

const fmtDate = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short' });
const fmtMonthShort = new Intl.DateTimeFormat('es', { month: 'short' });
const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

function ago(iso) {
  const diff = (new Date(iso) - Date.now()) / 1000;
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, secs] of units) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return 'ahora';
}

const STATUS_LABEL = { active: 'Activo', queued: 'En cola', removed: 'Eliminado', pending: 'Pendiente', processing: 'En proceso', done: 'Hecho', failed: 'Fallido', cancelled: 'Cancelado' };
const badge = (s) => `<span class="badge ${s}">${STATUS_LABEL[s] ?? s}</span>`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 204) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

let toastTimer;
function toast(msg, kind = 'info') {
  const el = $('#toast');
  el.textContent = msg;
  el.style.borderColor = kind === 'error' ? 'var(--danger)' : kind === 'ok' ? 'var(--ok)' : 'var(--border)';
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4000);
}

// ---------- Pestañas ----------
function showTab(tab) {
  state.tab = tab;
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== tab));
  clearInterval(state.queueTimer);
  if (tab === 'queue') {
    loadQueue(); loadRunner();
    state.queueTimer = setInterval(() => { loadQueue(); loadRunner(); }, 5000);
  }
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- Estadísticas ----------
async function loadStats() {
  const { followers, queue } = await api('GET', '/api/stats');
  $('#stats').innerHTML = [
    ['Seguidores', followers.total],
    ['Activos', followers.active],
    ['En cola', followers.queued],
    ['Eliminados', followers.removed],
  ].map(([l, v]) => `<div class="stat"><b>${v.toLocaleString('es')}</b><span>${l}</span></div>`).join('');
  $('#queue-pill').textContent = queue.pending + queue.processing + queue.failed;
}

// ---------- Meses ----------
async function loadMonths() {
  state.months = await api('GET', '/api/followers/months');
  renderMonths();
}

function renderMonths() {
  const form = $('#filters');
  const from = form.from.value, to = form.to.value;
  const el = $('#months');
  if (!state.months.length) {
    el.innerHTML = '<p class="muted">Todavía no hay datos. Importa tu exportación en la pestaña “Importar datos”.</p>';
    return;
  }
  const byYear = new Map();
  for (const m of state.months) {
    const y = m.month.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y).push(m);
  }
  el.innerHTML = [...byYear.entries()].reverse().map(([year, months]) => {
    const total = months.reduce((a, m) => a + m.total, 0);
    const active = months.reduce((a, m) => a + m.active, 0);
    const yFirst = `${year}-01-01`, yLast = `${year}-12-31`;
    const ySelected = from === yFirst && to === yLast;
    return `<div class="year-row">
      <button type="button" class="year ${ySelected ? 'selected' : ''}" data-first="${yFirst}" data-last="${yLast}" title="Seleccionar todo ${year}">
        <b>${year}</b><small>${active.toLocaleString('es')} activos</small><small>de ${total.toLocaleString('es')}</small></button>
      <div class="months-of-year">${months.map((m) => {
        const [y, mo] = m.month.split('-').map(Number);
        const first = `${m.month}-01`;
        const last = `${m.month}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
        const selected = from && to && first >= from && last <= to;
        return `<button type="button" class="month ${selected ? 'selected' : ''} ${m.active ? '' : 'empty'}" data-first="${first}" data-last="${last}" title="${m.total} seguidores, ${m.active} activos">
          <small>${fmtMonthShort.format(new Date(y, mo - 1, 1))}</small><b>${m.active.toLocaleString('es')}</b></button>`;
      }).join('')}</div>
    </div>`;
  }).join('');
}

$('#months').addEventListener('click', (e) => {
  const btn = e.target.closest('.month, .year');
  if (!btn) return;
  const form = $('#filters');
  if (e.shiftKey && form.from.value) {
    const lo = form.from.value < btn.dataset.first ? form.from.value : btn.dataset.first;
    const hi = form.to.value > btn.dataset.last ? form.to.value : btn.dataset.last;
    form.from.value = lo; form.to.value = hi;
  } else {
    form.from.value = btn.dataset.first; form.to.value = btn.dataset.last;
  }
  resetAndLoad();
});

// ---------- Filtros y listado ----------
function currentQuery() {
  const form = $('#filters');
  const params = new URLSearchParams();
  for (const k of ['from', 'to', 'q', 'status', 'sort']) if (form[k].value) params.set(k, form[k].value);
  return params;
}

function resetAndLoad() {
  state.page = 1;
  renderMonths();
  loadFollowers();
}

$('#filters').addEventListener('input', debounce(resetAndLoad, 250));
$('#filters').addEventListener('submit', (e) => { e.preventDefault(); resetAndLoad(); });
$$('.presets button').forEach((b) => b.addEventListener('click', () => {
  const form = $('#filters');
  if (b.dataset.preset === 'clear') { form.from.value = ''; form.to.value = ''; form.q.value = ''; }
  else {
    const d = new Date(); d.setDate(d.getDate() - Number(b.dataset.preset));
    form.from.value = d.toISOString().slice(0, 10);
    form.to.value = new Date().toISOString().slice(0, 10);
  }
  resetAndLoad();
}));

async function loadFollowers() {
  const params = currentQuery();
  params.set('page', state.page);
  params.set('pageSize', state.pageSize);
  const data = await api('GET', `/api/followers?${params}`);
  state.items = data.items; state.total = data.total;
  renderFollowers();
}

function renderFollowers() {
  const body = $('#followers-body');
  if (!state.items.length) {
    body.innerHTML = '<tr class="empty-row"><td colspan="5">Sin resultados con estos filtros.</td></tr>';
  } else {
    body.innerHTML = state.items.map((f) => `
      <tr class="${state.selected.has(f.username) ? 'selected' : ''}" data-username="${esc(f.username)}">
        <td><input type="checkbox" ${state.selected.has(f.username) ? 'checked' : ''} ${f.status === 'removed' ? 'disabled' : ''}></td>
        <td><a href="${esc(f.profileUrl)}" target="_blank" rel="noopener">@${esc(f.username)}</a></td>
        <td>${fmtDate.format(new Date(f.followedAt))}</td>
        <td class="muted">${ago(f.followedAt)}</td>
        <td>${badge(f.status)}</td>
      </tr>`).join('');
  }
  const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
  $('#result-count').textContent = state.total.toLocaleString('es');
  $('#page-info').textContent = `Página ${state.page} de ${pages}`;
  $('#prev').disabled = state.page <= 1;
  $('#next').disabled = state.page >= pages;
  $('#check-page').checked = state.items.length > 0 && state.items.every((f) => state.selected.has(f.username) || f.status === 'removed');
  updateSelection();
}

function updateSelection() {
  $('#selected-count').textContent = state.selected.size.toLocaleString('es');
  const btn = $('#enqueue');
  btn.disabled = state.selected.size === 0;
  btn.textContent = state.selected.size ? `Enviar ${state.selected.size.toLocaleString('es')} a la cola de eliminación` : 'Enviar a la cola de eliminación';
}

$('#followers-body').addEventListener('change', (e) => {
  const tr = e.target.closest('tr[data-username]');
  if (!tr) return;
  const u = tr.dataset.username;
  if (e.target.checked) state.selected.add(u); else state.selected.delete(u);
  tr.classList.toggle('selected', e.target.checked);
  updateSelection();
});
$('#check-page').addEventListener('change', (e) => {
  for (const f of state.items) if (f.status !== 'removed') e.target.checked ? state.selected.add(f.username) : state.selected.delete(f.username);
  renderFollowers();
});
$('#select-page').addEventListener('click', () => { for (const f of state.items) if (f.status !== 'removed') state.selected.add(f.username); renderFollowers(); });
$('#select-all').addEventListener('click', async () => {
  const params = currentQuery();
  if (params.get('status') === 'removed') return toast('Los eliminados no se pueden volver a encolar', 'error');
  const { usernames } = await api('GET', `/api/followers/usernames?${params}`);
  usernames.forEach((u) => state.selected.add(u));
  renderFollowers();
  toast(`${usernames.length.toLocaleString('es')} seguidores seleccionados`);
});
$('#clear-selection').addEventListener('click', () => { state.selected.clear(); renderFollowers(); });
$('#prev').addEventListener('click', () => { state.page--; loadFollowers(); });
$('#next').addEventListener('click', () => { state.page++; loadFollowers(); });

$('#enqueue').addEventListener('click', async () => {
  const n = state.selected.size;
  if (!confirm(`¿Enviar ${n.toLocaleString('es')} seguidores a la cola de eliminación?\n\nNo se elimina nada todavía: el userscript en instagram.com procesará la cola cuando lo inicies.`)) return;
  try {
    const r = await api('POST', '/api/queue', { usernames: [...state.selected] });
    const skipped = r.skipped.alreadyQueued.length + r.skipped.alreadyRemoved.length + r.skipped.unknown.length;
    toast(`${r.queued.length} en cola${skipped ? `, ${skipped} omitidos` : ''}`, 'ok');
    state.selected.clear();
    await refreshAll();
  } catch (err) { toast(err.message, 'error'); }
});

// ---------- Cola ----------
async function loadQueue() {
  const status = $('#queue-filter').value;
  const { jobs, counts } = await api('GET', `/api/queue?status=${status}`);
  $('#queue-counts').innerHTML = Object.entries(counts).map(([s, n]) => `<span class="badge ${s}">${STATUS_LABEL[s]}: ${n}</span>`).join('');
  const body = $('#queue-body');
  if (!jobs.length) { body.innerHTML = '<tr class="empty-row"><td colspan="7">La cola está vacía. Selecciona seguidores y envíalos desde la pestaña “Seguidores”.</td></tr>'; return; }
  body.innerHTML = jobs.map((j) => `
    <tr>
      <td class="muted">${j.id}</td>
      <td><a href="https://www.instagram.com/${esc(j.username)}/" target="_blank" rel="noopener">@${esc(j.username)}</a></td>
      <td>${badge(j.status)}</td>
      <td>${j.attempts}</td>
      <td class="detail">${esc(j.lastError ?? '')}</td>
      <td class="muted">${ago(j.updatedAt)}</td>
      <td class="actions">
        ${['pending', 'failed'].includes(j.status) ? `<button data-act="cancel" data-id="${j.id}" class="ghost">Cancelar</button>` : ''}
        ${['failed', 'processing', 'cancelled'].includes(j.status) ? `<button data-act="release" data-id="${j.id}">Reintentar</button>` : ''}
      </td>
    </tr>`).join('');
}
async function loadRunner() {
  const { heartbeat, connected, events } = await api('GET', '/api/runner');
  const st = $('#runner-status');
  if (!heartbeat) { st.textContent = 'sin señal'; st.className = 'muted'; }
  else if (!connected) { st.textContent = `desconectado (última señal ${ago(heartbeat.at)})`; st.className = 'off'; }
  else {
    st.textContent = heartbeat.running ? (heartbeat.pausedUntil ? 'pausado por Instagram' : 'en marcha') : 'conectado, detenido';
    st.className = 'on';
  }
  $('#runner-meta').textContent = heartbeat
    ? `${heartbeat.dryRun ? 'SIMULACIÓN · ' : ''}${heartbeat.lastHour ?? 0} eliminados esta hora${heartbeat.current ? ` · @${heartbeat.current}` : ''}`
    : '';
  const logEl = $('#runner-log');
  if (events.length) {
    const atBottom = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight < 30;
    logEl.innerHTML = events.map((e) => `<span class="${e.level}">${new Date(e.at).toLocaleTimeString('es')} ${esc(e.message)}</span>`).join('\n');
    if (atBottom) logEl.scrollTop = logEl.scrollHeight;
  }
}

$('#queue-filter').addEventListener('change', loadQueue);
$('#queue-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  try { await api('POST', `/api/queue/${btn.dataset.id}/${btn.dataset.act}`); await refreshAll(); }
  catch (err) { toast(err.message, 'error'); }
});
$('#retry-failed').addEventListener('click', async () => { const r = await api('POST', '/api/queue/retry-failed'); toast(`${r.retried} trabajos reintentados`); refreshAll(); });
$('#clear-finished').addEventListener('click', async () => {
  if (!confirm('¿Borrar del historial los trabajos hechos, fallidos y cancelados? Los fallidos volverán a aparecer como activos.')) return;
  const r = await api('DELETE', '/api/queue/finished'); toast(`${r.deleted} trabajos borrados`); refreshAll();
});

// ---------- Importar ----------
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', (e) => importFiles([...e.dataTransfer.files]));
$('#pick-files').addEventListener('click', () => $('#file-input').click());
$('#file-input').addEventListener('change', (e) => importFiles([...e.target.files]));

async function importFiles(files) {
  const out = $('#import-result');
  const jsonFiles = files.filter((f) => /\.(json|html)$/i.test(f.name));
  if (!jsonFiles.length) { out.className = 'notice error'; out.textContent = 'Selecciona archivos followers_1.json o followers_1.html (también followers_2…).'; return; }
  out.className = 'notice'; out.textContent = `Leyendo ${jsonFiles.length} archivo(s)…`;
  try {
    // Se envía el texto tal cual; el servidor detecta JSON u HTML.
    const documents = await Promise.all(jsonFiles.map((f) => f.text()));
    const r = await api('POST', '/api/imports', { documents });
    out.className = 'notice';
    out.textContent = `Importados ${r.parsed.toLocaleString('es')} seguidores de ${r.documents} archivo(s): ${r.inserted} nuevos, ${r.updated} actualizados.`;
    toast('Importación completa', 'ok');
    await refreshAll();
    showTab('followers');
  } catch (err) {
    out.className = 'notice error'; out.textContent = `Error al importar: ${err.message}`;
  }
}

// ---------- Utilidades ----------
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

async function refreshAll() {
  await Promise.all([loadStats(), loadMonths(), loadFollowers()]);
  if (state.tab === 'queue') await loadQueue();
}

refreshAll().catch((err) => toast(err.message, 'error'));
