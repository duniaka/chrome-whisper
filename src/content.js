// WebWhispr Content Script - Hotkey and text insertion

let activeElement = null;
let isRecording = false;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'INSERT_TRANSCRIPTION') {
        insertTranscription(message.text);
    }
    sendResponse({ success: true });
});

document.addEventListener('keydown', (event) => {
    if (event.code === 'ShiftRight' && !isRecording) {
        event.preventDefault();
        activeElement = document.activeElement;

        if (isTextInput(activeElement)) {
            isRecording = true;
            chrome.runtime.sendMessage({ type: 'START_RECORDING' });
        }
    }
});

document.addEventListener('keyup', (event) => {
    if (event.code === 'ShiftRight' && isRecording) {
        event.preventDefault();
        isRecording = false;
        chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    }
});

function insertTranscription(text) {
    if (!activeElement) return;

    activeElement.focus();

    if (activeElement.getAttribute('contenteditable') === 'true') {
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
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
}

function isTextInput(element) {
    if (!element) return false;

    const tagName = element.tagName?.toUpperCase();

    // Check if it's an input field
    if (tagName === 'INPUT') {
        const type = element.type?.toLowerCase();
        return ['text', 'search', 'email', 'url', 'tel', 'password'].includes(type) || !type;
    }

    // Check if it's a textarea
    if (tagName === 'TEXTAREA') {
        return true;
    }

    // Check if it's contenteditable
    if (element.getAttribute('contenteditable') === 'true') {
        return true;
    }

    return false;
}