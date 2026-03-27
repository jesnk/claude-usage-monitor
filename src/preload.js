const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeAPI', {
  getConfig:      ()        => ipcRenderer.invoke('get-config'),
  saveConfig:     (c)       => ipcRenderer.invoke('save-config', c),
  getAccounts:    ()        => ipcRenderer.invoke('get-accounts'),
  addAccount:     (a)       => ipcRenderer.invoke('add-account', a),
  removeAccount:  (id)      => ipcRenderer.invoke('remove-account', id),
  updateAccount:  (a)       => ipcRenderer.invoke('update-account', a),
  refreshAll:     ()        => ipcRenderer.invoke('refresh-all'),
  refreshAccount: (id)      => ipcRenderer.invoke('refresh-account', id),
  getDebug:       (id)      => ipcRenderer.invoke('get-debug', id),
  openClaude:     (url)     => ipcRenderer.invoke('open-claude', url),
  minimize:       ()        => ipcRenderer.invoke('minimize-window'),
  setWindowSize:  (w, h)    => ipcRenderer.invoke('set-window-size', { width: w, height: h }),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  getHiddenOrgs:  ()          => ipcRenderer.invoke('get-hidden-orgs'),
  setOrgHidden:   (key, h)    => ipcRenderer.invoke('set-org-hidden', { key, hidden: h }),

  onUsageUpdate:  (cb) => { ipcRenderer.on('usage-update',  (_, d) => cb(d)); },
  onShowSettings: (cb) => { ipcRenderer.on('show-settings', ()    => cb());  },
});
