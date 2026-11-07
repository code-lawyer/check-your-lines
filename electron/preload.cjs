const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cablewise', {
  scan: () => ipcRenderer.invoke('scan'),
  checkComputer: () => ipcRenderer.invoke('check-computer'),
  restoreComputer: () => ipcRenderer.invoke('restore-computer'),
  exportReport: (payload, format) => ipcRenderer.invoke('export', payload, format),
  loadCatalog: () => ipcRenderer.invoke('catalog-load'),
  saveCatalog: records => ipcRenderer.invoke('catalog-save', records),
  catalogRecoveryInfo: () => ipcRenderer.invoke('catalog-recovery-info'),
  recoverCatalog: request => ipcRenderer.invoke('catalog-recover', request),
  openSource: url => ipcRenderer.invoke('open-source', url),
  platform: process.platform
});
