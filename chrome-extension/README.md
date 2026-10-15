# TIFF Viewer for Chrome

A Chrome extension that opens TIFF images (including multipage) in a Chrome tab and saves them as PDF. Everything runs on your computer; files are not uploaded.

## Install

1. Unzip `TIFF-Viewer-Chrome.zip` into a folder you'll keep, e.g.
   `C:\Users\Ben\Dropbox\Ben\PW System Projects\Tiff Viewer\Chrome`.
   `manifest.json` should be directly inside that folder.
2. In Chrome, go to `chrome://extensions`.
3. Switch on **Developer mode** (top right).
4. Click **Load unpacked** and choose the folder from step 1.
5. Click **Details** on TIFF Viewer and switch on **Allow access to file URLs**. Without this it can't open TIFFs from your PC by double-click or drag-in.
6. Optional: click the puzzle-piece icon in the toolbar and pin TIFF Viewer.

Don't delete or move the folder afterwards. Chrome loads the extension from it every time it starts.

## Use

- **Links to .tif/.tiff on websites** open in the viewer instead of downloading.
- **Files on your PC:** drag a TIFF into a Chrome window, or right-click it in Explorer → Open with → Google Chrome. To make that the default, use Open with → Choose another app → Google Chrome → Always.
- **Toolbar button:** opens an empty viewer; click **Open…** or drop a file on it.
- **Right-click a link** → **Open in TIFF Viewer** for links that don't end in .tif.

In the viewer:

| | |
|---|---|
| ‹ › or ← → / PgUp PgDn | previous / next page |
| − + / zoom menu | zoom; Fit width, Fit page, 100% |
| ⟳ or R | rotate 90° (also applied to the saved PDF) |
| Save as PDF or Ctrl+S | saves a PDF with one page per TIFF page, sized from the TIFF's DPI |
| Save TIFF | saves the original file |
| Open… or Ctrl+O | open another file |

## Limits

- PDF pages are stored as lossless PNG. For black-and-white scans that's bigger than the original TIFF; the `tiff2pdf.exe` desktop tool makes smaller PDFs.
- Very large drawings (e.g. A0 at 400+ DPI) can exceed what Chrome can hold in a canvas, and that page shows an error.
- Unusual TIFFs (some 16-bit, old-style JPEG) may not decode.

## Updating

Replace the files in the folder, then click the reload arrow on TIFF Viewer in `chrome://extensions`.

## Libraries (bundled in `lib/`, MIT licence)

- UTIF.js 3.1.0, https://github.com/photopea/UTIF.js
- pako 1.0.11, https://github.com/nodeca/pako
- pdf-lib 1.17.1, https://pdf-lib.js.org/
