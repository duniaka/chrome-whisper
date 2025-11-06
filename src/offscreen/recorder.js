// Audio recorder for iframe
import { CONFIG, MESSAGE_TYPES } from '../config.js';
import logger from '../logger.js';

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

// Listen for commands from parent
window.addEventListener('message', async (event) => {
    if (event.data.type === MESSAGE_TYPES.RECORDER_START) {
        try {
            logger.log('Requesting microphone in iframe');
            stream = await navigator.mediaDevices.getUserMedia({
                audio: CONFIG.AUDIO_CONSTRAINTS
            });

            logger.log('Got stream in iframe');
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                logger.log('Recording stopped in iframe');
                const audioBlob = new Blob(audioChunks, { type: CONFIG.AUDIO_TYPE });

                // Stop all tracks immediately to release microphone
                logger.log('Stopping tracks in iframe');
                stream.getTracks().forEach(track => {
                    track.stop();
                });
                stream = null;
                mediaRecorder = null;

                // Send audio blob to parent
                const arrayBuffer = await audioBlob.arrayBuffer();
                window.parent.postMessage({
                    type: MESSAGE_TYPES.RECORDER_COMPLETE,
                    audioData: arrayBuffer
                }, '*');
            };

            mediaRecorder.start();
            logger.log('Recording started in iframe');

            // Notify parent
            window.parent.postMessage({ type: MESSAGE_TYPES.RECORDER_STARTED }, '*');

        } catch (error) {
            logger.error('Microphone error in iframe:', error.message);
            window.parent.postMessage({
                type: MESSAGE_TYPES.RECORDER_ERROR,
                error: error.message
            }, '*');
        }
    } else if (event.data.type === MESSAGE_TYPES.RECORDER_STOP) {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            logger.log('Stopping recording in iframe');
            mediaRecorder.stop();
        }
    }
});

logger.log('Recorder iframe ready');
