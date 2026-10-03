'use strict';

/* Fonctionnement en arrière-plan (Windows et Linux) :
 * - réglages natifs (arrière-plan, lancement au démarrage) enregistrés dans le dossier utilisateur ;
 * - lancement au démarrage : registre Windows via Electron, fichier ~/.config/autostart sous Linux
 *   (Electron ne le gère pas sous Linux) ;
 * - icône dans la zone de notification.
 * Fichier identique dans M-alert et M-Alert-sender.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { app, Tray, Menu, nativeImage, Notification } = require('electron');

const HIDDEN_ARG = '--hidden';

function settingsFile() {
  return path.join(app.getPath('userData'), 'native-settings.json');
}

function loadSettings() {
  try {
    return { background: true, hiddenNoticeShown: false, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch (_) {
    return { background: true, hiddenNoticeShown: false };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
}

// ---------- Lancement au démarrage ----------

function linuxAutostartFile(id) {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, 'autostart', `${id}.desktop`);
}

/** Commande qui relance l'application (AppImage, .deb ou mode développement). */
function launchCommand() {
  const quote = (s) => `"${String(s).replace(/(["`$\\])/g, '\\$1')}"`;
  // Paquet Arch : le lanceur /usr/bin/m-alert indique son chemin, stable même si Electron change.
  if (process.env.MALERT_EXEC) return `${quote(process.env.MALERT_EXEC)} ${HIDDEN_ARG}`;
  if (process.env.APPIMAGE) return `${quote(process.env.APPIMAGE)} ${HIDDEN_ARG}`;
  if (app.isPackaged) return `${quote(process.execPath)} ${HIDDEN_ARG}`;
  return `${quote(process.execPath)} ${quote(app.getAppPath())} ${HIDDEN_ARG}`;
}

function getAutostart(id) {
  if (process.platform === 'linux') return fs.existsSync(linuxAutostartFile(id));
  const args = app.isPackaged ? [HIDDEN_ARG] : [app.getAppPath(), HIDDEN_ARG];
  return app.getLoginItemSettings({ path: process.execPath, args }).openAtLogin;
}

function setAutostart(id, name, iconPath, enabled) {
  if (process.platform === 'linux') {
    const file = linuxAutostartFile(id);
    if (!enabled) {
      fs.rmSync(file, { force: true });
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${name}`,
      `Exec=${launchCommand()}`,
      `Icon=${iconPath}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      'X-GNOME-Autostart-Delay=5',
      '',
    ].join('\n'));
    return;
  }
  const args = app.isPackaged ? [HIDDEN_ARG] : [app.getAppPath(), HIDDEN_ARG];
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), path: process.execPath, args });
}

function startHidden() {
  return process.argv.includes(HIDDEN_ARG);
}

// ---------- Zone de notification ----------

function createTray(iconPath, tooltip, menuItems, onClick) {
  const size = process.platform === 'win32' ? 16 : 24;
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: size, height: size }));
  tray.setToolTip(tooltip);
  tray.setContextMenu(Menu.buildFromTemplate(menuItems));
  // Sous Linux, le clic simple n'est pas transmis par tous les bureaux : le menu reste disponible.
  tray.on('click', onClick);
  tray.on('double-click', onClick);
  return tray;
}

/** Prévient une seule fois que l'application continue en arrière-plan. */
function notifyHiddenOnce(settings, title, iconPath) {
  if (settings.hiddenNoticeShown || !Notification.isSupported()) return;
  new Notification({
    title,
    body: 'L\'application continue de fonctionner en arrière-plan. Utilisez l\'icône de la zone de notification pour la rouvrir ou la quitter.',
    icon: iconPath,
    silent: true,
  }).show();
  settings.hiddenNoticeShown = true;
  saveSettings(settings);
}

module.exports = {
  loadSettings, saveSettings, getAutostart, setAutostart, startHidden, createTray, notifyHiddenOnce,
};
