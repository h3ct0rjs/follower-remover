// ==UserScript==
// @name         Instagram Remover · Ejecutor de cola
// @namespace    local.instagram-remover
// @version      0.4.0
// @downloadURL  __API_BASE__/userscript/instagram-remover.user.js
// @updateURL    __API_BASE__/userscript/instagram-remover.user.js
// @description  Ejecuta, dentro de tu sesión de instagram.com, la cola de eliminación de seguidores creada en la app local.
// @match        https://www.instagram.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      localhost
// @connect      127.0.0.1
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const API = '__API_BASE__';
  const IG_APP_ID = '936619743392459';
  const VERSION = '0.4.0';

  const cfg = {
    minDelay: GM_getValue('minDelay', 90),
    maxDelay: GM_getValue('maxDelay', 180),
    maxPerHour: GM_getValue('maxPerHour', 25),
    dryRun: GM_getValue('dryRun', true),
  };
  const state = { running: false, current: null, history: [], pausedUntil: 0, timer: null };

  class Throttled extends Error {
    constructor(msg) { super(msg || 'Instagram limitó las peticiones'); this.name = 'Throttled'; }
  }

  // ---------- API local ----------
  function api(method, path, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url: API + path,
        headers: { 'Content-Type': 'application/json' },
        data: body ? JSON.stringify(body) : undefined,
        timeout: 15000,
        onload: (r) => {
          if (r.status === 204) return resolve(null);
          let json = null;
          try { json = JSON.parse(r.responseText); } catch { /* vacío */ }
          if (r.status >= 400) reject(new Error((json && json.error) || `API ${r.status}`));
          else resolve(json);
        },
        onerror: () => reject(new Error(`No se pudo conectar con ${API}. ¿Está corriendo la app (npm run dev)?`)),
        ontimeout: () => reject(new Error('Tiempo de espera agotado hablando con la app local')),
      });
    });
  }

  // ---------- Instagram (misma sesión del navegador) ----------
  // Receta de la web de Instagram (oct 2026): X-ASBD-ID 359341 (con 129477 los endpoints
  // de amistad devuelven HTML), X-IG-WWW-Claim de sessionStorage, y en los POST el cuerpo
  // lleva fb_dtsg + jazoest tomados de la página.
  const ASBD_ID = '359341';
  const WWW_CLAIM_KEY = 'www-claim-v2';
  const webSessionId = [0, 0, 0].map(() => Math.random().toString(36).slice(2, 8).padEnd(6, '0')).join(':');
  let wwwClaim = null;
  let sessionTokens = null;

  function csrf() {
    const m = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function myUserId() {
    const m = document.cookie.match(/(?:^|;\s*)ds_user_id=(\d+)/);
    return m ? m[1] : null;
  }
  function getWwwClaim() {
    if (wwwClaim === null) {
      try { wwwClaim = sessionStorage.getItem(WWW_CLAIM_KEY) || '0'; } catch { wwwClaim = '0'; }
    }
    return wwwClaim;
  }
  function rememberWwwClaim(res) {
    const c = res.headers.get('x-ig-set-www-claim');
    if (c) { wwwClaim = c; try { sessionStorage.setItem(WWW_CLAIM_KEY, c); } catch { /* nada */ } }
  }
  function apiHeaders(extra) {
    return Object.assign({
      'X-IG-App-ID': IG_APP_ID,
      'X-ASBD-ID': ASBD_ID,
      'X-IG-WWW-Claim': getWwwClaim(),
      'X-Web-Session-ID': webSessionId,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': csrf(),
      'Accept': '*/*',
    }, extra || {});
  }

  function tokensFromHtml(html) {
    const dtsg = (/"DTSGInitialData",\[\],\{"token":"([^"]+)"/.exec(html) || /"dtsg":\{"token":"([^"]+)"/.exec(html) || [])[1];
    const lsd = (/"LSD",\[\],\{"token":"([^"]+)"/.exec(html) || [])[1];
    if (!dtsg) return null;
    return { fbDtsg: dtsg, lsd: lsd || '', revision: (/"client_revision":(\d+)/.exec(html) || [])[1] };
  }
  async function getSessionTokens() {
    if (sessionTokens) return sessionTokens;
    try {
      const w = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
      const req = w.require;
      if (typeof req === 'function') {
        const dtsg = req('DTSGInitialData') && req('DTSGInitialData').token;
        const lsd = req('LSD') && req('LSD').token;
        if (dtsg) {
          let revision;
          try { revision = String(req('SiteData').client_revision || ''); } catch { /* nada */ }
          sessionTokens = { fbDtsg: dtsg, lsd: lsd || '', revision: revision || undefined, from: 'require' };
          return sessionTokens;
        }
      }
    } catch { /* sin registro de módulos */ }
    sessionTokens = tokensFromHtml(document.documentElement.innerHTML);
    if (sessionTokens) { sessionTokens.from = 'dom'; return sessionTokens; }
    const res = await fetch('https://www.instagram.com/', { credentials: 'same-origin' });
    sessionTokens = tokensFromHtml(await res.text());
    if (sessionTokens) sessionTokens.from = 'fetch';
    return sessionTokens;
  }
  function jazoest(dtsg) {
    let sum = 0;
    for (let i = 0; i < dtsg.length; i++) sum += dtsg.charCodeAt(i);
    return `2${sum}`;
  }

  async function ig(path, init = {}) {
    const res = await fetch('https://www.instagram.com' + path, Object.assign({ credentials: 'same-origin' }, init, {
      headers: apiHeaders(init.headers),
    }));
    rememberWwwClaim(res);
    if (res.status === 429) throw new Throttled('HTTP 429 (demasiadas peticiones)');
    if (res.status === 401 || res.status === 403) throw new Throttled(`HTTP ${res.status}: sesión rechazada o checkpoint`);
    if (res.redirected && /\/accounts\/login|challenge|auth_platform/.test(res.url)) {
      throw new Throttled(`Instagram redirigió a ${res.url.replace('https://www.instagram.com', '')} (sesión cerrada o verificación pendiente)`);
    }
    return res;
  }

  /** Lee JSON (quitando el prefijo anti-hijacking); si llega HTML lo tratamos como problema de sesión/cabeceras. */
  async function readJson(res, what) {
    const text = await res.text();
    try {
      return JSON.parse(text.replace(/^for \(;;\);/, ''));
    } catch {
      const snippet = text.replace(/\s+/g, ' ').slice(0, 120);
      throw new Throttled(`${what}: respuesta no JSON (HTTP ${res.status}, ${res.headers.get('content-type') || 'sin content-type'}): ${snippet}`);
    }
  }

  async function friendshipShow(id) {
    try {
      const r = await ig(`/api/v1/friendships/show/${id}/`);
      if (!r.ok) return null;
      return await readJson(r, 'friendship');
    } catch (err) {
      if (err instanceof Throttled) throw err;
      return null;
    }
  }

  /** Busca al usuario dentro de TU lista de seguidores (endpoint que la web usa en el diálogo de seguidores). */
  async function searchMyFollowers(username) {
    const me = myUserId();
    if (!me) throw new Throttled('No encuentro la cookie ds_user_id: ¿sesión cerrada?');
    const r = await ig(`/api/v1/friendships/${me}/followers/?count=12&query=${encodeURIComponent(username)}&search_surface=follow_list_page`);
    if (!r.ok) throw new Error(`followers search HTTP ${r.status}`);
    const j = await readJson(r, 'followers search');
    const users = j.users || [];
    const hit = users.find((u) => String(u.username).toLowerCase() === username.toLowerCase());
    return { hit, count: users.length };
  }

  /**
   * usuario → { id, followsViewer, via }
   *  1) búsqueda en tu lista de seguidores (rápida y confirma que te sigue)
   *  2) HTML del perfil (por si ya no te sigue o cambió de nombre) + friendships/show
   */
  async function lookupUser(username) {
    const reasons = [];
    try {
      const { hit, count } = await searchMyFollowers(username);
      if (hit && hit.pk) return { id: String(hit.pk), followsViewer: true, via: 'followers_search' };
      reasons.push(`no aparece en tu lista de seguidores (${count} resultados para "${username}")`);
    } catch (err) {
      if (err instanceof Throttled) throw err;
      reasons.push(`followers search: ${err.message}`);
    }

    const enc = encodeURIComponent(username);
    const page = await fetch(`https://www.instagram.com/${enc}/`, { credentials: 'same-origin' });
    if (page.status === 404) return { notFound: true };
    if (page.status === 429) throw new Throttled('HTTP 429 al cargar el perfil');
    if (/accounts\/login|auth_platform|challenge/.test(page.url)) throw new Throttled(`perfil redirigió a ${page.url}`);
    const html = await page.text();
    if (/Sorry, this page isn|Esta página no está disponible|page isn't available/i.test(html)) return { notFound: true };
    const safe = username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const m =
      html.match(new RegExp(`"id":"(\\d+)","username":"${safe}"`, 'i')) ||
      html.match(/"profile_id":"(\d+)"/) ||
      html.match(/profilePage_(\d+)/);
    if (m) {
      const st = await friendshipShow(m[1]);
      return { id: m[1], followsViewer: st ? !!st.followed_by : true, via: 'html' };
    }
    reasons.push(`perfil HTTP ${page.status} sin id en el HTML`);
    throw new Throttled(`No pude resolver @${username}: ${reasons.join(' · ')}`);
  }

  async function postFriendship(path, userId) {
    const tokens = await getSessionTokens();
    if (!tokens) throw new Throttled('No encuentro los tokens fb_dtsg/lsd en la página (¿sesión cerrada?)');
    const body = new URLSearchParams({
      container_module: 'self_followers',
      nav_chain: 'PolarisProfilePostsTabRoot:profilePage:1:via_cold_start',
      user_id: userId,
      jazoest: jazoest(tokens.fbDtsg),
      fb_dtsg: tokens.fbDtsg,
    });
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (tokens.revision) headers['X-Instagram-AJAX'] = tokens.revision;
    if (tokens.lsd) headers['X-FB-LSD'] = tokens.lsd;
    const res = await ig(path, { method: 'POST', headers, body: body.toString() });
    const ct = (res.headers.get('content-type') || '').split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text.replace(/^for \(;;\);/, '')); } catch { /* HTML */ }
    return { res, ct, text, json };
  }

  async function removeFollower(userId) {
    const { res, ct, text, json } = await postFriendship(`/api/v1/friendships/remove_follower/${userId}/`, userId);
    if (!json) throw new Throttled(`remove_follower → HTTP ${res.status} ${ct || 'sin content-type'} (no JSON; redirigido=${res.redirected})`);
    if (/checkpoint|challenge|feedback_required|spam|action_blocked/i.test(text)) throw new Throttled(json.message || 'Instagram pidió verificación o bloqueó la acción');
    if (!res.ok || json.status !== 'ok') throw new Error(`remove_follower HTTP ${res.status}: ${json.message || JSON.stringify(json).slice(0, 200)}`);
    // Confirmación: ya no debe figurar como seguidor.
    const st = await friendshipShow(userId);
    if (st && st.followed_by === true) throw new Error('Instagram respondió ok pero friendships/show aún dice que te sigue');
    return st ? 'confirmado' : 'ok';
  }

  /** Prueba los endpoints de Instagram y manda el resultado al registro (y al servidor). */
  async function diagnose() {
    log('— Diagnóstico de endpoints —');
    const me = myUserId();
    log(`ds_user_id: ${me || 'NO ENCONTRADO (¿sesión cerrada?)'} · csrftoken: ${csrf() ? 'sí' : 'no'} · www-claim: ${getWwwClaim()}`);
    try {
      const t = await getSessionTokens();
      log(t ? `tokens: fb_dtsg ${t.fbDtsg.slice(0, 6)}… lsd ${t.lsd ? 'sí' : 'no'} revisión ${t.revision || '?'} (origen ${t.from})` : 'tokens: NO ENCONTRADOS');
    } catch (err) { log(`tokens: ${err.message}`); }
    const probes = [
      ['friendships/show(@instagram)', `/api/v1/friendships/show/25025320/`],
      ['mis seguidores (3)', me ? `/api/v1/friendships/${me}/followers/?count=3&search_surface=follow_list_page` : null],
      ['buscar seguidor "a"', me ? `/api/v1/friendships/${me}/followers/?count=12&query=a&search_surface=follow_list_page` : null],
    ];
    for (const [name, path] of probes) {
      if (!path) continue;
      try {
        const r = await ig(path);
        const ct = (r.headers.get('content-type') || '').split(';')[0];
        const text = await r.text();
        let summary = text.replace(/\s+/g, ' ').slice(0, 90);
        try { const j = JSON.parse(text.replace(/^for \(;;\);/, '')); summary = `keys=${Object.keys(j).slice(0, 5).join(',')}` + (j.users ? ` users=${j.users.length}` : '') + (j.status ? ` status=${j.status}` : ''); } catch { /* no JSON */ }
        log(`  ${name}: HTTP ${r.status} ${ct} → ${summary}`);
      } catch (err) { log(`  ${name}: ${err.message}`); }
      await new Promise((r) => setTimeout(r, 1500));
    }
    try {
      const { res, ct, json, text } = await postFriendship('/api/v1/friendships/remove_follower/25025320/', '25025320');
      log(`  POST remove_follower(@instagram, no te sigue; inofensivo): HTTP ${res.status} ${ct} → ${json ? JSON.stringify(json).slice(0, 120) : text.replace(/\s+/g, ' ').slice(0, 60)}`);
    } catch (err) { log(`  POST remove_follower: ${err.message}`); }
    log('— Fin del diagnóstico —');
  }

  // ---------- Bucle ----------
  const sleep = (ms) => new Promise((r) => (state.timer = setTimeout(r, ms)));
  const rand = (a, b) => Math.round((a + Math.random() * (b - a)) * 1000);

  function removalsLastHour() {
    const cutoff = Date.now() - 3600000;
    state.history = state.history.filter((t) => t > cutoff);
    return state.history.length;
  }

  async function processOne() {
    const job = await api('POST', '/api/queue/claim', { version: VERSION });
    if (!job) return 'empty';
    state.current = job.username;
    render();
    log(`→ @${job.username} (trabajo #${job.id})`);

    try {
      const info = await lookupUser(job.username);
      if (info.notFound) {
        await api('POST', `/api/queue/${job.id}/result`, { outcome: 'failed', error: 'Usuario no encontrado (cambió de nombre o cuenta eliminada)' });
        log(`  ✗ @${job.username}: no existe`);
        return 'done';
      }
      if (!info.followsViewer) {
        await api('POST', `/api/queue/${job.id}/result`, { outcome: 'already_not_following', instagramUserId: info.id });
        log(`  ○ @${job.username}: ya no te seguía`);
        return 'done';
      }
      if (cfg.dryRun) {
        await api('POST', `/api/queue/${job.id}/release`);
        log(`  ⚠ simulación: NO se eliminó a @${job.username} (id ${info.id}, resuelto vía ${info.via}); trabajo devuelto a pendiente`);
        return 'dry';
      }
      log(`  id ${info.id} (resuelto vía ${info.via}); eliminando…`);
      const how = await removeFollower(info.id);
      state.history.push(Date.now());
      await api('POST', `/api/queue/${job.id}/result`, { outcome: 'removed', instagramUserId: info.id });
      log(`  ✓ @${job.username} eliminado (${how})`);
      return 'done';
    } catch (err) {
      if (err instanceof Throttled) {
        await api('POST', `/api/queue/${job.id}/release`).catch(() => {});
        throw err;
      }
      await api('POST', `/api/queue/${job.id}/result`, { outcome: 'failed', error: String(err.message || err).slice(0, 500) });
      log(`  ✗ @${job.username}: ${err.message || err}`);
      return 'done';
    } finally {
      state.current = null;
    }
  }

  async function loop() {
    while (state.running) {
      try {
        if (removalsLastHour() >= cfg.maxPerHour) {
          const wait = state.history[0] + 3600000 - Date.now() + 5000;
          log(`Límite por hora alcanzado (${cfg.maxPerHour}); esperando ${Math.ceil(wait / 60000)} min`);
          await sleep(wait);
          continue;
        }
        const outcome = await processOne();
        if (outcome === 'empty') {
          log('Cola vacía; reviso de nuevo en 30 s');
          await sleep(30000);
          continue;
        }
        if (outcome === 'dry') {
          log('Simulación activa: me detengo para no repetir el mismo trabajo. Desactiva "Simulación" para eliminar de verdad.');
          stop();
          break;
        }
        const ms = rand(cfg.minDelay, cfg.maxDelay);
        log(`Pausa de ${Math.round(ms / 1000)} s`);
        await sleep(ms);
      } catch (err) {
        if (err instanceof Throttled) {
          const pause = 30 * 60000;
          state.pausedUntil = Date.now() + pause;
          log(`⛔ ${err.message}. Pausa automática de 30 min para proteger la cuenta.`);
          render();
          await sleep(pause);
          state.pausedUntil = 0;
        } else if (/desactualizado/i.test(err.message || '')) {
          log(`⛔ ${err.message}`);
          stop();
          break;
        } else {
          log(`Error: ${err.message || err}. Reintento en 60 s`);
          await sleep(60000);
        }
      }
      render();
    }
  }

  function start() {
    if (state.running) return;
    state.running = true;
    log(cfg.dryRun ? 'Iniciado en modo SIMULACIÓN (no elimina nada)' : 'Iniciado: eliminando seguidores de la cola');
    render();
    loop();
  }
  function stop() {
    state.running = false;
    if (state.timer) clearTimeout(state.timer);
    state.pausedUntil = 0;
    log('Detenido');
    render();
  }

  // ---------- Panel ----------
  const logs = [];
  function log(msg, level) {
    const line = `${new Date().toLocaleTimeString()} ${msg}`;
    logs.push(line);
    if (logs.length > 200) logs.shift();
    const el = document.getElementById('igr-log');
    if (el) { el.textContent = logs.join('\n'); el.scrollTop = el.scrollHeight; }
    const lvl = level || (/^\s*(✗|⛔|Error)/.test(msg) ? 'error' : /⚠|Pausa autom/.test(msg) ? 'warn' : 'info');
    api('POST', '/api/runner/events', { level: lvl, message: msg }).catch(() => {});
  }

  function heartbeat() {
    api('POST', '/api/runner/heartbeat', {
      running: state.running,
      dryRun: cfg.dryRun,
      current: state.current,
      lastHour: removalsLastHour(),
      pausedUntil: state.pausedUntil ? new Date(state.pausedUntil).toISOString() : null,
    }).catch(() => {});
  }
  setInterval(heartbeat, 30000);

  function render() {
    const status = document.getElementById('igr-status');
    const btn = document.getElementById('igr-toggle');
    if (!status || !btn) return;
    let text = state.running ? 'En marcha' : 'Detenido';
    if (state.pausedUntil) text = `Pausado hasta ${new Date(state.pausedUntil).toLocaleTimeString()}`;
    if (state.current) text += ` · @${state.current}`;
    status.textContent = `${text} · ${removalsLastHour()}/${cfg.maxPerHour} esta hora${cfg.dryRun ? ' · SIMULACIÓN' : ''}`;
    btn.textContent = state.running ? 'Detener' : 'Iniciar';
    btn.style.background = state.running ? '#b42318' : '#0a7d4b';
  }

  function mount() {
    if (document.getElementById('igr-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'igr-panel';
    panel.innerHTML = `
      <style>
        #igr-panel{position:fixed;right:16px;bottom:16px;z-index:999999;width:340px;background:#111;color:#eee;font:12px/1.4 -apple-system,system-ui,sans-serif;border:1px solid #333;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5)}
        #igr-panel header{display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #333;cursor:pointer}
        #igr-panel header b{font-size:13px}
        #igr-body{padding:10px 12px;display:grid;gap:8px}
        #igr-panel label{display:flex;justify-content:space-between;align-items:center;gap:8px}
        #igr-panel input[type=number]{width:70px;background:#222;color:#eee;border:1px solid #444;border-radius:6px;padding:3px 6px}
        #igr-panel button{border:0;border-radius:8px;padding:8px;color:#fff;font-weight:600;cursor:pointer}
        #igr-log{height:140px;overflow:auto;background:#000;border-radius:8px;padding:8px;white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:11px;color:#bbb}
        #igr-status{color:#9ad;min-height:16px}
        .igr-collapsed #igr-body{display:none}
      </style>
      <header><b>Instagram Remover</b><span id="igr-min">—</span></header>
      <div id="igr-body">
        <div id="igr-status"></div>
        <label>Simulación (no elimina) <input id="igr-dry" type="checkbox"></label>
        <label>Pausa mínima (s) <input id="igr-min-d" type="number" min="20"></label>
        <label>Pausa máxima (s) <input id="igr-max-d" type="number" min="30"></label>
        <label>Máximo por hora <input id="igr-mph" type="number" min="1" max="60"></label>
        <button id="igr-toggle">Iniciar</button>
        <button id="igr-diag" style="background:#334">Diagnóstico</button>
        <pre id="igr-log"></pre>
      </div>`;
    document.body.appendChild(panel);

    const $ = (id) => document.getElementById(id);
    $('igr-dry').checked = cfg.dryRun;
    $('igr-min-d').value = cfg.minDelay;
    $('igr-max-d').value = cfg.maxDelay;
    $('igr-mph').value = cfg.maxPerHour;

    const persist = () => {
      cfg.dryRun = $('igr-dry').checked;
      cfg.minDelay = Math.max(20, Number($('igr-min-d').value) || 90);
      cfg.maxDelay = Math.max(cfg.minDelay, Number($('igr-max-d').value) || 180);
      cfg.maxPerHour = Math.min(60, Math.max(1, Number($('igr-mph').value) || 25));
      GM_setValue('dryRun', cfg.dryRun); GM_setValue('minDelay', cfg.minDelay);
      GM_setValue('maxDelay', cfg.maxDelay); GM_setValue('maxPerHour', cfg.maxPerHour);
      render();
    };
    for (const id of ['igr-dry', 'igr-min-d', 'igr-max-d', 'igr-mph']) $(id).addEventListener('change', persist);
    $('igr-toggle').addEventListener('click', () => (state.running ? stop() : start()));
    $('igr-diag').addEventListener('click', () => diagnose());
    panel.querySelector('header').addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT') return;
      panel.classList.toggle('igr-collapsed');
    });

    log(`Conectado a ${API} (script v${VERSION})`);
    heartbeat();
    api('GET', '/api/stats').then((s) => log(`Cola: ${s.queue.pending} pendientes, ${s.queue.failed} fallidos, ${s.queue.done} hechos`)).catch((e) => log(e.message));
    render();
  }

  // Instagram es una SPA: montamos el panel una vez que exista <body>.
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);
})();
