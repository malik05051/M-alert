'use strict';

/* M-Alert — application de bureau (Electron) pour Windows et Linux.
 * La fenêtre charge l'interface du dossier web/. Quand on la ferme, M-Alert continue en
 * arrière-plan dans la zone de notification et reste à l'écoute des alertes, comme JQuake.
 */

const path = require('path');
const { app, BrowserWindow, ipcMain, shell, powerMonitor } = require('electron');
const bg = require('./background');
const { Updater } = require('./updater');

const APP_ID = 'fr.malert.app';
const ICON = path.join(__dirname, 'web', 'icons', 'icon-512.png');
let win = null;
let tray = null;
let quitting = false;
let settings = null;
let updater = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Relancer M-Alert alors qu'il tourne en arrière-plan rouvre simplement la fenêtre.
  app.on('second-instance', () => showWindow());
}

// Nécessaire pour les notifications Windows (doit correspondre à l'appId de l'installateur).
if (process.platform === 'win32') app.setAppUserModelId(app.isPackaged ? APP_ID : process.execPath);

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function quit() {
  quitting = true;
  app.quit();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0b1220',
    title: 'M-Alert',
    icon: ICON,
    show: !bg.startHidden(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Les alertes doivent pouvoir sonner sans clic préalable, même fenêtre cachée.
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (quitting || !settings.background) return;
    e.preventDefault();
    win.hide();
    bg.notifyHiddenOnce(settings, 'M-Alert reste actif', ICON);
  });
}

ipcMain.on('show-window', showWindow);

ipcMain.on('alert', (_e, { level, front }) => {
  if (!win) return;
  if (front) {
    showWindow();
    // Passe brièvement au premier plan, comme JQuake lors d'un séisme.
    win.setAlwaysOnTop(true, 'screen-saver');
    setTimeout(() => win && win.setAlwaysOnTop(false), level >= 3 ? 15000 : 4000);
  }
  win.flashFrame(true);
  setTimeout(() => win && win.flashFrame(false), 10000);
});

ipcMain.handle('get-native-settings', () => ({
  platform: process.platform,
  background: settings.background,
  autostart: bg.getAutostart(APP_ID),
  autoUpdate: settings.autoUpdate,
}));

// Mises à jour
ipcMain.handle('update-get', () => updater.status);
ipcMain.on('update-check', () => updater.check());
ipcMain.on('update-install', () => updater.install());

ipcMain.on('set-native-settings', (_e, values) => {
  if (typeof values.background === 'boolean') settings.background = values.background;
  if (typeof values.autoUpdate === 'boolean') {
    settings.autoUpdate = values.autoUpdate;
    updater.setEnabled(values.autoUpdate);
  }
  bg.saveSettings(settings);
  if (typeof values.autostart === 'boolean') {
    try {
      bg.setAutostart(APP_ID, 'M-Alert', ICON, values.autostart);
    } catch (err) {
      console.error('Lancement au démarrage :', err.message);
    }
  }
});

app.whenReady().then(() => {
  settings = bg.loadSettings();
  createWindow();
  updater = new Updater({
    enabled: settings.autoUpdate,
    iconPath: ICON,
    send: (status) => win && win.webContents.send('update-status', status),
    isWindowVisible: () => Boolean(win && win.isVisible()),
    // Sans cela, la fenêtre se cacherait au lieu de se fermer et l'installation n'aurait pas lieu.
    onBeforeInstall: () => { quitting = true; },
  });
  updater.start();
  tray = bg.createTray(ICON, 'M-Alert — à l\'écoute des alertes', [
    { label: 'Ouvrir M-Alert', click: showWindow },
    { label: 'Réglages', click: () => { showWindow(); win.webContents.send('open-settings'); } },
    { label: 'Tester une alerte', click: () => { showWindow(); win.webContents.send('test-alert'); } },
    { label: 'Rechercher des mises à jour', click: () => { showWindow(); win.webContents.send('open-settings'); updater.check(); } },
    { type: 'separator' },
    { label: 'Quitter M-Alert', click: quit },
  ], showWindow);

  // Après une mise en veille, la connexion est rétablie immédiatement.
  powerMonitor.on('resume', () => win && win.webContents.send('resume'));
  powerMonitor.on('unlock-screen', () => win && win.webContents.send('resume'));
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  if (!settings || !settings.background) app.quit();
});
