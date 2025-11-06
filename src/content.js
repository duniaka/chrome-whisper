// WebWhispr Content Script
// Handles UI injection and transcription insertion into web pages

class WebWhisprContent {
    constructor() {
        this.isRecording = false;
        this.activeElement = null;
        this.recordingIndicator = null;

        this.init();
    }

    init() {
        console.log('[WebWhispr Content] Initializing...');
        this.setupMessageListeners();
        this.setupKeyboardShortcuts();
        this.injectStyles();
    }

    setupMessageListeners() {
        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('[WebWhispr Content] Received message:', message.type);

            switch (message.type) {
                case 'RECORDING_STARTED':
                    this.handleRecordingStarted();
                    break;

                case 'RECORDING_STOPPED':
                    this.handleRecordingStopped();
                    break;

                case 'INSERT_TRANSCRIPTION':
                    this.insertTranscription(message.text);
                    break;

                case 'TRANSCRIPTION_ERROR':
                    this.showError('Transcription failed: ' + message.error);
                    break;

                case 'RECORDING_ERROR':
                    this.showError('Recording failed: ' + message.error);
                    break;

                default:
                    console.log('[WebWhispr Content] Unknown message type:', message.type);
            }

            sendResponse({ success: true });
        });
    }

    setupKeyboardShortcuts() {
        // Add keyboard shortcut for voice input (Ctrl/Cmd + Shift + V)
        document.addEventListener('keydown', (event) => {
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            const modifier = isMac ? event.metaKey : event.ctrlKey;

            if (modifier && event.shiftKey && event.key === 'V') {
                event.preventDefault();
                this.toggleRecording();
            }
        });
    }

    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .webwhispr-recording-indicator {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #ff4444;
                color: white;
                padding: 12px 20px;
                border-radius: 25px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 10px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 999999;
                animation: webwhispr-pulse 1.5s ease-in-out infinite;
            }

            @keyframes webwhispr-pulse {
                0% { opacity: 0.8; }
                50% { opacity: 1; }
                100% { opacity: 0.8; }
            }

            .webwhispr-recording-dot {
                width: 10px;
                height: 10px;
                background: white;
                border-radius: 50%;
                animation: webwhispr-blink 1s ease-in-out infinite;
            }

            @keyframes webwhispr-blink {
                0% { opacity: 0; }
                50% { opacity: 1; }
                100% { opacity: 0; }
            }

            .webwhispr-notification {
                position: fixed;
                top: 20px;
                right: 20px;
                background: white;
                color: #333;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: system-ui, -apple-system, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 999999;
                animation: webwhispr-slide-in 0.3s ease-out;
            }

            @keyframes webwhispr-slide-in {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }

            .webwhispr-error {
                background: #ff4444;
                color: white;
            }

            .webwhispr-microphone-button {
                position: absolute;
                width: 24px;
                height: 24px;
                background: #4CAF50;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: none;
                align-items: center;
                justify-content: center;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
                z-index: 99999;
            }

            .webwhispr-microphone-button:hover {
                background: #45a049;
            }

            .webwhispr-microphone-button svg {
                width: 14px;
                height: 14px;
                fill: white;
            }

            input:focus + .webwhispr-microphone-button,
            textarea:focus + .webwhispr-microphone-button {
                display: flex;
            }
        `;
        document.head.appendChild(style);
    }

    toggleRecording() {
        if (!this.isRecording) {
            this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    startRecording() {
        // Store the currently active element
        this.activeElement = document.activeElement;

        // Check if it's a text input field
        if (!this.isTextInput(this.activeElement)) {
            this.showNotification('Please focus on a text field first');
            return;
        }

        console.log('[WebWhispr Content] Starting recording...');

        // Send message to background to start recording
        chrome.runtime.sendMessage({
            type: 'START_RECORDING'
        });

        this.isRecording = true;
        this.showRecordingIndicator();
    }

    stopRecording() {
        console.log('[WebWhispr Content] Stopping recording...');

        // Send message to background to stop recording
        chrome.runtime.sendMessage({
            type: 'STOP_RECORDING'
        });

        this.isRecording = false;
        this.hideRecordingIndicator();
    }

    handleRecordingStarted() {
        this.isRecording = true;
        this.activeElement = document.activeElement;

        if (!this.isTextInput(this.activeElement)) {
            // Find the first text input if none is focused
            const inputs = document.querySelectorAll('input[type="text"], input[type="search"], input[type="email"], textarea, [contenteditable="true"]');
            if (inputs.length > 0) {
                this.activeElement = inputs[0];
                this.activeElement.focus();
            }
        }

        this.showRecordingIndicator();
    }

    handleRecordingStopped() {
        this.isRecording = false;
        this.hideRecordingIndicator();
    }

    insertTranscription(text) {
        console.log('[WebWhispr Content] Inserting transcription:', text);

        if (!this.activeElement) {
            this.showError('No text field selected');
            return;
        }

        // Focus the element
        this.activeElement.focus();

        // Check if it's a contenteditable element
        if (this.activeElement.getAttribute('contenteditable') === 'true') {
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
            this.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (this.activeElement.tagName === 'INPUT' || this.activeElement.tagName === 'TEXTAREA') {
            // For input/textarea elements
            const start = this.activeElement.selectionStart;
            const end = this.activeElement.selectionEnd;
            const currentValue = this.activeElement.value;

            // Insert text at cursor position
            this.activeElement.value = currentValue.substring(0, start) + text + currentValue.substring(end);

            // Update cursor position
            const newPosition = start + text.length;
            this.activeElement.selectionStart = newPosition;
            this.activeElement.selectionEnd = newPosition;

            // Trigger events
            this.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
            this.activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        }

        this.showNotification('Transcription inserted');
    }

    isTextInput(element) {
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

    showRecordingIndicator() {
        if (this.recordingIndicator) return;

        this.recordingIndicator = document.createElement('div');
        this.recordingIndicator.className = 'webwhispr-recording-indicator';
        this.recordingIndicator.innerHTML = `
            <div class="webwhispr-recording-dot"></div>
            <span>Recording... (Click extension icon to stop)</span>
        `;

        document.body.appendChild(this.recordingIndicator);
    }

    hideRecordingIndicator() {
        if (this.recordingIndicator) {
            this.recordingIndicator.remove();
            this.recordingIndicator = null;
        }
    }

    showNotification(message, isError = false) {
        const notification = document.createElement('div');
        notification.className = 'webwhispr-notification' + (isError ? ' webwhispr-error' : '');
        notification.textContent = message;

        document.body.appendChild(notification);

        // Remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    showError(message) {
        this.showNotification(message, true);
    }

    // Add microphone buttons to input fields
    addMicrophoneButtons() {
        const inputs = document.querySelectorAll('input[type="text"], input[type="search"], textarea');

        inputs.forEach(input => {
            // Skip if button already added
            if (input.dataset.webwhisprEnabled) return;

            const button = document.createElement('button');
            button.className = 'webwhispr-microphone-button';
            button.innerHTML = `
                <svg viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                    <path d="M17.3 11c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
            `;

            button.addEventListener('click', (e) => {
                e.preventDefault();
                this.activeElement = input;
                this.toggleRecording();
            });

            // Position button relative to input
            const wrapper = document.createElement('div');
            wrapper.style.position = 'relative';
            wrapper.style.display = 'inline-block';

            input.parentNode.insertBefore(wrapper, input);
            wrapper.appendChild(input);
            wrapper.appendChild(button);

            input.dataset.webwhisprEnabled = 'true';
        });
    }
}

// Initialize the content script
const webwhispr = new WebWhisprContent();

// Add microphone buttons on page load and mutations
document.addEventListener('DOMContentLoaded', () => {
    webwhispr.addMicrophoneButtons();
});

// Watch for dynamically added inputs
const observer = new MutationObserver(() => {
    webwhispr.addMicrophoneButtons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});