// WebWhispr Offscreen - Recording management

class OffscreenManager {
    constructor() {
        this.recordingIframe = null;
        this.setupMessageListeners();
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.type) {
                case 'START_RECORDING':
                    this.startRecording();
                    break;
                case 'STOP_RECORDING':
                    this.stopRecording();
                    break;
            }
            sendResponse({ success: true });
        });

        window.addEventListener('message', (event) => {
            const { type, data } = event.data || {};
            switch (type) {
                case 'RECORDING_DATA':
                    this.handleAudioData(data.audio);
                    this.removeRecordingIframe();
                    break;
                case 'RECORDING_ERROR':
                    this.removeRecordingIframe();
                    chrome.runtime.sendMessage({ type: 'RECORDING_ERROR', error: data.error });
                    break;
            }
        });
    }

    startRecording() {
        if (!this.recordingIframe) {
            this.createRecordingIframe();
        } else {
            this.recordingIframe.contentWindow.postMessage({ type: 'START_RECORDING' }, '*');
        }
    }

    stopRecording() {
        if (this.recordingIframe) {
            this.recordingIframe.contentWindow.postMessage({ type: 'STOP_RECORDING' }, '*');
        }
    }

    createRecordingIframe() {
        const container = document.getElementById('iframe-container');
        const iframe = document.createElement('iframe');
        iframe.id = 'recording-iframe';
        iframe.src = chrome.runtime.getURL('offscreen/recorder.html');
        container.appendChild(iframe);
        this.recordingIframe = iframe;
    }

    removeRecordingIframe() {
        if (this.recordingIframe) {
            this.recordingIframe.remove();
            this.recordingIframe = null;
        }
    }

    handleAudioData(audioData) {
        chrome.runtime.sendMessage({ type: 'AUDIO_RECORDED', audio: audioData });
    }
}

const offscreenManager = new OffscreenManager();