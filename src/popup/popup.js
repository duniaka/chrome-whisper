// Load saved settings
chrome.storage.sync.get(['modelSize', 'language'], (result) => {
    if (result.modelSize) {
        document.getElementById('modelSize').value = result.modelSize;
    }
    if (result.language) {
        document.getElementById('language').value = result.language;
    }
});

// Save settings when changed
document.getElementById('modelSize').addEventListener('change', (e) => {
    const modelSize = e.target.value;
    chrome.storage.sync.set({ modelSize }, () => {
        showStatus('Model preference saved', 'success');
        // Notify background to reload model
        chrome.runtime.sendMessage({ type: 'MODEL_CHANGED', modelSize });
    });
});

document.getElementById('language').addEventListener('change', (e) => {
    const language = e.target.value;
    chrome.storage.sync.set({ language }, () => {
        showStatus('Language preference saved', 'success');
        // Notify background to reload model
        chrome.runtime.sendMessage({ type: 'LANGUAGE_CHANGED', language });
    });
});

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status show ${type}`;
    setTimeout(() => {
        status.classList.remove('show');
    }, 2000);
}

// Test microphone button
document.getElementById('testMic').addEventListener('click', async () => {
    const button = document.getElementById('testMic');
    button.textContent = '⏳ Testing...';
    button.disabled = true;

    try {
        // Send message to background to start a test recording
        await chrome.runtime.sendMessage({ type: 'TEST_MIC' });

        showStatus('Look for permission prompt! Click Allow when it appears', 'info');

        // Wait a bit, then stop the test
        setTimeout(() => {
            chrome.runtime.sendMessage({ type: 'STOP_TEST' });
            button.textContent = '🎤 Test Microphone Permission';
            button.disabled = false;
            showStatus('Test complete! Try using the extension now', 'success');
        }, 3000);
    } catch (error) {
        showStatus('Test failed: ' + error.message, 'error');
        button.textContent = '🎤 Test Microphone Permission';
        button.disabled = false;
    }
});
