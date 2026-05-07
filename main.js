const { app, BrowserWindow, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

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

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (backendProcess) backendProcess.kill();
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) backendProcess.kill();
  app.quit();
});