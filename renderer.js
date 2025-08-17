let accounts = [];
let iii = null;

async function openClient() {
    const version = extractVersion(document.getElementById('client').value);
    await downloadClientIfNotExist(version);

    const proxy = getProxyValues();

    document.getElementById('loader-container').style.display = 'none';

    // Get the select element by its ID
    const selectElement = document.getElementById('character');

    // Get the selected value
    const selectedValue = selectElement.value;

    const selectedAccount = accounts?.find(
        (x) => x.accountId === selectedValue
    );
    if (selectedAccount) {
        await window.electron.overwriteCredentialProperties(selectedAccount);
        await window.electron.openClient(version, proxy, selectedAccount);
    } else {
        alert('Account not found. Please restart your client.');
    }
}

window.electron.ipcRenderer.receive('progress', (event, data) => {
    if (data) {
        updateProgress(data.percent, data.status);
    }
});

function updateProgress(percent, status) {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status');

    progressBar.style.width = percent + '%';
    progressBar.textContent = percent + '%';
    statusText.textContent = status;
}

async function playButtonClickHandler() {
    if (
        document.getElementById('play')?.innerText.toLowerCase() ===
        'Play With Jagex Account'.toLowerCase()
    ) {
        await openClient();
    } else {
        document.getElementById('play').classList.add('disabled');
        try {
            await window.electron.startAuthFlow();
        } catch (error) {
            alert('Authentication flow ended unexpectedly.');
            window.electron.logError(error);
        }
        document.getElementById('play').classList.remove('disabled');
    }
}

async function handleJagexAccountLogic(properties) {
    setInterval(async () => {
        const hasChanged = await window.electron.checkFileChange();
        if (hasChanged) {
            const oldNumberOfAccounts = accounts.length;
            accounts = await window.electron.readAccounts();
            const newNumberOfAccounts = accounts.length;

            const selectedProfile = document.getElementById('profile')?.value;
            const selectedCharacter =
                document.getElementById('character')?.value;

            setupSidebarLayout(accounts.length);

            const orderedClientJars = await orderClientJarsByVersion();
            populateSelectElement('client', orderedClientJars);
            populateProfileSelector(
                await window.electron.listProfiles(),
                selectedProfile
            );
            await setVersionPreference(properties);

            if (oldNumberOfAccounts !== newNumberOfAccounts) {
                const latestAccount = accounts[0];
                if (latestAccount) {
                    document.getElementById('character').value =
                        latestAccount.accountId;
                }
            } else {
                document.getElementById('character').value = selectedCharacter;
            }
        }
    }, 1000);
}

window.onerror = function myErrorHandler(errorMsg, url, lineNumber) {
    alert('Error occured: ' + errorMsg + ' - Version 1.0.5'); //or any message
    window.electron.logError(errorMsg);
    return false;
};
window.addEventListener('error', function (e) {
    if (e.error) {
        alert('Error occured: ' + e.error.stack + ' - Version 1.0.5'); //or any message
        window.electron.logError(e.error.stack);
    } else if (e.reason) {
        alert('Error occured: ' + e.reason.stack + ' - Version 1.0.5'); //or any message
        window.electron.logError(e.reason.stack);
    }
    return false;
});

window.addEventListener('unhandledrejection', (event) => {
    event.preventDefault(); // This will not print the error in the console });
    alert('Error occured: ' + event.reason.stack + ' - Version 1.0.5'); //or any message
    window.electron.logError(event.reason.stack);
});

window.addEventListener('load', async () => {
    const properties = await window.electron.readProperties();

    const launcherVersion = await window.electron.fetchLauncherVersion(); // jagex launcher version
    const clientVersion = await window.electron.fetchClientVersion();

    const microbotLauncherVersion = await window.electron.launcherVersion();

    document.querySelector('.titlebar-title').innerText =
        'Microbot Launcher - ' + microbotLauncherVersion;

    if (properties['launcher'] !== launcherVersion) {
        document.getElementById('loader-container').style.display = 'block';

        properties['launcher'] = launcherVersion;
        await window.electron.downloadMicrobotLauncher();
    }

    if (properties['client'] === '0.0.0') {
        document.getElementById('loader-container').style.display = 'block';
        properties['client'] = clientVersion;
        await window.electron.downloadClient(clientVersion);
    }

    document.getElementById('loader-container').style.display = 'none';

    await window.electron.writeProperties(properties);

    const playButton = document.getElementById('play');
    playButton?.removeEventListener('click', playButtonClickHandler);
    playButton?.addEventListener('click', playButtonClickHandler);

    /*
     * Whenever the profile select changes, we set the "preferred" profile on accounts.json
     * for the current selected account, if no jagex account is selected, we set on
     * the non-jagex-preferred-profile.json
     */
    document
        .getElementById('profile')
        .addEventListener('change', async (event) => {
            const selectedProfile = event.target.value;
            const selectedAccount = document.getElementById('character')?.value;
            if (selectedAccount && selectedAccount !== 'none') {
                await window.electron.setProfileJagexAccount(
                    selectedAccount,
                    selectedProfile
                );
            } else {
                await window.electron.setProfileNoJagexAccount(selectedProfile);
            }
        });

    /*
     * Whenever the character select changes, we attempt to set the "preferred" profile
     * for the selected account if it exists, otherwise we set the profile
     * to the default
     */
    document
        .getElementById('character')
        .addEventListener('change', async (event) => {
            const selectedAccount = event.target.value;
            const accounts = await window.electron.readAccounts();

            if (selectedAccount && selectedAccount !== 'none') {
                const account = accounts.find(
                    (x) => x.accountId === selectedAccount
                );
                if (account) {
                    const profile = account.profile || 'default';
                    document.getElementById('profile').value = profile;
                }
            } else {
                // If no account is selected, set the profile to the preferred non-Jagex account profile
                // If no profile is set, default to "default"
                const nonJagexProfile =
                    await window.electron.readNonJagexProfile();
                const profile = nonJagexProfile || 'default';
                document.getElementById('profile').value = profile;
            }
        });

    //Init buttons and UI
    await initUI(properties);

    await checkForClientUpdate(properties);

    iii = setInterval(async () => {
        const properties = await window.electron.readProperties();
        await checkForClientUpdate(properties);
    }, 5 * 60 * 1000); // 5 minutes

    await handleJagexAccountLogic(properties);

    document.querySelectorAll('.loadingButton').forEach((button) => {
        button.addEventListener('click', startLoading);
    });

    loadLandingPageWebview();
});

function populateSelectElement(selectId, options) {
    const selectElement = document.getElementById(selectId);

    // Clear any existing options
    selectElement.innerHTML = '';

    // Add each option from the array to the select element
    options.forEach((optionText) => addSelectElement(selectId, optionText));
}

function addSelectElement(selectId, option) {
    // Get the select element by its ID
    const selectElement = document.getElementById(selectId);

    // Create a new option element
    const newOption = document.createElement('option');

    // Set the value and text of the new option
    newOption.value = option;
    newOption.text = option;

    // Add the new option to the select element
    selectElement.appendChild(newOption);
}

function populateProfileSelector(profiles = [], selectedProfile = null) {
    // Get the select element by its ID
    const profileSelect = document.getElementById('profile');

    // Clear any existing options (optional)
    profileSelect.innerHTML = '';

    // Create a default "default" option
    const defaultOption = document.createElement('option');
    defaultOption.value = 'default';
    defaultOption.textContent = 'Default';
    profileSelect.appendChild(defaultOption);

    // Only try to populate if profiles are available and not empty
    if (Array.isArray(profiles) && profiles.length > 0) {
        profiles.forEach((profile) => {
            addSelectElement('profile', profile);
        });
    }

    if (selectedProfile) {
        profileSelect.value = selectedProfile;
    }
}

function populateAccountSelector(characters = [], selectedAccount = null) {
    // Get the select element by its ID
    const characterSelect = document.getElementById('character');

    // Clear any existing options (optional)
    characterSelect.innerHTML = '';

    // Create a default "none" option
    const defaultOption = document.createElement('option');
    defaultOption.value = 'none';
    defaultOption.textContent = 'None';
    characterSelect.appendChild(defaultOption);

    // Iterate over the characters array and create option elements
    characters.forEach((character) => {
        const option = document.createElement('option');
        option.value = character.accountId; // Set sessionId as the value
        option.textContent = character.displayName; // Set displayName as the text
        characterSelect.appendChild(option); // Add the option to the select element
    });

    if (selectedAccount) {
        characterSelect.value = selectedAccount;
    }
}

async function removeAccountsHandler() {
    const userConfirmed = confirm('Are you sure you want to proceed?');
    if (!userConfirmed) return;
    await window.electron.removeAccounts();
    document.getElementById('play').innerHTML = 'Login Jagex Account';
    document.querySelector('#add-accounts').style = 'display:none';
    document.querySelector('#logout').style = 'display:none';
    accounts = [];
    populateAccountSelector([]);
}

function setupLogoutButton() {
    const logoutBtn = document.getElementById('logout');
    logoutBtn?.removeEventListener('click', removeAccountsHandler);
    logoutBtn?.addEventListener('click', removeAccountsHandler);
}

function setupSidebarLayout(amountOfAccounts) {
    const selectedAccount = document.getElementById('character')?.value;
    const playJagexButton = document.getElementById('play');
    const playButtonsDiv = document.querySelector('.play-buttons');
    const logoutButton = document.getElementById('logout');
    const addAccountsButton = document.getElementById('add-accounts');
    const characterSelect = document.getElementById('character');
    const characterSelectLabel = document.querySelector(
        'label[for="character"]'
    );

    if (amountOfAccounts > 0) {
        playJagexButton.innerHTML = 'Play With Jagex Account';
        logoutButton.style.display = 'block';
        playButtonsDiv.style.display = 'flex';
        characterSelectLabel.style.display = 'block';
        characterSelect.style.display = 'block';
        addAccountsButton.style.display = 'block';
        populateAccountSelector(accounts, selectedAccount);
        setupLogoutButton();
        setupAddAccountsButton();
    } else {
        playJagexButton.innerHTML = 'Login Jagex Account';
        logoutButton.style.display = 'none';
        characterSelectLabel.style.display = 'none';
        characterSelect.style.display = 'none';
        addAccountsButton.style.display = 'none';
    }
}

async function addAccountsHandler() {
    const addAccountsButton = document.getElementById('add-accounts');
    addAccountsButton.classList.add('disabled');
    try {
        await window.electron.startAuthFlow();
    } catch (error) {
        alert('Authentication flow ended unexpectedly.');
        window.electron.logError(error);
    }
    document.getElementById('add-accounts').classList.remove('disabled');
}

function setupAddAccountsButton() {
    const addAccountsButton = document.getElementById('add-accounts');
    addAccountsButton?.removeEventListener('click', addAccountsHandler);
    addAccountsButton?.addEventListener('click', addAccountsHandler);
}

/**
 * Extracts the version number from a string.
 * e.g., "microbot-1.1.1.1.jar" becomes "1.9.6.1"
 * @param {string} versionString - The string containing the version.
 * @returns {string} The extracted version number.
 */
function extractVersion(versionString) {
    return versionString.replace(/^microbot-/, '').replace(/\.jar$/, '');
}

function playNoJagexAccount() {
    document
        .querySelector('#play-no-jagex-account')
        .addEventListener('click', async () => {
            const proxy = getProxyValues();
            const selectedVersion = document.getElementById('client').value;
            const version = extractVersion(selectedVersion);

            const selectedProfile =
                document.getElementById('profile').value || 'default';
            await window.electron.setProfileNoJagexAccount(selectedProfile);

            await downloadClientIfNotExist(version);
            await window.electron.playNoJagexAccount(version, proxy);
        });
}

async function downloadClientIfNotExist(version) {
    if (!(await window.electron.clientExists(version))) {
        window.electron.logError(
            `Client ${version} does not exist. Downloading...`
        );
        document.getElementById('loader-container').style.display = 'block';
        await window.electron.downloadClient(version);
    }
    window.electron.logError(`Client ${version} is ready.`);
}

function updateNowBtn() {
    document
        .querySelector('#update-now-btn')
        .addEventListener('click', async () => {
            if (iii) clearInterval(iii);
            document.querySelector('#update-available').style = 'display:none';
            document.getElementById('loader-container').style.display = 'block';
            const clientVersion = await window.electron.fetchClientVersion();
            await window.electron.downloadClient(clientVersion);
            addSelectElement('client', ['microbot-' + clientVersion + '.jar']);
            const properties = await window.electron.readProperties();
            properties['client'] = clientVersion;
            await window.electron.writeProperties(properties);
            document.getElementById('loader-container').style.display = 'none';
        });
}

function reminderMeLaterBtn() {
    document
        .querySelector('#remind-me-later-btn')
        .addEventListener('click', async () => {
            document.querySelector('#update-available').style = 'display:none';
        });
}

function getProxyValues() {
    // Get the value of the proxy IP
    var proxyIp = document.getElementById('proxy-ip').value;

    // Get the selected value of the proxy type
    var proxyType = document.getElementById('proxy-type').value;

    return {
        proxyIp,
        proxyType
    };
}

function startLoading(event) {
    const button = event.target;
    button.classList.add('loading');

    setTimeout(() => {
        button.classList.remove('loading');
    }, 1000);
}

async function setVersionPreference(properties) {
    if (properties['version_pref'] && properties['version_pref'] !== '0.0.0') {
        document.getElementById('client').value = properties['version_pref'];
    } else {
        properties['version_pref'] = document.getElementById('client').value;
        await window.electron.writeProperties(properties);
    }
    document
        .getElementById('client')
        .addEventListener('change', async (event) => {
            const selectedValue = event.target.value;
            const properties = await window.electron.readProperties();
            properties['version_pref'] = selectedValue;
            await window.electron.writeProperties(properties);
        });
}

async function titlebarButtons() {
    document.getElementById('minimize-btn').addEventListener('click', () => {
        window.electron.minimizeWindow();
    });

    document.getElementById('maximize-btn').addEventListener('click', () => {
        window.electron.maximizeWindow();
    });

    document.getElementById('close-btn').addEventListener('click', () => {
        window.electron.closeLauncher();
    });
}

async function initUI(properties) {
    updateNowBtn();
    reminderMeLaterBtn();
    playNoJagexAccount();
    titlebarButtons();

    const accounts = await window.electron.readAccounts();
    await setupSidebarLayout(accounts?.length || 0);

    const orderedClientJars = await orderClientJarsByVersion();
    populateSelectElement('client', orderedClientJars);
    populateProfileSelector(await window.electron.listProfiles(), null);
    await setVersionPreference(properties);
    document.querySelector('.game-info').style = 'display:block';
}

async function checkForClientUpdate(properties) {
    const clientVersion = await window.electron.fetchClientVersion();
    window.electron.logError(
        `Current client version: ${clientVersion}, properties client version: ${properties['client']}`
    );
    const listOfJars = await window.electron.listJars();
    if (listOfJars.length === 0) {
        window.electron.logError(
            'No client jars found. Please download a client.'
        );
    } else {
        window.electron.logError(
            `Available client jars: ${listOfJars.join(', ')}`
        );
    }
    if (
        properties['client'] !== clientVersion &&
        listOfJars.every((file) => file.indexOf(clientVersion) < 0)
    ) {
        document.querySelector('#update-available').style = 'display:flex';
    } else if (properties['client'] !== clientVersion) {
        properties['client'] = clientVersion;
        await window.electron.writeProperties(properties);
    }
}

/**
 * Initialize the webview for the embedded site.
 * This webview will load the Microbot landing page and manipulate some elements
 * so it looks more integrated with the launcher.
 */
function loadLandingPageWebview() {
    const webview = document.getElementById('website');
    const webviewOverlay = document.getElementById('embed-overlay');
    if (webview) {
        webview.src = 'https://www.themicrobot.com?source=launcher';
        webview.addEventListener('dom-ready', () => {
            try {
                webview
                    .executeJavaScript(
                        `(() => {
                            try {
                                const topDiscordHeaderContainer = document.querySelector("body > header > div.c-events-block.py-2 > div");
                                if (topDiscordHeaderContainer) topDiscordHeaderContainer.remove();
                                const topSeparator = document.querySelector("body > header > div.c-border-red.mb-2");
                                if (topSeparator) topSeparator.remove();
                                const cookieBanner = document.getElementById("cookie-banner");
                                if (cookieBanner) cookieBanner.remove();
                                const navContainer = document.querySelector("body > header > nav > div");
                                if (navContainer) navContainer.style.maxWidth = "100%";
                                const bodyHero = document.querySelector("body > main > section.c-main-header.c-main-header--home.py-5.d-flex.flex-column.justify-content-center");
                                if (bodyHero) bodyHero.style.minHeight = "600px";
                            } catch (err) {
                                console.error('Webview DOM manipulation error:', err);
                            }
                            return true; // signal completion
                        })();`
                    )
                    .then(() => {
                        setTimeout(() => {
                            if (webviewOverlay) {
                                webviewOverlay.classList.add('hidden');
                                const removeAfter = () => {
                                    webviewOverlay?.removeEventListener(
                                        'transitionend',
                                        removeAfter
                                    );
                                };
                                webviewOverlay.addEventListener(
                                    'transitionend',
                                    removeAfter
                                );
                            }
                        }, 50);
                    })
                    .catch((err) =>
                        console.error('executeJavaScript failed', err)
                    );
            } catch (injectionError) {
                console.error('Failed to inject into webview:', injectionError);
                if (webviewOverlay) {
                    webviewOverlay.classList.add('hidden');
                }
            }
        });
    }
}

/**
 * Order the client jars by version from latest to oldest.
 * @returns {Promise<string[]>} A promise that resolves to the ordered list of client jar file names.
 */
async function orderClientJarsByVersion() {
    const clientJars = await window.electron.listJars();
    clientJars.sort((a, b) => {
        const versionA_match = a.match(/-([\d\.]+)\.jar$/);
        const versionB_match = b.match(/-([\d\.]+)\.jar$/);

        if (versionA_match && versionB_match) {
            const partsA = versionA_match[1].split('.').map(Number);
            const partsB = versionB_match[1].split('.').map(Number);

            for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                const partA = partsA[i] || 0;
                const partB = partsB[i] || 0;
                if (partA !== partB) {
                    return partB - partA; // Sort descending
                }
            }
        }
        return 0;
    });
    return clientJars;
}
