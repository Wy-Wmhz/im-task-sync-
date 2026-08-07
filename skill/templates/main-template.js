'use strict';

// Defense: clear inherited ELECTRON_RUN_AS_NODE
delete process.env.ELECTRON_RUN_AS_NODE;

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');

// ---- Config loading ----
var CONFIG = {};
var CONFIG_PATH = path.join(__dirname, 'config.json');
try {
  CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error('[main] Failed to load config.json: ' + e.message);
}

var APP_URL = CONFIG.appUrl || '';
var ICON_PATH = path.join(__dirname, 'icon.png');
var TASKS_FILE = CONFIG.tasksFile || path.join(__dirname, 'tasks.json');
var SYNC_ENGINE = path.join(__dirname, 'sync-engine.js');
var WINDOW_TITLE = CONFIG.windowTitle || '任务台';

// Find Node.js executable for spawning sync-engine
var NODE_EXE = 'node';
if (CONFIG.connectors && CONFIG.connectors.dingtalk) {
  NODE_EXE = CONFIG.connectors.dingtalk.nodePath || 'node';
}

var win = null;
var tray = null;
var isQuiting = false;

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 320,
    minHeight: 480,
    icon: ICON_PATH,
    title: WINDOW_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  if (APP_URL) {
    win.loadURL(APP_URL);
  } else {
    // Fallback: load local HTML
    win.loadFile(path.join(__dirname, 'index.html'));
  }

  // Core: close button -> hide to tray, not quit
  win.on('close', function(e) {
    if (!isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  var icon;
  try {
    icon = nativeImage.createFromPath(ICON_PATH);
    if (icon.isEmpty()) icon = nativeImage.createEmpty();
  } catch (err) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(WINDOW_TITLE);

  var menu = Menu.buildFromTemplate([
    {
      label: '\u663e\u793a\u4efb\u52a1\u53f0',
      click: function() {
        if (win) { win.show(); win.focus(); }
      }
    },
    { type: 'separator' },
    {
      label: '\u7acb\u5373\u540c\u6b65',
      click: function() {
        if (win) win.webContents.send('sync-status', { status: 'syncing' });
        triggerSync();
      }
    },
    { type: 'separator' },
    {
      label: '\u9000\u51fa',
      click: function() {
        isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);

  tray.on('click', function() {
    if (win) {
      if (win.isVisible()) win.focus();
      else win.show();
    }
  });
}

// ---- IPC: renderer requests current tasks data ----
ipcMain.on('get-tasks', function(event) {
  try {
    var data = fs.readFileSync(TASKS_FILE, 'utf8');
    event.returnValue = JSON.parse(data);
  } catch (e) {
    event.returnValue = { batchId: '', generatedAt: '', tasks: [] };
  }
});

// ---- IPC: renderer requests manual sync (clicking the badge) ----
var syncRunning = false;

function triggerSync() {
  return new Promise(function(resolve) {
    if (syncRunning) {
      resolve({ success: false, message: 'sync already running' });
      return;
    }
    syncRunning = true;

    // Notify renderer: sync started
    if (win) win.webContents.send('sync-status', { status: 'syncing' });

    execFile(NODE_EXE, [SYNC_ENGINE, '--config', CONFIG_PATH], {
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
      env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '' })
    }, function(error, stdout, stderr) {
      syncRunning = false;

      if (error) {
        if (win) win.webContents.send('sync-status', { status: 'error', message: error.message });
        resolve({ success: false, message: error.message });
        return;
      }

      // Parse sync engine output
      var summary = { success: false, tasksExtracted: 0 };
      try {
        summary = JSON.parse(stdout.trim());
      } catch (e) {}

      // Read the updated tasks.json
      var taskData = { batchId: '', generatedAt: '', tasks: [] };
      try {
        taskData = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      } catch (e) {}

      // Notify renderer with new data
      if (win) win.webContents.send('sync-status', {
        status: 'done',
        summary: summary,
        data: taskData
      });

      resolve({ success: true, summary: summary, data: taskData });
    });
  });
}

ipcMain.handle('trigger-sync', function(event) {
  return triggerSync();
});

// ---- File watcher: notify renderer when tasks.json is updated ----
var watchTimer = null;
function startFileSync() {
  // Create initial file if not exists
  if (!fs.existsSync(TASKS_FILE)) {
    try {
      fs.writeFileSync(TASKS_FILE, JSON.stringify({ batchId: '', generatedAt: '', tasks: [] }));
    } catch (e) {
      // tasksFile might be in a different directory, try creating it
    }
  }

  try {
    fs.watch(TASKS_FILE, function() {
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(function() {
        watchTimer = null;
        try {
          var data = fs.readFileSync(TASKS_FILE, 'utf8');
          var parsed = JSON.parse(data);
          if (win) win.webContents.send('tasks-updated', parsed);
        } catch (e) {}
      }, 500);
    });
  } catch (e) {
    // Watch error - not critical, polling will still work
  }
}

// ---- App lifecycle ----
app.whenReady().then(function() {
  createWindow();
  createTray();
  startFileSync();
});

app.on('window-all-closed', function() {});

app.on('before-quit', function() {
  isQuiting = true;
});
