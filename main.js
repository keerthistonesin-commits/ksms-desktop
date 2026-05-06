const { app, BrowserWindow, screen, dialog } = require('electron'); // dialog add chesa
const { autoUpdater } = require('electron-updater'); // autoUpdater import chesa
const { spawn } = require('child_process');
const path = require('path');

let mainWindow;
let backendProcess;

function startBackend() {
  return new Promise((resolve) => {
    const backendPath = path.join(__dirname, '../backend');
    backendProcess = spawn('node', ['server.js'], {
      cwd: backendPath, stdio: 'inherit', shell: true
    });
    backendProcess.on('error', () => resolve());
    setTimeout(resolve, 4000);
  });
}

app.whenReady().then(async () => {
  await startBackend();

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'KSMS - Keerthi Smart Marketing System',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, '../frontend/dist/index.html'));

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

  // --- AUTO UPDATER: App load ayyaka updates check chestundi ---
  mainWindow.once('ready-to-show', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (backendProcess) backendProcess.kill();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});

// --- AUTO UPDATER EVENT LISTENERS ---

// Update available unte console lo chupistundi (debugging kosam)
autoUpdater.on('update-available', () => {
  console.log('Kotha update dorikindi, background lo download avtundi...');
});

// Download aipoyaka user ki dialog box chupistundi
autoUpdater.on('update-downloaded', () => {
  const dialogOpts = {
    type: 'info',
    buttons: ['Restart & Install', 'Later'],
    title: 'KSMS Update Ready',
    message: 'Kotha version download aindi!',
    detail: 'KSMS app ni ippude restart chesi kotha features install cheyyala?'
  };

  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      // User 'Restart & Install' nokkithe app update ayyi restart avtundi
      autoUpdater.quitAndInstall();
    }
  });
});