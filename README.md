# AudioTrim — GitHub Pages Audio Trimmer

A client-side audio trimming website. It lets users select a local audio file, preview a selected section, and download the selection as a WAV file.

## Files

- `index.html` — page structure
- `style.css` — responsive design
- `script.js` — file decoding, waveform selection, preview, and WAV export

## Run locally

1. Download and extract the ZIP.
2. Keep all three files in the same folder.
3. Open `index.html` in a recent browser. For the most consistent behaviour, use a local static server or GitHub Pages.

## Publish on GitHub Pages

1. Sign in to GitHub and create a new repository, for example `audio-trimmer`.
2. Upload `index.html`, `style.css`, `script.js`, and optionally `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then click **Save**.
6. Wait for GitHub to publish the site. Open the URL shown in the Pages settings.

## Important technical notes

- Audio is processed in the visitor's browser; this project does not upload audio to a server.
- The browser must support decoding the selected audio format. File extensions alone do not guarantee browser compatibility.
- Export currently creates a 16-bit PCM WAV file. It does not export MP3.
- Large audio files may use substantial device memory. If decoding fails, try a shorter or smaller file, or convert it to a browser-supported format.
- The waveform is drawn with the Canvas API. Drag from one point to another to select a segment.
- Google Fonts are used for typography when internet access is available; the tool still works if those fonts cannot load.
- If you publish publicly, make it clear that users should only edit audio they have the right to use.
