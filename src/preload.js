const { contextBridge, ipcRenderer, webFrame } = require('electron');

// Zoom shortcuts: Ctrl+= (zoom in), Ctrl+- (zoom out), Ctrl+0 (reset)
window.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '=' || e.key === '+') {
    e.preventDefault();
    webFrame.setZoomFactor(Math.min(webFrame.getZoomFactor() + 0.1, 3.0));
  } else if (e.key === '-') {
    e.preventDefault();
    webFrame.setZoomFactor(Math.max(webFrame.getZoomFactor() - 0.1, 0.3));
  } else if (e.key === '0') {
    e.preventDefault();
    webFrame.setZoomFactor(1.0);
  }
});

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
  windowMove: (dx, dy) => ipcRenderer.send('window-move', { dx, dy }),
  getHiddenOrgs:  ()          => ipcRenderer.invoke('get-hidden-orgs'),
  setOrgHidden:   (key, h)    => ipcRenderer.invoke('set-org-hidden', { key, hidden: h }),

  onUsageUpdate:  (cb) => { ipcRenderer.on('usage-update',  (_, d) => cb(d)); },
  onShowSettings: (cb) => { ipcRenderer.on('show-settings', ()    => cb());  },
});
