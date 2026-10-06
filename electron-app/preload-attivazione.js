const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prismaAttivazione', {
  stato: () => ipcRenderer.invoke('att:stato'),
  scegliFile: () => ipcRenderer.invoke('att:scegli-file'),
  invia: (testo) => ipcRenderer.invoke('att:invia', testo),
  copia: (testo) => ipcRenderer.invoke('att:copia', testo)
});
