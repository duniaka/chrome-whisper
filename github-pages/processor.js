// WebWhispr Processor - Runs on GitHub Pages
// Handles Whisper transcription using Transformers.js

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 4; // Use multi-threading for better performance

let transcriber = null;
let isInitialized = false;

// Initialize the Whisper model
async function initializeModel() {
    try {
        console.log('[Processor] Initializing Whisper model...');

        // Create the transcription pipeline
        transcriber = await pipeline(
            'automatic-speech-recognition',
            'Xenova/whisper-tiny', // Using tiny model for faster loading
            {
                // Model options
                revision: 'main',
                progress_callback: (progress) => {
                    console.log('[Processor] Model loading progress:', progress);
                    // Notify parent of loading progress
                    window.parent.postMessage({
                        type: 'MODEL_PROGRESS',
                        progress: progress
                    }, '*');
                }
            }
        );

        isInitialized = true;
        console.log('[Processor] Model initialized successfully');

        // Notify parent that we're ready
        window.parent.postMessage({
            type: 'PROCESSOR_READY'
        }, '*');

        // Update status
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = 'Processor ready';
        }

    } catch (error) {
        console.error('[Processor] Failed to initialize model:', error);
        window.parent.postMessage({
            type: 'PROCESSOR_ERROR',
            error: error.message
        }, '*');
    }
}

// Process audio data
async function transcribeAudio(audioData) {
    if (!isInitialized || !transcriber) {
        throw new Error('Model not initialized');
    }

    try {
        console.log('[Processor] Starting transcription...');

        // Convert base64 to blob if needed
        let audioBlob;
        if (typeof audioData === 'string') {
            // Assume it's base64
            const binaryString = atob(audioData.split(',')[1] || audioData);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            audioBlob = new Blob([bytes], { type: 'audio/wav' });
        } else if (audioData instanceof ArrayBuffer) {
            audioBlob = new Blob([audioData], { type: 'audio/wav' });
        } else {
            audioBlob = audioData; // Assume it's already a blob
        }

        // Create audio URL
        const audioUrl = URL.createObjectURL(audioBlob);

        // Perform transcription
        const result = await transcriber(audioUrl, {
            // Transcription options
            language: 'en', // Default to English
            task: 'transcribe',
            chunk_length_s: 30, // Process in 30-second chunks
            return_timestamps: false // We just need the text
        });

        // Clean up
        URL.revokeObjectURL(audioUrl);

        console.log('[Processor] Transcription complete:', result.text);
        return result.text;

    } catch (error) {
        console.error('[Processor] Transcription failed:', error);
        throw error;
    }
}

// Listen for messages from parent (offscreen document)
window.addEventListener('message', async (event) => {
    // Note: In production, verify event.origin for security
    // For GitHub Pages, it would be chrome-extension://[extension-id]

    const { type, data } = event.data || {};

    switch (type) {
        case 'INIT_PROCESSOR':
            console.log('[Processor] Received init request');
            if (!isInitialized) {
                await initializeModel();
            } else {
                // Already initialized, send ready message
                window.parent.postMessage({
                    type: 'PROCESSOR_READY'
                }, '*');
            }
            break;

        case 'TRANSCRIBE_AUDIO':
            console.log('[Processor] Received transcription request');
            try {
                if (!isInitialized) {
                    await initializeModel();
                }

                const transcription = await transcribeAudio(data.audio);

                // Send result back to parent
                window.parent.postMessage({
                    type: 'TRANSCRIPTION_RESULT',
                    requestId: data.requestId,
                    text: transcription
                }, '*');

            } catch (error) {
                console.error('[Processor] Transcription error:', error);
                window.parent.postMessage({
                    type: 'TRANSCRIPTION_ERROR',
                    requestId: data.requestId,
                    error: error.message
                }, '*');
            }
            break;

        case 'CHANGE_MODEL':
            console.log('[Processor] Changing model to:', data.model);
            // Reinitialize with different model if needed
            isInitialized = false;
            transcriber = null;
            await initializeModel();
            break;

        default:
            console.log('[Processor] Unknown message type:', type);
    }
});

// Initialize on load
console.log('[Processor] WebWhispr Processor loaded');
initializeModel();