// Background service worker for WebWhispr

import { CONFIG, MESSAGE_TYPES } from './config.js';
import logger from './logger.js';
import InitializationManager from './initializationManager.js';

let offscreenDocumentCreated = false;
let settingsOpenedTimestamp = 0;
const offscreenInitManager = new InitializationManager();

// Create offscreen document for audio processing
async function createOffscreenDocument() {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        offscreenDocumentCreated = true;
        return;
    }

    try {
        await chrome.offscreen.createDocument({
            url: CONFIG.OFFSCREEN_HTML,
            reasons: ['USER_MEDIA'],
            justification: 'Recording audio for speech-to-text transcription'
        });
        offscreenDocumentCreated = true;
        logger.log('Offscreen document created');
    } catch (error) {
        if (error.message.includes('Only a single offscreen')) {
            // Already exists, that's fine
            offscreenDocumentCreated = true;
        } else {
            logger.error('Failed to create offscreen document:', error);
            offscreenDocumentCreated = false;
            throw error;
        }
    }
}

// Ensure offscreen document exists using initialization manager
async function ensureOffscreenDocument() {
    return offscreenInitManager.initialize(createOffscreenDocument);
}

// Helper function to safely send message to active tab
function sendToActiveTab(message) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs?.[0]?.id) {
            chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
        }
    });
}

// Message handlers organized by source
const messageHandlers = {
    // Popup handlers
    [MESSAGE_TYPES.GET_SETTINGS]: (message, sender, sendResponse) => {
        chrome.storage.sync.get(['modelSize', 'language'], (result) => {
            sendResponse({
                modelSize: result.modelSize || CONFIG.DEFAULTS.MODEL_SIZE,
                language: result.language || CONFIG.DEFAULTS.LANGUAGE
            });
        });
        return true;
    },

    [MESSAGE_TYPES.MODEL_CHANGED]: () => {
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RELOAD_MODEL }).catch(() => {});
        }
    },

    [MESSAGE_TYPES.LANGUAGE_CHANGED]: () => {
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({ type: MESSAGE_TYPES.RELOAD_MODEL }).catch(() => {});
        }
    },

    [MESSAGE_TYPES.TEST_MIC]: () => {
        ensureOffscreenDocument()
            .then(() => chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_RECORDING }))
            .catch(error => logger.error('Error in test:', error));
    },

    [MESSAGE_TYPES.STOP_TEST]: () => {
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STOP_RECORDING }).catch(() => {});
        }
    },

    // Content script handlers
    [`${MESSAGE_TYPES.START_RECORDING}:tab`]: () => {
        ensureOffscreenDocument()
            .then(() => chrome.runtime.sendMessage({ type: MESSAGE_TYPES.START_RECORDING }))
            .catch(error => logger.error('Error starting recording:', error));
    },

    [`${MESSAGE_TYPES.STOP_RECORDING}:tab`]: () => {
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({ type: MESSAGE_TYPES.STOP_RECORDING }).catch(error => {
                logger.error('Error stopping recording:', error);
            });
        }
    },

    // Offscreen handlers
    [MESSAGE_TYPES.RECORDING_STARTED]: () => {
        sendToActiveTab({ type: MESSAGE_TYPES.SHOW_RECORDING });
    },

    [MESSAGE_TYPES.PROCESSING]: () => {
        sendToActiveTab({ type: MESSAGE_TYPES.SHOW_PROCESSING });
    },

    [MESSAGE_TYPES.TRANSCRIPTION_COMPLETE]: (message) => {
        sendToActiveTab({
            type: MESSAGE_TYPES.INSERT_TEXT,
            text: message.text
        });
    },

    [MESSAGE_TYPES.ERROR]: (message) => {
        sendToActiveTab({
            type: MESSAGE_TYPES.SHOW_ERROR,
            error: message.error
        });
    },

    [MESSAGE_TYPES.OPEN_MIC_SETTINGS]: () => {
        // Prevent duplicate opens within 2 seconds
        const now = Date.now();
        if (now - settingsOpenedTimestamp > CONFIG.SETTINGS_DEBOUNCE) {
            settingsOpenedTimestamp = now;
            chrome.tabs.create({
                url: `chrome://settings/content/siteDetails?site=${CONFIG.EXTENSION_ID_PATH}`
            });
        }
    },

    [MESSAGE_TYPES.MODEL_PROGRESS]: (message) => {
        logger.log(`Model ${message.status} ${message.progress}%`);
    },

    [MESSAGE_TYPES.MODEL_READY]: () => {
        logger.log('Model ready');
    },

    [MESSAGE_TYPES.CLOSE_OFFSCREEN]: () => {
        chrome.offscreen.closeDocument().then(() => {
            offscreenDocumentCreated = false;
        }).catch(error => {
            logger.error('Error closing offscreen document:', error);
        });
    }
};

// Main message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Determine handler key based on message type and sender
    let handlerKey = message.type;
    if (sender.tab) {
        handlerKey = `${message.type}:tab`;
    }

    const handler = messageHandlers[handlerKey] || messageHandlers[message.type];

    if (handler) {
        const result = handler(message, sender, sendResponse);
        // If handler returns true, response is async
        if (result === true) return true;
    }
});

// Create offscreen document on installation
chrome.runtime.onInstalled.addListener(async () => {
    logger.log('Extension installed/updated');
    await createOffscreenDocument();
});

// Create offscreen document on startup
chrome.runtime.onStartup.addListener(async () => {
    logger.log('Browser started');
    await createOffscreenDocument();
});

// Initialize immediately
(async () => {
    logger.log('Initializing background script');
    await createOffscreenDocument();
    logger.log('Background script ready');
})();
