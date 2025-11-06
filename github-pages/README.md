# WebWhispr Processor - GitHub Pages Setup

This folder contains the processor files that need to be hosted on GitHub Pages to handle Whisper AI transcription.

## Setup Instructions

1. **Create a new GitHub repository** named `webwhispr-processor`

2. **Upload these files** to the repository:
   - `processor.html`
   - `processor.js`

3. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Set Source to: Deploy from a branch
   - Select branch: main (or master)
   - Select folder: / (root)
   - Click Save

4. **Wait for deployment** (usually takes 5-10 minutes)
   - Your processor will be available at: `https://YOUR_USERNAME.github.io/webwhispr-processor/`

5. **Update the extension**:
   - Edit `src/offscreen/offscreen.js`
   - Replace `YOUR_USERNAME` in the `PROCESSOR_URL` with your GitHub username
   - Rebuild the extension with `npm run build`

## Important Notes

- The processor runs entirely in the browser - no data is sent to servers
- Models are downloaded from Hugging Face CDN and cached locally
- Make sure the repository is PUBLIC for GitHub Pages to work
- The Cross-Origin headers in processor.html are required for SharedArrayBuffer

## Testing

Once deployed, you can test the processor directly by visiting:
`https://YOUR_USERNAME.github.io/webwhispr-processor/processor.html`

You should see "Processor initializing..." followed by "Processor ready" once the model loads.

## Security

The processor only accepts messages from the Chrome extension (via postMessage).
In production, you should verify the origin of messages for additional security.