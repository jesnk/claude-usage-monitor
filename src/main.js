const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage, session } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let store = null;
let pollIntervals = {};

// ─── Store ────────────────────────────────────────────────────────────────────

async function getStore() {
  if (!store) {
    const { default: ElectronStore } = await import('electron-store');
    store = new ElectronStore({
      name: 'claude-monitor-config',
      defaults: {
        accounts: [],
        position: { x: -1, y: -1 },
        opacity: 0.92,
        alwaysOnTop: true,
        pollInterval: 60000,
        hiddenOrgs: {},
      }
    });
  }
  return store;
}

// ─── App ──────────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  await getStore();
  createMainWindow();
  createTray();
  startPollingAll(true);
});

app.on('window-all-closed', () => {});
app.on('before-quit', () => { Object.values(pollIntervals).forEach(clearInterval); });

// ─── Window ───────────────────────────────────────────────────────────────────

function createMainWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  let pos = store.get('position');
  const winW = 340, winH = 200;
  if (pos.x === -1) pos = { x: sw - winW - 16, y: sh - winH - 16 };

  mainWindow = new BrowserWindow({
    width: winW, height: winH,
    x: pos.x, y: pos.y,
    frame: false, transparent: true,
    alwaysOnTop: store.get('alwaysOnTop'),
    skipTaskbar: true, resizable: false, hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  mainWindow.setOpacity(store.get('opacity'));
  if (store.get('alwaysOnTop')) mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setIgnoreMouseEvents(true, { forward: true });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('moved', () => {
    const [x, y] = mainWindow.getPosition();
    store.set('position', { x, y });
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip('Claude Monitor');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show / Hide', click: () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show() },
    { label: 'Settings',    click: () => { mainWindow?.webContents.send('show-settings'); mainWindow?.show(); } },
    { type: 'separator' },
    { label: 'Refresh Now', click: () => startPollingAll(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
  tray.on('double-click', () => mainWindow?.isVisible() ? mainWindow.hide() : mainWindow?.show());
}

// ─── API: Electron session.fetch (Chrome TLS fingerprint bypasses Cloudflare) ─

// One persistent session partition per account so cookies don't conflict
const accountSessions = {};
function getAccountSession(id) {
  if (!accountSessions[id]) {
    accountSessions[id] = session.fromPartition('persist:claude-' + id);
  }
  return accountSessions[id];
}

async function fetchWithSessionKey(apiPath, sessionKey, accountId) {
  const cleanKey = (sessionKey || '').trim().replace(/[\r\n\t]/g, '');
  const ses = getAccountSession(accountId);

  // Inject the sessionKey cookie into this session's cookie store
  try {
    await ses.cookies.set({
      url: 'https://claude.ai',
      name: 'sessionKey',
      value: cleanKey,
      domain: '.claude.ai',
      path: '/',
      secure: true,
      sameSite: 'no_restriction',
    });
  } catch (_) {
    // Cookie may already be set from a previous call — continue anyway
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await ses.fetch('https://claude.ai' + apiPath, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://claude.ai/',
      },
    });
    clearTimeout(timer);
    const raw = await response.text();
    let data = null;
    try { data = JSON.parse(raw); } catch (_) {}
    return { status: response.status, data, raw: raw.slice(0, 600) };
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') return { status: 0, data: null, error: 'timeout' };
    return { status: 0, data: null, error: e.message };
  }
}

async function fetchFullUsage(account) {
  const { sessionKey, label, id } = account;
  if (!sessionKey) return { id, label, error: 'No session key' };

  const debug = {};

  try {
    // 1) /api/account
    const acctRes = await fetchWithSessionKey('/api/account', sessionKey, id);
    debug.account = { status: acctRes.status, raw: acctRes.raw };

    if (acctRes.status === 403 && acctRes.raw && acctRes.raw.includes('cf-mitigated')) {
      return { id, label, error: 'Cloudflare 차단 — 잠시 후 다시 시도하세요', debug };
    }
    if (acctRes.status === 401 || acctRes.status === 403) {
      return { id, label, error: '세션 만료 — F12 > Application > Cookies > sessionKey 값을 다시 복사해서 갱신하세요', debug };
    }
    if (acctRes.status === 0) {
      return { id, label, error: '네트워크 오류: ' + acctRes.error, debug };
    }

    const acct = acctRes.data || {};
    const email = acct.email_address || acct.email || '?';

    // 2) /api/organizations
    const orgsRes = await fetchWithSessionKey('/api/organizations', sessionKey, id);
    debug.organizations = { status: orgsRes.status, raw: orgsRes.raw };

    const orgs = Array.isArray(orgsRes.data) ? orgsRes.data : [];

    if (orgs.length === 0) {
      return { id, label, email, error: 'Organization을 찾을 수 없어요', debug };
    }

    // 3) Fetch usage for ALL organizations
    const orgResults = [];
    for (const org of orgs) {
      const orgUuid = org.uuid;
      if (!orgUuid) continue;

      const usageRes = await fetchWithSessionKey('/api/organizations/' + orgUuid + '/usage', sessionKey, id);
      debug['usage_' + (org.name || orgUuid)] = { status: usageRes.status, raw: usageRes.raw };

      const flags = org.active_flags || [];
      const plan = flags.find(f => /pro|team|free/i.test(f)) || org.rate_limit_tier || '?';
      const orgName = org.name || '';

      if (usageRes.status === 200 && usageRes.data) {
        const u = usageRes.data;
        orgResults.push({
          orgUuid, plan, orgName,
          usage: {
            session: {
              utilization: (u.five_hour && u.five_hour.utilization != null) ? u.five_hour.utilization : null,
              resetsAt:    (u.five_hour && u.five_hour.resets_at) ? u.five_hour.resets_at : null,
            },
            weekly: {
              utilization: (u.seven_day && u.seven_day.utilization != null) ? u.seven_day.utilization : null,
              resetsAt:    (u.seven_day && u.seven_day.resets_at) ? u.seven_day.resets_at : null,
            },
            extra: u.extra_usage || null,
          },
        });
      } else {
        // Skip orgs where usage API is inaccessible (e.g. 403 for evaluation/special orgs)
        debug['skipped_' + (org.name || orgUuid)] = 'Usage API ' + usageRes.status;
      }
    }

    if (orgResults.length === 0) {
      return { id, label, email, error: '접근 가능한 Organization이 없습니다', debug, lastUpdated: Date.now() };
    }

    const primary = orgResults[0] || {};
    return {
      id, label, email,
      orgUuid: primary.orgUuid,
      plan: primary.plan,
      usage: primary.usage || null,
      orgs: orgResults,
      debug,
      lastUpdated: Date.now(),
      error: null,
    };

  } catch (err) {
    return { id, label, error: err.message, debug, lastUpdated: Date.now() };
  }
}

// ─── Polling ──────────────────────────────────────────────────────────────────

async function pollAccount(account) {
  const result = await fetchFullUsage(account);
  mainWindow && mainWindow.webContents.send('usage-update', result);
  return result;
}

async function startPollingAll(immediate) {
  const s = await getStore();
  const accounts = s.get('accounts') || [];
  const interval = s.get('pollInterval') || 60000;
  for (const account of accounts) {
    if (pollIntervals[account.id]) clearInterval(pollIntervals[account.id]);
    if (immediate) pollAccount(account);
    pollIntervals[account.id] = setInterval(() => pollAccount(account), interval);
  }
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

ipcMain.handle('get-config', async () => {
  const s = await getStore();
  return { accounts: s.get('accounts'), opacity: s.get('opacity'), alwaysOnTop: s.get('alwaysOnTop'), pollInterval: s.get('pollInterval'), hiddenOrgs: s.get('hiddenOrgs') };
});

ipcMain.handle('save-config', async (_, config) => {
  const s = await getStore();
  if (config.opacity     != null) { s.set('opacity', config.opacity); mainWindow && mainWindow.setOpacity(config.opacity); }
  if (config.alwaysOnTop != null) { s.set('alwaysOnTop', config.alwaysOnTop); mainWindow && mainWindow.setAlwaysOnTop(config.alwaysOnTop, 'screen-saver'); }
  if (config.pollInterval != null) s.set('pollInterval', config.pollInterval);
  return true;
});

ipcMain.handle('get-accounts', async () => { return (await getStore()).get('accounts') || []; });

ipcMain.handle('add-account', async (_, account) => {
  const s = await getStore();
  const accounts = s.get('accounts') || [];
  if (account.sessionKey) account.sessionKey = account.sessionKey.trim().replace(/[\r\n\t]/g, '');
  const newAccount = Object.assign({}, account, { id: Date.now().toString() });
  accounts.push(newAccount);
  s.set('accounts', accounts);
  pollAccount(newAccount);
  pollIntervals[newAccount.id] = setInterval(() => pollAccount(newAccount), s.get('pollInterval') || 60000);
  return newAccount;
});

ipcMain.handle('remove-account', async (_, id) => {
  const s = await getStore();
  s.set('accounts', (s.get('accounts') || []).filter(a => a.id !== id));
  if (pollIntervals[id]) { clearInterval(pollIntervals[id]); delete pollIntervals[id]; }
  return true;
});

ipcMain.handle('update-account', async (_, account) => {
  const s = await getStore();
  const accounts = s.get('accounts') || [];
  if (account.sessionKey) account.sessionKey = account.sessionKey.trim().replace(/[\r\n\t]/g, '');
  const idx = accounts.findIndex(a => a.id === account.id);
  if (idx >= 0) {
    accounts[idx] = account;
    s.set('accounts', accounts);
    if (pollIntervals[account.id]) clearInterval(pollIntervals[account.id]);
    pollAccount(account);
    pollIntervals[account.id] = setInterval(() => pollAccount(account), s.get('pollInterval') || 60000);
  }
  return true;
});

ipcMain.handle('get-hidden-orgs', async () => {
  return (await getStore()).get('hiddenOrgs') || {};
});
ipcMain.handle('set-org-hidden', async (_, { key, hidden }) => {
  const s = await getStore();
  const map = s.get('hiddenOrgs') || {};
  if (hidden) map[key] = true; else delete map[key];
  s.set('hiddenOrgs', map);
  return map;
});

ipcMain.handle('refresh-all', async () => { await startPollingAll(true); return true; });
ipcMain.handle('refresh-account', async (_, id) => {
  const account = ((await getStore()).get('accounts') || []).find(a => a.id === id);
  if (account) await pollAccount(account);
  return true;
});
ipcMain.handle('get-debug', async (_, id) => {
  const account = ((await getStore()).get('accounts') || []).find(a => a.id === id);
  return account ? fetchFullUsage(account) : { error: 'Account not found' };
});
ipcMain.handle('open-claude', async (_, url) => { shell.openExternal(url || 'https://claude.ai'); return true; });
ipcMain.handle('set-window-size', (_, { width, height }) => { mainWindow && mainWindow.setSize(width, height); });
ipcMain.handle('minimize-window', () => { mainWindow && mainWindow.hide(); });
ipcMain.on('set-ignore-mouse-events', (_, ignore) => {
  mainWindow?.setIgnoreMouseEvents(ignore, { forward: true });
});
ipcMain.on('window-move', (_, { dx, dy }) => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  mainWindow.setPosition(x + dx, y + dy);
});
