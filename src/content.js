// WebWhispr Content Script
// Handles hotkey and text insertion

let activeElement = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case 'INSERT_TRANSCRIPTION':
            insertTranscription(message.text);
            break;
    }

    sendResponse({ success: true });
});

// Keyboard shortcut: Right Shift
let shiftDownTime = null;
let recordingTimeout = null;

document.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftRight') {
        event.preventDefault();
        shiftDownTime = Date.now();
        activeElement = document.activeElement;

        recordingTimeout = setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'START_RECORDING' });
        }, 150);
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'ShiftRight') {
        event.preventDefault();
        clearTimeout(recordingTimeout);

        if (shiftDownTime && Date.now() - shiftDownTime >= 150) {
            chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
        }

        shiftDownTime = null;
    }
});

function insertTranscription(text) {
    activeElement.focus();

    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    const currentValue = activeElement.value;

    activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);

    const newPosition = start + text.length;
    activeElement.selectionStart = newPosition;
    activeElement.selectionEnd = newPosition;

    activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    activeElement.dispatchEvent(new Event('change', { bubbles: true }));
}

