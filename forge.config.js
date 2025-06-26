const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './images/microbot_transparent.ico',
    ignore: [
    /^\/dist/,
    /^\/out/,
    /^\/artifacts/,
    /\.log$/,
    /\.zip$/,
    /\.exe$/,
    /\/\.git/,
    /\/\.github/,
    /\/test/,
    /\/node_modules\/\.bin/,
    /\/node_modules\/.*(electron|webpack|cross-env|@types|eslint).*/,
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'microbot_launcher',
        setupIcon: './images/microbot_transparent.ico',  // This sets the icon for Setup.exe
        iconUrl: 'https://files.microbot.cloud/assets/microbot-launcher/microbot_transparent.ico', // Required for Squirrel
        loadingGif: './images/microbot.gif', // Optional loading GIF for Squirrel
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
