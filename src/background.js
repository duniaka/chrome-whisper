// Background service worker for WebWhispr

console.log('WebWhispr: Background script loaded');

let offscreenDocumentCreated = false;
let settingsOpenedTimestamp = 0;

// Create offscreen document for audio processing
async function createOffscreenDocument() {
    // Check if offscreen document already exists
    const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
    });

    if (existingContexts.length > 0) {
        console.log('WebWhispr: Offscreen document already exists');
        offscreenDocumentCreated = true;
        return;
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen/offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Recording audio for speech-to-text transcription'
        });
        offscreenDocumentCreated = true;
        console.log('WebWhispr: Offscreen document created successfully');
    } catch (error) {
        if (error.message.includes('Only a single offscreen')) {
            // Already exists, that's fine
            offscreenDocumentCreated = true;
            console.log('WebWhispr: Offscreen document already exists (ok)');
        } else {
            console.error('WebWhispr: Failed to create offscreen document:', error);
            offscreenDocumentCreated = false;
        }
    }
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
    if (!offscreenDocumentCreated) {
        await createOffscreenDocument();
    }
}

// Handle messages from content scripts, popup, and offscreen document
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('WebWhispr: Background received message:', message.type);

    // From popup: Get settings
    if (message.type === 'GET_SETTINGS') {
        chrome.storage.sync.get(['modelSize', 'language'], (result) => {
            sendResponse({
                modelSize: result.modelSize || 'small',
                language: result.language || 'en'
            });
        });
        return true;
    }

    // From popup: Model or language changed
    if (message.type === 'MODEL_CHANGED' || message.type === 'LANGUAGE_CHANGED') {
        // Notify offscreen to reload model
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({
                type: 'RELOAD_MODEL'
            }).catch(() => {});
        }
        return;
    }

    // From popup: Test microphone
    if (message.type === 'TEST_MIC') {
        console.log('WebWhispr: TEST_MIC from popup');
        ensureOffscreenDocument().then(() => {
            setTimeout(() => {
                chrome.runtime.sendMessage({
                    type: 'START_RECORDING'
                }).catch(error => {
                    console.error('WebWhispr: Error in test:', error);
                });
            }, 100);
        });
        return;
    }

    // From popup: Stop test
    if (message.type === 'STOP_TEST') {
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({
                type: 'STOP_RECORDING'
            }).catch(() => {});
        }
        return;
    }

    // From content script: Start recording
    if (message.type === 'START_RECORDING' && sender.tab) {
        console.log('WebWhispr: START_RECORDING from content script');
        ensureOffscreenDocument().then(() => {
            // Give offscreen document a moment to initialize
            setTimeout(() => {
                // Forward to offscreen document
                chrome.runtime.sendMessage({
                    type: 'START_RECORDING'
                }).catch(error => {
                    console.error('WebWhispr: Error starting recording:', error);
                });
            }, 100);
        });
        return;
    }

    // From content script: Stop recording
    if (message.type === 'STOP_RECORDING' && sender.tab) {
        console.log('WebWhispr: STOP_RECORDING from content script');
        if (offscreenDocumentCreated) {
            chrome.runtime.sendMessage({
                type: 'STOP_RECORDING'
            }).catch(error => {
                console.error('WebWhispr: Error stopping recording:', error);
            });
        }
        return;
    }

    // From offscreen: Recording started
    if (message.type === 'RECORDING_STARTED') {
        // Notify content script to show indicator
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SHOW_RECORDING'
                }).catch(() => {});
            }
        });
        return;
    }

    // From offscreen: Processing
    if (message.type === 'PROCESSING') {
        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SHOW_PROCESSING'
                }).catch(() => {});
            }
        });
        return;
    }

    // From offscreen: Transcription complete
    if (message.type === 'TRANSCRIPTION_COMPLETE') {
        // Send text to content script for insertion
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'INSERT_TEXT',
                    text: message.text
                }).catch(() => {});
            }
        });
        return;
    }

    // From offscreen: Error
    if (message.type === 'ERROR') {
        // Notify content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    type: 'SHOW_ERROR',
                    error: message.error
                }).catch(() => {});
            }
        });
        return;
    }

    // From offscreen: Open mic settings
    if (message.type === 'OPEN_MIC_SETTINGS') {
        // Prevent duplicate opens within 2 seconds
        const now = Date.now();
        if (now - settingsOpenedTimestamp > 2000) {
            settingsOpenedTimestamp = now;
            chrome.tabs.create({
                url: `chrome://settings/content/siteDetails?site=chrome-extension://${chrome.runtime.id}`
            });
        }
        return;
    }

    // From offscreen: Model progress
    if (message.type === 'MODEL_PROGRESS') {
        // Could notify popup or content script about download progress
        console.log(`WebWhispr: Model ${message.status} ${message.progress}%`);
        return;
    }

    // From offscreen: Model ready
    if (message.type === 'MODEL_READY') {
        console.log('WebWhispr: Model is ready');
        return;
    }

    // From offscreen: Close offscreen document
    if (message.type === 'CLOSE_OFFSCREEN') {
        console.log('WebWhispr: Closing offscreen document to release microphone');
        chrome.offscreen.closeDocument().then(() => {
            console.log('WebWhispr: Offscreen document closed');
            offscreenDocumentCreated = false;
        }).catch(error => {
            console.error('WebWhispr: Error closing offscreen document:', error);
        });
        return;
    }
});

// Create offscreen document on installation
chrome.runtime.onInstalled.addListener(async () => {
    console.log('WebWhispr: Extension installed/updated');
    await createOffscreenDocument();
});

// Create offscreen document on startup
chrome.runtime.onStartup.addListener(async () => {
    console.log('WebWhispr: Browser started');
    await createOffscreenDocument();
});

// Initialize immediately
(async () => {
    console.log('WebWhispr: Initializing...');
    await createOffscreenDocument();
    console.log('WebWhispr: Background script ready');
})();
