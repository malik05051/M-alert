'use strict';

/* Mises à jour de M-Alert.
 * - Installateur Windows (NSIS) et AppImage : mise à jour automatique avec electron-updater
 *   (téléchargement en arrière-plan depuis les Releases GitHub, installation au redémarrage).
 * - Version portable Windows et paquet .deb : vérification seule, avec un lien vers la Release.
 * - Paquet Arch : rien, pacman s'en charge (pacman -Syu).
 */

const { app, net, shell, Notification } = require('electron');

const REPO = 'malik05051/M-alert';
const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 6 * 3600 * 1000;

function detectMode() {
  if (process.env.MALERT_EXEC) return 'pacman';
  if (!app.isPackaged) return process.env.MALERT_UPDATE_TEST ? 'notify' : 'dev';
  if (process.platform === 'win32') return process.env.PORTABLE_EXECUTABLE_DIR ? 'notify' : 'auto';
  if (process.platform === 'linux') return process.env.APPIMAGE ? 'auto' : 'notify';
  return 'notify';
}

/** Compare deux versions « 1.2.3 » : > 0 si a est plus récente. */
function compareVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

class Updater {
  /**
   * @param {{ send: (status: object) => void, onBeforeInstall: () => void, iconPath: string,
   *           isWindowVisible: () => boolean, enabled: boolean }} opts
   */
  constructor(opts) {
    this.opts = opts;
    this.mode = detectMode();
    this.status = { state: 'idle', mode: this.mode, current: app.getVersion() };
    this.autoUpdater = null;
    this.timer = null;
    this.notified = null;
  }

  setStatus(patch) {
    this.status = { ...this.status, ...patch, mode: this.mode, current: app.getVersion() };
    this.opts.send(this.status);
  }

  notify(title, body) {
    if (this.opts.isWindowVisible() || !Notification.isSupported()) return;
    new Notification({ title, body, icon: this.opts.iconPath }).show();
  }

  initAuto() {
    if (this.autoUpdater) return true;
    try {
      // Chargé seulement ici : le paquet Arch et le mode développement n'en ont pas besoin.
      ({ autoUpdater: this.autoUpdater } = require('electron-updater'));
    } catch (err) {
      console.error('electron-updater indisponible :', err.message);
      this.mode = 'notify';
      return false;
    }
    const u = this.autoUpdater;
    u.autoDownload = true;
    u.autoInstallOnAppQuit = true;
    u.on('checking-for-update', () => this.setStatus({ state: 'checking', error: null }));
    u.on('update-not-available', () => this.setStatus({ state: 'none', checkedAt: new Date().toISOString() }));
    u.on('update-available', (info) => this.setStatus({ state: 'downloading', version: info.version, percent: 0 }));
    u.on('download-progress', (p) => this.setStatus({ state: 'downloading', percent: Math.round(p.percent) }));
    u.on('update-downloaded', (info) => {
      this.setStatus({ state: 'ready', version: info.version });
      if (this.notified !== info.version) {
        this.notified = info.version;
        this.notify('Mise à jour de M-Alert prête',
          `La version ${info.version} sera installée au prochain redémarrage de M-Alert.`);
      }
    });
    u.on('error', (err) => this.setStatus({ state: 'error', error: String(err && err.message || err).split('\n')[0] }));
    return true;
  }

  /** Vérification simple via l'API GitHub (portable, .deb). */
  async checkNotifyOnly() {
    this.setStatus({ state: 'checking', error: null });
    try {
      const res = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'M-Alert' },
      });
      if (!res.ok) throw new Error(`GitHub : HTTP ${res.status}`);
      const release = await res.json();
      const latest = String(release.tag_name || '').replace(/^v/, '');
      if (latest && compareVersions(latest, app.getVersion()) > 0) {
        this.setStatus({ state: 'available', version: latest, url: release.html_url || RELEASES_URL });
        if (this.notified !== latest) {
          this.notified = latest;
          this.notify('Nouvelle version de M-Alert', `La version ${latest} est disponible au téléchargement.`);
        }
      } else {
        this.setStatus({ state: 'none', checkedAt: new Date().toISOString() });
      }
    } catch (err) {
      this.setStatus({ state: 'error', error: err.message });
    }
  }

  async check() {
    if (this.mode === 'pacman' || this.mode === 'dev') {
      this.setStatus({ state: 'disabled' });
      return;
    }
    if (this.mode === 'auto' && this.initAuto()) {
      try {
        await this.autoUpdater.checkForUpdates();
      } catch (err) {
        this.setStatus({ state: 'error', error: String(err.message || err).split('\n')[0] });
      }
      return;
    }
    await this.checkNotifyOnly();
  }

  setEnabled(enabled) {
    this.opts.enabled = enabled;
    clearInterval(this.timer);
    this.timer = null;
    if (enabled) this.timer = setInterval(() => this.check(), CHECK_EVERY_MS);
  }

  start() {
    if (this.mode === 'pacman' || this.mode === 'dev') {
      this.setStatus({ state: 'disabled' });
      return;
    }
    this.setEnabled(this.opts.enabled);
    // Première vérification peu après le démarrage, sans ralentir l'ouverture.
    if (this.opts.enabled) setTimeout(() => this.check(), 15000);
  }

  /** Redémarre M-Alert pour installer la mise à jour téléchargée, ou ouvre la page de la Release. */
  install() {
    if (this.status.state === 'ready' && this.autoUpdater) {
      this.opts.onBeforeInstall();
      // Installation silencieuse puis relance de M-Alert.
      setImmediate(() => this.autoUpdater.quitAndInstall(true, true));
      return;
    }
    shell.openExternal(this.status.url || RELEASES_URL);
  }
}

module.exports = { Updater, compareVersions, detectMode };
