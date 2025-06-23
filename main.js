const {app, BrowserWindow, dialog, shell} = require('electron');
const {microbotDir} = require("./libs/dir-module");
const path = require('path');
const {ipcMain} = require('electron');
const fs = require('fs');
const axios = require('axios');
const https = require('https');
const AdmZip = require('adm-zip');
const {readPropertiesFile, writePropertiesFile} = require("./libs/properties");
const {readAccountsJson, removeAccountsJson, checkFileModification} = require("./libs/accounts-loader");
const {overwrite} = require("./libs/overwrite-credential-properties");
const {logMessage, logError} = require("./libs/logger");


const url = 'https:/microbot.cloud'
const filestorage = 'https://files.microbot.cloud'

const packageJsonPath = path.join(__dirname, 'package.json');
const packageJson = require(packageJsonPath);
const packageVersion = packageJson.version;

let splash;
let mainWindow;
let jarExecutor;
let accountLoader;
let dirModule;
let logger;
let credentialProperties
let properties;

// Ensure the .microbot directory exists
if (!fs.existsSync(microbotDir)) {
    fs.mkdirSync(microbotDir);
}


// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
}


function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }

    const ChildProcess = require('child_process');
    const path = require('path');

    const appFolder = path.resolve(process.execPath, '..');
    const rootAtomFolder = path.resolve(appFolder, '..');
    const updateDotExe = path.resolve(path.join(rootAtomFolder, 'Update.exe'));
    const exeName = path.basename(process.execPath);

    const spawn = function (command, args) {
        let spawnedProcess;

        try {
            spawnedProcess = ChildProcess.spawn(command, args, {detached: true});
        } catch (error) {
        }

        return spawnedProcess;
    };

    const spawnUpdate = function (args) {
        return spawn(updateDotExe, args);
    };

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            // Optionally do things such as:
            // - Add your .exe to the PATH
            // - Write to the registry for things like file associations and
            //   explorer context menus

            const iconPath = path.join(__dirname, '../../../app.ico');

            // Install desktop and start menu shortcuts
            spawnUpdate(['--createShortcut=' + exeName, '--shortcut-locations=StartMenu,Desktop', `--icon=${iconPath}`]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-uninstall':
            // Undo anything you did in the --squirrel-install and
            // --squirrel-updated handlers

            // Remove desktop and start menu shortcuts
            spawnUpdate(['--removeShortcut', exeName]);

            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-obsolete':
            // This is called on the outgoing version of your app before
            // we update to the new version - it's the opposite of
            // --squirrel-updated

            app.quit();
            return true;
    }
}


async function downloadFileFromBlobStorage(blobPath, dir, filename) {
    try {
        // Construct the URL, including the dir only if it's provided
        const url = dir ? `${blobPath}/${dir}/${filename}` : `${blobPath}/${filename}`;

        const response = await axios.get(url,
            {responseType: 'arraybuffer'})
        // Step 2: Determine the path to save the file

        // Ensure the directory exists
        if (dir) {
            const dirPath = path.join(microbotDir, dir);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, {recursive: true});
            }
            const filePath = path.join(dirPath, filename);
            fs.writeFileSync(filePath, response.data);
            return filePath
        }

        // Step 3: Save the file
        const filePath = path.join(microbotDir, filename);
        fs.writeFileSync(filePath, response.data);

        return filePath
    } catch (err) {
        logError(err)
    }

    return ""
}

async function createWindow() {

    // Create the splash screen window
    splash = new BrowserWindow({
        width: 400,
        height: 300,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        icon: path.join(__dirname, 'images/microbot_transparent.ico'),
    });


    const splashPath = await downloadFileFromBlobStorage(filestorage + '/assets/microbot-launcher', '', 'splash.html')

    await splash.loadFile(splashPath ? splashPath : 'splash.html');

    jarExecutor = await loadRemoteLibrary('jar-executor.js')
    accountLoader = await loadRemoteLibrary('accounts-loader.js')
    dirModule = await loadRemoteLibrary('dir-module.js')
    logger = await loadRemoteLibrary('logger.js')
    credentialProperties = await loadRemoteLibrary('overwrite-credential-properties.js')
    properties = await loadRemoteLibrary('properties.js')

    // Create the main window, but don't show it yet
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false, // Don't show the main window immediately
        title: 'Microbot Launcher',
        autoHideMenuBar: true,
        icon: path.join(__dirname, 'images/microbot_transparent.ico'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: true,
            contextIsolation: true,
        },
    });

    await downloadFileFromBlobStorage(filestorage + '/assets/microbot-launcher', 'css', 'styles.css')
    const indexHtmlPath = await downloadFileFromBlobStorage(filestorage + '/assets/microbot-launcher', '', 'index.html')

    await mainWindow.loadFile(indexHtmlPath ? indexHtmlPath : 'index.html');

    setTimeout(() => {
        splash.destroy();
        mainWindow.show();
    }, 1000);

}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', async function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('download-jcef', async (event) => {
    try {
        event.sender.send('progress', {percent: 10, status: 'Downloading...'});

        const response = await axios({
            method: 'get',
            url: url + '/assets/microbot-launcher/jcef-bundle.zip',
            responseType: 'arraybuffer',
            onDownloadProgress: (progressEvent) => {
                const totalLength = 126009591;

                const progress = ((progressEvent.loaded * 100) / totalLength).toFixed(2);  // Keep two decimal places
                let currentPercent = (10 + (progress * 0.4)).toFixed(2);  // Map the progress to 10%-50%
                event.sender.send('progress', {percent: currentPercent, status: `Downloading... (${progress}%)`});
            }
        });

        event.sender.send('progress', {percent: 50, status: 'Saving file...'});


        event.sender.send('progress', {percent: 55, status: 'Unpacking file...'});

        // Step 2: Determine the path to save the ZIP file
        const zipFilePath = path.join(microbotDir, 'jcef-bundle.zip');

        // Step 3: Save the ZIP file
        fs.writeFileSync(zipFilePath, response.data);

        // Step 4: Unpack the ZIP file
        const zip = new AdmZip(zipFilePath);
        const extractPath = microbotDir;

        zip.extractAllTo(extractPath, true);

        event.sender.send('progress', {percent: 60, status: 'Cleaning up...'});


        // Optionally, delete the ZIP file after extraction
        fs.unlinkSync(zipFilePath);

        // Return a success message or the path where the files were extracted
        return {success: true, path: extractPath};
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('download-microbot-launcher', async (event) => {
    try {
        event.sender.send('progress', {percent: 70, status: 'Downloading Microbot Jagex Launcher...'});

        const response = await axios.get(url + '/assets/microbot-launcher/microbot-launcher.jar',
            {responseType: 'arraybuffer'})  // Ensure the response is treated as binary data);


        event.sender.send('progress', {percent: 80, status: 'Finishing...'});

        const filePath = path.join(microbotDir, 'microbot-launcher.jar');


        // Step 3: Save the file
        fs.writeFileSync(filePath, response.data);

        event.sender.send('progress', {percent: 80, status: 'Completed!'});

        // Return a success message or the path where the file was saved
        return {success: true, path: filePath};
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});


ipcMain.handle('download-client', async (event, version) => {
    try {
        event.sender.send('progress', {percent: 90, status: 'Downloading Microbot-' + version + ''});

        if (fs.existsSync('microbot-' + version + '.jar'))
            return {success: true, path: 'microbot-' + version + '.jar'}

        const response = await axios({
            method: 'get',
            url: url + 'releases/microbot/stable/microbot-' + version + '.jar',
            responseType: 'arraybuffer',
            onDownloadProgress: (progressEvent) => {
                const totalLength = 126009591;

                const progress = ((progressEvent.loaded * 100) / totalLength).toFixed(2);  // Keep two decimal places
                let currentPercent = (10 + (progress * 0.4)).toFixed(2);  // Map the progress to 10%-50%
                event.sender.send('progress', {
                    percent: currentPercent,
                    status: `Downloading client ${version}... (${progress}%)`
                });
            }
        });

        const filePath = path.join(microbotDir, 'microbot-' + version + '.jar');

        // Step 3: Save the file
        fs.writeFileSync(filePath, response.data);

        event.sender.send('progress', {percent: 100, status: 'Completed!'});

        // Return a success message or the path where the file was saved
        return {success: true, path: filePath};
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('write-properties', async (event, data) => {
    try {
        writePropertiesFile(data)
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('fetch-launcher-version', async () => {
    try {
        const response = await axios.get(url + '/api/file/launcher');
        return response.data;
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('fetch-client-version', async () => {
    try {
        const response = await axios.get(url + '/api/file/client');
        return response.data;
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('fetch-launcher-html-version', async () => {
    try {
        const response = await axios.get(url + '/api/file/html');
        return response.data;
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('read-properties', async () => {
    try {
        return readPropertiesFile();
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('open-launcher', async () => {
    try {
        const filePath = path.join(microbotDir, 'jcef-bundle');
        const launcherPath = path.join(microbotDir, 'microbot-launcher.jar');

        jarExecutor.executeJar(
            [
                `-Djava.library.path=${filePath}`,
                '-jar',
                launcherPath
            ],
            dialog
        );
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('open-client', async (event, version, proxy) => {
    try {
        const jarPath = path.join(microbotDir, 'microbot-' + version + ".jar");

        const commandArgs = [
            '-jar',
            jarPath,
            '-proxy=' + proxy.proxyIp,
            '-proxy-type=' + proxy.proxyType
        ];

        jarExecutor.checkJavaAndRunJar(
            commandArgs,
            dialog,
            shell,
            mainWindow
        );
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('jcef-exists', async () => {
    try {
        const filePath = path.join(microbotDir, 'jcef-bundle');
        return fs.existsSync(filePath)
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});


ipcMain.handle('client-exists', async (event, version) => {
    try {
        const filePath = path.join(microbotDir, version);
        return fs.existsSync(filePath)
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('launcher-exists', async () => {
    try {
        const filePath = path.join(microbotDir, 'microbot-launcher.jar');
        return fs.existsSync(filePath)
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('read-accounts', async () => {
    try {
        return readAccountsJson()
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('overwrite-credential-properties', async (event, character) => {
    try {
        overwrite(character)
        return {success: 'Succesfull'}
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('remove-accounts', async () => {
    try {
        removeAccountsJson()
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('check-file-change', async () => {
    try {
        return checkFileModification()
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('play-no-jagex-account', async (event, version, proxy) => {
    try {
        const jarPath = path.join(microbotDir, 'microbot-' + version + ".jar");
        jarExecutor.checkJavaAndRunJar(
            [
                '-jar',
                jarPath,
                '-clean-jagex-launcher',
                '-proxy=' + proxy.proxyIp,
                '-proxy-type=' + proxy.proxyType
            ],
            dialog,
            shell,
            mainWindow
        );
    } catch (error) {
        logMessage(error.message)
        return {error: error.message};
    }
});

ipcMain.handle('list-jars', async () => {
    const files = fs.readdirSync(microbotDir, (err) => {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
    });

    const regex = /\d/;

    return files.filter(file => file.startsWith('microbot-') && file.endsWith('.jar') && regex.test(file))
});

ipcMain.handle('launcher-version', async () => {
    return packageVersion
});

ipcMain.handle('log-error', async (event, message) => {
    logError(message)
});

async function loadRemoteLibrary(fileName) {
    const remoteUrl = filestorage + `/assets/microbot-launcher/libs/${fileName}`;
    const localPath = path.join(__dirname, `libs/${fileName}`);

    try {
        await downloadAndSaveFile(remoteUrl, localPath);
        return require(localPath)
    } catch (error) {
        dialog.showErrorBox('Error', 'Error loading remote module ' + fileName + " with error " + error.message)
        logError('Error loading module ' + remoteUrl)
    }
}

async function downloadAndSaveFile(remoteUrl, localPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(localPath);
        https.get(remoteUrl, (response) => {
            if (response.statusCode === 200) {
                response.pipe(file);
                file.on('finish', () => {
                    file.close(resolve);
                });
            } else {
                dialog.showErrorBox('Failed to load js files!', 'Failed to load ' + localPath)
                reject(new Error(`Failed to download file: ${response.statusCode}`));
            }
        }).on('error', (err) => {
            fs.unlink(localPath, () => reject(err));
        });
    });
}