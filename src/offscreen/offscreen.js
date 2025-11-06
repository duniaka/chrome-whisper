// WebWhispr Offscreen Document
// Manages recording iframe

class OffscreenManager {
    constructor() {
        this.recordingIframe = null;
        this.processorIframe = null;

        this.init();
    }

    init() {
        console.log('[Offscreen] Initializing...');
        this.createProcessorIframe();
        this.setupMessageListeners();
    }

    setupMessageListeners() {
        // Listen for messages from the background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[Offscreen] Received message:', message);

            switch (message.type) {
                case 'START_RECORDING':
                    this.startRecording();
                    sendResponse({ success: true });
                    break;

                case 'STOP_RECORDING':
                    this.stopRecording();
                    sendResponse({ success: true });
                    break;

                default:
                    console.log('[Offscreen] Unknown message type:', message.type);
            }

            return true; // Keep channel open for async response
        });

        // Listen for messages from recording iframe
        window.addEventListener('message', (event) => {
            this.handleIframeMessage(event);
        });
    }

    handleIframeMessage(event) {
        // Handle messages from recording iframe
        const { type, data } = event.data || {};

        console.log('[Offscreen] Iframe message:', type, 'from', event.origin);

        switch (type) {
            case 'RECORDING_READY':
                console.log('[Offscreen] Recording iframe ready');
                break;

            case 'RECORDING_DATA':
                console.log('[Offscreen] Received audio data from recording iframe');
                this.handleAudioData(data.audio);
                // Remove recording iframe after getting the audio
                this.removeRecordingIframe();
                break;

            case 'RECORDING_ERROR':
                console.error('[Offscreen] Recording error:', data.error);
                this.removeRecordingIframe();
                chrome.runtime.sendMessage({
                    type: 'RECORDING_ERROR',
                    error: data.error
                });
                break;
        }
    }

    startRecording() {
        console.log('[Offscreen] Starting recording...');

        // Create recording iframe if it doesn't exist
        if (!this.recordingIframe) {
            this.createRecordingIframe();
        } else {
            // Send message to existing recording iframe to start
            this.recordingIframe.contentWindow.postMessage({
                type: 'START_RECORDING'
            }, '*');
        }
    }

    stopRecording() {
        console.log('[Offscreen] Stopping recording...');

        if (this.recordingIframe) {
            // Send message to recording iframe to stop and send data
            this.recordingIframe.contentWindow.postMessage({
                type: 'STOP_RECORDING'
            }, '*');
        }
    }

    createRecordingIframe() {
        console.log('[Offscreen] Creating recording iframe...');

        const container = document.getElementById('iframe-container');

        // Create the iframe element
        const iframe = document.createElement('iframe');
        iframe.id = 'recording-iframe';

        // Use the actual HTML file from the extension
        iframe.src = chrome.runtime.getURL('offscreen/recorder.html');

        // Add to container
        container.appendChild(iframe);
        this.recordingIframe = iframe;
    }

    removeRecordingIframe() {
        console.log('[Offscreen] Removing recording iframe...');

        if (this.recordingIframe) {
            this.recordingIframe.remove();
            this.recordingIframe = null;
        }
    }

    async handleAudioData(audioData) {
        console.log('[Offscreen] Received audio data, sending to processor...');

        // Send audio to processor iframe for transcription
        if (this.processorIframe) {
            this.processorIframe.contentWindow.postMessage({
                type: 'TRANSCRIBE',
                audio: audioData
            }, '*');
        }
    }

    createProcessorIframe() {
        console.log('[Offscreen] Creating processor iframe...');

        const container = document.getElementById('iframe-container');

        // Create the iframe element
        const iframe = document.createElement('iframe');
        iframe.id = 'processor-iframe';
        iframe.src = 'https://duniaka.github.io/chrome-whisper/github-pages/processor.html';
        iframe.style.display = 'none';

        // Add to container
        container.appendChild(iframe);
        this.processorIframe = iframe;

        // Listen for transcription results from processor
        window.addEventListener('message', (event) => {
            if (event.origin === 'https://duniaka.github.io' && event.data.type === 'TRANSCRIPTION_RESULT') {
                console.log('[Offscreen] Received transcription from processor');
                chrome.runtime.sendMessage({
                    type: 'AUDIO_RECORDED',
                    text: event.data.text
                });
            }
        });
    }
}

// Initialize the offscreen manager
const offscreenManager = new OffscreenManager();