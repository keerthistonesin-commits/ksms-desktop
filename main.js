const { app, BrowserWindow, screen, dialog } = require('electron'); // 'dialog' add chesam
const { spawn } = require('child_process');
const path = require('path');
const { autoUpdater } = require('electron-updater'); // Updater import chesam

// --- AUTO UPDATER CONFIGURATION ---
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// 1. Kotha update dorikithe popup vastundi
autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Available',
    message: 'Kotha update dorikindi bro! Background lo download avtundi, 1-2 mins wait cheyyandi.'
  });
});

// 2. Update lekapothe console lo padutundi
autoUpdater.on('update-not-available', (info) => {
  console.log('Update not available presently.');
});

// 3. Emaina ERROR vaste e popup vastundi (Idi chala important)
autoUpdater.on('error', (err) => {
  dialog.showErrorBox('Updater Error', err == null ? "unknown" : (err.stack || err).toString());
});

// 4. Download aipoindi, restart ki ready
autoUpdater.on('update-downloaded', (info) => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Update Ready',
    message: 'Download aipoindi! App restart avtundi.'
  }).then(() => {
    autoUpdater.quitAndInstall();
  });
});
// ----------------------------------

let mainWindow;
let backendProcess;

function startBackend() {
  return new Promise((resolve) => {
    // Backend folder — desktop-app బయట ఉంది
    const backendPath = path.join(__dirname, '..', 'backend');
    
    backendProcess = spawn('node', ['server.js'], {
      cwd: backendPath,
      stdio: 'inherit',
      shell: true
    });

    backendProcess.on('error', (err) => {
      console.log('Backend error:', err.message);
      resolve();
    });

    // 4 seconds wait
    setTimeout(resolve, 4000);
  });
}

app.whenReady().then(async () => {
  await startBackend();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.round(width * 0.85),
    height: Math.round(height * 0.9),
    minWidth: 900,
    minHeight: 600,
    title: 'Keerthi Smart Marketing System',
    resizable: true,
    maximizable: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    autoHideMenuBar: true
  });

  // Frontend dist folder — desktop-app బయట ఉంది
  const frontendPath = path.join(__dirname, '..', 'frontend', 'dist', 'index.html');
  mainWindow.loadFile(frontendPath);

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

  // --- TRIGGER THE UPDATER ---
  // App open ayyina 3 seconds ki silent ga update check chestundi
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 3000);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (backendProcess) backendProcess.kill();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});