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
        this.setupMessageListeners();
        this.setupActionListener();
    }

    setupMessageListeners() {
        // Listen for messages from content scripts and offscreen
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'START_RECORDING':
                    this.handleStartRecording(sender.tab?.id);
                    sendResponse({ success: true });
                    break;

                case 'STOP_RECORDING':
                    this.handleStopRecording();
                    sendResponse({ success: true });
                    break;

                case 'AUDIO_RECORDED':
                    this.handleAudioRecorded(message);
                    break;

                case 'RECORDING_ERROR':
                    this.handleRecordingError(message.error);
                    break;
            }

            return true; // Keep channel open for async response
        });
    }

    setupActionListener() {
        // Handle clicks on the extension icon
        chrome.action.onClicked.addListener((tab) => {
            if (!this.isRecording) {
                this.handleStartRecording(tab.id);
            } else {
                this.handleStopRecording();
            }
        });
    }

    async handleStartRecording(tabId) {
        if (this.isRecording) {
            return;
        }

        this.activeTabId = tabId;
        this.isRecording = true;

        // Ensure offscreen document exists
        await this.ensureOffscreenDocument();

        // Start recording immediately
        await this.sendToOffscreen({
            type: 'START_RECORDING'
        });
    }

    async handleStopRecording() {
        this.isRecording = false;

        // Stop recording in offscreen
        await this.sendToOffscreen({
            type: 'STOP_RECORDING'
        });

        // Notify content script
        if (this.activeTabId) {
            chrome.tabs.sendMessage(this.activeTabId, {
                type: 'RECORDING_STOPPED'
            });
        }
    }

    async handleAudioRecorded(data) {
        // If text is provided, use it; otherwise use placeholder
        const text = data.text || '[Audio recorded - transcription not yet implemented]';

        // Send to content script
        if (this.activeTabId) {
            await chrome.tabs.sendMessage(this.activeTabId, {
                type: 'INSERT_TRANSCRIPTION',
                text: text
            });
        }

        // Reset recording state
        this.isRecording = false;
    }

    handleRecordingError(error) {
        // Reset recording state
        this.isRecording = false;
    }

    async ensureOffscreenDocument() {
        // Check if offscreen document already exists
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) {
            return;
        }

        await chrome.offscreen.createDocument({
            url: 'offscreen/offscreen.html',
            reasons: ['USER_MEDIA', 'IFRAME_SCRIPTING'],
            justification: 'Recording audio from microphone and processing with Whisper AI'
        });
    }

    async sendToOffscreen(message) {
        // Ensure offscreen document exists
        await this.ensureOffscreenDocument();

        // Send message
        const response = await chrome.runtime.sendMessage(message);
        return response;
    }

}

// Initialize the background service
const backgroundService = new BackgroundService();