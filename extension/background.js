const MESSAGE_TYPE_TRANSLATE = "YKW_TRANSLATE_TEXT";
const MESSAGE_TYPE_OPEN_TRANSLATION = "YKW_OPEN_TRANSLATION";
const DEFAULT_ERROR_MESSAGE = "Could not translate";
const CACHE_KEY_PREFIX = "translation:";
const CONTEXT_MENU_ID = "ykw-translate-selection";

// Single obvious place to change the backend endpoint if it moves.
const API_ENDPOINT = "http://localhost:3000/api/translate/";
const inFlightTranslations = new Map();

chrome.runtime.onInstalled.addListener(() => {
    ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
    ensureContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID || !tab || typeof tab.id !== "number") {
        return;
    }

    const text = readNonEmptyString(info.selectionText);

    if (!text) {
        return;
    }

    const options = typeof info.frameId === "number"
        ? { frameId: info.frameId }
        : undefined;

    chrome.tabs.sendMessage(
        tab.id,
        {
            type: MESSAGE_TYPE_OPEN_TRANSLATION,
            payload: { text }
        },
        options,
        () => {
            void chrome.runtime.lastError;
        }
    );
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || message.type !== MESSAGE_TYPE_TRANSLATE) {
        return false;
    }

    translateSelection(message.payload)
        .then(sendResponse)
        .catch(() => sendResponse({ ok: false, error: DEFAULT_ERROR_MESSAGE }));

    return true;
});

async function translateSelection(payload) {
    const text = readNonEmptyString(payload && payload.text);

    if (!text) {
        return { ok: false, error: DEFAULT_ERROR_MESSAGE };
    }

    const cacheKey = await createCacheKey(text);
    const cachedTranslation = await readCachedTranslation(cacheKey, text);

    if (cachedTranslation) {
        return cachedTranslation;
    }

    const existingRequest = inFlightTranslations.get(cacheKey);

    if (existingRequest) {
        return existingRequest;
    }

    const request = fetchTranslation(text)
        .then(async (result) => {
            if (result.ok) {
                await writeCachedTranslation(cacheKey, text, result);
            }

            return result;
        })
        .finally(() => {
            inFlightTranslations.delete(cacheKey);
        });

    inFlightTranslations.set(cacheKey, request);

    return request;
}

function ensureContextMenu() {
    chrome.contextMenus.removeAll(() => {
        chrome.contextMenus.create({
            id: CONTEXT_MENU_ID,
            title: "Translate to Kashmiri",
            contexts: ["selection"]
        });
    });
}

async function fetchTranslation(text) {
    try {
        const response = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ text })
        });

        const responseText = await response.text();
        const responseBody = safeParseJson(responseText);

        if (!response.ok) {
            return { ok: false, error: DEFAULT_ERROR_MESSAGE, status: response.status };
        }

        const normalizedTranslation = normalizeTranslationPayload(responseBody);

        if (!normalizedTranslation) {
            return { ok: false, error: DEFAULT_ERROR_MESSAGE, status: response.status };
        }

        return {
            ok: true,
            translatedString: normalizedTranslation.translatedString,
            transliteratedRomanString: normalizedTranslation.transliteratedRomanString
        };
    } catch (_error) {
        return { ok: false, error: DEFAULT_ERROR_MESSAGE };
    }
}

async function createCacheKey(text) {
    const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(text)
    );

    const digestBytes = Array.from(new Uint8Array(digest));
    const digestHex = digestBytes
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    return `${CACHE_KEY_PREFIX}${digestHex}`;
}

async function readCachedTranslation(cacheKey, text) {
    const cachedItems = await chrome.storage.local.get(cacheKey);
    const cachedEntry = cachedItems[cacheKey];

    if (!cachedEntry || cachedEntry.text !== text) {
        return null;
    }

    const translatedString = readNonEmptyString(cachedEntry.translatedString);
    const transliteratedRomanString = readNonEmptyString(cachedEntry.transliteratedRomanString);

    if (!translatedString || !transliteratedRomanString) {
        await chrome.storage.local.remove(cacheKey);
        return null;
    }

    return {
        ok: true,
        translatedString,
        transliteratedRomanString
    };
}

async function writeCachedTranslation(cacheKey, text, result) {
    await chrome.storage.local.set({
        [cacheKey]: {
            text,
            translatedString: result.translatedString,
            transliteratedRomanString: result.transliteratedRomanString,
            cachedAt: Date.now()
        }
    });
}

function safeParseJson(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.parse(value);
    } catch (_error) {
        return null;
    }
}

function normalizeTranslationPayload(responseBody) {
    if (!responseBody || typeof responseBody !== "object") {
        return null;
    }

    const candidates = [
        responseBody.data && responseBody.data.data,
        responseBody.data,
        responseBody
    ];

    for (const candidate of candidates) {
        const translatedString = readNonEmptyString(candidate && candidate.translatedString);
        const transliteratedRomanString = readNonEmptyString(candidate && candidate.transliteratedRomanString);

        if (translatedString && transliteratedRomanString) {
            return {
                translatedString,
                transliteratedRomanString
            };
        }
    }

    return null;
}

function readNonEmptyString(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}
