/* M-Alert — son d'alerte.
 *
 * Pour utiliser vos propres sons, déposez des fichiers dans web/sounds/ :
 *   alerte-1.mp3 (information), alerte-2.mp3 (jaune), alerte-3.mp3 (orange), alerte-4.mp3 (rouge)
 *   ou un seul fichier alerte.mp3 utilisé pour tous les niveaux.
 * Si aucun fichier n'est présent, une sirène synthétique est jouée.
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
    // Orange / rouge : sirène montante-descendante.
    const dur = level === 4 ? 4 : 3;
    const o = c.createOscillator();
    o.type = level === 4 ? 'sawtooth' : 'square';
    const sweep = level === 4 ? 0.5 : 0.75;
    for (let t = 0; t < dur; t += sweep) {
      o.frequency.setValueAtTime(level === 4 ? 600 : 650, t0 + t);
      o.frequency.linearRampToValueAtTime(level === 4 ? 1300 : 1000, t0 + t + sweep / 2);
      o.frequency.linearRampToValueAtTime(level === 4 ? 600 : 650, t0 + t + sweep);
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
   * @param {number} level 1 à 4
   * @param {{volume?: number, loop?: boolean, maxSeconds?: number}} opts
   */
  async function play(level, opts = {}) {
    stop();
    const token = loopToken;
    const volume = Math.max(0, Math.min(1, opts.volume == null ? 0.8 : opts.volume));
    const loop = Boolean(opts.loop);
    const maxMs = (opts.maxSeconds || 120) * 1000;

    for (const src of [`sounds/alerte-${level}.mp3`, 'sounds/alerte.mp3']) {
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

  window.MAlertSound = { play, stop, unlock, isLocked };
})();
