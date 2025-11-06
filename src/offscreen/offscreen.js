// Offscreen document for WebWhispr
// Handles audio recording and transcription in extension context

console.log('WebWhispr: Offscreen document loaded');

// Import bundled Transformers.js with all model implementations
import { pipeline } from '../transformers.min.js';

let transcriber = null;
let isRecording = false;
let modelSize = 'small';
let language = 'en';
let settingsLoaded = false;
let recorderIframe = null;

// Load settings from background (chrome.storage not available in offscreen)
async function loadSettings() {
    if (settingsLoaded) return;

    return new Promise((resolve) => {
        // Request settings from background script
        chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (response) => {
            if (response) {
                modelSize = response.modelSize || 'small';
                language = response.language || 'en';
                settingsLoaded = true;
                console.log('WebWhispr: Settings loaded:', { modelSize, language });
            }
            resolve();
        });
    });
}

// Load Whisper model
async function loadModel() {
    await loadSettings();

    const modelName = language === 'en' || language === 'multilingual'
        ? `Xenova/whisper-${modelSize}${language === 'en' ? '.en' : ''}`
        : `Xenova/whisper-${modelSize}`;

    console.log('WebWhispr: Loading model:', modelName);
    console.log('WebWhispr: Settings:', { modelSize, language });
    console.log('WebWhispr: Creating pipeline for automatic-speech-recognition...');

    try {
        transcriber = await pipeline('automatic-speech-recognition', modelName, {
            progress_callback: (progress) => {
                console.log('WebWhispr: Progress:', progress);
                if (progress.status === 'downloading') {
                    const percent = Math.round(progress.progress || 0);
                    console.log(`WebWhispr: Downloading model... ${percent}%`);
                    // Send progress to background
                    chrome.runtime.sendMessage({
                        type: 'MODEL_PROGRESS',
                        progress: percent,
                        status: 'downloading'
                    });
                } else if (progress.status === 'loading') {
                    console.log('WebWhispr: Loading model files...');
                } else if (progress.status === 'ready') {
                    console.log('WebWhispr: Model ready!');
                }
            }
        });
        console.log('WebWhispr: Pipeline created successfully');
    } catch (error) {
        console.error('WebWhispr: Error creating pipeline:', error);
        console.error('WebWhispr: Error name:', error.name);
        console.error('WebWhispr: Error message:', error.message);
        console.error('WebWhispr: Error stack:', error.stack);
        throw error;
    }

    console.log('WebWhispr: Model loaded successfully');
    chrome.runtime.sendMessage({
        type: 'MODEL_READY'
    });
}

// Start recording
async function startRecording() {
    if (isRecording) {
        console.log('WebWhispr: Already recording');
        return;
    }

    console.log('WebWhispr: Creating recorder iframe...');
    isRecording = true;

    // Create iframe for recording
    recorderIframe = document.createElement('iframe');
    recorderIframe.src = 'recorder.html';
    recorderIframe.style.display = 'none';
    document.body.appendChild(recorderIframe);

    // Wait for iframe to load
    await new Promise(resolve => {
        recorderIframe.onload = resolve;
    });

    console.log('WebWhispr: Recorder iframe loaded, starting recording...');

    // Send start command to iframe
    recorderIframe.contentWindow.postMessage({ type: 'START_RECORDING' }, '*');
}

// Stop recording
function stopRecording() {
    console.log('WebWhispr: stopRecording called, isRecording:', isRecording);

    if (!isRecording) {
        console.log('WebWhispr: Not recording');
        return;
    }

    console.log('WebWhispr: Stopping recording in iframe...');

    if (recorderIframe) {
        recorderIframe.contentWindow.postMessage({ type: 'STOP_RECORDING' }, '*');
    }
}

// Destroy iframe and release all resources
function destroyRecorderIframe() {
    if (recorderIframe) {
        console.log('WebWhispr: Destroying recorder iframe to fully release microphone');
        recorderIframe.remove();
        recorderIframe = null;
    }
}

// Transcribe audio
async function transcribeAudio(audioBlob) {
    try {
        // Ensure model is loaded
        if (!transcriber) {
            console.log('WebWhispr: Model not loaded, loading now...');
            await loadModel();
        }

        console.log('WebWhispr: Transcribing audio...');

        // Convert blob to audio buffer
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: 16000 });
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get mono audio
        let audio;
        if (audioBuffer.numberOfChannels === 2) {
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            audio = new Float32Array(left.length);
            for (let i = 0; i < left.length; i++) {
                audio[i] = (left[i] + right[i]) / 2;
            }
        } else {
            audio = audioBuffer.getChannelData(0);
        }

        // Transcribe
        const options = language === 'multilingual'
            ? { language: null } // Auto-detect
            : language !== 'en'
                ? { language: language }
                : {};

        console.log('WebWhispr: Running transcription...');
        const result = await transcriber(audio, options);

        if (result && result.text) {
            const text = result.text.trim();
            console.log('WebWhispr: Transcription complete:', text);

            // Send result to background
            chrome.runtime.sendMessage({
                type: 'TRANSCRIPTION_COMPLETE',
                text: text
            });
        } else {
            console.log('WebWhispr: No speech detected');
            chrome.runtime.sendMessage({
                type: 'ERROR',
                error: 'No speech detected'
            });
        }

    } catch (error) {
        console.error('WebWhispr: Transcription error:', error);
        chrome.runtime.sendMessage({
            type: 'ERROR',
            error: error.message
        });
    }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('WebWhispr: Offscreen received message:', message.type, 'from:', sender);

    if (message.type === 'START_RECORDING') {
        console.log('WebWhispr: Processing START_RECORDING');
        startRecording();
        sendResponse({ received: true });
    } else if (message.type === 'STOP_RECORDING') {
        console.log('WebWhispr: Processing STOP_RECORDING');
        stopRecording();
        sendResponse({ received: true });
    } else if (message.type === 'LOAD_MODEL') {
        console.log('WebWhispr: Processing LOAD_MODEL');
        loadModel().then(() => {
            sendResponse({ success: true });
        }).catch(error => {
            sendResponse({ success: false, error: error.message });
        });
        return true; // Keep channel open for async response
    } else if (message.type === 'RELOAD_MODEL') {
        console.log('WebWhispr: Processing RELOAD_MODEL');
        transcriber = null; // Force reload on next use
        settingsLoaded = false; // Force reload settings
        sendResponse({ received: true });
    }
});

// Listen for messages from recorder iframe
window.addEventListener('message', async (event) => {
    console.log('WebWhispr: Received message from iframe:', event.data.type);

    if (event.data.type === 'RECORDING_STARTED') {
        // Notify background that recording started
        chrome.runtime.sendMessage({
            type: 'RECORDING_STARTED'
        });
    } else if (event.data.type === 'RECORDING_COMPLETE') {
        isRecording = false;

        // Destroy iframe immediately to release microphone
        destroyRecorderIframe();

        // Notify that we're processing
        chrome.runtime.sendMessage({
            type: 'PROCESSING'
        });

        // Convert arrayBuffer to blob and transcribe
        const audioBlob = new Blob([event.data.audioData], { type: 'audio/webm' });
        await transcribeAudio(audioBlob);

    } else if (event.data.type === 'RECORDING_ERROR') {
        isRecording = false;
        destroyRecorderIframe();

        let errorMessage = event.data.error || 'Microphone access denied';

        if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
            errorMessage = 'Opening mic settings...';
            chrome.runtime.sendMessage({
                type: 'OPEN_MIC_SETTINGS'
            });
        }

        chrome.runtime.sendMessage({
            type: 'ERROR',
            error: errorMessage
        });
    }
});

console.log('WebWhispr: Offscreen document ready and listening for messages');

// Load settings on startup
loadSettings().then(() => {
    console.log('WebWhispr: Initial settings loaded');
});
