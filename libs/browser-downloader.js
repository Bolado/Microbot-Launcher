const axios = require("axios");
const path = require("path");
const fs = require("fs").promises;
const AdmZip = require("adm-zip");

const userHome = process.env.HOME || process.env.USERPROFILE;
const ASSETS_DIR = path.join(userHome, ".microbot", "assets");
const BROWSER_DIR = path.join(ASSETS_DIR, "browser");
const chromiumVersionsURL =
  "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json";

/**
 * Fetches the latest Chromium download URL for the specified platform.
 * @param {string} platform - The platform for which to fetch the download URL (e.g., 'win32', 'darwin', 'linux').
 * @returns {Promise<string>} - The download URL for the latest Chromium version.
 * @throws {Error} - If the platform is unsupported or if there is an error fetching the URL.
 */
async function getLatestChromiumDownloadURL(platform) {
  try {
    const response = await axios.get(chromiumVersionsURL);
    if (!response.data || !response.data.channels) {
      throw new Error("Invalid response from Chromium versions API.");
    }
    const platforms = response.data.channels.Stable.downloads["chrome"];
    console.log("Available platforms:", platforms);
    if (!platforms.length) {
      throw new Error("No download URLs available for the specified platform.");
    }
    let platformFormated;
    let downloadUrl;

    switch (platform) {
      case "win32":
        platformFormated = "win64";
        break;
      case "darwin":
        platformFormated = "mac-arm64";
        break;
      case "linux":
        platformFormated = "linux64";
        break;
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    platforms.forEach((item) => {
      if (item.platform === platformFormated) {
        downloadUrl = item.url;
      }
    });
    return downloadUrl;
  } catch (error) {
    console.error("Error fetching Chromium download URL:", error);
    throw error;
  }
}

/**
 * Downloads and extracts the Chromium browser for the specified platform.
 * @param {function} onProgress - Callback function to report download progress.
 * @returns {Promise<string>} - The path to the extracted browser executable.
 * @throws {Error} - If there is an error during download or extraction.
 * */
async function downloadAndExtractBrowser(onProgress) {
  const platform = process.platform;
  try {
    await fs.mkdir(ASSETS_DIR, { recursive: true });

    const downloadUrl = await getLatestChromiumDownloadURL(platform);
    if (!downloadUrl) {
      throw new Error(`Unsupported platform for Chromium: ${platform}`);
    }

    const fileName = path.basename(downloadUrl);
    const tempFilePath = path.join(ASSETS_DIR, fileName);

    onProgress(0, "Starting to download dependencies...");
    const response = await axios({
      method: "get",
      url: downloadUrl,
      responseType: "arraybuffer",
      onDownloadProgress: (progressEvent) => {
        const percent = Math.round(
          (progressEvent.loaded * 90) / progressEvent.total
        );
        onProgress(percent, `Downloading dependencies... (${percent}%)`);
      },
    });

    await fs.writeFile(tempFilePath, response.data);
    onProgress(90, "Extracting dependencies...");

    const zip = new AdmZip(tempFilePath);
    zip.extractAllTo(ASSETS_DIR, true);

    await fs.unlink(tempFilePath);

    const allFolders = await fs.readdir(ASSETS_DIR);
    let targetFolder = null;
    const browserFolders = allFolders.filter((folder) =>
      folder.toLowerCase().includes("chrome")
    );

    if (browserFolders.length > 0) {
      targetFolder = path.join(ASSETS_DIR, browserFolders[0]);
    }

    if (!targetFolder) {
      throw new Error(
        `No browser folder found. Available folders: ${allFolders.join(", ")}`
      );
    }

    console.log("Renaming:", targetFolder, "to", BROWSER_DIR);
    await fs.rename(targetFolder, BROWSER_DIR);

    onProgress(100, "Dependencies downloaded and extracted.");
    return getBrowserExecutablePath();
  } catch (error) {
    console.error("Error downloading or extracting browser:", error);
    throw error;
  }
}

/**
 * Returns the path to the browser executable based on the current platform.
 * @returns {string} - The path to the browser executable.
 * @throws {Error} - If the platform is unsupported.
 */
function getBrowserExecutablePath() {
  const platform = process.platform;
  let executablePath;
  switch (platform) {
    case "win32":
      executablePath = path.join(BROWSER_DIR, "chrome.exe");
      break;
    case "darwin":
      executablePath = path.join(
        BROWSER_DIR,
        "Google Chrome for Testing.app",
        "Contents",
        "MacOS",
        "Google Chrome for Testing"
      );
      break;
    case "linux":
      executablePath = path.join(BROWSER_DIR, "chrome");
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  return executablePath;
}

async function isBrowserDownloaded() {
  try {
    const executablePath = getBrowserExecutablePath();
    return await fs
      .access(executablePath, fs.constants.F_OK)
      .then(() => true)
      .catch(() => false);
  } catch (error) {
    console.error("Error checking browser existence:", error);
    return false;
  }
}

module.exports = {
  getLatestChromiumDownloadURL,
  downloadAndExtractBrowser,
  getBrowserExecutablePath,
  isBrowserDownloaded,
};
