/* M-Alert — application de réception des alertes. */
(function () {
  'use strict';

  const M = window.MAlert;
  const { PHENOMENA, VIGILANCE, LEVELS, escapeHtml } = M;
  const native = window.malertNative || null; // présent dans l'application de bureau (Electron)
  const $ = (id) => document.getElementById(id);

  // ---------- Réglages ----------

  const DEFAULTS = {
    department: null,
    extra: [],
    all: false,
    minLevel: 1,
    categoriesOff: [], // catégories d'alertes désactivées (les nouvelles restent actives)
    sound: true,
    volume: 0.8,
    repeat: true,
    vigNotify: true,
    front: true,
    push: false,
    tiles: false,
    serverUrl: (window.MALERT_CONFIG && window.MALERT_CONFIG.serverUrl) || 'http://localhost:8080',
  };
  let settings = { ...DEFAULTS, ...M.storage.get('malert.settings', {}) };
  const saveSettings = () => M.storage.set('malert.settings', settings);

  function myDepartments() {
    const list = settings.department ? [settings.department] : [];
    for (const d of settings.extra) if (!list.includes(d)) list.push(d);
    return list;
  }

  // ---------- État ----------

  let alerts = [];          // alertes actives
  let vigilance = null;     // dernières données de vigilance
  let day = 0;              // 0 = aujourd'hui, 1 = demain
  let selectedCode = null;  // département cliqué sur la carte
  const seen = new Set(M.storage.get('malert.seen', []));
  const queue = [];         // alertes en attente d'affichage plein écran
  let current = null;       // alerte affichée en plein écran

  function markSeen(id) {
    seen.add(id);
    M.storage.set('malert.seen', [...seen].slice(-300));
  }

  // ---------- Carte ----------

  const map = window.MAlertMap.create('map', {
    tooltip: tooltipHtml,
    onDepartmentClick: (code) => {
      selectedCode = code;
      renderSelected();
    },
  });

  function periodData(d = day) {
    return vigilance && vigilance.periods && vigilance.periods[d] ? vigilance.periods[d] : null;
  }

  function vigFor(code, d = day) {
    const p = periodData(d);
    return (p && p.departments[code]) || null;
  }

  function alertsFor(code) {
    return alerts.filter((a) => a.departments.includes('ALL') || a.departments.includes(code));
  }

  function phenRows(vig) {
    if (!vig || !vig.phenomena || !vig.phenomena.length) return '';
    return vig.phenomena.map((p) => {
      const ph = PHENOMENA[p.id] || PHENOMENA[0];
      return `<div class="tt-row"><span class="sw" style="width:9px;height:9px;border-radius:2px;background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)}</div>`;
    }).join('');
  }

  function tooltipHtml(code, nom) {
    const vig = vigFor(code);
    const level = vig ? vig.level : 0;
    const al = alertsFor(code);
    let html = `<div class="tt-title">${escapeHtml(nom)} (${code})</div>`;
    html += `<div class="tt-row">Vigilance ${day ? 'demain' : 'aujourd\'hui'} : <b style="color:${VIGILANCE[level].color}">${VIGILANCE[level].name}</b></div>`;
    html += phenRows(vig);
    if (vig && vig.manual) html += '<div class="tt-row">✎ Corrigé par M-Alert</div>';
    for (const a of al) {
      html += `<div class="tt-row" style="margin-top:4px"><span class="tag" style="background:${LEVELS[a.level].color};color:${LEVELS[a.level].text}">${LEVELS[a.level].name}</span>${escapeHtml(a.title)}</div>`;
    }
    return html;
  }

  function refreshMap() {
    const p = periodData();
    map.setVigilance(p ? p.departments : {});
    map.setAlerts(alerts);
    map.setHighlighted(myDepartments());
  }

  // ---------- Panneau latéral ----------

  function depCardHtml(code, { mine }) {
    const today = vigFor(code, 0);
    const tomorrow = vigFor(code, 1);
    const pill = (vig, label) => {
      const l = vig ? vig.level : 0;
      return `<div class="vig-pill lvl-${l}"><small>${label}</small>${VIGILANCE[l].name}</div>`;
    };
    const shown = day === 0 ? today : tomorrow;
    const phen = shown && shown.phenomena.length
      ? `<ul class="phen-list">${shown.phenomena.map((p) => {
        const ph = PHENOMENA[p.id] || PHENOMENA[0];
        return `<li><span class="sw" style="background:${VIGILANCE[p.level].color}"></span>${ph.icon} ${escapeHtml(ph.name)} — ${VIGILANCE[p.level].name.toLowerCase()}</li>`;
      }).join('')}</ul>`
      : `<p class="muted small" style="margin:0">Pas de phénomène particulier ${day ? 'demain' : 'aujourd\'hui'}.</p>`;
    const corrected = shown && shown.manual && vigilance && vigilance.source !== 'manual'
      ? '<p class="small" style="margin:8px 0 0;color:#c4b5fd">✎ Vigilance corrigée manuellement par M-Alert.</p>'
      : '';
    const al = alertsFor(code);
    const alertHtml = al.length
      ? `<div class="alert-list" style="margin-top:10px">${al.map(alertItemHtml).join('')}</div>`
      : '';
    return `
      <h2>${mine ? 'Mon département' : 'Département sélectionné'}</h2>
      <p class="dep-title">${escapeHtml(M.departmentName(code))}</p>
      <div class="vig-pills">${pill(today, 'Aujourd\'hui')}${pill(tomorrow, 'Demain')}</div>
      ${phen}${corrected}${alertHtml}`;
  }

  function renderMyDep() {
    const card = $('myDepCard');
    if (!settings.department) {
      card.innerHTML = `<h2>Mon département</h2><p class="muted">Aucun département choisi.</p>
        <div class="btn-row"><button class="btn primary" type="button" data-action="settings">Choisir mon département</button></div>`;
      return;
    }
    card.innerHTML = depCardHtml(settings.department, { mine: true });
  }

  function renderSelected() {
    const card = $('selectedCard');
    if (!selectedCode || selectedCode === settings.department) {
      card.classList.add('hidden');
      return;
    }
    const followed = settings.extra.includes(selectedCode);
    card.innerHTML = depCardHtml(selectedCode, { mine: false }) + `
      <div class="btn-row">
        <button class="btn small" type="button" data-action="set-main" data-code="${selectedCode}">Définir comme mon département</button>
        <button class="btn small ghost" type="button" data-action="toggle-follow" data-code="${selectedCode}">${followed ? 'Ne plus suivre' : 'Suivre aussi'}</button>
        <button class="btn small ghost" type="button" data-action="close-selected">Fermer</button>
      </div>`;
    card.classList.remove('hidden');
  }

  function isMine(alert) {
    if (alert.departments.includes('ALL')) return true;
    return alert.departments.some((d) => myDepartments().includes(d));
  }

  function alertItemHtml(a) {
    const lv = LEVELS[a.level];
    const ph = M.alertKind(a);
    return `<div class="alert-item ${isMine(a) ? 'mine' : ''}" data-alert="${a.id}" style="border-left-color:${lv.color}">
      <div class="t"><span class="tag" style="background:${lv.color};color:${lv.text}">${lv.name}</span>${a.test ? '<span class="tag" style="background:#6d28d9;color:#fff">TEST</span>' : ''}${escapeHtml(a.title)}</div>
      <div class="m">${ph.icon} ${escapeHtml(ph.name)} · ${escapeHtml(M.departmentsLabel(a.departments, 3))}</div>
      <div class="m">${M.relativeTime(a.createdAt)}${a.updatedAt ? ` · modifiée ${M.relativeTime(a.updatedAt)}` : ''} · jusqu'à ${M.formatTime(a.expiresAt)}</div>
    </div>`;
  }

  function renderAlerts() {
    const sorted = [...alerts].sort((a, b) => (isMine(b) - isMine(a)) || (b.level - a.level) || b.createdAt.localeCompare(a.createdAt));
    $('alertCount').textContent = alerts.length;
    $('alertList').innerHTML = sorted.length
      ? sorted.map(alertItemHtml).join('')
      : '<div class="empty">Aucune alerte en cours ✅</div>';
  }

  function renderVigInfo() {
    const p = periodData();
    const info = $('vigInfo');
    const badge = M.vigilanceBadge(vigilance);
    $('vigBadge').classList.toggle('hidden', !badge);
    if (badge) {
      $('vigBadge').className = badge.cls;
      $('vigBadge').textContent = badge.text;
      $('vigBadge').title = badge.title;
    }
    if (!vigilance || !p) {
      info.textContent = vigilance && vigilance.error ? `Vigilance indisponible : ${vigilance.error}` : 'Vigilance en attente du serveur…';
      $('mapCaption').textContent = 'Vigilance : en attente…';
      return;
    }
    info.textContent = vigilance.source === 'manual'
      ? `Vigilance saisie manuellement par M-Alert${vigilance.reason === 'api-down' ? ' (API Météo-France indisponible)' : ''} · ${M.formatDateTime(vigilance.updatedAt)}`
      : `Mise à jour : ${M.formatDateTime(vigilance.updatedAt)}${vigilance.corrections ? ` · ${vigilance.corrections} département(s) corrigé(s) par M-Alert` : ''}${vigilance.error ? ' · ⚠ ' + vigilance.error : ''}`;
    $('mapCaption').textContent = `Vigilance ${day ? 'de demain' : 'd\'aujourd\'hui'} · ${M.formatDateTime(p.begin)} → ${M.formatDateTime(p.end)}`;
  }

  function renderAll() {
    refreshMap();
    renderMyDep();
    renderSelected();
    renderAlerts();
    renderVigInfo();
  }

  document.addEventListener('click', (e) => {
    const item = e.target.closest('[data-alert]');
    if (item) {
      const a = alerts.find((x) => x.id === item.dataset.alert);
      if (a) {
        map.focus(a.departments);
        showOverlay(a, { silent: true });
      }
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const code = btn.dataset.code;
    switch (btn.dataset.action) {
      case 'settings': openSettings(); break;
      case 'set-main':
        settings.department = code;
        settings.extra = settings.extra.filter((d) => d !== code);
        saveSettings(); onSettingsChanged(); break;
      case 'toggle-follow':
        settings.extra = settings.extra.includes(code) ? settings.extra.filter((d) => d !== code) : [...settings.extra, code];
        saveSettings(); onSettingsChanged(); break;
      case 'close-selected': selectedCode = null; renderSelected(); break;
      default: break;
    }
  });

  document.querySelectorAll('#dayToggle button').forEach((b) => b.addEventListener('click', () => {
    day = Number(b.dataset.day);
    document.querySelectorAll('#dayToggle button').forEach((x) => x.classList.toggle('active', x === b));
    renderAll();
  }));

  // Horloge
  setInterval(() => { $('clock').textContent = new Date().toLocaleTimeString('fr-FR'); }, 1000);

  // ---------- Toasts ----------

  function toast(title, body, color, onClick) {
    const el = document.createElement('div');
    el.className = 'toast';
    if (color) el.style.borderLeftColor = color;
    el.innerHTML = `<strong>${escapeHtml(title)}</strong>${body ? `<span class="muted small">${escapeHtml(body)}</span>` : ''}`;
    el.addEventListener('click', () => {
      el.remove();
      if (onClick) onClick();
    });
    $('toasts').appendChild(el);
    setTimeout(() => el.remove(), 9000);
  }

  // ---------- Alerte plein écran, son et notification ----------

  function wantsCategory(alert) {
    return !settings.categoriesOff.includes(M.categoryOf(alert));
  }

  function matchesMe(alert) {
    if (alert.level < settings.minLevel) return false;
    if (!wantsCategory(alert)) return false;
    if (settings.all) return true;
    return isMine(alert);
  }

  function showOverlay(alert, { silent } = {}) {
    current = alert;
    const lv = LEVELS[alert.level];
    const ph = M.alertKind(alert);
    const ov = $('alertOverlay');
    ov.className = `alert-overlay lvl-${alert.level}`;
    ov.style.setProperty('--c', lv.color);
    ov.style.setProperty('--ct', lv.text);
    $('ovLevel').textContent = M.levelLabel(alert.level);
    $('ovPhen').textContent = `${ph.icon} ${ph.name}`;
    $('ovTest').classList.toggle('hidden', !alert.test);
    $('ovTime').textContent = M.formatDateTime(alert.createdAt) + (alert.updatedAt ? ` · modifiée ${M.formatTime(alert.updatedAt)}` : '');
    $('ovTitle').textContent = alert.title;
    $('ovDeps').textContent = M.departmentsLabel(alert.departments, 8);
    $('ovDesc').textContent = alert.description;
    const advice = M.adviceFor(alert);
    $('ovAdviceWrap').classList.toggle('hidden', !advice);
    $('ovAdvice').textContent = advice || '';
    $('ovValid').textContent = `Valable jusqu'au ${M.formatDateTime(alert.expiresAt)}`;
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    $('ovMute').classList.toggle('hidden', Boolean(silent) || !settings.sound);
    $('ovAck').focus();
  }

  function acknowledge() {
    window.MAlertSound.stop();
    markSeen(current && current.id);
    current = null;
    const next = queue.shift();
    if (next) {
      showOverlay(next, { silent: true });
      return;
    }
    $('alertOverlay').classList.add('hidden');
  }

  $('ovAck').addEventListener('click', acknowledge);
  $('ovMute').addEventListener('click', () => {
    window.MAlertSound.stop();
    $('ovMute').classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !$('settings').open) acknowledge();
  });

  async function systemNotification(title, body, { tag, urgent, onClick } = {}) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const options = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', requireInteraction: Boolean(urgent), renotify: true };
    try {
      const n = new Notification(title, options);
      n.onclick = () => {
        window.focus();
        if (native) native.showWindow();
        if (onClick) onClick();
        n.close();
      };
    } catch (_) {
      // Android/Chrome n'autorise que les notifications via le service worker.
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, options);
    }
  }

  function trigger(alert, { updated } = {}) {
    if (seen.has(alert.id)) return;
    // Catégorie désactivée dans les réglages : aucune alerte sonore ni message.
    if (!wantsCategory(alert)) {
      markSeen(alert.id);
      return;
    }
    if (!matchesMe(alert)) {
      markSeen(alert.id);
      const lv = LEVELS[alert.level];
      toast(`Nouvelle alerte ${lv.name.toLowerCase()} : ${alert.title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        map.focus(alert.departments);
        showOverlay(alert, { silent: true });
      });
      return;
    }

    if (current) queue.push(alert);
    else showOverlay(alert);
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    map.focus(alert.departments);

    if (settings.sound) {
      window.MAlertSound.play(alert, {
        volume: settings.volume,
        loop: settings.repeat && alert.level >= 3,
      });
      setTimeout(() => {
        if (window.MAlertSound.isLocked()) $('soundHint').classList.remove('hidden');
      }, 1000);
    }
    const lv = LEVELS[alert.level];
    const prefix = (alert.test ? '[TEST] ' : '') + (updated ? 'MISE À JOUR · ' : '');
    systemNotification(
      `${prefix}${M.alertKind(alert).icon} ${M.levelLabel(alert.level)} — ${alert.title}`,
      `${M.departmentsLabel(alert.departments, 3)}\n${alert.description}`,
      { tag: alert.id, urgent: alert.level >= 3 },
    );
    if (native) native.alert({ level: alert.level, front: settings.front });
    // L'identifiant est mémorisé à l'acquittement ; on le note aussi ici pour ne pas
    // rejouer l'alerte si l'application est rechargée avant.
    markSeen(alert.id);
  }

  // Alerte modifiée depuis M-Alert-sender.
  function onAlertUpdated(alert, previous) {
    const before = previous && previous.departments ? { ...alert, ...previous } : null;
    const concernedBefore = Boolean(before && matchesMe(before));
    const concernedNow = M.isActive(alert) && matchesMe(alert);
    const lv = LEVELS[alert.level];
    if (concernedNow && (!concernedBefore || alert.level > before.level)) {
      // Mon département vient d'être ajouté ou le niveau monte : nouvelle alerte sonore.
      if (current && current.id === alert.id) {
        window.MAlertSound.stop();
        current = null;
      }
      seen.delete(alert.id);
      trigger(alert, { updated: true });
      return;
    }
    if (current && current.id === alert.id) {
      if (concernedNow) showOverlay(alert, { silent: $('ovMute').classList.contains('hidden') });
      else acknowledge();
    }
    if (concernedNow) {
      toast(`Alerte modifiée : ${alert.title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        map.focus(alert.departments);
        showOverlay(alert, { silent: true });
      });
    } else if (concernedBefore) {
      toast(`Vos départements ne sont plus concernés : ${alert.title}`, M.departmentsLabel(alert.departments, 3), '#34d399');
    }
  }

  // Vigilance : prévenir quand le niveau de mes départements augmente.
  function checkVigilanceChange(oldVig, newVig) {
    if (!settings.vigNotify || !oldVig || !newVig || !oldVig.periods[0] || !newVig.periods[0]) return;
    if (oldVig.source !== newVig.source) return;
    for (const code of myDepartments()) {
      const before = (oldVig.periods[0].departments[code] || {}).level || 1;
      const after = (newVig.periods[0].departments[code] || {}).level || 1;
      if (after > before && after >= 2) {
        const v = VIGILANCE[after];
        const phen = (newVig.periods[0].departments[code].phenomena || []).map((p) => (PHENOMENA[p.id] || PHENOMENA[0]).name).join(', ');
        toast(`Vigilance ${v.name.toLowerCase()} — ${M.departmentName(code)}`, phen, v.color, () => map.focus([code]));
        systemNotification(`Vigilance ${v.name.toLowerCase()} — ${M.departmentName(code)}`, phen || 'Nouvelle vigilance Météo-France', { tag: `vig-${code}` });
      }
    }
  }

  // Débloque le son au premier geste (exigence des navigateurs).
  const unlockOnce = () => {
    window.MAlertSound.unlock();
    $('soundHint').classList.add('hidden');
  };
  document.addEventListener('pointerdown', unlockOnce, { capture: true });
  document.addEventListener('keydown', unlockOnce, { capture: true });
  $('soundHint').addEventListener('click', unlockOnce);

  // ---------- Connexion temps réel ----------

  let ws = null;
  let retry = 0;
  let reconnectTimer = null;

  function setStatus(state, text) {
    $('status').dataset.state = state;
    $('statusText').textContent = text;
  }

  function subscribeMessage() {
    return JSON.stringify({ type: 'subscribe', role: 'receiver', departments: myDepartments(), all: settings.all });
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (ws) {
      ws.onclose = null;
      ws.close();
    }
    const url = M.normalizeServerUrl(settings.serverUrl);
    if (!url) {
      setStatus('offline', 'Serveur non configuré');
      return;
    }
    setStatus('connecting', 'Connexion…');
    try {
      ws = new WebSocket(M.toWsUrl(url));
    } catch (err) {
      setStatus('offline', 'Adresse du serveur invalide');
      return;
    }
    ws.onopen = () => {
      retry = 0;
      setStatus('online', 'Connecté');
      ws.send(subscribeMessage());
    };
    // Message périodique : garde la connexion (et un serveur gratuit) éveillée.
    const socket = ws;
    const keepAlive = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"ping"}');
    }, 240000);
    ws.addEventListener('close', () => clearInterval(keepAlive));
    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (_) {
        return;
      }
      handleMessage(msg);
    };
    ws.onclose = () => {
      setStatus('offline', 'Déconnecté — nouvelle tentative…');
      const delay = Math.min(30000, 1000 * 2 ** retry++) + Math.random() * 1000;
      reconnectTimer = setTimeout(connect, delay);
    };
    ws.onerror = () => { /* onclose suit */ };
  }

  function handleMessage(msg) {
    switch (msg.type) {
      case 'hello': {
        const old = vigilance;
        vigilance = msg.vigilance;
        alerts = (msg.alerts || []).filter(M.isActive);
        renderAll();
        checkVigilanceChange(old, vigilance);
        // Alertes envoyées pendant que l'application était hors ligne.
        alerts.filter((a) => !seen.has(a.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach(trigger);
        break;
      }
      case 'alert':
        if (!alerts.some((a) => a.id === msg.alert.id)) alerts.push(msg.alert);
        renderAll();
        trigger(msg.alert);
        break;
      case 'update': {
        const a = msg.alert;
        alerts = alerts.filter((x) => x.id !== a.id);
        if (M.isActive(a)) alerts.push(a);
        const qi = queue.findIndex((x) => x.id === a.id);
        if (qi >= 0) queue[qi] = a;
        renderAll();
        onAlertUpdated(a, msg.previous);
        break;
      }
      case 'cancel':
      case 'expire': {
        const a = msg.alert;
        const had = alerts.some((x) => x.id === a.id);
        alerts = alerts.filter((x) => x.id !== a.id);
        const idx = queue.findIndex((x) => x.id === a.id);
        if (idx >= 0) queue.splice(idx, 1);
        if (current && current.id === a.id) acknowledge();
        renderAll();
        if (had && isMine(a)) {
          toast(msg.type === 'cancel' ? `Alerte levée : ${a.title}` : `Fin de l'alerte : ${a.title}`, M.departmentsLabel(a.departments, 3), '#34d399');
        }
        break;
      }
      case 'vigilance': {
        const old = vigilance;
        vigilance = msg.vigilance;
        renderAll();
        checkVigilanceChange(old, vigilance);
        break;
      }
      default: break;
    }
  }

  // Retire les alertes expirées même sans message du serveur.
  let tick = 0;
  setInterval(() => {
    const before = alerts.length;
    alerts = alerts.filter(M.isActive);
    if (alerts.length !== before) renderAll();
    else if (++tick % 6 === 0) renderAlerts(); // met à jour les « il y a x min » toutes les 30 s
  }, 5000); // 5 s : les alertes à durée personnalisée peuvent être très courtes

  // ---------- Notifications push (navigateur / téléphone) ----------

  const pushSupported = !native && 'serviceWorker' in navigator && 'PushManager' in window && window.isSecureContext;

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
  }

  async function syncPush() {
    if (!pushSupported) return;
    const state = $('pushState');
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const server = M.normalizeServerUrl(settings.serverUrl);
      let sub = await reg.pushManager.getSubscription();
      if (!settings.push) {
        if (sub) {
          fetch(`${server}/api/push/unsubscribe`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
          }).catch(() => {});
          await sub.unsubscribe();
        }
        state.textContent = '';
        return;
      }
      if (Notification.permission !== 'granted') {
        const p = await Notification.requestPermission();
        updateNotifState();
        if (p !== 'granted') throw new Error('notifications refusées');
      }
      if (!sub) {
        const { publicKey } = await (await fetch(`${server}/api/push/key`)).json();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
      }
      const res = await fetch(`${server}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(), departments: myDepartments(), all: settings.all, minLevel: settings.minLevel,
          excludedCategories: settings.categoriesOff,
        }),
      });
      if (!res.ok) throw new Error(`serveur HTTP ${res.status}`);
      state.textContent = '✅ Notifications push actives sur cet appareil.';
    } catch (err) {
      state.textContent = `⚠ Push indisponible : ${err.message}`;
    }
  }

  // Le service worker relaie les clics sur les notifications push.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'open-alert') {
        const a = alerts.find((x) => x.id === e.data.id);
        if (a) {
          map.focus(a.departments);
          showOverlay(a, { silent: true });
        }
      }
    });
  }

  // ---------- Fenêtre de réglages ----------

  const dlg = $('settings');
  const departments = M.departmentList();

  $('setCategories').innerHTML = Object.entries(M.CATEGORIES).map(([id, c]) =>
    `<label class="check"><input type="checkbox" value="${id}"> ${c.icon} ${escapeHtml(c.name)}</label>`).join('');

  function fillDepartmentInputs() {
    $('setDep').innerHTML = '<option value="">— Choisir —</option>' +
      departments.map((d) => `<option value="${d.code}">${d.code} — ${escapeHtml(d.nom)}</option>`).join('');
    $('setExtra').innerHTML = departments.map((d) =>
      `<label data-search="${escapeHtml((d.code + ' ' + d.nom).toLowerCase())}"><input type="checkbox" value="${d.code}"> ${d.code} ${escapeHtml(d.nom)}</label>`).join('');
  }

  $('extraFilter').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    $('setExtra').querySelectorAll('label').forEach((l) => {
      l.classList.toggle('hidden', q && !l.dataset.search.includes(q));
    });
  });

  function updateNotifState() {
    const el = $('notifState');
    const btn = $('btnNotif');
    if (!('Notification' in window)) {
      el.textContent = 'Notifications non prises en charge sur cet appareil.';
      btn.classList.add('hidden');
      return;
    }
    const p = Notification.permission;
    el.textContent = p === 'granted' ? '✅ Notifications autorisées' : p === 'denied'
      ? '⛔ Notifications bloquées (autorisez-les dans les paramètres du navigateur)'
      : 'Notifications non autorisées';
    btn.classList.toggle('hidden', p !== 'default');
  }

  $('btnNotif').addEventListener('click', async () => {
    await Notification.requestPermission();
    updateNotifState();
  });

  async function openSettings({ welcome = false } = {}) {
    $('settingsTitle').textContent = welcome ? 'Bienvenue sur M-Alert' : 'Réglages';
    $('welcomeText').classList.toggle('hidden', !welcome);
    $('settingsClose').classList.toggle('hidden', welcome);
    $('setDep').value = settings.department || '';
    $('setExtra').querySelectorAll('input').forEach((i) => { i.checked = settings.extra.includes(i.value); });
    $('extraFilter').value = '';
    $('setExtra').querySelectorAll('label').forEach((l) => l.classList.remove('hidden'));
    $('setAll').checked = settings.all;
    $('setMinLevel').value = String(settings.minLevel);
    $('setCategories').querySelectorAll('input').forEach((i) => { i.checked = !settings.categoriesOff.includes(i.value); });
    $('setSound').checked = settings.sound;
    $('setVolume').value = String(settings.volume);
    $('setRepeat').checked = settings.repeat;
    $('setVigNotify').checked = settings.vigNotify;
    $('setFront').checked = settings.front;
    $('setPush').checked = settings.push;
    $('setTiles').checked = settings.tiles;
    $('setServer').value = settings.serverUrl;
    document.querySelectorAll('.native-only').forEach((el) => el.classList.toggle('hidden', !native));
    document.querySelectorAll('.push-only').forEach((el) => el.classList.toggle('hidden', !pushSupported));
    if (native) {
      const ns = await native.getSettings();
      $('setBackground').checked = ns.background;
      $('setAutostart').checked = ns.autostart;
      $('setAutoUpdate').checked = ns.autoUpdate;
      native.getUpdateStatus().then(renderUpdate);
    }
    updateNotifState();
    dlg.dataset.welcome = welcome ? '1' : '';
    if (!dlg.open) dlg.showModal();
  }

  $('btnSettings').addEventListener('click', () => openSettings());
  $('settingsClose').addEventListener('click', () => dlg.close());
  dlg.addEventListener('cancel', (e) => {
    if (dlg.dataset.welcome) e.preventDefault(); // le choix du département est obligatoire au premier lancement
  });

  $('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const dep = $('setDep').value;
    if (!dep) {
      $('setDep').focus();
      $('setDep').reportValidity();
      return;
    }
    const oldServer = settings.serverUrl;
    settings = {
      ...settings,
      department: dep,
      extra: [...$('setExtra').querySelectorAll('input:checked')].map((i) => i.value).filter((c) => c !== dep),
      all: $('setAll').checked,
      minLevel: Number($('setMinLevel').value),
      categoriesOff: [...$('setCategories').querySelectorAll('input:not(:checked)')].map((i) => i.value),
      sound: $('setSound').checked,
      volume: Number($('setVolume').value),
      repeat: $('setRepeat').checked,
      vigNotify: $('setVigNotify').checked,
      front: $('setFront').checked,
      push: $('setPush').checked,
      tiles: $('setTiles').checked,
      serverUrl: M.normalizeServerUrl($('setServer').value) || DEFAULTS.serverUrl,
    };
    if (native) {
      native.setSettings({
        background: $('setBackground').checked,
        autostart: $('setAutostart').checked,
        autoUpdate: $('setAutoUpdate').checked,
      });
    }
    saveSettings();
    const wasWelcome = Boolean(dlg.dataset.welcome);
    dlg.close();
    if (wasWelcome && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(updateNotifState);
    }
    onSettingsChanged(oldServer !== settings.serverUrl);
    if (wasWelcome) map.focus(myDepartments());
  });

  $('btnTest').addEventListener('click', () => {
    window.MAlertSound.unlock();
    const dep = $('setDep').value || settings.department || '75';
    const level = Math.max(3, Number($('setMinLevel').value));
    const test = {
      id: `test-${Date.now()}`,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      level,
      phenomenon: 3,
      title: 'Ceci est un test d\'alerte M-Alert',
      description: 'Aucune action n\'est requise. Ce test vérifie le son, l\'affichage et les notifications sur votre appareil.',
      instructions: '',
      departments: [dep],
      test: true,
    };
    dlg.close();
    if (current) acknowledge();
    showOverlay(test);
    if ($('setSound').checked) window.MAlertSound.play(test, { volume: Number($('setVolume').value), loop: false });
    systemNotification('[TEST] Alerte M-Alert', test.description, { tag: test.id });
    if (native) native.alert({ level, front: false });
  });

  function onSettingsChanged(serverChanged) {
    map.setTiles(settings.tiles);
    renderAll();
    if (serverChanged) connect();
    else if (ws && ws.readyState === WebSocket.OPEN) ws.send(subscribeMessage());
    syncPush();
  }

  // ---------- Mises à jour (application de bureau) ----------

  let lastUpdate = null;
  let dismissedUpdate = null;

  function renderUpdate(s) {
    if (!s) return;
    lastUpdate = s;
    $('updVersion').textContent = `version ${s.current}`;
    const auto = s.mode === 'auto';
    $('updAutoRow').classList.toggle('hidden', s.mode === 'pacman' || s.mode === 'dev');
    $('btnUpdCheck').classList.toggle('hidden', s.mode === 'pacman' || s.mode === 'dev');
    $('btnUpdCheck').disabled = s.state === 'checking' || s.state === 'downloading';
    const text = {
      disabled: s.mode === 'pacman'
        ? 'Mises à jour gérées par pacman : sudo pacman -Syu'
        : 'Mises à jour désactivées en mode développement.',
      idle: '',
      checking: 'Recherche d\'une nouvelle version…',
      none: 'M-Alert est à jour.',
      downloading: `Téléchargement de la version ${s.version || ''}… ${s.percent ? s.percent + ' %' : ''}`,
      ready: `La version ${s.version} est prête : elle s'installera au prochain redémarrage de M-Alert.`,
      available: `La version ${s.version} est disponible${auto ? '' : ' (à télécharger et installer)'}.`,
      error: `Impossible de vérifier les mises à jour : ${s.error || 'erreur inconnue'}`,
    }[s.state] || '';
    $('updState').textContent = text;

    const showBar = (s.state === 'ready' || s.state === 'available') && dismissedUpdate !== s.version;
    $('updateBar').classList.toggle('hidden', !showBar);
    if (showBar) {
      $('updateBarText').textContent = s.state === 'ready'
        ? `🔄 La mise à jour ${s.version} de M-Alert est prête.`
        : `🔔 Une nouvelle version de M-Alert (${s.version}) est disponible.`;
      $('updateBarAction').textContent = s.state === 'ready' ? 'Redémarrer et installer' : 'Télécharger';
    }
  }

  // ---------- Application de bureau ----------

  if (native) {
    native.onOpenSettings(() => openSettings());
    native.onTestAlert(() => $('btnTest').click());
    native.onUpdateStatus(renderUpdate);
    native.getUpdateStatus().then(renderUpdate);
    $('btnUpdCheck').addEventListener('click', () => native.checkForUpdates());
    $('updateBarAction').addEventListener('click', () => native.installUpdate());
    $('updateBarLater').addEventListener('click', () => {
      dismissedUpdate = lastUpdate && lastUpdate.version;
      $('updateBar').classList.add('hidden');
    });
    // Retour de veille : on se reconnecte tout de suite pour ne rater aucune alerte.
    native.onResume(() => {
      retry = 0;
      connect();
    });
  }

  window.addEventListener('online', () => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      retry = 0;
      connect();
    }
  });

  // ---------- Démarrage ----------

  fillDepartmentInputs();
  map.setTiles(settings.tiles);
  renderAll();
  connect();
  if (pushSupported && settings.push) syncPush();
  if (!settings.department) openSettings({ welcome: true });
  else setTimeout(() => map.focus(myDepartments()), 300);
})();
