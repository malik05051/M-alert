/* M-Alert — constantes et utilitaires partagés (identiques dans M-alert et M-Alert-sender). */
(function () {
  'use strict';

  const PHENOMENA = {
    0: { name: 'Autre', icon: '⚠️' },
    1: { name: 'Vent violent', icon: '🌬️' },
    2: { name: 'Pluie-inondation', icon: '🌧️' },
    3: { name: 'Orages', icon: '⛈️' },
    4: { name: 'Crues', icon: '🌊' },
    5: { name: 'Neige-verglas', icon: '❄️' },
    6: { name: 'Canicule', icon: '🌡️' },
    7: { name: 'Grand froid', icon: '🥶' },
    8: { name: 'Avalanches', icon: '🏔️' },
    9: { name: 'Vagues-submersion', icon: '🌊' },
  };

  // Catégories d'alertes M-Alert. Le phénomène ne concerne que la catégorie « meteo ».
  const CATEGORIES = {
    meteo: { name: 'Météo', icon: '🌦️' },
    seisme: { name: 'Tremblement de terre', icon: '🏚️' },
    tsunami: { name: 'Tsunami', icon: '🌊' },
    pollution: { name: 'Pollution', icon: '🌫️' },
    accident: { name: 'Accident industriel', icon: '🏭' },
    greve: { name: 'Grève', icon: '📢' },
    blocus: { name: 'Blocus / manifestation', icon: '🚧' },
  };

  // Consignes types inspirées des recommandations officielles (préfectures, ARS, ministère des Affaires étrangères).
  const CATEGORY_ADVICE = {
    seisme: 'Pendant les secousses, abritez-vous sous un meuble solide, loin des fenêtres, et protégez votre tête ; à l\'extérieur, éloignez-vous des bâtiments et des lignes électriques. Ensuite, coupez le gaz et l\'électricité, évacuez sans prendre l\'ascenseur et attendez-vous à des répliques.',
    tsunami: 'Réagissez immédiatement sans attendre la vague : rejoignez à pied un point haut ou l\'intérieur des terres. Ne restez ni sur la plage, ni dans les ports, ni sur les digues. N\'utilisez pas votre voiture et ne revenez pas avant la fin de l\'alerte : plusieurs vagues peuvent se succéder.',
    pollution: 'Réduisez ou reportez les activités physiques et sportives intenses. Les personnes sensibles (enfants, personnes âgées, malades) doivent les limiter, y compris en intérieur, et éviter les axes à forte circulation. Respectez les mesures de restriction de circulation.',
    accident: 'Mettez-vous à l\'abri dans un bâtiment en dur, fermez portes et fenêtres, arrêtez ventilation et climatisation. N\'allez pas chercher vos enfants à l\'école, ils sont pris en charge. Pas de flamme ni de cigarette. Éloignez-vous du site seulement si les autorités le demandent.',
    greve: 'Renseignez-vous auprès des transporteurs et des services concernés. Anticipez vos déplacements et prévoyez des solutions de remplacement.',
    blocus: 'Évitez le secteur concerné et prévoyez un itinéraire de délestage. Attendez-vous à des perturbations de circulation et des transports. Suivez les consignes des forces de l\'ordre et des autorités.',
  };

  // Couleurs de vigilance (1 vert, 2 jaune, 3 orange, 4 rouge, 5 majeure en rose).
  const VIGILANCE = {
    0: { name: 'Pas de données', color: '#3a4556' },
    1: { name: 'Vert', color: '#2f9e44' },
    2: { name: 'Jaune', color: '#ffe11a' },
    3: { name: 'Orange', color: '#ff9300' },
    4: { name: 'Rouge', color: '#e0141e' },
    // Niveau majeur, au-delà du rouge : saisie manuelle uniquement (Météo-France s'arrête au rouge).
    5: { name: 'Majeure', color: '#fe05fd' },
  };

  // Niveaux des alertes M-Alert.
  const LEVELS = {
    1: { name: 'Information', color: '#3b82f6', text: '#fff' },
    2: { name: 'Jaune', color: '#ffe11a', text: '#1b1b1b' },
    3: { name: 'Orange', color: '#ff9300', text: '#1b1b1b' },
    4: { name: 'Rouge', color: '#e0141e', text: '#fff' },
    5: { name: 'Majeure', color: '#fe05fd', text: '#fff' },
  };

  // Conseils de comportement inspirés des consignes de vigilance Météo-France.
  const ADVICE = {
    0: 'Restez informés de l\'évolution de la situation et suivez les consignes des autorités.',
    1: 'Limitez vos déplacements. Ne vous promenez pas en forêt. Rangez ou fixez les objets susceptibles d\'être emportés. N\'intervenez pas sur les toitures.',
    2: 'Ne vous engagez en aucun cas, à pied ou en voiture, sur une voie immergée. Éloignez-vous des cours d\'eau. Mettez vos biens à l\'abri de la montée des eaux.',
    3: 'Évitez les activités extérieures. Abritez-vous hors des zones boisées. Évitez d\'utiliser les appareils électriques et le téléphone fixe. Ne vous engagez pas sur les routes inondées.',
    4: 'Ne vous engagez pas sur une route inondée. Éloignez-vous des cours d\'eau. Tenez-vous informés auprès des autorités (Vigicrues).',
    5: 'Limitez vos déplacements et renseignez-vous sur les conditions de circulation. Équipez votre véhicule. Protégez-vous des chutes et protégez les autres en dégageant la neige et le verglas devant chez vous.',
    6: 'Buvez régulièrement de l\'eau. Mouillez-vous le corps. Fermez les volets la journée. Évitez les efforts physiques et l\'alcool. Prenez des nouvelles de vos proches vulnérables.',
    7: 'Évitez les expositions prolongées au froid. Habillez-vous chaudement en plusieurs couches. Ne surchauffez pas, aérez votre logement. Signalez les personnes sans abri au 115.',
    8: 'Renoncez aux sorties hors des pistes balisées. Respectez les consignes des stations et des autorités.',
    9: 'Tenez-vous éloignés des côtes et des estuaires. Ne vous promenez pas en bord de mer. Mettez vos biens à l\'abri des submersions.',
  };

  /** « Information », « Alerte rouge », « ALERTE MAJEURE »… */
  // Catégories à niveaux propres (les couleurs restent celles des niveaux 2 à 5).
  const CATEGORY_LEVELS = {
    // Tsunami : trois niveaux, comme au Japon.
    tsunami: {
      2: { label: 'Avis de tsunami', name: 'Avis' },
      4: { label: 'Avertissement de tsunami', name: 'Avertissement' },
      5: { label: 'Avertissement majeur de tsunami', name: 'Avertissement majeur' },
    },
    // Blocus / manifestation : trois niveaux, comme le tsunami.
    blocus: {
      2: { label: 'Avis de blocus / manifestation', name: 'Avis' },
      4: { label: 'Avertissement blocus / manifestation', name: 'Avertissement' },
      5: { label: 'Avertissement majeur blocus / manifestation', name: 'Avertissement majeur' },
    },
    // Tremblement de terre : quatre niveaux.
    seisme: {
      2: { label: 'Alerte séisme faible', name: 'Faible' },
      3: { label: 'Alerte séisme moyen', name: 'Moyen' },
      4: { label: 'Alerte séisme élevé', name: 'Élevé' },
      5: { label: 'Alerte séisme majeur', name: 'Majeur' },
    },
  };
  const TSUNAMI_LEVELS = CATEGORY_LEVELS.tsunami;

  // Intensité sismique sur l'échelle japonaise (shindo), couleurs proches de JQuake.
  const SHINDO = {
    0: { color: '#6b7280', text: '#fff' },
    1: { color: '#5e8fc4', text: '#fff' },
    2: { color: '#2563eb', text: '#fff' },
    3: { color: '#16a34a', text: '#fff' },
    4: { color: '#facc15', text: '#1b1b1b' },
    '5-': { color: '#f59e0b', text: '#1b1b1b' },
    '5+': { color: '#ea580c', text: '#fff' },
    '6-': { color: '#dc2626', text: '#fff' },
    '6+': { color: '#991b1b', text: '#fff' },
    7: { color: '#7e22ce', text: '#fff' },
  };
  const SHINDO_ORDER = ['0', '1', '2', '3', '4', '5-', '5+', '6-', '6+', '7'];

  /** « M6.3 · profondeur 10 km · intensité max 6- » pour un tremblement de terre (vide si rien n'est renseigné). */
  function quakeSummary(alert) {
    if (!alert || alert.category !== 'seisme') return '';
    const parts = [];
    if (typeof alert.magnitude === 'number') parts.push(`M${alert.magnitude.toFixed(1)}`);
    if (typeof alert.depth === 'number') parts.push(`profondeur ${alert.depth} km`);
    if (alert.shindo) parts.push(`intensité max ${alert.shindo} (shindo)`);
    return parts.join(' · ');
  }

  /** Niveaux propres à la catégorie de l'alerte (tsunami, séisme), ou null. */
  function specialLevel(alert) {
    const levels = alert && CATEGORY_LEVELS[alert.category];
    return (levels && levels[alert.level]) || null;
  }

  function isTsunami(alert) {
    return Boolean(alert) && alert.category === 'tsunami' && Boolean(specialLevel(alert));
  }

  /** Intitulé complet du niveau d'une alerte : « Alerte rouge », « Avertissement de tsunami »… */
  function alertLevelLabel(alert) {
    const special = specialLevel(alert);
    return special ? special.label : levelLabel(alert.level);
  }

  /** Nom court du niveau, pour les étiquettes : « Rouge », « Avertissement », « Faible »… */
  function alertLevelName(alert) {
    const special = specialLevel(alert);
    return special ? special.name : LEVELS[alert.level].name;
  }

  function levelLabel(level) {
    if (level === 1) return 'Information';
    if (level === 5) return 'Alerte majeure';
    return `Alerte ${LEVELS[level].name.toLowerCase()}`;
  }

  function categoryOf(alert) {
    return alert && CATEGORIES[alert.category] ? alert.category : 'meteo';
  }

  /** Icône et libellé d'une alerte : le phénomène pour la météo, sinon la catégorie. */
  function alertKind(alert) {
    const cat = categoryOf(alert);
    if (cat !== 'meteo') return CATEGORIES[cat];
    return PHENOMENA[alert.phenomenon] || PHENOMENA[0];
  }

  /** Consignes : celles saisies, sinon les consignes types pour l'orange et le rouge. */
  function adviceFor(alert) {
    if (alert.instructions) return alert.instructions;
    if (alert.level < 3) return '';
    const cat = categoryOf(alert);
    return cat === 'meteo' ? ADVICE[alert.phenomenon] || '' : CATEGORY_ADVICE[cat] || '';
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function relativeTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'à l\'instant';
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    return formatDateTime(iso);
  }

  function departmentList() {
    const features = (window.MALERT_DEPARTMENTS && window.MALERT_DEPARTMENTS.features) || [];
    return features
      .map((f) => ({ code: f.properties.code, nom: f.properties.nom }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  const NAMES = {};
  departmentList().forEach((d) => { NAMES[d.code] = d.nom; });

  function departmentName(code) {
    if (code === 'ALL') return 'Toute la France';
    return NAMES[code] ? `${NAMES[code]} (${code})` : code;
  }

  function departmentsLabel(codes, max = 4) {
    if (!codes || !codes.length) return '';
    if (codes.includes('ALL')) return 'Toute la France';
    const names = codes.map(departmentName);
    if (names.length <= max) return names.join(', ');
    return `${names.slice(0, max).join(', ')} et ${names.length - max} autre(s)`;
  }

  function isActive(alert) {
    return alert && !alert.cancelledAt && new Date(alert.expiresAt).getTime() > Date.now();
  }

  // Lecture/écriture localStorage protégées (navigation privée, stockage bloqué…).
  const storage = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) { /* ignoré */ }
    },
  };

  function toWsUrl(httpUrl) {
    return httpUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + '/ws';
  }

  function normalizeServerUrl(url) {
    url = String(url || '').trim().replace(/\/+$/, '');
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    return url;
  }

  /** Badge d'état de la vigilance : { text, cls, title } ou null si tout va bien. */
  function vigilanceBadge(v) {
    if (!v) return null;
    if (v.source === 'manual') {
      return {
        text: 'Vigilance manuelle',
        cls: 'badge-manual',
        title: v.reason === 'api-down'
          ? 'L\'API Météo-France est en panne : la vigilance est saisie manuellement par M-Alert.'
          : 'La vigilance est saisie manuellement par M-Alert.',
      };
    }
    if (v.source === 'demo') {
      return { text: 'Vigilance : démo', cls: 'badge-demo', title: 'Aucune clé API Météo-France sur le serveur : données fictives.' };
    }
    if (v.error) {
      return { text: '⚠ Vigilance non à jour', cls: 'badge-demo', title: `${v.error} — affichage des dernières données reçues.` };
    }
    if (v.corrections) {
      return {
        text: 'Vigilance corrigée',
        cls: 'badge-manual',
        title: `Vigilance Météo-France avec ${v.corrections} département(s) corrigé(s) manuellement par M-Alert.`,
      };
    }
    return null;
  }

  window.MAlert = {
    PHENOMENA, CATEGORIES, CATEGORY_ADVICE, VIGILANCE, LEVELS, ADVICE, vigilanceBadge,
    categoryOf, alertKind, adviceFor, levelLabel, SHINDO, SHINDO_ORDER, quakeSummary, CATEGORY_LEVELS, TSUNAMI_LEVELS, specialLevel, isTsunami, alertLevelLabel, alertLevelName,
    escapeHtml, formatDateTime, formatTime, relativeTime,
    departmentList, departmentName, departmentsLabel, isActive,
    storage, toWsUrl, normalizeServerUrl,
  };

  // Application de bureau : l'arrière-plan n'étant pas ralenti (pour que les alertes sonnent fenêtre
  // cachée), la page se croit toujours visible. Le processus principal signale donc quand la fenêtre
  // est cachée ou réduite, et les animations sont mises en pause.
  if (window.malertNative && window.malertNative.onVisibility) {
    window.malertNative.onVisibility((visible) => document.documentElement.classList.toggle('app-hidden', !visible));
  }
})();
