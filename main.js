'use strict';

/* M-Alert — application de bureau (Electron).
 * La fenêtre charge l'interface du dossier web/. Fermer la fenêtre la réduit dans la zone de
 * notification : M-Alert continue d'écouter les alertes en arrière-plan, comme JQuake.
 */

const path = require('path');
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron');

const ICON = path.join(__dirname, 'web', 'icons', 'icon-512.png');
let win = null;
let tray = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

// Nécessaire pour les notifications Windows.
if (process.platform === 'win32') app.setAppUserModelId('fr.malert.app');

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  const startHidden = process.argv.includes('--hidden');
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: '#0b1220',
    title: 'M-Alert',
    icon: ICON,
    show: !startHidden,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Les alertes doivent pouvoir sonner sans clic préalable.
      autoplayPolicy: 'no-user-gesture-required',
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'web', 'index.html'));

  // Liens externes dans le navigateur par défaut.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('M-Alert — à l\'écoute des alertes');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Ouvrir M-Alert', click: showWindow },
    { label: 'Réglages', click: () => { showWindow(); win.webContents.send('open-settings'); } },
    { label: 'Tester une alerte', click: () => { showWindow(); win.webContents.send('test-alert'); } },
    { type: 'separator' },
    { label: 'Quitter', click: () => { quitting = true; app.quit(); } },
  ]));
  tray.on('click', showWindow);
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

ipcMain.handle('get-autostart', () => app.getLoginItemSettings().openAtLogin);
ipcMain.on('set-autostart', (_e, enabled) => {
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), args: ['--hidden'] });
});

app.whenReady().then(() => {
  createWindow();
  createTray();
  app.on('activate', showWindow);
});

app.on('before-quit', () => { quitting = true; });
// L'application reste active dans la zone de notification quand la fenêtre est fermée.
app.on('window-all-closed', () => {});
