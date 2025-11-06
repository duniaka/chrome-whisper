// Offscreen document for WebWhispr
// Handles audio recording and transcription in extension context

import { pipeline } from '@xenova/transformers';
import { CONFIG, MESSAGE_TYPES } from '../config.js';
import logger from '../logger.js';

let transcriber = null;
let isRecording = false;
let modelSize = CONFIG.DEFAULTS.MODEL_SIZE;
let language = CONFIG.DEFAULTS.LANGUAGE;
let settingsLoaded = false;
let recorderIframe = null;

// Load settings from background (chrome.storage not available in offscreen)
async function loadSettings() {
    if (settingsLoaded) return;

    return new Promise((resolve) => {
        // Request settings from background script
        chrome.runtime.sendMessage({ type: MESSAGE_TYPES.GET_SETTINGS }, (response) => {
            if (response) {
                modelSize = response.modelSize || CONFIG.DEFAULTS.MODEL_SIZE;
                language = response.language || CONFIG.DEFAULTS.LANGUAGE;
                settingsLoaded = true;
                logger.log('Settings loaded:', { modelSize, language });
            }
            resolve();
        });
    });
}

// Load Whisper model
async function loadModel() {
    await loadSettings();

    const modelName = language === 'en' || language === 'multilingual'
        ? `${CONFIG.MODEL_PREFIX}${modelSize}${language === 'en' ? '.en' : ''}`
        : `${CONFIG.MODEL_PREFIX}${modelSize}`;

    logger.log('Loading model:', modelName);

    try {
        transcriber = await pipeline('automatic-speech-recognition', modelName, {
            progress_callback: (progress) => {
                if (progress.status === 'downloading') {
                    const percent = Math.round(progress.progress || 0);
                    logger.log(`Downloading model... ${percent}%`);
                    // Send progress to background
                    chrome.runtime.sendMessage({
                        type: MESSAGE_TYPES.MODEL_PROGRESS,
                        progress: percent,
                        status: 'downloading'
                    }).catch(() => {});
                } else if (progress.status === 'loading') {
                    logger.log('Loading model files...');
                } else if (progress.status === 'ready') {
                    logger.log('Model ready');
                }
            }
        });
        logger.log('Pipeline created successfully');
    } catch (error) {
        logger.error('Error creating pipeline:', error.message);
        throw error;
    }

    logger.log('Model loaded successfully');
    chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.MODEL_READY
    }).catch(() => {});
}

// Start recording
async function startRecording() {
    if (isRecording) {
        logger.log('Already recording');
        return;
    }

    logger.log('Creating recorder iframe');
    isRecording = true;

    // Create iframe for recording
    recorderIframe = document.createElement('iframe');
    recorderIframe.src = CONFIG.RECORDER_HTML;
    recorderIframe.style.display = 'none';
    document.body.appendChild(recorderIframe);

    // Wait for iframe to load
    await new Promise(resolve => {
        recorderIframe.onload = resolve;
    });

    logger.log('Recorder iframe loaded, starting recording');

    // Send start command to iframe
    recorderIframe.contentWindow.postMessage({ type: MESSAGE_TYPES.RECORDER_START }, '*');
}

// Stop recording
function stopRecording() {
    if (!isRecording) {
        logger.log('Not recording');
        return;
    }

    logger.log('Stopping recording in iframe');

    if (recorderIframe?.contentWindow) {
        recorderIframe.contentWindow.postMessage({ type: MESSAGE_TYPES.RECORDER_STOP }, '*');
    }
}

// Destroy iframe and release all resources
function destroyRecorderIframe() {
    if (recorderIframe) {
        logger.log('Destroying recorder iframe to release microphone');
        recorderIframe.remove();
        recorderIframe = null;
    }
}

// Transcribe audio
async function transcribeAudio(audioBlob) {
    try {
        // Ensure model is loaded
        if (!transcriber) {
            logger.log('Model not loaded, loading now');
            await loadModel();
        }

        logger.log('Transcribing audio');

        // Convert blob to audio buffer
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioContext = new AudioContext({ sampleRate: CONFIG.SAMPLE_RATE });
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

        logger.log('Running transcription');
        const result = await transcriber(audio, options);

        if (result && result.text) {
            const text = result.text.trim();
            logger.log('Transcription complete:', text);

            // Send result to background
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.TRANSCRIPTION_COMPLETE,
                text: text
            }).catch(() => {});
        } else {
            logger.log('No speech detected');
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.ERROR,
                error: 'No speech detected'
            }).catch(() => {});
        }

    } catch (error) {
        logger.error('Transcription error:', error.message);
        chrome.runtime.sendMessage({
            type: MESSAGE_TYPES.ERROR,
            error: error.message
        }).catch(() => {});
    }
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case MESSAGE_TYPES.START_RECORDING:
            startRecording();
            sendResponse({ received: true });
            break;

        case MESSAGE_TYPES.STOP_RECORDING:
            stopRecording();
            sendResponse({ received: true });
            break;

        case MESSAGE_TYPES.LOAD_MODEL:
            loadModel().then(() => {
                sendResponse({ success: true });
            }).catch(error => {
                sendResponse({ success: false, error: error.message });
            });
            return true; // Keep channel open for async response

        case MESSAGE_TYPES.RELOAD_MODEL:
            transcriber = null; // Force reload on next use
            settingsLoaded = false; // Force reload settings
            sendResponse({ received: true });
            break;
    }
});

// Listen for messages from recorder iframe
window.addEventListener('message', async (event) => {
    switch (event.data.type) {
        case MESSAGE_TYPES.RECORDER_STARTED:
            // Notify background that recording started
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.RECORDING_STARTED
            }).catch(() => {});
            break;

        case MESSAGE_TYPES.RECORDER_COMPLETE:
            isRecording = false;

            // Destroy iframe immediately to release microphone
            destroyRecorderIframe();

            // Notify that we're processing
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.PROCESSING
            }).catch(() => {});

            // Convert arrayBuffer to blob and transcribe
            const audioBlob = new Blob([event.data.audioData], { type: CONFIG.AUDIO_TYPE });
            await transcribeAudio(audioBlob);
            break;

        case MESSAGE_TYPES.RECORDER_ERROR:
            isRecording = false;
            destroyRecorderIframe();

            let errorMessage = event.data.error || 'Microphone access denied';

            if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
                errorMessage = 'Opening mic settings...';
                chrome.runtime.sendMessage({
                    type: MESSAGE_TYPES.OPEN_MIC_SETTINGS
                }).catch(() => {});
            }

            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.ERROR,
                error: errorMessage
            }).catch(() => {});
            break;
    }
});

logger.log('Offscreen document ready and listening for messages');

// Load settings on startup
loadSettings().then(() => {
    logger.log('Initial settings loaded');
}).catch(error => {
    logger.error('Error loading settings:', error.message);
});
