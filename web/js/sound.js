/* M-Alert — son d'alerte.
 *
 * Sons (dossier web/sounds/) :
 *   information.mp3  information (niveau 1)
 *   eew.mp3          jaune et orange
 *   rouge.mp3        rouge
 *   majeur.mp3       toutes les alertes majeures (même tsunami, crues…)
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

  // Débloque l'audio au premier geste de l'utilisateur (politique d'autoplay des navigateurs).
  function unlock() {
    const c = audioContext();
    if (c) {
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    }
  }

  // Vrai si le navigateur bloque encore le son (aucun geste de l'utilisateur depuis l'ouverture).
  function isLocked() {
    const c = audioContext();
    return !c || c.state !== 'running';
  }

  // Phénomènes météo liés à l'eau : pluie-inondation (2), crues (4), vagues-submersion (9).
  const WATER_PHENOMENA = [2, 4, 9];

  /** Fichier son d'une alerte (ou d'un simple niveau). */
  function soundFile(alert) {
    const level = alert.level;
    const category = alert.category || 'meteo';
    if (level >= 5) return 'majeur';
    if (category === 'tsunami' || (category === 'meteo' && WATER_PHENOMENA.includes(Number(alert.phenomenon)))) return 'tsunami';
    if (level === 4) return 'rouge';
    if (level >= 2) return 'eew';
    return 'information';
  }

  function tryFile(src, volume, loop) {
    return new Promise((resolve) => {
      const a = new Audio(src);
      a.volume = volume;
      a.loop = loop;
      a.addEventListener('error', () => resolve(null), { once: true });
      a.play().then(() => resolve(a)).catch(() => resolve(null));
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
    if (audioEl) {
      audioEl.pause();
      audioEl = null;
    }
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
   * @param {{volume?: number, loop?: boolean, maxSeconds?: number}} opts
   */
  async function play(what, opts = {}) {
    stop();
    const alert = typeof what === 'object' && what ? what : { level: Number(what) };
    const level = Math.max(1, Math.min(5, Number(alert.level) || 1));
    const token = loopToken;
    const volume = Math.max(0, Math.min(1, opts.volume == null ? 0.8 : opts.volume));
    const loop = Boolean(opts.loop);
    const maxMs = (opts.maxSeconds || 120) * 1000;

    for (const src of [`sounds/${soundFile({ ...alert, level })}.mp3`]) {
      const a = await tryFile(src, volume, loop);
      if (token !== loopToken) {
        if (a) a.pause();
        return;
      }
      if (a) {
        audioEl = a;
        if (loop) synthTimer = setTimeout(stop, maxMs);
        return;
      }
    }

    const started = Date.now();
    const again = () => {
      if (token !== loopToken) return;
      const d = synth(level, volume);
      if (loop && Date.now() - started < maxMs) synthTimer = setTimeout(again, d * 1000 + 600);
    };
    again();
  }

  window.MAlertSound = { play, stop, unlock, isLocked, soundFile };
})();
