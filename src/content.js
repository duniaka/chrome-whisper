// Content script for WebWhispr
// Only handles keyboard detection and text insertion
// NO microphone access - that's handled in the offscreen document

import { CONFIG, MESSAGE_TYPES } from './config.js';
import logger from './logger.js';

let isKeyPressed = false;
let activeElement = null;
let shiftHoldTimer = null;

// Create recording indicator UI
const indicator = document.createElement('div');
indicator.id = 'webwhispr-indicator';
indicator.textContent = CONFIG.MESSAGES.RECORDING;

// Inject styles
function injectStyles() {
    if (!document.getElementById('webwhispr-styles')) {
        const style = document.createElement('style');
        style.id = 'webwhispr-styles';
        style.textContent = `
#webwhispr-indicator {
    position: fixed;
    top: 20px;
    right: 20px;
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
}

@keyframes webwhispr-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}
        `;
        document.head?.appendChild(style);
    }
}

// Add to page
function addIndicator() {
    injectStyles();
    document.body?.appendChild(indicator);
}

if (document.head && document.body) {
    addIndicator();
} else {
    window.addEventListener('DOMContentLoaded', addIndicator);
}

// Show indicator with specified text and background color
function showIndicator(text, backgroundColor) {
    indicator.textContent = text;
    indicator.style.background = backgroundColor;
    indicator.style.display = 'block';
}

// Hide indicator
function hideIndicator() {
    indicator.style.display = 'none';
}

// Insert text into the active element
function insertText(text) {
    if (!activeElement) {
        logger.log('No active element to insert text');
        return;
    }

    try {
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

        } else if (activeElement?.isContentEditable) {
            // Handle contenteditable elements
            const selection = window.getSelection();
            if (selection?.rangeCount > 0) {
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
        }
    } catch (error) {
        logger.error('Error inserting text:', error);
    }
}

// Listen for keyboard events - long press shift to record
document.addEventListener('keydown', (e) => {
    // Only trigger on Shift key (either left or right)
    if (CONFIG.SHIFT_KEYS.includes(e.code) && !isKeyPressed && !shiftHoldTimer) {
        activeElement = document.activeElement;

        // Start timer for long press
        shiftHoldTimer = setTimeout(() => {
            e.preventDefault();
            e.stopPropagation();

            isKeyPressed = true;

            // Send message to background to start recording
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.START_RECORDING
            }).catch(error => {
                logger.error('Error sending START_RECORDING:', error);
            });
        }, CONFIG.HOLD_DURATION);
    }
}, true);

document.addEventListener('keyup', (e) => {
    if (CONFIG.SHIFT_KEYS.includes(e.code)) {
        // Clear timer if shift released before threshold
        if (shiftHoldTimer && !isKeyPressed) {
            clearTimeout(shiftHoldTimer);
            shiftHoldTimer = null;
            // Let shift work normally for quick presses
            return;
        }

        // Stop recording if it was started
        if (isKeyPressed) {
            e.preventDefault();
            e.stopPropagation();

            isKeyPressed = false;
            shiftHoldTimer = null;

            // Send message to background to stop recording
            chrome.runtime.sendMessage({
                type: MESSAGE_TYPES.STOP_RECORDING
            }).catch(error => {
                logger.error('Error sending STOP_RECORDING:', error);
            });
        }
    }
}, true);

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case MESSAGE_TYPES.SHOW_RECORDING:
            showIndicator(CONFIG.MESSAGES.RECORDING, CONFIG.COLORS.RECORDING);
            break;
        case MESSAGE_TYPES.SHOW_PROCESSING:
            showIndicator(CONFIG.MESSAGES.PROCESSING, CONFIG.COLORS.PROCESSING);
            break;
        case MESSAGE_TYPES.INSERT_TEXT:
            insertText(message.text);
            showIndicator(CONFIG.MESSAGES.SUCCESS, CONFIG.COLORS.SUCCESS);
            setTimeout(hideIndicator, CONFIG.STATUS_DISPLAY_DURATION.SUCCESS);
            break;
        case MESSAGE_TYPES.SHOW_ERROR:
            showIndicator(CONFIG.MESSAGES.ERROR_PREFIX + message.error, CONFIG.COLORS.RECORDING);
            setTimeout(hideIndicator, CONFIG.STATUS_DISPLAY_DURATION.ERROR);
            break;
    }
});
