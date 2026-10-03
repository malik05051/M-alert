'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Fonctions natives exposées à l'interface web (window.malertNative).
contextBridge.exposeInMainWorld('malertNative', {
  isElectron: true,
  showWindow: () => ipcRenderer.send('show-window'),
  alert: (info) => ipcRenderer.send('alert', info),
  getAutostart: () => ipcRenderer.invoke('get-autostart'),
  setAutostart: (enabled) => ipcRenderer.send('set-autostart', enabled),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  onTestAlert: (cb) => ipcRenderer.on('test-alert', () => cb()),
});
