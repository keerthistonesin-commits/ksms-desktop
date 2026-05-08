const { contextBridge, ipcRenderer } = require('electron');

// Frontend (React) ki ee functions matrame access isthunnam (For Security)
contextBridge.exposeInMainWorld('api', {
  connectGoogle: () => ipcRenderer.invoke('connect-google'),
  saveAuthCode: (code) => ipcRenderer.invoke('save-auth-code', code),
  backupToDrive: () => ipcRenderer.invoke('backup-to-drive'),
  restoreFromDrive: () => ipcRenderer.invoke('restore-from-drive')
});