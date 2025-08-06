module.exports = async function (deps) {

    const {
        fs,
        path,
        microbotDir,
        ipcMain,
        log
    } = deps

    const filePath = path.resolve(microbotDir, 'accounts.json');

    ipcMain.handle('read-accounts', async () => {
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                let accounts = JSON.parse(data);
                accounts.sort((a, b) => new Date(b.createdOn) - new Date(a.createdOn));
                // Use a Set to track unique display names
                const uniqueDisplayNames = new Set();

                // Filter the accounts array
                return accounts.filter(account => {
                    if (uniqueDisplayNames.has(account.displayName)) {
                        // If the displayName is already in the set, skip this account
                        return false;
                    } else {
                        // Otherwise, add the displayName to the set and include this account
                        if (!account.displayName) {
                            account.displayName = 'Not set'
                            return true;
                        } else {
                            uniqueDisplayNames.add(account.displayName);
                            return true;
                        }
                    }
                })
            }
        } catch (error) {
            log.error(error.message)
            return { error: error.message };
        }
    });


    ipcMain.handle('remove-accounts', async () => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            log.error(error.message)
            return { error: error.message };
        }
    });

    let lastModifiedTime = null;

    ipcMain.handle('check-file-change', async () => {
        try {
            let val = false;
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                const modifiedTime = stats.mtime;

                // Check if the modification time has changed
                if (!lastModifiedTime || modifiedTime > lastModifiedTime) {
                    log.info('File has been modified!');
                    lastModifiedTime = modifiedTime; // Update the last modification time
                    val = true;
                }
            }
            return val;
        } catch (error) {
            log.error(error.message)
            return { error: error.message };
        }
    });

    /*
    * Handler to write the preferred profile for a non Jagex account
    * A check will be made to see if the file exists, if not, create it
    * We write the selected profile to the file so it can be read later
    * when launching the client
    */
    ipcMain.handle('set-profile-no-jagex', async (event, profile) => {
        try {
            const profileFilePath = path.join(microbotDir, 'non-jagex-preferred-profile.json');
            if (!fs.existsSync(profileFilePath)) {
                fs.writeFileSync(profileFilePath, JSON.stringify({ profile: profile }, null, 2));
                return { success: true, path: profileFilePath };
            }
            fs.writeFileSync(profileFilePath, JSON.stringify({ profile: profile }, null, 2));
            return { success: true, path: profileFilePath };
        } catch (error) {
            log.error(error.message);
            return { error: error.message };
        }
    });

    /*
    * Different from set-profile-no-jagex, this one is for Jagex accounts
    * We find the account object in accounts.json that has the same name as the
    * accountID parameter, and set the profile property to that account object
    */
    ipcMain.handle('set-profile-jagex', async (event, accountID, profile) => {
        log.info(`Setting profile for Jagex account: ${accountID} to ${profile}`);
        try {
            if (fs.existsSync(filePath)) {
                const data = fs.readFileSync(filePath, 'utf8');
                let accounts = JSON.parse(data);
                const account = accounts.find(acc => acc.accountId === accountID);
                if (account) {
                    account.profile = profile;
                    fs.writeFileSync(filePath, JSON.stringify(accounts, null, 2));
                    return { success: true };
                } else {
                    return { error: 'Account not found' };
                }
            }
        } catch (error) {
            log.error(error.message);
            return { error: error.message };
        }
    });
}