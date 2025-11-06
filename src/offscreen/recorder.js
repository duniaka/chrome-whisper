// Recorder iframe script

let mediaRecorder = null;
let audioChunks = [];
let stream = null;

async function startRecording() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
        });

        mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const reader = new FileReader();
            reader.onloadend = () => {
                window.parent.postMessage({
                    type: 'RECORDING_DATA',
                    data: { audio: reader.result }
                }, '*');
            };
            reader.readAsDataURL(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
    } catch (error) {
        window.parent.postMessage({
            type: 'RECORDING_ERROR',
            data: { error: error.message }
        }, '*');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}

window.addEventListener('message', (event) => {
    const { type } = event.data || {};
    if (type === 'START_RECORDING') startRecording();
    if (type === 'STOP_RECORDING') stopRecording();
});

startRecording();