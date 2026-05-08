const { app, BrowserWindow, screen, dialog, ipcMain, shell } = require('electron');
const { spawn }       = require('child_process');
const { autoUpdater } = require('electron-updater');
const { google }      = require('googleapis');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const url  = require('url');

// ─── Path helpers (Dev vs .exe) ───────────────────────────────────────────────
function getBackendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.join(__dirname, '..', 'backend');
}
function getFrontendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'frontend', 'dist', 'index.html')
    : path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
}
function getDataPath() {
  // .exe లో AppData\Roaming\ksms-desktop\data లో save అవుతుంది
  // Dev లో backend/data లో
  return app.isPackaged
    ? path.join(app.getPath('userData'), 'data')
    : path.join(getBackendPath(), 'data');
}

// ─── Auto Updater ─────────────────────────────────────────────────────────────
autoUpdater.autoDownload        = true;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'కొత్త update దొరికింది! Background లో download అవుతుంది.'
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Download అయిపోయింది! App restart అవుతుంది.'
  }).then(() => autoUpdater.quitAndInstall());
});

autoUpdater.on('error', (err) => {
  console.log('Updater error:', err?.message);
});

// ─── Google Drive OAuth2 ──────────────────────────────────────────────────────
const CLIENT_ID     = '73531561382-6f9j3pngha0ubp8dunk915rp26f3a3v5.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI  = 'http://localhost:8421/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const tokenPath    = path.join(app.getPath('userData'), 'tokens.json');

if (fs.existsSync(tokenPath)) {
  try {
    oauth2Client.setCredentials(JSON.parse(fs.readFileSync(tokenPath)));
  } catch {}
}

let authServer = null;

// Google Login
ipcMain.handle('connect-google', async () => {
  return new Promise((resolve) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
    });

    if (authServer) { try { authServer.close(); } catch {} authServer = null; }

    authServer = http.createServer(async (req, res) => {
      try {
        if (req.url.indexOf('/callback') > -1) {
          const code = new url.URL(req.url, 'http://localhost:8421').searchParams.get('code');
          res.end('Authentication Successful! KSMS App కి return చేయండి.');
          if (authServer) { authServer.close(); authServer = null; }
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          fs.writeFileSync(tokenPath, JSON.stringify(tokens));
          resolve({ success: true });
        }
      } catch (err) {
        res.end('Authentication Failed!');
        if (authServer) { authServer.close(); authServer = null; }
        resolve({ success: false, error: err.message });
      }
    });

    authServer.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        shell.openExternal(authUrl);
        resolve({ success: false, error: 'Login already opened in browser!' });
      } else {
        resolve({ success: false, error: e.message });
      }
    });

    authServer.listen(8421, () => shell.openExternal(authUrl));
  });
});

// Google Drive Backup — NeDB files backup చేస్తుంది
ipcMain.handle('backup-to-drive', async () => {
  try {
    const drive   = google.drive({ version: 'v3', auth: oauth2Client });
    const dataDir = getDataPath();
    const dbFiles = ['customers.db','campaigns.db','numbers.db','messages.db','settings.db'];
    const backupData = {};

    for (const f of dbFiles) {
      const filePath = path.join(dataDir, f);
      if (fs.existsSync(filePath)) {
        backupData[f] = fs.readFileSync(filePath, 'utf8');
      }
    }

    const backupJson    = JSON.stringify({ version:'1.2.0', date: new Date().toISOString(), files: backupData });
    const backupBuffer  = Buffer.from(backupJson);
    const fileName      = `KSMS_Backup_${new Date().toISOString().slice(0,10)}.json`;
    const { Readable }  = require('stream');
    const stream        = Readable.from(backupBuffer);

    const response = await drive.files.create({
      resource: { name: fileName },
      media:    { mimeType: 'application/json', body: stream },
      fields:   'id'
    });

    return { success: true, fileId: response.data.id, fileName };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// Google Drive Restore
ipcMain.handle('restore-from-drive', async () => {
  try {
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const res   = await drive.files.list({
      q: "name contains 'KSMS_Backup_' and mimeType='application/json'",
      orderBy: 'createdTime desc',
      fields: 'files(id,name)',
      pageSize: 1
    });

    if (!res.data.files?.length) return { success: false, error: 'Google Drive లో backup దొరకలేదు!' };

    const fileId  = res.data.files[0].id;
    const chunks  = [];
    const dlRes   = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' });

    await new Promise((resolve, reject) => {
      dlRes.data.on('data', c => chunks.push(c));
      dlRes.data.on('end', resolve);
      dlRes.data.on('error', reject);
    });

    const backupData = JSON.parse(Buffer.concat(chunks).toString());
    const dataDir    = getDataPath();
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    for (const [fileName, content] of Object.entries(backupData.files || {})) {
      fs.writeFileSync(path.join(dataDir, fileName), content);
    }

    return { success: true, message: 'Restored! App restart చేయండి.' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── Backend Spawn ────────────────────────────────────────────────────────────
let mainWindow;
let backendProcess;

function startBackend() {
  return new Promise((resolve) => {
    const backendPath = getBackendPath();
    console.log('Starting backend:', backendPath);

    backendProcess = spawn('node', ['server.js'], {
      cwd:   backendPath,
      shell: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DB_PATH:  getDataPath()
      }
    });

    backendProcess.on('error', (err) => {
      console.log('Backend error:', err.message);
      resolve();
    });

    setTimeout(resolve, 5000);
  });
}

// ─── App Ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  await startBackend();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width:     Math.round(width  * 0.85),
    height:    Math.round(height * 0.90),
    minWidth:  1024,
    minHeight: 600,
    title:    'KSMS - Keerthi Smart Marketing System',
    resizable:    true,
    maximizable:  true,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      webSecurity:      false,
      preload: path.join(__dirname, 'preload.js')
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(getFrontendPath());

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.focus();
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('click', function(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
          setTimeout(() => e.target.focus(), 0);
        }
      }, true);
    `);
  });

  // Auto updater — 3s తర్వాత check చేయి
  setTimeout(() => {
    try { autoUpdater.checkForUpdatesAndNotify(); } catch {}
  }, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (backendProcess) backendProcess.kill();
  });
});

// ─── App Close ────────────────────────────────────────────────────────────────
app.on('window-all-closed', () => {
  // OneDrive Auto Backup
  try {
    const dataDir    = getDataPath();
    const userHome   = app.getPath('home');
    const oneDriveDir = path.join(userHome, 'OneDrive', 'KSMS_Backups');

    if (!fs.existsSync(oneDriveDir)) fs.mkdirSync(oneDriveDir, { recursive: true });

    const dbFiles = ['customers.db','campaigns.db','numbers.db','messages.db','settings.db'];
    const backupData = {};

    for (const f of dbFiles) {
      const fp = path.join(dataDir, f);
      if (fs.existsSync(fp)) backupData[f] = fs.readFileSync(fp, 'utf8');
    }

    const dateStr  = new Date().toISOString().replace(/:/g,'-').split('.')[0];
    const destPath = path.join(oneDriveDir, `backup_${dateStr}.json`);
    fs.writeFileSync(destPath, JSON.stringify({ version:'1.2.0', date: new Date().toISOString(), files: backupData }));
    console.log('✅ OneDrive Auto-Backup done!');
  } catch (err) {
    console.log('OneDrive backup skipped:', err.message);
  }

  if (backendProcess) backendProcess.kill();
  app.quit();
});

app.on('before-quit', () => {
  if (backendProcess) backendProcess.kill();
});