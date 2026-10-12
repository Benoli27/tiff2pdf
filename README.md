# tiff2pdf

Turns TIFF files (multipage included) into PDFs. Built on [img2pdf](https://gitlab.mister-muffin.de/josch/img2pdf).

- No quality loss. CCITT G3/G4 data (typical black-and-white scans) goes into the PDF unchanged. Other compressions (LZW, Deflate, JPEG, uncompressed) are decoded and stored losslessly with Flate.
- Keeps the TIFF's DPI, so page sizes come out right (a 300 DPI A4 scan becomes an A4 page). If a TIFF has no DPI, 96 DPI is assumed.
- Files never leave your machine.

## Get the exe

GitHub builds `tiff2pdf.exe` on every push (workflow: `.github/workflows/build-exe.yml`).

1. Open the repo's **Actions** tab and click the latest green **Build Windows exe** run.
2. Under **Artifacts**, download **tiff2pdf-windows** and unzip it.
3. Move `tiff2pdf.exe` somewhere permanent, e.g. `C:\Tools\tiff2pdf.exe`.

It's a single file with no installer and doesn't need Python.

## Use it

- **Drag and drop:** drag TIFFs (or a folder) onto `tiff2pdf.exe`. A PDF appears next to each TIFF. A window shows the result; press Enter to close it.
- **Double-click:** opens a file picker.
- **Right-click → Send to (recommended):**
  1. Press `Win + R`, type `shell:sendto`, press Enter.
  2. In that folder, right-click → New → Shortcut, and point it at `tiff2pdf.exe`.
  3. Now select TIFFs in Explorer → right-click → Send to → tiff2pdf. On Windows 11, choose "Show more options" first.

### Merge into one PDF

From a Command Prompt:

```
C:\Tools\tiff2pdf.exe --merge -o combined.pdf page1.tif page2.tif
```

## First run: Windows SmartScreen

The exe isn't code-signed, so Windows may show "Windows protected your PC". Click **More info → Run anyway**. If your company's IT blocks unsigned programs, ask them to allow it, or use the Python route below.

## Running from Python instead

```
pip install -r requirements.txt
python tiff2pdf.py scan.tif
python tiff2pdf.py --merge -o out.pdf folder/
```

To build the exe yourself on Windows: `pip install pyinstaller` then `pyinstaller --onefile --name tiff2pdf tiff2pdf.py`. The result is in `dist\`.

## Fallback for unusual TIFFs

If img2pdf rejects a file (for example 16-bit), the tool re-encodes each page losslessly with Pillow and prints a `note:` line. 16-bit pages are reduced to 8-bit, which is what PDF viewers display anyway.

## Alternatives that need no install

- libtiff's [`tiff2pdf`](https://libtiff.gitlab.io/libtiff/tools/tiff2pdf.html) command-line tool
- macOS Preview: File → Export as PDF
