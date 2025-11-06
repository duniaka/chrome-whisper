// WebWhispr Popup Script

document.addEventListener('DOMContentLoaded', () => {
    const recordBtn = document.getElementById('recordBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    const statusDiv = document.getElementById('status');
    const modelSelect = document.getElementById('modelSelect');
    const processorUrlInput = document.getElementById('processorUrl');

    let isRecording = false;

    // Load saved settings
    loadSettings();

    // Record button handler
    recordBtn.addEventListener('click', () => {
        if (!isRecording) {
            startRecording();
        } else {
            stopRecording();
        }
    });

    // Settings button handler
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('active');
    });

    // Save settings on change
    modelSelect.addEventListener('change', saveSettings);
    processorUrlInput.addEventListener('input', debounce(saveSettings, 500));

    // Check if Mac for shortcut display
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    if (isMac) {
        document.querySelectorAll('.kbd').forEach(kbd => {
            kbd.textContent = kbd.textContent.replace('Ctrl', 'Cmd');
        });
    }

    function startRecording() {
        console.log('Starting recording from popup...');

        chrome.runtime.sendMessage({
            type: 'START_RECORDING'
        }, (response) => {
            if (response?.success) {
                isRecording = true;
                updateUI();
            }
        });
    }

    function stopRecording() {
        console.log('Stopping recording from popup...');

        chrome.runtime.sendMessage({
            type: 'STOP_RECORDING'
        }, (response) => {
            if (response?.success) {
                isRecording = false;
                updateUI();
            }
        });
    }

    function updateUI() {
        if (isRecording) {
            recordBtn.textContent = 'Stop Recording';
            recordBtn.classList.add('recording');
            statusDiv.textContent = 'Recording in progress...';
        } else {
            recordBtn.textContent = 'Start Recording';
            recordBtn.classList.remove('recording');
            statusDiv.textContent = 'Ready to record';
        }
    }

    function loadSettings() {
        chrome.storage.local.get(['whisperModel', 'processorUrl'], (data) => {
            if (data.whisperModel) {
                modelSelect.value = data.whisperModel;
            }
            if (data.processorUrl) {
                processorUrlInput.value = data.processorUrl;
            }
        });
    }

    function saveSettings() {
        const settings = {
            whisperModel: modelSelect.value,
            processorUrl: processorUrlInput.value
        };

        chrome.storage.local.set(settings, () => {
            console.log('Settings saved:', settings);

            // Notify background script of settings change
            chrome.runtime.sendMessage({
                type: 'SETTINGS_UPDATED',
                settings: settings
            });
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Listen for status updates
    chrome.runtime.onMessage.addListener((message) => {
        if (message.type === 'RECORDING_STARTED') {
            isRecording = true;
            updateUI();
        } else if (message.type === 'RECORDING_STOPPED' ||
                   message.type === 'TRANSCRIPTION_COMPLETE') {
            isRecording = false;
            updateUI();
        }
    });
});