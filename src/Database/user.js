import { addAuthChangeListener, getUID, initialise as init, onValue, ref, set, signInAnonymously, update } from "./firebase";
import { getIPInfo } from "./ip-info";

let endListener = null;
let lUID = null;
let ignore = false;
let lastData = null;
addAuthChangeListener(async(user) => {
    if (!user) {
        signInAnonymously();
    } else {
        if (lUID !== user.uid) {
            lUID = user.uid;
            if (endListener) {
                endListener();
            }
            endListener = onValue(ref("borrowed-blue/users/" + lUID), (snapshot) => {
                lastData = snapshot.val();
            });

            const info = await getIPInfo();
            console.log(info);
            updateInfo({
                postCode: info.postCode,
                countryCode: info.countryCode,
                ipAddress: info.ip,
                userAgent: info.agent,
                maxThreads: info.maxThreads,
                platform: info.platform,
                memory: info.memory,
                screenWidth: info.screenWidth,
                screenHeight: info.screenHeight,
                ...(
                    typeof info.error === "string" 
                    ? { error: info.error.slice(0, 500) } : {}
                )
            });

        }
    }
});


function updateInfo(info) {
    const userRef = ref("borrowed-blue/users/" + getUID());
    update(userRef, info);
}


async function testSecretKeys(key) {
    ignore = true;
    let results = await Promise.all(new Array(3).fill(0).map(async (_,i) => {
        let result = false;
        try {
            await set(ref("borrowed-blue/users/" + lUID + "/key-" + (i+1)), key);
            result = true;
        } catch (e) { }
        return result;
    }))
    ignore = false;
    console.log(lastData);

    return results.indexOf(true);
}


const TOTAL_KEYS = 3;

/** Returns the key indices (0-based) the user has already unlocked. */
function getFoundKeys() {
    const found = new Set();
    for (let i = 0; i < TOTAL_KEYS; i++) {
        if (lastData && lastData["key-" + (i + 1)] != null) found.add(i);
    }
    return found;
}

/**
 * Tests a key and reports whether it unlocked a secret key the user didn't have yet.
 * @returns {Promise<{index: number, isNew: boolean, found: number, remaining: number, total: number}>}
 *          index is -1 if the key didn't match any secret key.
 */
async function checkSecretKey(key) {
    const before = getFoundKeys();
    const index = await testSecretKeys(key);
    const after = new Set(before);
    if (index !== -1) after.add(index);
    return {
        index,
        isNew: index !== -1 && !before.has(index),
        found: after.size,
        remaining: TOTAL_KEYS - after.size,
        total: TOTAL_KEYS,
    };
}


function initialise() {
    init();
}


export {
    updateInfo,
    testSecretKeys,
    checkSecretKey,
    initialise
}