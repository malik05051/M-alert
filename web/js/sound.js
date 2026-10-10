/* M-Alert — son d'alerte.
 *
 * Sons (dossier web/sounds/) :
 *   information.mp3  information (niveau 1)
 *   eew.mp3          jaune et orange
 *   seisme-eew.mp3, seisme-eew2.mp3, seisme-leger.mp3
 *                    tremblements de terre (tous niveaux, majeure comprise), au choix de M-Alert
 *   rouge.mp3        rouge
 *   majeur.mp3       alertes majeures (même tsunami, crues…), sauf tremblement de terre
 *   tsunami.mp3      crues, pluie-inondation, tsunami et vagues-submersion (sauf en majeure)
 * Si un fichier manque ou ne peut pas être lu, une sirène synthétique est jouée.
 */
(function () {
  'use strict';

  let ctx = null;
  let audioEl = null;
  let synthTimer = null;
  let synthNodes = [];
  let loopToken = 0;

  function audioContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // Version web : les MP3 sont joués par Web Audio. Safari (iPhone, Mac) et parfois Firefox refusent
  // de lancer un élément <audio> sans clic de l'utilisateur, ce qui faisait jouer la sirène de
  // secours ; un contexte Web Audio débloqué une fois peut, lui, jouer à tout moment.
  // (Application de bureau : fichiers locaux, lus par l'élément <audio> qui y est autorisé.)
  const WEB = /^https?:$/.test(location.protocol);
  const buffers = new Map(); // nom du son -> Promise<AudioBuffer>
  let sources = [];

  function loadBuffer(name) {
    if (!buffers.has(name)) {
      const c = audioContext();
      const p = fetch(`sounds/${name}.mp3`)
        .then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        })
        // Forme à rappels : acceptée aussi par les anciennes versions de Safari.
        .then((data) => new Promise((resolve, reject) => c.decodeAudioData(data, resolve, reject)));
      p.catch(() => buffers.delete(name)); // nouvel essai la fois suivante
      buffers.set(name, p);
    }
    return buffers.get(name);
  }

  async function tryBuffer(name, volume, loop, token) {
    let buffer;
    try {
      buffer = await loadBuffer(name);
    } catch (_) {
      return null;
    }
    const c = audioContext();
    if (token !== loopToken || !c || c.state !== 'running') return null;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buffer;
    src.loop = loop;
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(c.destination);
    src.start();
    sources.push(src, gain);
    return src;
  }

  // Débloque l'audio au premier geste de l'utilisateur (politique d'autoplay des navigateurs).
  function unlock() {
    const c = audioContext();
    if (c) {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
      // Sons préchargés pour qu'une alerte sonne immédiatement.
      if (WEB) ['information', 'eew', 'rouge', 'majeur', 'tsunami', ...Object.values(QUAKE_SOUNDS)].forEach((n) => loadBuffer(n).catch(() => {}));
    }
  }

  // Vrai si le navigateur bloque encore le son (aucun geste de l'utilisateur depuis l'ouverture).
  function isLocked() {
    const c = audioContext();
    return !c || c.state !== 'running';
  }

  // Phénomènes météo liés à l'eau : pluie-inondation (2), crues (4), vagues-submersion (9).
  const WATER_PHENOMENA = [2, 4, 9];

  // Sons des tremblements de terre (EEW, Earthquake Early Warning), choisis par M-Alert pour chaque alerte.
  const QUAKE_SOUNDS = { eew: 'seisme-eew', eew2: 'seisme-eew2', leger: 'seisme-leger' };

  /** Fichier son d'une alerte (ou d'un simple niveau). */
  function soundFile(alert) {
    const level = alert.level;
    const category = alert.category || 'meteo';
    // Séisme : son choisi (EEW par défaut), quel que soit le niveau.
    if (category === 'seisme') return QUAKE_SOUNDS[alert.quakeSound] || QUAKE_SOUNDS.eew;
    if (level >= 5) return 'majeur';
    if (category === 'tsunami' || (category === 'meteo' && WATER_PHENOMENA.includes(Number(alert.phenomenon)))) return 'tsunami';
    if (level === 4) return 'rouge';
    if (level >= 2) return 'eew';
    return 'information';
  }

  // Tous les sons créés : stop() les coupe tous, même ceux que le navigateur démarrerait en retard
  // (son d'abord bloqué puis relancé après un clic, chargement lent sur mobile…).
  const liveAudio = new Set();

  function silence(a) {
    a.loop = false;
    a.pause();
    liveAudio.delete(a);
  }

  function tryFile(src, volume, loop, token) {
    return new Promise((resolve) => {
      const a = new Audio(src);
      a.volume = volume;
      a.loop = loop;
      liveAudio.add(a);
      // Un son d'une alerte déjà coupée ne doit jamais se (re)mettre à jouer.
      a.addEventListener('play', () => { if (token !== loopToken) silence(a); });
      a.addEventListener('error', () => { silence(a); resolve(null); }, { once: true });
      a.play().then(() => resolve(a)).catch(() => { silence(a); resolve(null); });
    });
  }

  // Sirène synthétique : motifs différents selon le niveau.
  function synth(level, volume) {
    const c = audioContext();
    if (!c) return 0;
    const t0 = c.currentTime + 0.05;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.connect(c.destination);
    synthNodes.push(gain);

    const beep = (start, dur, freq, type = 'sine') => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      o.connect(gain);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.5, start + 0.02);
      gain.gain.setValueAtTime(volume * 0.5, start + dur - 0.03);
      gain.gain.linearRampToValueAtTime(0, start + dur);
      o.start(start);
      o.stop(start + dur);
      synthNodes.push(o);
    };

    if (level <= 1) {
      beep(t0, 0.18, 880);
      beep(t0 + 0.28, 0.25, 1175);
      return 0.7;
    }
    if (level === 2) {
      for (let i = 0; i < 3; i++) beep(t0 + i * 0.4, 0.25, 988, 'triangle');
      return 1.4;
    }
    // Orange / rouge / majeure : sirène montante-descendante, de plus en plus rapide et aiguë.
    const siren = {
      3: { dur: 3, type: 'square', sweep: 0.75, low: 650, high: 1000 },
      4: { dur: 4, type: 'sawtooth', sweep: 0.5, low: 600, high: 1300 },
      5: { dur: 5, type: 'sawtooth', sweep: 0.3, low: 700, high: 1600 },
    }[Math.min(level, 5)];
    const dur = siren.dur;
    const o = c.createOscillator();
    o.type = siren.type;
    for (let t = 0; t < dur; t += siren.sweep) {
      o.frequency.setValueAtTime(siren.low, t0 + t);
      o.frequency.linearRampToValueAtTime(siren.high, t0 + t + siren.sweep / 2);
      o.frequency.linearRampToValueAtTime(siren.low, t0 + t + siren.sweep);
    }
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
    o.connect(filter);
    filter.connect(gain);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume * 0.25, t0 + 0.05);
    gain.gain.setValueAtTime(volume * 0.25, t0 + dur - 0.1);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    o.start(t0);
    o.stop(t0 + dur);
    synthNodes.push(o, filter);
    return dur + 0.2;
  }

  function stop() {
    loopToken++;
    clearTimeout(synthTimer);
    audioEl = null;
    for (const a of [...liveAudio]) silence(a);
    for (const n of sources) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (_) { /* déjà arrêté */ }
    }
    sources = [];
    for (const n of synthNodes) {
      try {
        if (n.stop) n.stop();
        n.disconnect();
      } catch (_) { /* déjà arrêté */ }
    }
    synthNodes = [];
  }

  /**
   * Joue le son d'alerte.
   * @param {number|{level: number, category?: string, phenomenon?: number}} what niveau (1 à 5) ou alerte
   * @param {{volume?: number, loop?: boolean, maxSeconds?: number, untilStopped?: boolean}} opts
   *   untilStopped : la répétition ne s'arrête qu'avec stop() (pas de limite de durée)
   */
  async function play(what, opts = {}) {
    stop();
    const alert = typeof what === 'object' && what ? what : { level: Number(what) };
    const level = Math.max(1, Math.min(5, Number(alert.level) || 1));
    const token = loopToken;
    const volume = Math.max(0, Math.min(1, opts.volume == null ? 0.8 : opts.volume));
    const loop = Boolean(opts.loop);
    const maxMs = opts.untilStopped ? Infinity : (opts.maxSeconds || 120) * 1000;

    const name = soundFile({ ...alert, level });
    if (WEB) {
      // Au premier clic, le déblocage du son prend un instant : on l'attend un peu.
      const c = audioContext();
      if (c && c.state !== 'running') await Promise.race([c.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
      if (token !== loopToken) return;
    }
    // Web, son débloqué : Web Audio.
    if (WEB && !isLocked()) {
      const s = await tryBuffer(name, volume, loop, token);
      if (token !== loopToken) return;
      if (s) {
        if (loop && Number.isFinite(maxMs)) synthTimer = setTimeout(stop, maxMs);
        return;
      }
    }

    for (const src of [`sounds/${name}.mp3`]) {
      const a = await tryFile(src, volume, loop, token);
      if (token !== loopToken) {
        if (a) silence(a);
        return;
      }
      if (a) {
        audioEl = a;
        if (loop && Number.isFinite(maxMs)) synthTimer = setTimeout(stop, maxMs);
        return;
      }
    }

    const started = Date.now();
    const again = () => {
      if (token !== loopToken) return;
      // Son encore bloqué par le navigateur : ne pas empiler des sirènes qui partiraient toutes
      // d'un coup au premier clic.
      if (isLocked()) return;
      const d = synth(level, volume);
      if (loop && Date.now() - started < maxMs) synthTimer = setTimeout(again, d * 1000 + 600);
    };
    again();
  }

  window.MAlertSound = { play, stop, unlock, isLocked, soundFile };
})();
