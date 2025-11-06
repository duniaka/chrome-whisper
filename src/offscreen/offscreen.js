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

        // Create a data URL for the recording page
        const recordingHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Recording</title>
    <style>
        body {
            margin: 10px;
            font-family: system-ui;
            background: #ffe4e4;
        }
        #status {
            padding: 10px;
            background: white;
            border-radius: 4px;
        }
        button {
            margin: 5px;
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            background: #ff6b6b;
            color: white;
            cursor: pointer;
        }
        button:hover {
            background: #ff5252;
        }
    </style>
</head>
<body>
    <div id="status">Recording iframe loading...</div>
    <button onclick="testMicrophone()">Test Microphone</button>
    <script>
        let mediaRecorder = null;
        let audioChunks = [];
        let stream = null;

        function updateStatus(text) {
            document.getElementById('status').textContent = text;
        }

        async function testMicrophone() {
            try {
                const testStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                updateStatus('Microphone access granted');
                testStream.getTracks().forEach(track => track.stop());
            } catch (error) {
                updateStatus('Microphone error: ' + error.message);
            }
        }

        async function startRecording() {
            try {
                updateStatus('Requesting microphone access...');

                // Request microphone access
                stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 16000 // Whisper works best with 16kHz
                    }
                });

                updateStatus('Recording started');

                // Create MediaRecorder
                mediaRecorder = new MediaRecorder(stream, {
                    mimeType: 'audio/webm'
                });

                audioChunks = [];

                mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = async () => {
                    updateStatus('Processing audio...');

                    // Create blob from chunks
                    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                    // Convert to base64 for easier transport
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const base64Audio = reader.result;

                        // Send audio data to parent
                        window.parent.postMessage({
                            type: 'RECORDING_DATA',
                            data: {
                                audio: base64Audio
                            }
                        }, '*');

                        updateStatus('Audio sent');
                    };
                    reader.readAsDataURL(audioBlob);

                    // Clean up
                    if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                    }
                };

                // Start recording
                mediaRecorder.start();

                // Send ready message
                window.parent.postMessage({
                    type: 'RECORDING_READY'
                }, '*');

            } catch (error) {
                console.error('Recording error:', error);
                updateStatus('Error: ' + error.message);

                window.parent.postMessage({
                    type: 'RECORDING_ERROR',
                    data: { error: error.message }
                }, '*');
            }
        }

        function stopRecording() {
            updateStatus('Stopping recording...');

            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            } else {
                updateStatus('No active recording');
            }
        }

        // Listen for messages from parent
        window.addEventListener('message', (event) => {
            const { type } = event.data || {};

            switch (type) {
                case 'START_RECORDING':
                    startRecording();
                    break;
                case 'STOP_RECORDING':
                    stopRecording();
                    break;
            }
        });

        // Initialize
        updateStatus('Recording iframe ready');

        // Automatically start recording when iframe is created
        startRecording();
    </script>
</body>
</html>`;

        // Convert HTML to data URL
        const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(recordingHTML)}`;
        iframe.src = dataUrl;

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

        // Ensure processor is initialized
        if (!this.processorIframe) {
            await this.initializeProcessor();

            // Wait a bit for processor to be ready
            await new Promise(resolve => {
                const checkReady = setInterval(() => {
                    if (this.isProcessorReady) {
                        clearInterval(checkReady);
                        resolve();
                    }
                }, 100);

                // Timeout after 10 seconds
                setTimeout(() => {
                    clearInterval(checkReady);
                    resolve();
                }, 10000);
            });
        }

        // Generate request ID
        const requestId = `req_${++this.requestIdCounter}`;

        // Store pending request
        this.pendingRequests.set(requestId, {
            timestamp: Date.now()
        });

        // Send audio to processor iframe
        if (this.processorIframe) {
            this.processorIframe.contentWindow.postMessage({
                type: 'TRANSCRIBE_AUDIO',
                data: {
                    audio: audioData,
                    requestId: requestId
                }
            }, '*');

            this.updateStatus('Audio sent to processor, waiting for transcription...');
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