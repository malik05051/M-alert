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
    phenomenaOff: [], // phénomènes météo désactivés (ex. 6 = canicule)
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

  // Alertes qui ont sonné pour moi, avec leur niveau : à l'ouverture, une alerte déjà vue sonne
  // de nouveau si mon département y a été ajouté (ou si son niveau a monté) pendant que
  // l'application était fermée. Première fois : les alertes déjà vues comptent comme signalées.
  // Pour chaque alerte : niveau et départements suivis pour lesquels elle a déjà sonné.
  let alerted = M.storage.get('malert.alerted', null);
  if (!alerted) {
    alerted = {};
    for (const id of seen) alerted[id] = 5;
  }
  /** { level, mine } ; mine = null pour les anciennes entrées (aucun département « nouveau »). */
  function alertedRecord(id) {
    const r = alerted[id];
    if (r == null) return { level: 0, mine: [] };
    return typeof r === 'number' ? { level: r, mine: null } : r;
  }

  /** Mes départements (principal et suivis) visés par l'alerte. */
  function myIncluded(alert) {
    const mine = myDepartments();
    return alert.departments.includes('ALL') ? mine : mine.filter((d) => alert.departments.includes(d));
  }

  function markAlerted(alert) {
    const r = alertedRecord(alert.id);
    alerted[alert.id] = {
      level: Math.max(r.level, alert.level),
      mine: r.mine === null ? null : [...new Set([...r.mine, ...myIncluded(alert)])],
    };
    const keep = Object.keys(alerted).slice(-300);
    alerted = Object.fromEntries(keep.map((id) => [id, alerted[id]]));
    M.storage.set('malert.alerted', alerted);
  }

  /** Alertes à signaler à l'ouverture : jamais vues, ou étendues à un de mes départements / plus graves. */
  function missedAlerts(list) {
    return list.filter((a) => {
      if (!seen.has(a.id)) return true;
      if (!matchesMe(a)) return false;
      const r = alertedRecord(a.id);
      const newDepartment = r.mine !== null && myIncluded(a).some((d) => !r.mine.includes(d));
      if (r.level >= a.level && !newDepartment) return false;
      seen.delete(a.id);
      a.__updated = true;
      return true;
    });
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

  /** Alerte M-Alert de plus haut niveau pour un département, aujourd'hui (0) ou demain (1). */
  function topAlertFor(code, d) {
    let from = Date.now();
    if (d === 1) {
      const p = periodData(1);
      const t = new Date();
      t.setHours(24, 0, 0, 0);
      from = p ? new Date(p.begin).getTime() : t.getTime();
    }
    return alertsFor(code)
      .filter((a) => wantsCategory(a) && new Date(a.expiresAt).getTime() > from)
      .reduce((m, a) => (!m || a.level > m.level ? a : m), null);
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
      html += `<div class="tt-row" style="margin-top:4px"><span class="tag" style="background:${LEVELS[a.level].color};color:${LEVELS[a.level].text}">${escapeHtml(M.alertLevelName(a))}</span>${escapeHtml(a.title)}</div>`;
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
    // Niveau affiché : le plus élevé entre la vigilance Météo-France et les alertes M-Alert du jour.
    const pill = (vig, label, d) => {
      const l = vig ? vig.level : 0;
      const a = topAlertFor(code, d);
      if (a && a.level >= 2 && a.level > l) {
        const lv = LEVELS[a.level];
        return `<div class="vig-pill" style="background:${lv.color};color:${lv.text}"><small>${label} · M-Alert</small>${escapeHtml(M.alertLevelName(a))}</div>`;
      }
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
      <div class="vig-pills">${pill(today, 'Aujourd\'hui', 0)}${pill(tomorrow, 'Demain', 1)}</div>
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
      <div class="t"><span class="tag" style="background:${lv.color};color:${lv.text}">${escapeHtml(M.alertLevelName(a))}</span>${a.test ? '<span class="tag" style="background:#6d28d9;color:#fff">TEST</span>' : ''}${escapeHtml(a.title)}</div>
      <div class="m">${ph.icon} ${escapeHtml(ph.name)}${M.quakeSummary(a) ? ` · ${escapeHtml(M.quakeSummary(a))}` : ''}${M.tornadoSummary(a) ? ` · ${escapeHtml(M.tornadoSummary(a))}` : ''} · ${escapeHtml(M.departmentsLabel(a.departments, 3))}</div>
      <div class="m">${M.relativeTime(a.createdAt)}${a.updatedAt ? ` · modifiée ${M.relativeTime(a.updatedAt)}` : ''} · ${M.untilText(a, { short: true })}</div>
    </div>`;
  }

  // Filtre de la liste « Alertes en cours » : catégorie ou phénomène météo.
  let alertFilter = M.storage.get('malert.alertFilter', '');
  $('alertFilter').innerHTML = '<option value="">Toutes les alertes</option>'
    + `<optgroup label="Catégorie">${Object.entries(M.CATEGORIES).map(([id, c]) => `<option value="cat:${id}">${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</optgroup>`
    + `<optgroup label="Phénomène météo">${Object.entries(PHENOMENA).map(([id, p]) => `<option value="phen:${id}">${p.icon} ${escapeHtml(p.name)}</option>`).join('')}</optgroup>`;
  $('alertFilter').value = alertFilter;
  if ($('alertFilter').value !== alertFilter) alertFilter = '';
  $('alertFilter').addEventListener('change', (e) => {
    alertFilter = e.target.value;
    M.storage.set('malert.alertFilter', alertFilter);
    renderAlerts();
  });

  function passesFilter(a) {
    if (!alertFilter) return true;
    const [kind, value] = alertFilter.split(':');
    if (kind === 'cat') return M.categoryOf(a) === value;
    return M.categoryOf(a) === 'meteo' && String(Number(a.phenomenon) || 0) === value;
  }

  function renderAlerts() {
    const sorted = [...alerts].filter(passesFilter).sort((a, b) => (isMine(b) - isMine(a)) || (b.level - a.level) || b.createdAt.localeCompare(a.createdAt));
    $('alertCount').textContent = alertFilter ? `${sorted.length}/${alerts.length}` : alerts.length;
    $('alertList').innerHTML = sorted.length
      ? sorted.map(alertItemHtml).join('')
      : `<div class="empty">${alertFilter && alerts.length ? 'Aucune alerte de ce type en cours.' : 'Aucune alerte en cours ✅'}</div>`;
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
        focusAlert(a);
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
    const cat = M.categoryOf(alert);
    if (settings.categoriesOff.includes(cat)) return false;
    // Phénomène météo désactivé dans les réglages.
    return !(cat === 'meteo' && (settings.phenomenaOff || []).includes(Number(alert.phenomenon) || 0));
  }

  function matchesMe(alert) {
    if (alert.level < settings.minLevel) return false;
    if (!wantsCategory(alert)) return false;
    if (settings.all) return true;
    return isMine(alert);
  }

  /** Lieu de l'épicentre : département, ou coordonnées s'il est en mer ou hors de France. */
  function epicenterText(e) {
    const code = map.departmentAt(e.lat, e.lon);
    return code
      ? `${M.departmentName(code)}`
      : `${Math.abs(e.lat).toFixed(2)}° ${e.lat >= 0 ? 'N' : 'S'}, ${Math.abs(e.lon).toFixed(2)}° ${e.lon >= 0 ? 'E' : 'O'} (en mer ou hors de France)`;
  }

  /**
   * Centre la carte sur une alerte (départements et épicentre). Pour un séisme, le bandeau
   * d'alerte reste en haut : la carte est centrée dans la partie visible en dessous.
   */
  function focusAlert(alert) {
    requestAnimationFrame(() => {
      let top = 0;
      if (!$('alertOverlay').classList.contains('hidden') && $('alertOverlay').classList.contains('compact')) {
        const banner = $('alertOverlay').querySelector('.alert-banner').getBoundingClientRect();
        top = Math.max(0, banner.bottom - $('map').getBoundingClientRect().top);
      }
      map.focus(alert.departments, { epicenter: alert.epicenter, top });
    });
  }

  function showOverlay(alert, { silent } = {}) {
    current = alert;
    const lv = LEVELS[alert.level];
    const ph = M.alertKind(alert);
    const ov = $('alertOverlay');
    // Tremblement de terre : bandeau compact en haut, la carte (épicentre, départements) reste visible.
    ov.className = `alert-overlay lvl-${alert.level}${alert.category === 'seisme' ? ' compact' : ''}`;
    ov.style.setProperty('--c', lv.color);
    ov.style.setProperty('--ct', lv.text);
    $('ovLevel').textContent = M.alertLevelLabel(alert);
    $('ovPhen').textContent = `${ph.icon} ${ph.name}`;
    $('ovTest').classList.toggle('hidden', !alert.test);
    $('ovTime').textContent = M.formatDateTime(alert.createdAt) + (alert.updatedAt ? ` · modifiée ${M.formatTime(alert.updatedAt)}` : '');
    $('ovTitle').textContent = alert.title;
    $('ovDeps').textContent = M.departmentsLabel(alert.departments, 8);
    // Tremblement de terre : intensité (shindo), magnitude et épicentre.
    const quake = [];
    if (alert.category === 'seisme' && alert.shindo && M.SHINDO[alert.shindo]) {
      const sh = M.SHINDO[alert.shindo];
      quake.push(`<span class="shindo" style="background:${sh.color};color:${sh.text}" title="Intensité maximale (échelle shindo)">${escapeHtml(alert.shindo)}</span>`);
    }
    if (alert.category === 'seisme' && typeof alert.magnitude === 'number') quake.push(`<b>M${alert.magnitude.toFixed(1)}</b>`);
    if (alert.category === 'seisme' && typeof alert.depth === 'number') quake.push(`<span>Profondeur : <b>${alert.depth} km</b></span>`);
    if (alert.epicenter) quake.push(`✕ Épicentre : ${escapeHtml(epicenterText(alert.epicenter))}`);
    // Tornade : niveau EF et vent attendu.
    if (M.isTornado(alert)) {
      quake.push(`<span class="shindo" style="background:${lv.color};color:${lv.text}" title="Échelle de Fujita améliorée">EF${alert.ef}</span>`);
      if (typeof alert.windKmh === 'number') quake.push(`<span>Vent attendu : <b>${alert.windKmh} km/h</b></span>`);
    }
    $('ovEpi').classList.toggle('hidden', !quake.length);
    $('ovEpi').innerHTML = quake.join(' ');
    $('ovDesc').textContent = alert.description;
    const advice = M.adviceFor(alert);
    $('ovAdviceWrap').classList.toggle('hidden', !advice);
    $('ovAdvice').textContent = advice || '';
    $('ovValid').textContent = alert.noEnd ? 'Sans date de fin : en vigueur jusqu\'à la levée de l\'alerte' : `Valable ${M.untilText(alert)}`;
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    $('ovMute').classList.toggle('hidden', Boolean(silent) || !settings.sound);
    $('ovAck').focus({ preventScroll: true });
    ov.querySelector('.alert-banner').scrollTop = 0;
    ov.querySelector('.alert-body').classList.remove('expanded');
  }

  // Son d'une alerte. Majeur.mp3 se répète toujours jusqu'à « J'ai compris », sans limite de durée.
  let pendingSound = null; // alerte qui n'a pas pu sonner (son bloqué par le navigateur)
  function alertSound(alert) {
    const majeur = window.MAlertSound.soundFile(alert) === 'majeur';
    window.MAlertSound.play(alert, {
      volume: settings.volume,
      loop: majeur || (settings.repeat && alert.level >= 3),
      untilStopped: majeur,
    });
  }

  function acknowledge() {
    pendingSound = null;
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
  // Bandeau compact (séisme) : un clic sur le texte l'affiche en entier.
  document.querySelector('#alertOverlay .alert-body').addEventListener('click', (e) => e.currentTarget.classList.toggle('expanded'));
  $('ovMute').addEventListener('click', () => {
    pendingSound = null;
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
      toast(`${M.specialLevel(alert) ? M.alertLevelLabel(alert) : `Nouvelle alerte ${lv.name.toLowerCase()}`} : ${alert.title}`, M.departmentsLabel(alert.departments, 3), lv.color, () => {
        focusAlert(alert);
        showOverlay(alert, { silent: true });
      });
      return;
    }

    if (current) queue.push(alert);
    else showOverlay(alert);
    $('ovQueue').textContent = queue.length ? `+${queue.length} autre(s) alerte(s)` : '';
    focusAlert(alert);

    if (settings.sound) {
      alertSound(alert);
      setTimeout(() => {
        if (window.MAlertSound.isLocked() && current && current.id === alert.id) {
          pendingSound = alert; // rejoué au premier clic qui débloque le son
          $('soundHint').classList.remove('hidden');
        }
      }, 1000);
    }
    const lv = LEVELS[alert.level];
    const prefix = (alert.test ? '[TEST] ' : '') + (updated ? 'MISE À JOUR · ' : '');
    systemNotification(
      `${prefix}${M.alertKind(alert).icon} ${M.alertLevelLabel(alert)} — ${alert.title}`,
      `${M.departmentsLabel(alert.departments, 3)}\n${alert.description}`,
      { tag: alert.id, urgent: alert.level >= 3 },
    );
    if (native) native.alert({ level: alert.level, front: settings.front });
    // L'identifiant est mémorisé à l'acquittement ; on le note aussi ici pour ne pas
    // rejouer l'alerte si l'application est rechargée avant.
    markSeen(alert.id);
    markAlerted(alert);
  }

  // Alerte modifiée depuis M-Alert-sender.
  function onAlertUpdated(alert, previous) {
    const before = previous && previous.departments ? { ...alert, ...previous } : null;
    const concernedBefore = Boolean(before && matchesMe(before));
    const concernedNow = M.isActive(alert) && matchesMe(alert);
    // Un de mes départements ajouté à l'alerte (même si elle me concernait déjà par un autre
    // département suivi, ou via « toute la France »).
    const addedMine = before ? myIncluded(alert).filter((d) => !myIncluded(before).includes(d)) : [];
    const lv = LEVELS[alert.level];
    if (concernedNow && (!concernedBefore || alert.level > before.level || addedMine.length)) {
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
        focusAlert(alert);
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

  // Débloque le son au premier geste (exigence des navigateurs). Si une alerte n'a pas pu sonner,
  // elle sonne à ce moment-là, sauf si le geste sert justement à la couper ou à l'acquitter.
  const unlockOnce = (e) => {
    window.MAlertSound.unlock();
    $('soundHint').classList.add('hidden');
    const silencing = e && e.target && e.target.closest && e.target.closest('#ovAck, #ovMute');
    if (pendingSound && current && current.id === pendingSound.id && !silencing && settings.sound) alertSound(current);
    pendingSound = null;
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
        // Alertes envoyées (ou étendues à mon département) pendant que l'application était fermée
        // ou hors ligne. Celles reçues application ouverte sont déjà marquées vues.
        missedAlerts(alerts).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).forEach((a) => {
          const updated = Boolean(a.__updated);
          delete a.__updated;
          trigger(a, { updated });
        });
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
          excludedPhenomena: settings.phenomenaOff || [],
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
          focusAlert(a);
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
  $('setPhenomena').innerHTML = Object.entries(PHENOMENA).map(([id, p]) =>
    `<label class="check"><input type="checkbox" value="${id}"> ${p.icon} ${escapeHtml(p.name)}</label>`).join('');

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
    $('setPhenomena').querySelectorAll('input').forEach((i) => { i.checked = !(settings.phenomenaOff || []).includes(Number(i.value)); });
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
      phenomenaOff: [...$('setPhenomena').querySelectorAll('input:not(:checked)')].map((i) => Number(i.value)),
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
