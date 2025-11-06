// Audio recorder for iframe
console.log('WebWhispr: Recorder iframe loaded');

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

// Listen for commands from parent
window.addEventListener('message', async (event) => {
    console.log('WebWhispr: Recorder received message:', event.data.type);

    if (event.data.type === 'START_RECORDING') {
        try {
            console.log('WebWhispr: Requesting microphone in iframe...');
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('WebWhispr: Got stream in iframe');
            audioChunks = [];
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = async () => {
                console.log('WebWhispr: Recording stopped in iframe');
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });

                // Stop all tracks IMMEDIATELY
                console.log('WebWhispr: Stopping tracks in iframe...');
                stream.getTracks().forEach(track => {
                    console.log('WebWhispr: Track state before stop:', track.readyState);
                    track.stop();
                    console.log('WebWhispr: Track state after stop:', track.readyState);
                });
                stream = null;
                mediaRecorder = null;

                // Send audio blob to parent
                const arrayBuffer = await audioBlob.arrayBuffer();
                window.parent.postMessage({
                    type: 'RECORDING_COMPLETE',
                    audioData: arrayBuffer
                }, '*');
            };

            mediaRecorder.start();
            console.log('WebWhispr: Recording started in iframe');

            // Notify parent
            window.parent.postMessage({ type: 'RECORDING_STARTED' }, '*');

        } catch (error) {
            console.error('WebWhispr: Microphone error in iframe:', error);
            window.parent.postMessage({
                type: 'RECORDING_ERROR',
                error: error.message
            }, '*');
        }
    } else if (event.data.type === 'STOP_RECORDING') {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.log('WebWhispr: Stopping recording in iframe...');
            mediaRecorder.stop();
        }
    }
});

console.log('WebWhispr: Recorder iframe ready');
