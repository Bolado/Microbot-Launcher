const { app, BrowserWindow, dialog, shell } = require("electron");
const { microbotDir } = require("./libs/dir-module");
const path = require("path");
const fs = require("fs");
const axios = require("axios");
const https = require("https");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const { ipcMain } = require("electron");
const AdmZip = require("adm-zip");
const packageJson = require(path.join(__dirname, "package.json"));
const { spawn } = require("child_process");
process.on("uncaughtException", (error) => {
  log.error("Uncaught Exception:", error);
});

let mainWindow = null;

// Ensure the .microbot directory exists
if (!fs.existsSync(microbotDir)) {
  fs.mkdirSync(microbotDir);
}

async function loadLibraries() {
  // Load remote ipc-handlers.js from filestorage
  log.info("load libraries...");
  try {
    log.info("require ipcHandlers...");
    const handler = require(path.join(__dirname, "libs/ipc-handlers.js"));
    const deps = {
      AdmZip: AdmZip,
      axios: axios,
      ipcMain: ipcMain,
      microbotDir: microbotDir,
      packageJson: packageJson,
      path: path,
      log: log,
      spawn: spawn,
      dialog: dialog,
      shell: shell,
      projectDir: __dirname,
      fs: fs,
      app: app,
      mainWindow: mainWindow,
    };
    if (typeof handler === "function") {
      await handler(deps);
    } else {
      log.error("ipcHandlers does not export a function");
    }
    log.info("done require ipchandler...");
  } catch (error) {
    log.error("Error requiring ipcHandlers:", error);
  }
}
async function createWindow() {
  // Create the main window, but don't show it yet
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Don't show the main window immediately
    title: "Microbot Launcher",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "images/microbot_transparent.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: true,
      contextIsolation: true,
    },
    titleBarStyle: "hidden",
    frame: false,
  });
  if (process.platform === "darwin") {
    mainWindow.setWindowButtonVisibility(false);
  }
  const extraHandlers = require(path.join(
    __dirname,
    "libs/extra-ipc-handlers.js"
  ));
  extraHandlers(app, ipcMain, mainWindow);

  await mainWindow.loadFile(path.join(__dirname, "index.html"));
}

autoUpdater.autoDownload = false;
autoUpdater.disableWebInstaller = true;
autoUpdater.on("update-available", (info) => {
  dialog
    .showMessageBox({
      type: "info",
      title: "Update available",
      message: `Version ${info.version} of the launcher is available. Do you want to download it now?`,
      buttons: ["Yes", "Later"],
    })
    .then((result) => {
      dialog.showMessageBox({
        type: "info",
        title: "Downloading",
        message: `Downloading version ${info.version} of the launcher...`,
      });
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
      }
    });
});
autoUpdater.on("update-downloaded", () => {
  dialog
    .showMessageBox({
      title: "Install Updates",
      message:
        "Updates downloaded. The application will now quit and install the updates.",
    })
    .then(() => {
      autoUpdater.quitAndInstall();
    });
});
app.whenReady().then(async () => {
  log.info("App starting...");
  await loadLibraries();
  await createWindow();
  if (process.env.DEBUG !== "true") {
    mainWindow.show();
    autoUpdater.checkForUpdates();
  } else {
    mainWindow.show();
  }
});
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});
