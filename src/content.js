// WebWhispr Content Script
// Handles hotkey and text insertion

let activeElement = null;
let recordingIndicator = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'INSERT_TRANSCRIPTION':
            insertTranscription(message.text);
            removeRecordingIndicator();
            break;
    }

    sendResponse({ success: true });
});

// Keyboard shortcut: Right Shift
let shiftDownTime = null;
let recordingTimeout = null;

window.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftRight') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        shiftDownTime = Date.now();
        activeElement = document.activeElement;

        recordingTimeout = setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'START_RECORDING' });
            showRecordingIndicator();
        }, 150);
    }
}, true);

window.addEventListener('keyup', (event) => {
    if (event.code === 'ShiftRight') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        clearTimeout(recordingTimeout);

        if (shiftDownTime && Date.now() - shiftDownTime >= 150) {
            chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
            bounceIndicator();
        }

        shiftDownTime = null;
    }
}, true);

function insertTranscription(text) {
    if (!activeElement) return;

    activeElement.focus();

    try {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const currentValue = activeElement.value;

        activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);

        const newPosition = start + text.length;
        activeElement.selectionStart = newPosition;
        activeElement.selectionEnd = newPosition;

        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (e) {
        // If it fails, just try to insert with execCommand
        document.execCommand('insertText', false, text);
    }

    removeRecordingIndicator();
}

function showRecordingIndicator() {
    if (recordingIndicator) return;

    recordingIndicator = document.createElement('div');
    recordingIndicator.id = 'webwhispr-recording-indicator';
    recordingIndicator.style.cssText = `
        position: fixed;
        width: 14px;
        height: 14px;
        background-color: #3b82f6;
        border-radius: 50%;
        border: none;
        pointer-events: none;
        z-index: 10000;
    `;
    document.body.appendChild(recordingIndicator);
    updateIndicatorPosition();
}

function updateIndicatorPosition() {
    if (!recordingIndicator) return;

    recordingIndicator.style.left = (window.innerWidth - 30) + 'px';
    recordingIndicator.style.top = '20px';
}

function bounceIndicator() {
    if (!recordingIndicator) return;

    recordingIndicator.style.animation = 'webwhispr-bounce 0.6s ease-in-out infinite';
}

function removeRecordingIndicator() {
    if (recordingIndicator) {
        recordingIndicator.remove();
        recordingIndicator = null;
    }
}

// Add animation styles
const style = document.createElement('style');
style.textContent = `
    @keyframes webwhispr-bounce {
        0% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.4);
            opacity: 0.8;
        }
        100% {
            transform: scale(1);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

