# tiff2pdf

Two ways to turn TIFF files (including multipage TIFFs) into PDFs.

| | Desktop tool (`tiff2pdf.py`) | Browser page (`index.html`) |
|---|---|---|
| Install | Python, or a packaged `.exe` | None: open the page |
| Quality | Lossless. CCITT G3/G4 fax data is copied into the PDF unchanged | Lossless (pages stored as PNG) |
| File size | Smallest | Larger, especially for black-and-white scans |
| Large drawings (A0 at high DPI) | Fine | Can hit browser memory / canvas limits |
| Files leave your machine? | No | No, everything runs in the browser |

Both keep the TIFF's DPI, so page sizes come out right (a 300 DPI A4 scan becomes an A4 page). If a TIFF has no DPI, 96 DPI is assumed.

## Desktop tool

```
pip install -r requirements.txt
python tiff2pdf.py scan.tif                     # -> scan.pdf next to it
python tiff2pdf.py a.tif b.tif folder/          # one PDF per TIFF
python tiff2pdf.py --merge a.tif b.tif          # -> a_merged.pdf
python tiff2pdf.py --merge -o out.pdf folder/   # choose the merged name
python tiff2pdf.py                              # no arguments: pick files in a dialog
```

### Windows drag-and-drop `.exe`

```
pip install pyinstaller
pyinstaller --onefile --name tiff2pdf tiff2pdf.py
```

Drag TIFFs onto `dist\tiff2pdf.exe` and a PDF appears next to each one. The window stays open so you can read the result. Company IT may block unsigned `.exe` files; running the `.py` with Python avoids that.

### What it does with each TIFF

1. It hands the TIFF to [img2pdf](https://gitlab.mister-muffin.de/josch/img2pdf). For CCITT Group 3/4 (typical black-and-white scans) the compressed data goes into the PDF as-is. Other compressions (LZW, Deflate, JPEG, uncompressed) are decoded and stored losslessly with Flate.
2. If img2pdf rejects a file (for example a 16-bit TIFF), it falls back to Pillow and re-encodes each page losslessly. 16-bit pages are reduced to 8-bit, which is all PDF viewers display. The tool prints a `note:` line when this happens.

## Browser page

Open `index.html` in a browser (or host it anywhere, e.g. GitHub Pages). Drop TIFFs on it, tick "Merge" if you want one PDF, and click Convert. It needs internet access to load three libraries from cdn.jsdelivr.net (pinned versions):

- [UTIF.js](https://github.com/photopea/UTIF.js) 3.1.0: TIFF decoding
- [pako](https://github.com/nodeca/pako) 1.0.11: Deflate support for UTIF.js
- [pdf-lib](https://pdf-lib.js.org/) 1.17.1: PDF writing

`index.html` includes a fix for UTIF.js mis-colouring JPEG-compressed TIFFs that use RGB photometric. That fix is tied to UTIF.js 3.1.0, so re-test JPEG TIFFs if you change that version.

## Tested

Both tools were checked against generated TIFFs: multipage CCITT G4 at 300 DPI, JPEG (RGB and YCbCr photometric), RGBA, 16-bit greyscale and CMYK LZW. Page sizes and pixel colours matched the source. Test with a few of your real files before relying on it, especially unusual scanner output.

## Alternatives that need no code

- libtiff's [`tiff2pdf`](https://libtiff.gitlab.io/libtiff/tools/tiff2pdf.html) command-line tool
- macOS Preview: File → Export as PDF
