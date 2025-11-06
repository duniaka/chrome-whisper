// WebWhispr Content Script
// Handles hotkey and text insertion

let activeElement = null;

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[WebWhispr Content] Received message:', message.type);

    switch (message.type) {
        case 'INSERT_TRANSCRIPTION':
            insertTranscription(message.text);
            break;

        default:
            console.log('[WebWhispr Content] Unknown message type:', message.type);
    }

    sendResponse({ success: true });
});

// Keyboard shortcut: Right Shift
document.addEventListener('keydown', (event) => {
    // Right Shift key code is 16, shiftKey is true
    // We need to detect specifically the right shift
    if (event.code === 'ShiftRight') {
        event.preventDefault();
        activeElement = document.activeElement;

        // Check if it's a text input field
        if (isTextInput(activeElement)) {
            console.log('[WebWhispr Content] Right Shift pressed, starting recording...');
            try {
                chrome.runtime.sendMessage({ type: 'START_RECORDING' });
            } catch (error) {
                console.error('[WebWhispr Content] Failed to send message:', error);
            }
        }
    }
});

function insertTranscription(text) {
    console.log('[WebWhispr Content] Inserting transcription:', text);

    if (!activeElement) {
        return;
    }

    // Focus the element
    activeElement.focus();

    // Check if it's a contenteditable element
    if (activeElement.getAttribute('contenteditable') === 'true') {
        // For contenteditable elements
        const selection = window.getSelection();
        const range = selection.getRangeAt(0);
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);

        // Trigger input event
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        // For input/textarea elements
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const currentValue = activeElement.value;

        // Insert text at cursor position
        activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);

        // Update cursor position
        const newPosition = start + text.length;
        activeElement.selectionStart = newPosition;
        activeElement.selectionEnd = newPosition;

        // Trigger events
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