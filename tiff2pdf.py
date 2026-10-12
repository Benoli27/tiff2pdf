"""Convert TIFF files to PDF losslessly using img2pdf.

Usage:
    tiff2pdf.py FILE.tif [FILE2.tif ...]          one PDF per TIFF, saved next to it
    tiff2pdf.py --merge FILE.tif [FILE2.tif ...]  all TIFFs into one PDF
    tiff2pdf.py --merge -o out.pdf FILE.tif ...   choose the merged output name

On Windows you can drag TIFFs onto the script (or the packaged .exe).
Run it with no arguments to pick files from a dialog.
"""

import argparse
import io
import os
import sys
from pathlib import Path

import img2pdf
import pikepdf
from PIL import Image, ImageSequence

TIFF_EXTS = {".tif", ".tiff"}


def pages_as_png(path):
    """Fallback for TIFFs img2pdf rejects (e.g. 16-bit, unusual modes).
    Pages are re-encoded losslessly, keeping their DPI. 16-bit pages are
    reduced to 8-bit, since PDF viewers display 8 bits per channel anyway."""
    pages = []
    with Image.open(path) as im:
        for frame in ImageSequence.Iterator(im):
            dpi = frame.info.get("dpi")
            if dpi and min(dpi) < 10:  # missing/bogus resolution tag
                dpi = None
            if frame.mode in ("RGBA", "LA", "PA") or "transparency" in frame.info:
                rgba = frame.convert("RGBA")
                flat = Image.new("RGB", rgba.size, "white")
                flat.paste(rgba, mask=rgba.getchannel("A"))
                frame = flat
            elif frame.mode in ("I;16", "I;16B", "I;16L", "I"):
                frame = frame.convert("I").point(lambda v: v / 256).convert("L")
            elif frame.mode not in ("1", "L", "RGB", "CMYK", "P"):
                frame = frame.convert("RGB")
            buf = io.BytesIO()
            save_kwargs = {"dpi": tuple(round(d) for d in dpi)} if dpi else {}
            if frame.mode == "CMYK":
                frame.save(buf, format="TIFF", compression="tiff_adobe_deflate", **save_kwargs)
            else:
                frame.save(buf, format="PNG", **save_kwargs)
            pages.append(buf.getvalue())
    return pages


def tiff_to_pdf_bytes(path):
    """Embed the TIFF as-is where img2pdf can (no re-encoding); otherwise
    fall back to lossless re-encoded pages."""
    try:
        return img2pdf.convert(str(path)), False
    except Exception:
        return img2pdf.convert(pages_as_png(path)), True


def convert(paths, output):
    pdfs = []
    for p in paths:
        data, fallback = tiff_to_pdf_bytes(p)
        if fallback:
            print(f"  note: {p.name} not directly embeddable; re-encoded (see README)")
        pdfs.append(data)
    if len(pdfs) == 1:
        output.write_bytes(pdfs[0])
        return
    merged = pikepdf.new()
    for data in pdfs:
        merged.pages.extend(pikepdf.open(io.BytesIO(data)).pages)
    merged.save(output)


def collect(args_files):
    files = []
    for f in args_files:
        p = Path(f)
        if p.is_dir():
            files.extend(sorted(q for q in p.iterdir() if q.suffix.lower() in TIFF_EXTS))
        elif p.suffix.lower() in TIFF_EXTS:
            files.append(p)
        else:
            print(f"skipping (not a TIFF): {p}")
    return files


def pick_files():
    try:
        import tkinter
        from tkinter import filedialog
    except ImportError:
        return []
    root = tkinter.Tk()
    root.withdraw()
    chosen = filedialog.askopenfilenames(
        title="Choose TIFF files", filetypes=[("TIFF images", "*.tif *.tiff")]
    )
    root.destroy()
    return list(chosen)


def main():
    ap = argparse.ArgumentParser(description="Convert TIFF files to PDF (lossless).")
    ap.add_argument("files", nargs="*", help="TIFF files or folders")
    ap.add_argument("-m", "--merge", action="store_true", help="combine all inputs into one PDF")
    ap.add_argument("-o", "--output", help="output PDF path (with --merge)")
    args = ap.parse_args()

    interactive = not args.files
    files = collect(args.files or pick_files())
    if not files:
        print("No TIFF files given.")
        return 1

    failed = 0
    if args.merge:
        out = Path(args.output) if args.output else files[0].with_name(files[0].stem + "_merged.pdf")
        try:
            convert(files, out)
            print(f"OK  {len(files)} file(s) -> {out}")
        except Exception as e:
            print(f"FAIL merge: {e}")
            failed = 1
    else:
        for f in files:
            out = f.with_suffix(".pdf")
            try:
                convert([f], out)
                print(f"OK  {f.name} -> {out.name}")
            except Exception as e:
                print(f"FAIL {f.name}: {e}")
                failed += 1

    # Keep the console window open when launched by drag-and-drop/double-click on Windows.
    if os.name == "nt" and (interactive or getattr(sys, "frozen", False)):
        input("\nPress Enter to close...")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
