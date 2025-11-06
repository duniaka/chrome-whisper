// WebWhispr Background Service Worker

class BackgroundService {
    constructor() {
        this.activeTabId = null;
        this.isRecording = false;
        this.setupMessageListeners();
        this.setupActionListener();
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'AUDIO_RECORDED':
                    this.handleAudioRecorded(message.audio);
                    break;
                case 'RECORDING_ERROR':
                    this.handleRecordingError(message.error);
                    break;
            }
            sendResponse({ success: true });
        });
    }

    setupActionListener() {
        chrome.action.onClicked.addListener((tab) => {
            if (!this.isRecording) {
                this.handleStartRecording(tab.id);
            } else {
                this.handleStopRecording();
            }
        });
    }

    async handleStartRecording(tabId) {
        this.activeTabId = tabId;
        this.isRecording = true;
        await this.ensureOffscreenDocument();
        await this.sendToOffscreen({ type: 'START_RECORDING' });
    }

    async handleStopRecording() {
        this.isRecording = false;
        await this.sendToOffscreen({ type: 'STOP_RECORDING' });
    }

    async handleAudioRecorded(audioData) {
        const text = '[Audio recorded - transcription not yet implemented]';
        if (this.activeTabId) {
            try {
                await chrome.tabs.sendMessage(this.activeTabId, {
                    type: 'INSERT_TRANSCRIPTION',
                    text: text
                });
            } catch (error) {
                // Silently fail if tab is closed or unavailable
            }
        }
        this.isRecording = false;
    }

    handleRecordingError(error) {
        this.isRecording = false;
    }

    async ensureOffscreenDocument() {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });

        if (existingContexts.length > 0) return;

        await chrome.offscreen.createDocument({
            url: 'offscreen/offscreen.html',
            reasons: ['USER_MEDIA', 'IFRAME_SCRIPTING'],
            justification: 'Recording audio from microphone'
        });
    }

    async sendToOffscreen(message) {
        try {
            await this.ensureOffscreenDocument();
            return await chrome.runtime.sendMessage(message);
        } catch (error) {
            // Silently fail
        }
    }
}

const backgroundService = new BackgroundService();