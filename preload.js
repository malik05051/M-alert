'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Fonctions natives exposées à l'interface web (window.malertNative).
contextBridge.exposeInMainWorld('malertNative', {
  isElectron: true,
  showWindow: () => ipcRenderer.send('show-window'),
  alert: (info) => ipcRenderer.send('alert', info),
  getSettings: () => ipcRenderer.invoke('get-native-settings'),
  setSettings: (values) => ipcRenderer.send('set-native-settings', values),
  onOpenSettings: (cb) => ipcRenderer.on('open-settings', () => cb()),
  onTestAlert: (cb) => ipcRenderer.on('test-alert', () => cb()),
  onResume: (cb) => ipcRenderer.on('resume', () => cb()),
  onVisibility: (cb) => ipcRenderer.on('visibility', (_e, visible) => cb(visible)),
  getUpdateStatus: () => ipcRenderer.invoke('update-get'),
  checkForUpdates: () => ipcRenderer.send('update-check'),
  installUpdate: () => ipcRenderer.send('update-install'),
  onUpdateStatus: (cb) => ipcRenderer.on('update-status', (_e, status) => cb(status)),
});
