// Content script for WebWhispr
// Only handles keyboard detection and text insertion
// NO microphone access - that's handled in the offscreen document

console.log('WebWhispr: Content script loaded');

let isKeyPressed = false;
let activeElement = null;
let shiftHoldTimer = null;
const HOLD_DURATION = 500; // ms to hold shift before recording starts

// Create recording indicator UI
const indicator = document.createElement('div');
indicator.id = 'webwhispr-indicator';
indicator.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #ef4444;
    color: white;
    padding: 12px 20px;
    border-radius: 8px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 2147483647;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    display: none;
    animation: webwhispr-pulse 1.5s infinite;
`;
indicator.textContent = '🔴 Recording...';

// Add pulse animation
const style = document.createElement('style');
style.textContent = `
    @keyframes webwhispr-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }
`;

// Add to page
if (document.head && document.body) {
    document.head.appendChild(style);
    document.body.appendChild(indicator);
    console.log('WebWhispr: UI added to page');
} else {
    window.addEventListener('DOMContentLoaded', () => {
        document.head.appendChild(style);
        document.body.appendChild(indicator);
        console.log('WebWhispr: UI added to page (DOMContentLoaded)');
    });
}

// Show indicator
function showIndicator(text, color) {
    indicator.textContent = text;
    indicator.style.background = color;
    indicator.style.display = 'block';
}

// Hide indicator
function hideIndicator() {
    indicator.style.display = 'none';
}

// Insert text into the active element
function insertText(text) {
    if (!activeElement) {
        console.log('WebWhispr: No active element to insert text');
        return;
    }

    console.log('WebWhispr: Inserting text:', text);

    // Handle different input types
    if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
        const start = activeElement.selectionStart || 0;
        const end = activeElement.selectionEnd || 0;
        const currentValue = activeElement.value;

        // Insert text at cursor position
        activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);

        // Move cursor to end of inserted text
        const newPosition = start + text.length;
        activeElement.selectionStart = newPosition;
        activeElement.selectionEnd = newPosition;

        // Trigger input events for frameworks like React
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));

    } else if (activeElement.isContentEditable) {
        // Handle contenteditable elements
        try {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode(text));

                // Move cursor to end
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);

                // Trigger input event
                activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            }
        } catch (error) {
            console.error('WebWhispr: Error inserting into contenteditable:', error);
        }
    }
}

// Listen for keyboard events - long press shift to record
document.addEventListener('keydown', (e) => {
    // Only trigger on Shift key (either left or right)
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !isKeyPressed && !shiftHoldTimer) {
        activeElement = document.activeElement;

        // Start timer for long press
        shiftHoldTimer = setTimeout(() => {
            console.log('WebWhispr: Shift held - starting recording');
            e.preventDefault();
            e.stopPropagation();

            isKeyPressed = true;

            // Send message to background to start recording
            chrome.runtime.sendMessage({
                type: 'START_RECORDING'
            }).catch(error => {
                console.error('WebWhispr: Error sending START_RECORDING:', error);
            });
        }, HOLD_DURATION);
    }
}, true);

document.addEventListener('keyup', (e) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        // Clear timer if shift released before threshold
        if (shiftHoldTimer && !isKeyPressed) {
            clearTimeout(shiftHoldTimer);
            shiftHoldTimer = null;
            // Let shift work normally for quick presses
            return;
        }

        // Stop recording if it was started
        if (isKeyPressed) {
            console.log('WebWhispr: Shift released - stopping recording');
            e.preventDefault();
            e.stopPropagation();

            isKeyPressed = false;
            shiftHoldTimer = null;

            // Send message to background to stop recording
            chrome.runtime.sendMessage({
                type: 'STOP_RECORDING'
            }).catch(error => {
                console.error('WebWhispr: Error sending STOP_RECORDING:', error);
            });
        }
    }
}, true);

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('WebWhispr: Content script received message:', message.type);

    if (message.type === 'SHOW_RECORDING') {
        showIndicator('🔴 Recording...', '#ef4444');
    } else if (message.type === 'SHOW_PROCESSING') {
        showIndicator('⏳ Transcribing...', '#f59e0b');
    } else if (message.type === 'INSERT_TEXT') {
        insertText(message.text);
        showIndicator('✅ Done!', '#22c55e');
        setTimeout(hideIndicator, 2000);
    } else if (message.type === 'SHOW_ERROR') {
        showIndicator('❌ ' + message.error, '#ef4444');
        setTimeout(hideIndicator, 3000);
    }
});

console.log('WebWhispr: Ready - Hold Shift for 0.5 seconds to record');
