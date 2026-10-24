# AudioTrim — GitHub Pages MP3 Audio Trimmer

A client-side audio trimming website. Users upload a local audio file, select and preview a section, and download the trimmed clip as an MP3 file.

## Files
- `index.html` — page structure and MP3 encoder library reference
- `style.css` — responsive design
- `script.js` — audio decoding, waveform selection, preview, resampling, and MP3 export

## Publish on GitHub Pages
1. Create a GitHub repository, for example `audio-trimmer`.
2. Upload `index.html`, `style.css`, `script.js`, and this README to the repository root.
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/(root)`, then click **Save**.
5. Open the published URL shown in the Pages settings.

## Notes
- Exports MP3 at 128 kbps.
- The MP3 encoder (`lamejs`) is loaded from cdnjs, so an internet connection is needed for MP3 export.
- Audio is processed in the browser and is not uploaded to a server.
- Large files can take time and use significant memory. Browser support for decoding input formats varies.
- Only edit audio you have the right to use.
