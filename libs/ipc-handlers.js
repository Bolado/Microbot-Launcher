module.exports = async function (deps) {
  const {
    ipcMain,
    axios,
    microbotDir,
    packageJson,
    path,
    log,
    fs,
    projectDir,
    app,
  } = deps;

  const url = "https:/microbot.cloud";
  const filestorage = "https://files.microbot.cloud";

  const { startAuthFlow } = require("./oauth-jagex.js");
  const { isBrowserDownloaded } = require("./browser-util.js");

  ipcMain.handle("start-auth-flow", async () => {
    try {
      await startAuthFlow();
      return { success: true };
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("is-browser-downloaded", async () => {
    return await isBrowserDownloaded();
  });

  const propertiesHandler = require(path.join(
    projectDir,
    "libs/properties.js"
  ));
  await propertiesHandler(deps);
  const overwriteCredentialsHandler = require(path.join(
    projectDir,
    "libs/overwrite-credential-properties.js"
  ));
  await overwriteCredentialsHandler(deps);
  const accountLoaderHandler = require(path.join(
    projectDir,
    "libs/accounts-loader.js"
  ));
  await accountLoaderHandler(deps);
  const jarExecutorHandler = require(path.join(
    projectDir,
    "libs/jar-executor.js"
  ));
  await jarExecutorHandler(deps);
  const packageVersion = packageJson.version;

  ipcMain.handle("download-microbot-launcher", async (event) => {
    try {
      event.sender.send("progress", {
        percent: 70,
        status: "Downloading Microbot Jagex Launcher...",
      });
      const response = await axios.get(
        filestorage + "/assets/microbot-launcher/microbot-launcher.jar",
        { responseType: "arraybuffer" }
      );
      event.sender.send("progress", { percent: 80, status: "Finishing..." });
      const filePath = path.join(microbotDir, "microbot-launcher.jar");
      fs.writeFileSync(filePath, response.data);
      event.sender.send("progress", { percent: 80, status: "Completed!" });
      return { success: true, path: filePath };
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("download-client", async (event, version) => {
    version = String(version).replace(".jar", "");
    const url = `${filestorage}/releases/microbot/stable/microbot-${version}.jar`;
    try {
      event.sender.send("progress", {
        percent: 90,
        status: "Downloading Microbot-" + version + "",
      });
      if (fs.existsSync("microbot-" + version + ".jar"))
        return { success: true, path: "microbot-" + version + ".jar" };
      const response = await axios({
        method: "get",
        url: url,
        responseType: "arraybuffer",
        onDownloadProgress: (progressEvent) => {
          const totalLength = 126009591;
          const progress = ((progressEvent.loaded * 100) / totalLength).toFixed(
            2
          );
          let currentPercent = (10 + progress * 0.4).toFixed(2);
          event.sender.send("progress", {
            percent: currentPercent,
            status: `Downloading client ${version}... (${progress}%)`,
          });
        },
      });
      const filePath = path.join(microbotDir, "microbot-" + version + ".jar");
      fs.writeFileSync(filePath, response.data);
      event.sender.send("progress", { percent: 100, status: "Completed!" });
      return { success: true, path: filePath };
    } catch (error) {
      log.error(
        `Error downloading client ${version} from ${url}:`,
        error.message
      );
      return { error: error.message };
    }
  });

  ipcMain.handle("fetch-launcher-version", async () => {
    try {
      const response = await axios.get(url + "/api/version/launcher");
      return response.data;
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("fetch-client-version", async () => {
    try {
      const response = await axios.get(url + "/api/version/client");
      return response.data;
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("fetch-launcher-html-version", async () => {
    // uncomment the following code if you want to enable fetching launcher.html version
    // and also make sure to update the url
    //
    // try {
    //   const response = await axios.get(url + "/api/file/html");
    //   return response.data;
    // } catch (error) {
    //   log.error(error.message);
    //   return { error: error.message };
    // }
  });

  ipcMain.handle("download-launcher-html", async () => {
    // uncomment the following code if you want to enable downloading launcher.html
    // and also make sure to update the url
    //
    // try {
    //   const response = await axios.get(
    //     filestorage + "/assets/microbot-launcher/launcher.html",
    //     { responseType: "arraybuffer" }
    //   );
    //   const filePath = path.join(microbotDir, "launcher.html");
    //   fs.writeFileSync(filePath, response.data);
    //   return { success: true, path: filePath };
    // } catch (error) {
    //   log.error(error.message);
    //   return { error: error.message };
    // }
  });

  ipcMain.handle("client-exists", async (event, version) => {
    try {
      const filePath = path.join(microbotDir, "microbot-" + version);
      log.info(filePath);
      return fs.existsSync(filePath);
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("launcher-exists", async () => {
    try {
      const filePath = path.join(microbotDir, "microbot-launcher.jar");
      return fs.existsSync(filePath);
    } catch (error) {
      log.error(error.message);
      return { error: error.message };
    }
  });

  ipcMain.handle("list-jars", async () => {
    const files = fs.readdirSync(microbotDir, (err) => {
      if (err) {
        return console.log("Unable to scan directory: " + err);
      }
    });
    const regex = /\d/;
    return files.filter(
      (file) =>
        file.startsWith("microbot-") &&
        file.endsWith(".jar") &&
        regex.test(file)
    );
  });

  ipcMain.handle("launcher-version", async () => {
    return packageVersion;
  });

  ipcMain.handle("log-error", async (event, message) => {
    log.error(message);
  });
};
