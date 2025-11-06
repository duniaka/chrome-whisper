// Recorder script for recording iframe
let mediaRecorder = null;
let audioChunks = [];
let stream = null;

function updateStatus(text) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = text;
    }
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

// Attach button event listener
document.addEventListener('DOMContentLoaded', () => {
    const testBtn = document.getElementById('testBtn');
    if (testBtn) {
        testBtn.addEventListener('click', testMicrophone);
    }
});

// Automatically start recording when iframe is created
startRecording();