"""Render an HTML page in Chromium and pixel-diff it against the source PDF.

The reference is MuPDF's own compositor at 72 dpi, so one PDF point == one CSS
pixel and every coordinate from the extractor maps 1:1 onto the raster.

Two metrics are reported because one of them lies: the raw per-pixel diff is
dominated by rasterizer antialiasing, while the blur/box metric isolates real
geometry error. A region that is hot raw but cold under blur is AA fringe; a
region hot in both is a genuine placement bug.

Usage:
  python render_diff.py page.html --pdf design.pdf [--selector .art]
         [--width 1920] [--height 2820] [--page 0] [--grid 12x6] [--save diff]
"""
import argparse
import os

import numpy as np
import pymupdf
from PIL import Image, ImageFilter
from playwright.sync_api import sync_playwright


def box2(img):
    """2x2 box average: cancels sub-pixel colour fringing."""
    hh, ww = img.shape[0] // 2 * 2, img.shape[1] // 2 * 2
    return img[:hh, :ww].reshape(hh // 2, 2, ww // 2, 2).mean(axis=(1, 3))


LUM = (0.299, 0.587, 0.114)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--pdf", required=True)
    ap.add_argument("--selector", default=".art",
                    help="element to screenshot (default: .art)")
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=2820)
    ap.add_argument("--page", type=int, default=0)
    ap.add_argument("--grid", default="12x6")
    ap.add_argument("--save", default=None,
                    help="write the screenshot + reference next to this prefix")
    a = ap.parse_args()

    ref_path = (a.save + "-ref.png") if a.save else "_ref.png"
    shot_path = (a.save + "-shot.png") if a.save else "_shot.png"

    doc = pymupdf.open(a.pdf)
    doc[a.page].get_pixmap(matrix=pymupdf.Matrix(1, 1), alpha=False).save(ref_path)

    url = "file:///" + os.path.abspath(a.html).replace("\\", "/")
    with sync_playwright() as pw:
        # Chromium uses sub-pixel (LCD) text AA, PyMuPDF renders grayscale.
        # Without these flags you measure AA fringing, not placement.
        b = pw.chromium.launch(args=["--disable-lcd-text",
                                     "--force-color-profile=srgb"])
        pg = b.new_page(viewport={"width": a.width, "height": 900},
                        device_scale_factor=1)
        errs = []
        pg.on("console", lambda m: errs.append(m.type + ": " + m.text)
              if m.type in ("error", "warning") else None)
        pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        pg.goto(url)
        try:
            pg.wait_for_function("document.fonts.status === 'loaded'",
                                 timeout=20000)
        except Exception:
            pass
        pg.wait_for_timeout(800)
        el = pg.query_selector(a.selector) or pg.query_selector("body")
        el.screenshot(path=shot_path)
        b.close()

    if errs:
        print("CONSOLE:", *errs[:10], sep="\n  ")

    A = Image.open(ref_path).convert("RGB")
    C = Image.open(shot_path).convert("RGB")
    a_rgb = np.asarray(A, dtype=np.int16)
    c_rgb = np.asarray(C, dtype=np.int16)

    h = min(a_rgb.shape[0], c_rgb.shape[0])
    w = min(a_rgb.shape[1], c_rgb.shape[1])
    print("ref %s   shot %s   compare %dx%d"
          % (A.size, C.size, w, h))
    a_rgb, c_rgb = a_rgb[:h, :w], c_rgb[:h, :w]

    d = np.abs(a_rgb - c_rgb).max(axis=2)
    bad = d > 24
    print("MISMATCH %.3f%%   mean|d| %.2f   max %d"
          % (100.0 * bad.mean(), d.mean(), d.max()))

    ba = np.asarray(Image.open(ref_path).convert("L")
                    .filter(ImageFilter.GaussianBlur(1)), dtype=np.int16)[:h, :w]
    bc = np.asarray(Image.open(shot_path).convert("L")
                    .filter(ImageFilter.GaussianBlur(1)), dtype=np.int16)[:h, :w]
    db = np.abs(ba - bc)
    print("PERCEPTUAL (1px blur, luminance): >8 %.3f%%   >24 %.3f%%   mean %.2f"
          % (100 * (db > 8).mean(), 100 * (db > 24).mean(), db.mean()))

    la = box2(a_rgb.astype(np.float32) @ LUM)
    lc = box2(c_rgb.astype(np.float32) @ LUM)
    dl = np.abs(la - lc)
    print("AA-ROBUST (2x2 box, luminance):  >8 %.3f%%   >24 %.3f%%   mean %.2f"
          % (100 * (dl > 8).mean(), 100 * (dl > 24).mean(), dl.mean()))

    rows, cols = (int(v) for v in a.grid.lower().split("x"))
    for name, msk, sh, sw in (("raw", bad, h, w),
                              ("aa ", dl > 24, dl.shape[0], dl.shape[1])):
        print("--- %s grid ---" % name)
        for r in range(rows):
            line = []
            for k in range(cols):
                y0, y1 = r * sh // rows, (r + 1) * sh // rows
                x0, x1 = k * sw // cols, (k + 1) * sw // cols
                line.append("%5.1f" % (100.0 * msk[y0:y1, x0:x1].mean()))
            print("y %4d-%4d | %s"
                  % (r * h // rows, (r + 1) * h // rows, " ".join(line)))

    if bad.any():
        ys, xs = np.nonzero(bad)
        print("bbox of diff: x %d-%d  y %d-%d"
              % (xs.min(), xs.max(), ys.min(), ys.max()))

    if not a.save:
        os.remove(ref_path)
        os.remove(shot_path)


if __name__ == "__main__":
    main()
