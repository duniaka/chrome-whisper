# WebWhispr - Privacy-First Voice Input Chrome Extension

WebWhispr enables voice input in any text field on the web using Whisper AI, running entirely in your browser for complete privacy.

## Architecture

The extension uses a unique architecture to bypass Chrome Extension CSP restrictions:

1. **Recording**: Audio recording happens in an offscreen document with a temporary iframe
2. **Processing**: Transcription runs on a GitHub Pages hosted iframe using Transformers.js
3. **Privacy**: All processing happens locally - no audio ever leaves your browser

## Setup

### 1. Deploy GitHub Pages Processor

1. Create a GitHub repository named `webwhispr-processor`
2. Upload files from `github-pages/` folder
3. Enable GitHub Pages in repository settings
4. Note your URL: `https://YOUR_USERNAME.github.io/webwhispr-processor/`

### 2. Configure Extension

1. Edit `src/offscreen/offscreen.js`
2. Replace `YOUR_USERNAME` with your GitHub username in `PROCESSOR_URL`
3. Install dependencies: `npm install`
4. Build extension: `npm run build`

### 3. Install Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

## Usage

### Voice Input Methods

1. **Extension Icon**: Click the extension icon to start/stop recording
2. **Keyboard Shortcut**: Press `Ctrl+Shift+V` (or `Cmd+Shift+V` on Mac)
3. **Popup**: Click extension icon → Start Recording button

### How It Works

1. Focus on any text input field
2. Start recording using one of the methods above
3. Speak clearly
4. Stop recording
5. Transcription will be inserted at cursor position

## Features

- ✅ Complete privacy - all processing in browser
- ✅ Works on any website
- ✅ Multiple Whisper model sizes
- ✅ Keyboard shortcuts
- ✅ Visual recording indicator
- ✅ Auto-focus detection

## Development

```bash
# Install dependencies
npm install

# Build extension
npm run build

# Development build (same as build)
npm run dev
```

## File Structure

```
src/
├── background.js       # Service worker managing offscreen
├── content.js          # Content script for UI and text insertion
├── offscreen/          # Offscreen document for recording
│   ├── offscreen.html
│   └── offscreen.js
└── popup/              # Extension popup interface
    ├── popup.html
    └── popup.js

github-pages/           # GitHub Pages hosted processor
├── processor.html      # Processor page with CORS headers
└── processor.js        # Transformers.js Whisper implementation
```

## Technical Details

### Why This Architecture?

Chrome Extension Manifest V3 has strict CSP that prevents:
- Blob URL workers (needed by ONNX Runtime)
- Dynamic code execution
- Inline scripts

By hosting the processor on GitHub Pages, we bypass these restrictions while maintaining security.

### Message Flow

1. User triggers recording → Content Script → Background
2. Background → Offscreen Document
3. Offscreen creates recording iframe → Records audio
4. Offscreen removes recording iframe → Sends audio to processor iframe
5. Processor iframe (GitHub Pages) → Runs Whisper → Returns transcription
6. Offscreen → Background → Content Script → Insert text

## Privacy

- No servers involved - everything runs locally
- Audio never leaves your browser
- Models cached locally after first download
- No analytics or tracking

## License

ISC