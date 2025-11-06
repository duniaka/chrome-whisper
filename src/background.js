// WebWhispr Background Service Worker
// Manages offscreen document lifecycle and message routing

class BackgroundService {
    constructor() {
        this.offscreenDocument = null;
        this.activeTabId = null;
        this.isRecording = false;

        this.init();
    }

    init() {
        console.log('[Background] Initializing WebWhispr...');
        this.setupMessageListeners();
        this.setupActionListener();
    }

    setupMessageListeners() {
        // Listen for messages from content scripts and offscreen
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[Background] Received message:', message.type);

            switch (message.type) {
                case 'START_RECORDING':
                    this.handleStartRecording(sender.tab?.id);
                    sendResponse({ success: true });
                    break;

                case 'STOP_RECORDING':
                    this.handleStopRecording();
                    sendResponse({ success: true });
                    break;

                case 'OFFSCREEN_READY':
                    console.log('[Background] Offscreen document ready');
                    break;

                case 'AUDIO_RECORDED':
                    this.handleAudioRecorded(message.audio);
                    break;

                case 'RECORDING_ERROR':
                    this.handleRecordingError(message.error);
                    break;

                default:
                    console.log('[Background] Unknown message type:', message.type);
            }

            return true; // Keep channel open for async response
        });
    }

    setupActionListener() {
        // Handle clicks on the extension icon
        chrome.action.onClicked.addListener((tab) => {
            console.log('[Background] Extension icon clicked');

            if (!this.isRecording) {
                this.handleStartRecording(tab.id);
            } else {
                this.handleStopRecording();
            }
        });
    }

    async handleStartRecording(tabId) {
        console.log('[Background] Starting recording for tab:', tabId);

        this.activeTabId = tabId;
        this.isRecording = true;

        // Ensure offscreen document exists (processor will auto-initialize)
        await this.ensureOffscreenDocument();

        // Start recording immediately
        await this.sendToOffscreen({
            type: 'START_RECORDING'
        });

        // Update extension icon to show recording state
        this.updateIcon(true);

        // Notify content script
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                type: 'RECORDING_STARTED'
            });
        }
    }

    async handleStopRecording() {
        console.log('[Background] Stopping recording');

        this.isRecording = false;

        // Stop recording in offscreen
        await this.sendToOffscreen({
            type: 'STOP_RECORDING'
        });

        // Update extension icon
        this.updateIcon(false);

        // Notify content script
        if (this.activeTabId) {
            chrome.tabs.sendMessage(this.activeTabId, {
                type: 'RECORDING_STOPPED'
            });
        }
    }

    async handleAudioRecorded(audioData) {
        console.log('[Background] Audio recorded, length:', audioData.length);

        // TODO: Process audio with Whisper
        // For now, just send a placeholder
        const text = '[Audio recorded - transcription not yet implemented]';

        // Send to content script
        if (this.activeTabId) {
            try {
                await chrome.tabs.sendMessage(this.activeTabId, {
                    type: 'INSERT_TRANSCRIPTION',
                    text: text
                });
            } catch (error) {
                console.error('[Background] Failed to send to tab:', error);
                this.showNotification('Audio Recorded', 'Audio was recorded but could not be inserted');
            }
        }

        // Reset recording state
        this.isRecording = false;
        this.updateIcon(false);
    }

    handleRecordingError(error) {
        console.error('[Background] Recording error:', error);

        // Notify user
        this.showNotification('Recording Error', error);

        // Reset recording state
        this.isRecording = false;
        this.updateIcon(false);

        // Notify content script
        if (this.activeTabId) {
            chrome.tabs.sendMessage(this.activeTabId, {
                type: 'RECORDING_ERROR',
                error: error
            });
        }
    }

    async ensureOffscreenDocument() {
        // Check if offscreen document already exists
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) {
            console.log('[Background] Offscreen document already exists');
            return;
        }

        console.log('[Background] Creating offscreen document...');

        try {
            await chrome.offscreen.createDocument({
                url: 'offscreen/offscreen.html',
                reasons: ['USER_MEDIA', 'IFRAME_SCRIPTING'],
                justification: 'Recording audio from microphone and processing with Whisper AI'
            });

            console.log('[Background] Offscreen document created');

            // Wait for offscreen to be ready
            await new Promise(resolve => {
                const listener = (message) => {
                    if (message.type === 'OFFSCREEN_READY') {
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve();
                    }
                };
                chrome.runtime.onMessage.addListener(listener);

                // Timeout after 5 seconds
                setTimeout(resolve, 5000);
            });

        } catch (error) {
            console.error('[Background] Failed to create offscreen document:', error);
            throw error;
        }
    }

    async sendToOffscreen(message) {
        console.log('[Background] Sending to offscreen:', message.type);

        try {
            // Ensure offscreen document exists
            await this.ensureOffscreenDocument();

            // Send message
            const response = await chrome.runtime.sendMessage(message);
            return response;
        } catch (error) {
            console.error('[Background] Failed to send to offscreen:', error);
            throw error;
        }
    }

    updateIcon(isRecording) {
        const iconPath = isRecording ? {
            16: 'icons/icon16-recording.png',
            48: 'icons/icon48-recording.png',
            128: 'icons/icon128-recording.png'
        } : {
            16: 'icons/icon16.png',
            48: 'icons/icon48.png',
            128: 'icons/icon128.png'
        };

        // Only update if icons exist, otherwise use badge
        chrome.action.setIcon({ path: iconPath }).catch(() => {
            // Fallback to badge if icons don't exist
            chrome.action.setBadgeText({
                text: isRecording ? 'REC' : ''
            });

            chrome.action.setBadgeBackgroundColor({
                color: '#FF0000'
            });
        });

        // Update tooltip
        chrome.action.setTitle({
            title: isRecording ? 'Click to stop recording' : 'Click to start voice input'
        });
    }

    showNotification(title, message) {
        console.log('[Background] Notification:', title, message);

        // For now, just log. In production, you might want to use chrome.notifications API
        // or send to content script to show in-page notification
    }
}

// Initialize the background service
const backgroundService = new BackgroundService();

console.log('[Background] WebWhispr background service loaded');