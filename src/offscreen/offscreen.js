// WebWhispr Offscreen Document
// Manages recording iframe and GitHub Pages processor iframe

class OffscreenManager {
    constructor() {
        this.processorIframe = null;
        this.recordingIframe = null;
        this.isProcessorReady = false;
        this.pendingRequests = new Map(); // Track pending transcription requests
        this.requestIdCounter = 0;

        // GitHub Pages URL
        this.PROCESSOR_URL = 'https://duniaka.github.io/chrome-whisper/github-pages/processor.html';

        this.init();
    }

    init() {
        console.log('[Offscreen] Initializing...');
        this.setupMessageListeners();
        this.updateStatus('Offscreen initialized');

        // Initialize processor immediately on load
        this.initializeProcessor();
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

                case 'INITIALIZE_PROCESSOR':
                    this.initializeProcessor();
                    sendResponse({ success: true });
                    break;

                default:
                    console.log('[Offscreen] Unknown message type:', message.type);
            }

            return true; // Keep channel open for async response
        });

        // Listen for messages from iframes
        window.addEventListener('message', (event) => {
            this.handleIframeMessage(event);
        });
    }

    handleIframeMessage(event) {
        // Handle messages from both recording and processor iframes
        const { type, data } = event.data || {};

        console.log('[Offscreen] Iframe message:', type, 'from', event.origin);

        switch (type) {
            case 'RECORDING_READY':
                console.log('[Offscreen] Recording iframe ready');
                this.updateStatus('Recording ready');
                break;

            case 'RECORDING_DATA':
                console.log('[Offscreen] Received audio data from recording iframe');
                this.handleAudioData(data.audio);
                // Remove recording iframe after getting the audio
                this.removeRecordingIframe();
                break;

            case 'RECORDING_ERROR':
                console.error('[Offscreen] Recording error:', data.error);
                this.updateStatus(`Recording error: ${data.error}`);
                this.removeRecordingIframe();
                chrome.runtime.sendMessage({
                    type: 'RECORDING_ERROR',
                    error: data.error
                });
                break;

            case 'PROCESSOR_READY':
                console.log('[Offscreen] Processor iframe ready');
                this.isProcessorReady = true;
                this.updateStatus('Processor ready');
                break;

            case 'MODEL_PROGRESS':
                console.log('[Offscreen] Model loading progress:', data.progress);
                this.updateStatus(`Loading model: ${Math.round((data.progress?.progress || 0) * 100)}%`);
                break;

            case 'TRANSCRIPTION_RESULT':
                console.log('[Offscreen] Transcription result received');
                this.handleTranscriptionResult(data);
                break;

            case 'TRANSCRIPTION_ERROR':
                console.error('[Offscreen] Transcription error:', data.error);
                this.handleTranscriptionError(data);
                break;

            case 'PROCESSOR_ERROR':
                console.error('[Offscreen] Processor error:', data.error);
                this.updateStatus(`Processor error: ${data.error}`);
                break;
        }
    }

    startRecording() {
        console.log('[Offscreen] Starting recording...');
        this.updateStatus('Starting recording...');

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
        this.updateStatus('Stopping recording...');

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
        iframe.style.width = '100%';
        iframe.style.height = '150px';
        iframe.style.border = '1px solid #ff9999';
        iframe.style.borderRadius = '4px';
        iframe.style.marginBottom = '10px';

        // Use the actual HTML file from the extension
        iframe.src = chrome.runtime.getURL('offscreen/recorder.html');

        // Add to container
        container.appendChild(iframe);
        this.recordingIframe = iframe;

        this.updateStatus('Recording iframe created');
    }

    removeRecordingIframe() {
        console.log('[Offscreen] Removing recording iframe...');

        if (this.recordingIframe) {
            this.recordingIframe.remove();
            this.recordingIframe = null;
            this.updateStatus('Recording iframe removed');
        }
    }

    initializeProcessor() {
        console.log('[Offscreen] Initializing processor...');

        if (!this.processorIframe) {
            this.createProcessorIframe();
        } else if (this.isProcessorReady) {
            // Processor already ready
            chrome.runtime.sendMessage({
                type: 'PROCESSOR_INITIALIZED'
            });
        }
    }

    createProcessorIframe() {
        console.log('[Offscreen] Creating processor iframe...');
        this.updateStatus('Creating processor iframe...');

        const container = document.getElementById('iframe-container');

        // Create the iframe element
        const iframe = document.createElement('iframe');
        iframe.id = 'processor-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '150px';
        iframe.style.border = '1px solid #9999ff';
        iframe.style.borderRadius = '4px';
        iframe.style.marginBottom = '10px';

        // Set the GitHub Pages URL
        iframe.src = this.PROCESSOR_URL;

        // Add to container
        container.appendChild(iframe);
        this.processorIframe = iframe;

        this.updateStatus('Processor iframe created, waiting for initialization...');
    }

    async handleAudioData(audioData) {
        console.log('[Offscreen] Processing audio data...');
        this.updateStatus('Sending audio to processor...');

        // Ensure processor iframe exists (but don't wait for model to load)
        if (!this.processorIframe) {
            this.initializeProcessor();
        }

        // Generate request ID
        const requestId = `req_${++this.requestIdCounter}`;

        // Store pending request
        this.pendingRequests.set(requestId, {
            timestamp: Date.now(),
            audio: audioData
        });

        // Send audio to processor iframe immediately
        // The processor will queue it if model isn't ready yet
        if (this.processorIframe) {
            this.processorIframe.contentWindow.postMessage({
                type: 'TRANSCRIBE_AUDIO',
                data: {
                    audio: audioData,
                    requestId: requestId
                }
            }, '*');

            this.updateStatus('Audio sent to processor' + (this.isProcessorReady ? ', transcribing...' : ', waiting for model to load...'));
        } else {
            console.error('[Offscreen] Processor iframe not available');
            this.updateStatus('Error: Processor not available');
        }
    }

    handleTranscriptionResult(data) {
        console.log('[Offscreen] Handling transcription result:', data);

        const { requestId, text } = data;

        // Remove from pending requests
        if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
        }

        this.updateStatus(`Transcription complete: "${text}"`);

        // Send result to background script
        chrome.runtime.sendMessage({
            type: 'TRANSCRIPTION_COMPLETE',
            text: text
        });
    }

    handleTranscriptionError(data) {
        console.error('[Offscreen] Transcription error:', data);

        const { requestId, error } = data;

        // Remove from pending requests
        if (this.pendingRequests.has(requestId)) {
            this.pendingRequests.delete(requestId);
        }

        this.updateStatus(`Transcription error: ${error}`);

        // Send error to background script
        chrome.runtime.sendMessage({
            type: 'TRANSCRIPTION_ERROR',
            error: error
        });
    }

    updateStatus(text) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
        }
        console.log('[Offscreen Status]', text);
    }
}

// Initialize the offscreen manager
const offscreenManager = new OffscreenManager();

// Notify background that offscreen is ready
chrome.runtime.sendMessage({ type: 'OFFSCREEN_READY' });