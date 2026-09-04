#!/usr/bin/env python3
"""
pdf_image_to_html.py

Convert a PDF / image / .ai / .psd design into a geometry-exact, responsive
HTML + Tailwind page.

NO external LLM. NO API key. NO network calls.

The agent running this skill is the model. This script only does the parts a
computer is measurably better at than a language model:

  * rasterize the source into a reference PNG
  * pull out real embedded images (SMask / Indexed-colorspace safe)
  * read every text span's exact bbox, font, size and colour
  * locate vector artwork that has NO extractable text (outlined type)
  * emit design.json + a percentage-positioned Tailwind scaffold
  * score a rendered HTML against the reference PNG with a pixel diff

Subcommands
-----------
  analyze <input>     -> reference/, assets/, design.json, scaffold.html
  compare <html>      -> mismatch %, plus diff + side-by-side overlay PNGs

Requires:
    pip install pymupdf pillow                     # analyze + compare
    pip install psd-tools                          # only for .psd input
    pip install playwright && playwright install chromium   # only for compare

Examples:
    python pdf_image_to_html.py analyze flyer.pdf
    python pdf_image_to_html.py analyze flyer.pdf \\
        --crop headline=100,1230,672,1820 --crop cta=100,2166,899,2355
    python pdf_image_to_html.py compare flyer_html/scaffold.html \\
        --reference flyer_html/reference/page_1.png --width 1920
"""

from __future__ import annotations

import argparse
import html as html_mod
import json
import logging
import re
from collections import Counter
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("design_to_html")

DEFAULT_DPI = 144                 # reference render resolution
DEFAULT_MIN_ASSET_DIM = 48        # px; skip tiny icon/UI fragments
DEFAULT_CLUSTER_GAP = 24          # pt; drawings closer than this merge into one region
RASTER_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PDF_LIKE_SUFFIXES = {".pdf", ".ai"}  # .ai files are usually PDF-compatible underneath

# Fallback web stacks for fonts found in the source. The agent should override
# these with real matches via --font-map once it has looked at the design.
FONT_FALLBACKS = [
    ("cond",      "'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', system-ui, sans-serif"),
    ("boldcond",  "'Barlow Condensed', 'Roboto Condensed', 'Arial Narrow', system-ui, sans-serif"),
    ("serif",     "Georgia, 'Times New Roman', serif"),
    ("mono",      "ui-monospace, 'SFMono-Regular', Menlo, monospace"),
]
DEFAULT_FONT_STACK = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"


def _fitz():
    """PyMuPDF import shim. `fitz` is the legacy alias; `pymupdf` is current."""
    try:
        import pymupdf as fitz
    except ImportError:
        try:
            import fitz  # type: ignore[no-redef]
        except ImportError as exc:  # pragma: no cover
            raise SystemExit(
                "PyMuPDF is required. Install with: pip install pymupdf"
            ) from exc
    return fitz


def _hex(color) -> str | None:
    """PyMuPDF reports span colours as a packed 0xRRGGBB int and drawing
    fill/stroke colours as an (r, g, b) float triple. Accept either."""
    if color is None:
        return None
    if isinstance(color, (tuple, list)):
        if len(color) < 3:
            return None
        r, g, b = color[:3]
        return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))
    return "#%06x" % (int(color) & 0xFFFFFF)


def _slug(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z]+", "_", name).strip("_") or "font"


# ---------------------------------------------------------------------------
# 1. Input normalization -> flat reference images
# ---------------------------------------------------------------------------

def rasterize_source(path: Path, dpi: int, out_dir: Path) -> list[Path]:
    """Produce the flattened reference image(s). Handles raster, PDF/AI, PSD."""
    suffix = path.suffix.lower()
    if suffix in RASTER_SUFFIXES:
        return [path]
    if suffix in PDF_LIKE_SUFFIXES:
        return pdf_to_images(path, dpi, out_dir)
    if suffix == ".psd":
        return [psd_to_composite(path, out_dir)]
    raise SystemExit(
        f"Unsupported input type: {suffix}. Supported: "
        f"{', '.join(sorted(RASTER_SUFFIXES | PDF_LIKE_SUFFIXES | {'.psd'}))}"
    )


def pdf_to_images(pdf_path: Path, dpi: int, out_dir: Path) -> list[Path]:
    fitz = _fitz()
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        hint = (
            " If this is an .ai file, re-save it from Illustrator with "
            "'Create PDF Compatible File' checked, or export a PDF/PNG instead."
            if pdf_path.suffix.lower() == ".ai"
            else ""
        )
        raise SystemExit(f"Could not open {pdf_path.name}: {exc}.{hint}") from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    pages: list[Path] = []
    for i, page in enumerate(doc):
        out_path = out_dir / f"page_{i + 1}.png"
        page.get_pixmap(dpi=dpi).save(out_path)
        pages.append(out_path)
        log.info("Rendered page %d -> %s", i + 1, out_path)
    doc.close()
    return pages


def strip_text_page(pdf_path: Path, page_no: int, out_png: Path, dpi: int,
                    pad: float = 1.5) -> Path | None:
    """Render a page with all EXTRACTABLE text removed, artwork untouched.

    This is the single most useful output for a faithful rebuild: it gives you
    a pixel-exact base layer -- background bands, vector art, cut-out photos,
    and any type that was converted to outlines -- with holes where the real
    text used to be. Layer genuine HTML text over it at the measured
    coordinates and you get 1:1 fidelity *and* selectable, reflowable copy.

    The flags matter: images and line art are explicitly preserved, so only
    text objects are redacted. Without them, apply_redactions() would happily
    eat the logo vectors and photos that happen to intersect a text bbox.
    """
    fitz = _fitz()
    try:
        doc = fitz.open(pdf_path)
    except Exception as exc:
        log.warning("Could not open %s for text stripping: %s", pdf_path.name, exc)
        return None

    page = doc[page_no - 1]
    rects = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                if sp.get("text", "").strip():
                    rects.append(fitz.Rect(sp["bbox"]) + (-pad, -pad, pad, pad))
    if not rects:
        doc.close()
        return None

    for r in rects:
        page.add_redact_annot(r)
    page.apply_redactions(
        images=fitz.PDF_REDACT_IMAGE_NONE,
        graphics=fitz.PDF_REDACT_LINE_ART_NONE,
    )
    out_png.parent.mkdir(parents=True, exist_ok=True)
    page.get_pixmap(dpi=dpi).save(out_png)
    doc.close()
    log.info("Rendered text-free base layer -> %s (%d span(s) cleared)",
             out_png, len(rects))
    return out_png


def psd_to_composite(psd_path: Path, out_dir: Path) -> Path:
    try:
        from psd_tools import PSDImage
    except ImportError as exc:
        raise SystemExit(
            "psd-tools is required for PSD input. Install with: pip install psd-tools"
        ) from exc

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{psd_path.stem}_composite.png"
    PSDImage.open(psd_path).composite().save(out_path)
    log.info("Rendered PSD composite -> %s", out_path)
    return out_path


# ---------------------------------------------------------------------------
# 2. Real asset extraction
# ---------------------------------------------------------------------------

def extract_assets(path: Path, out_dir: Path, min_dim: int) -> list[dict]:
    suffix = path.suffix.lower()
    assets_dir = out_dir / "assets"
    if suffix in PDF_LIKE_SUFFIXES:
        return _extract_pdf_assets(path, assets_dir, min_dim)
    if suffix == ".psd":
        return _extract_psd_assets(path, assets_dir, min_dim)
    return []  # plain screenshots have no separable embedded assets


def _extract_pdf_assets(path: Path, assets_dir: Path, min_dim: int) -> list[dict]:
    """Render each embedded image's placement rect through the page's own
    compositor instead of pulling the raw XObject stream.

    doc.extract_image(xref) silently returns the WRONG pixels for a meaningful
    slice of real PDFs: an image with an Indexed colorspace, or a separate
    SMask (soft mask / alpha), can come back as just the flat silhouette with
    no colour data at all, or as raw indexed bytes with no palette applied. It
    does not error -- it returns a valid-looking dict with wrong content. A
    plain marketing flyer hit both variants in one file during testing.

    page.get_pixmap(clip=rect, alpha=True) asks MuPDF to render that rectangle
    the same way it renders the full page, so colorspace resolution, alpha
    compositing and paint order are all handled by the authoritative renderer
    instead of being re-derived from lower-level stream data.
    """
    fitz = _fitz()
    doc = fitz.open(path)
    manifest: list[dict] = []
    seen: set[int] = set()
    for page_no, page in enumerate(doc, start=1):
        for info in page.get_image_info(xrefs=True):
            xref = info.get("xref")
            if not xref or xref in seen:
                continue
            seen.add(xref)
            rect = fitz.Rect(info["bbox"]) & page.rect  # clip to the visible page
            if rect.is_empty or rect.width < min_dim or rect.height < min_dim:
                continue
            assets_dir.mkdir(parents=True, exist_ok=True)
            pix = page.get_pixmap(clip=rect, alpha=True, dpi=200)
            fname = f"asset_{xref}.png"
            pix.save(assets_dir / fname)
            manifest.append({
                "file": f"assets/{fname}",
                "page": page_no,
                "xref": xref,
                "pixels": [pix.width, pix.height],
            })
    doc.close()
    log.info("Extracted %d embedded image asset(s) -> %s", len(manifest), assets_dir)
    return manifest


def _extract_psd_assets(path: Path, assets_dir: Path, min_dim: int) -> list[dict]:
    from psd_tools import PSDImage

    psd = PSDImage.open(path)
    manifest: list[dict] = []
    for layer in psd.descendants():
        if not layer.is_visible() or layer.kind != "pixel":
            continue  # skip groups, adjustment, shape and text layers
        if layer.width < min_dim or layer.height < min_dim:
            continue
        img = layer.composite()
        if img is None:
            continue
        assets_dir.mkdir(parents=True, exist_ok=True)
        fname = f"{re.sub(r'[^\\w.-]', '_', layer.name) or f'layer_{layer.layer_id}'}.png"
        img.save(assets_dir / fname)
        manifest.append({"file": f"assets/{fname}", "pixels": [layer.width, layer.height],
                         "layer": layer.name})
    log.info("Extracted %d raster layer(s) -> %s", len(manifest), assets_dir)
    return manifest


def extract_vector_region(
    path: Path, out_dir: Path, name: str, rect: tuple[float, float, float, float], dpi: int = 300
) -> dict:
    """Crop a region of vector-built artwork straight out of the page render.

    Use this for outlined display type, logo lockups, badges and other
    decorative brand art that has no extractable text behind it. Do NOT try to
    replay page.get_drawings() as individually styled HTML/SVG elements: a
    compound path with fill holes (letterforms with counters) degrades into an
    unreadable blob when each sub-shape is approximated by its bounding box,
    and paint order against interleaved images is easy to get backwards.
    """
    fitz = _fitz()
    doc = fitz.open(path)
    page = doc[0]
    out_dir.mkdir(parents=True, exist_ok=True)
    pix = page.get_pixmap(clip=fitz.Rect(*rect), dpi=dpi)
    fname = f"{name}.png"
    pix.save(out_dir / fname)
    doc.close()
    log.info("Cropped region '%s' -> %s", name, out_dir / fname)
    return {"file": f"assets/{fname}", "pixels": [pix.width, pix.height],
            "rect_pt": list(rect)}


# ---------------------------------------------------------------------------
# 3. Page analysis: text geometry, vector regions, palette
# ---------------------------------------------------------------------------

def _pct(value: float, total: float) -> float:
    return round(value / total * 100, 4) if total else 0.0


def analyze_text(page, width: float, height: float) -> list[dict]:
    """Every text span, with the geometry needed to place it in HTML."""
    spans: list[dict] = []
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            for sp in line.get("spans", []):
                text = sp.get("text", "").strip()
                if not text:
                    continue
                x0, y0, x1, y1 = sp["bbox"]
                ox, oy = sp["origin"]
                spans.append({
                    "text": text,
                    "font": sp["font"],
                    "size_pt": round(sp["size"], 2),
                    "bold": bool(re.search(r"(bold|black|heavy|semibold)", sp["font"], re.I)),
                    "color": _hex(sp.get("color")),
                    "bbox_pt": [round(v, 2) for v in (x0, y0, x1, y1)],
                    "bbox_pct": [_pct(x0, width), _pct(y0, height),
                                 _pct(x1, width), _pct(y1, height)],
                    "origin_pt": [round(ox, 2), round(oy, 2)],
                })
    spans.sort(key=lambda s: (round(s["bbox_pt"][1], 1), s["bbox_pt"][0]))
    return spans


def cluster_drawings(page, width: float, height: float, gap: float) -> list[dict]:
    """Group vector drawings into spatial clusters.

    Any cluster is artwork with NO extractable text behind it -- outlined
    display type, logo lockups, rules, pills, background shapes. The agent has
    to look at the reference render and decide what each one is. We report the
    bbox plus the fill colours used, which is usually enough to tell "yellow
    button with blue text" from "decorative swoosh".
    """
    fitz = _fitz()
    drawings = page.get_drawings()
    page_area = width * height

    # A full-bleed background fill (a colour band, a page-sized rect) touches
    # almost every other shape, so clustering everything together collapses
    # the page into one useless region. Split those out first and report them
    # on their own -- they are CSS background, not artwork to crop.
    background, foreground = [], []
    for d in drawings:
        r = d["rect"]
        if r.is_empty or r.is_infinite:
            continue
        (background if (r.width * r.height) / page_area > 0.20 else foreground).append(d)

    boxes: list[tuple[float, float, float, float]] = [
        (d["rect"].x0, d["rect"].y0, d["rect"].x1, d["rect"].y1) for d in foreground
    ]

    def _describe(items: list, note: str) -> dict | None:
        if not items:
            return None
        x0 = min(d["rect"].x0 for d in items); y0 = min(d["rect"].y0 for d in items)
        x1 = max(d["rect"].x1 for d in items); y1 = max(d["rect"].y1 for d in items)
        fills: Counter = Counter()
        for d in items:
            for key in ("fill", "color"):
                c = _hex(d.get(key))
                if c:
                    fills[c] += 1
        return {
            "bbox_pt": [round(v, 2) for v in (x0, y0, x1, y1)],
            "bbox_pct": [_pct(x0, width), _pct(y0, height),
                         _pct(x1, width), _pct(y1, height)],
            "size_pt": [round(x1 - x0, 2), round(y1 - y0, 2)],
            "fills": [c for c, _ in fills.most_common(6)],
            "note": note,
        }

    regions = [r for r in [_describe(background, "PAGE BACKGROUND -- reproduce as CSS, "
                                                 "do not crop as an image")] if r]
    if not boxes:
        return regions

    # The merge below is O(n^3) in the worst case. Past a few thousand shapes
    # it stops being informative anyway, so fall back to one summary region
    # rather than hanging.
    if len(boxes) > 1500:
        regions.append(_describe(
            foreground,
            f"{len(boxes)} separate shapes -- too many to cluster; "
            "treat the whole area as flat vector art"))
        return regions

    # Greedy merge: repeatedly union any two boxes that sit within `gap` pt.
    merged = True
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]
                if (a[0] - gap <= b[2] and b[0] - gap <= a[2]
                        and a[1] - gap <= b[3] and b[1] - gap <= a[3]):
                    boxes[i] = (min(a[0], b[0]), min(a[1], b[1]),
                                max(a[2], b[2]), max(a[3], b[3]))
                    boxes.pop(j)
                    merged = True
                    break
            if merged:
                break

    for (x0, y0, x1, y1) in sorted(boxes, key=lambda b: (b[1], b[0])):
        if (x1 - x0) < 8 or (y1 - y0) < 8:
            continue
        cluster_rect = fitz.Rect(x0, y0, x1, y1)
        members = [d for d in foreground
                   if not d["rect"].is_empty and cluster_rect.intersects(d["rect"])]
        item = _describe(
            members,
            "no extractable text here -- crop as an image or rebuild in CSS")
        if item:
            item["bbox_pt"] = [round(v, 2) for v in (x0, y0, x1, y1)]
            item["bbox_pct"] = [_pct(x0, width), _pct(y0, height),
                                _pct(x1, width), _pct(y1, height)]
            item["size_pt"] = [round(x1 - x0, 2), round(y1 - y0, 2)]
            item["shapes"] = len(members)
            regions.append(item)
    return regions


def palette_of(png: Path, top: int = 10) -> list[dict]:
    """Dominant colours in the render, so the agent has exact hex values."""
    try:
        from PIL import Image
    except ImportError:
        return []
    im = Image.open(png).convert("RGB")
    im.thumbnail((400, 400))
    # getdata() is deprecated in Pillow 10+; getcolors() returns the same
    # (count, colour) pairs without building an intermediate sequence.
    counts = Counter({c: n for n, c in im.getcolors(maxcolors=1 << 24)})
    total = sum(counts.values())
    return [{"hex": "#%02x%02x%02x" % c, "share": round(n / total, 4)}
            for c, n in counts.most_common(top)]


def analyze_page(path: Path, page_no: int, ref_png: Path) -> dict:
    fitz = _fitz()
    doc = fitz.open(path)
    page = doc[page_no - 1]
    width, height = float(page.rect.width), float(page.rect.height)

    spans = analyze_text(page, width, height)
    clusters = cluster_drawings(page, width, height, DEFAULT_CLUSTER_GAP)
    fonts = sorted({s["font"] for s in spans})

    # Drop clusters that are just the backdrop behind real text.
    text_boxes = [(s["bbox_pt"][0], s["bbox_pt"][1], s["bbox_pt"][2], s["bbox_pt"][3])
                  for s in spans]
    standalone = []
    for c in clusters:
        x0, y0, x1, y1 = c["bbox_pt"]
        if any(x0 <= t[2] and t[0] <= x1 and y0 <= t[3] and t[1] <= y1 for t in text_boxes):
            c["note"] = "overlaps real text -- likely a background shape, not outlined type"
        else:
            c["note"] = "isolated vector art -- very likely OUTLINED TEXT, crop it"
        standalone.append(c)

    data = {
        "page": page_no,
        "size_pt": [round(width, 2), round(height, 2)],
        "aspect_ratio": round(width / height, 5),
        "reference_png": ref_png.name,
        "fonts_used": fonts,
        "palette": palette_of(ref_png),
        "text_spans": spans,
        "images": [],
        "vector_regions": standalone,
        "drawing_count": len(page.get_drawings()),
    }
    doc.close()
    return data


# ---------------------------------------------------------------------------
# 4. Scaffold generation
# ---------------------------------------------------------------------------

def _esc(text: str) -> str:
    return html_mod.escape(text, quote=True)


def _font_stack(font_name: str, font_map: dict[str, str]) -> str:
    if font_name in font_map:
        return f"'{font_map[font_name]}', {DEFAULT_FONT_STACK}"
    low = font_name.lower()
    for key, stack in FONT_FALLBACKS:
        if key in low:
            return stack
    return DEFAULT_FONT_STACK


def render_scaffold(page_data: dict, assets: list[dict], crops: list[dict],
                    title: str, font_map: dict[str, str],
                    base_layer: str | None = None) -> str:
    """A percentage-positioned, container-query-scaled Tailwind scaffold.

    Everything is placed in % of the artboard and sized in `cqw` (1% of the
    container's inline size), so the whole composition scales with its
    container without a transform. That is what keeps it responsive while
    staying geometry-exact.
    """
    w_pt, h_pt = page_data["size_pt"]
    fonts = page_data["fonts_used"]

    font_vars = "\n".join(
        f"    --font-{_slug(f)}: {_font_stack(f, font_map)};" for f in fonts
    )
    google = sorted({m.strip("'") for m in font_map.values()})
    gfonts = (
        f'<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        f'<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        f'<link href="https://fonts.googleapis.com/css2?'
        f'{"&".join("family=" + g.replace(" ", "+") for g in google)}&display=swap" '
        f'rel="stylesheet">\n'
        if google else ""
    )

    # --- image layers, back to front -------------------------------------
    img_lines = []
    if base_layer:
        img_lines.append(
            f'    <img src="{base_layer}" alt="" aria-hidden="true" '
            f'class="absolute inset-0 h-full w-full object-fill">'
        )
    for a in assets:
        pt = a.get("bbox_pt")
        if not pt:
            continue
        left, top = _pct(pt[0], w_pt), _pct(pt[1], h_pt)
        width_pct = _pct(pt[2] - pt[0], w_pt)
        img_lines.append(
            f'    <img src="{a["file"]}" alt="" '
            f'class="absolute left-[{left}%] top-[{top}%] w-[{width_pct}%] h-auto">'
        )
    for c in crops:
        x0, y0, x1, y1 = c["rect_pt"]
        img_lines.append(
            f'    <img src="{c["file"]}" alt="{_esc(c.get("alt", ""))}" '
            f'class="absolute left-[{_pct(x0, w_pt)}%] top-[{_pct(y0, h_pt)}%] '
            f'w-[{_pct(x1 - x0, w_pt)}%] h-auto">'
        )

    # --- text layers ------------------------------------------------------
    txt_lines = []
    for s in page_data["text_spans"]:
        x0, y0, x1, y1 = s["bbox_pt"]
        size_cqw = round(s["size_pt"] / w_pt * 100, 3)
        cy = round(((y0 + y1) / 2) / h_pt * 100, 4)
        cls = [
            "absolute", "whitespace-nowrap", "leading-none",
            f'left-[{_pct(x0, w_pt)}%]',
            f'top-[{cy}%]', "-translate-y-1/2",
            f'text-[{size_cqw}cqw]',
            f'text-[{s["color"]}]',
        ]
        if s["bold"]:
            cls.append("font-bold")
        txt_lines.append(
            f'    <span class="{" ".join(cls)}" '
            f'style="font-family: var(--font-{_slug(s["font"])})">{_esc(s["text"])}</span>'
        )

    # --- narrow-viewport flow fallback ------------------------------------
    flow_lines = []
    for s in sorted(page_data["text_spans"], key=lambda s: (s["bbox_pt"][1], s["bbox_pt"][0])):
        size_cqw = round(s["size_pt"] / w_pt * 100, 3)
        # On a phone the artboard is ~100vw, so the same cqw would be tiny.
        # Re-scale against a narrower reference and clamp to a readable floor.
        vw = round(s["size_pt"] / w_pt * 100 * 2.6, 2)
        flow_lines.append(
            f'      <p class="text-[clamp(1rem,{vw}vw,3rem)] text-[{s["color"]}]" '
            f'style="font-family: var(--font-{_slug(s["font"])})">{_esc(s["text"])}</p>'
        )

    artboard_cls = (
        f'relative mx-auto aspect-[{round(w_pt, 2)}/{round(h_pt, 2)}] '
        f'w-full max-w-[{round(w_pt)}px] overflow-hidden [container-type:inline-size]'
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_esc(title)}</title>
<script src="https://cdn.tailwindcss.com"></script>
{gfonts}<style>
  :root {{
{font_vars}
  }}
</style>
</head>
<body class="bg-white">

<!-- Wide viewports: geometry-exact artboard. Every layer is positioned in %
     of the artboard and sized in cqw, so it scales with its container. -->
<main class="{artboard_cls} hidden md:block">
{chr(10).join(img_lines)}
{chr(10).join(txt_lines)}
</main>

<!-- Narrow viewports: the same content in normal flow, re-scaled to stay
     readable. This is the part that makes the page genuinely responsive
     rather than just scaled down. -->
<section class="mx-auto max-w-md space-y-3 px-5 py-8 md:hidden">
{chr(10).join(flow_lines)}
</section>

</body>
</html>
"""


# ---------------------------------------------------------------------------
# 5. compare: render the HTML and score it against the reference
# ---------------------------------------------------------------------------

def render_html(html_path: Path, out_png: Path, width: int, wait_ms: int = 1500) -> tuple[int, int]:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise SystemExit(
            "Playwright is required for compare. Install with:\n"
            "  pip install playwright && playwright install chromium"
        ) from exc

    url = html_path.resolve().as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1)
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(wait_ms)
        pg.screenshot(path=str(out_png), full_page=True)
        browser.close()
    return png_size(out_png)


def png_size(png: Path) -> tuple[int, int]:
    from PIL import Image
    with Image.open(png) as im:
        return im.size


def diff_images(reference: Path, candidate: Path, out_diff: Path, out_side: Path) -> dict:
    """Pixel-diff a rendered HTML against the reference page render.

    This is the feedback loop that replaces "ask a vision model to eyeball
    it": it returns a number, so you can iterate without seeing anything.
    """
    from PIL import Image, ImageChops

    ref = Image.open(reference).convert("RGB")
    cand = Image.open(candidate).convert("RGB")
    if ref.size != cand.size:
        log.info("Resizing reference %s -> candidate %s", ref.size, cand.size)
        ref = ref.resize(cand.size, Image.LANCZOS)

    delta = ImageChops.difference(ref, cand).convert("L")
    hist = delta.histogram()
    total = sum(hist)
    mismatch = sum(hist[33:])            # pixels off by more than ~12%
    mean = sum(i * n for i, n in enumerate(hist)) / total

    if out_diff:
        delta.point(lambda v: min(255, v * 6)).convert("RGB").save(out_diff)
    if out_side:
        side = Image.new("RGB", (ref.width * 2 + 12, ref.height), (24, 24, 27))
        side.paste(ref, (0, 0))
        side.paste(cand, (ref.width + 12, 0))
        side.save(out_side)

    return {
        "size": list(cand.size),
        "mismatch_pct": round(mismatch / total * 100, 2),
        "mean_delta_0_255": round(mean, 2),
        "verdict": (
            "excellent" if mismatch / total < 0.02 else
            "close" if mismatch / total < 0.08 else
            "needs work"
        ),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def _parse_crop(spec: str) -> tuple[str, tuple[float, float, float, float]]:
    if "=" not in spec:
        raise SystemExit(f"--crop must look like NAME=x0,y0,x1,y1 (got {spec!r})")
    name, rect = spec.split("=", 1)
    parts = [p.strip() for p in rect.split(",")]
    if len(parts) != 4:
        raise SystemExit(f"--crop rect needs 4 numbers (got {rect!r})")
    return name, tuple(float(p) for p in parts)


def cmd_analyze(args) -> None:
    src: Path = args.input
    if not src.exists():
        raise SystemExit(f"Input file not found: {src}")

    out_dir: Path = args.out_dir or src.parent / f"{src.stem}_html"
    out_dir.mkdir(parents=True, exist_ok=True)

    references = rasterize_source(src, args.dpi, out_dir / "reference")

    if args.skip_assets:
        assets: list[dict] = []
    else:
        assets = extract_assets(src, out_dir, args.min_asset_size)

    # Attach page-relative geometry to each extracted asset so the scaffold
    # can position it without the agent measuring anything.
    if src.suffix.lower() in PDF_LIKE_SUFFIXES and assets:
        fitz = _fitz()
        doc = fitz.open(src)
        by_xref: dict[int, tuple] = {}
        for page in doc:
            for info in page.get_image_info(xrefs=True):
                xref = info.get("xref")
                if xref and xref not in by_xref:
                    by_xref[xref] = tuple(round(v, 2) for v in info["bbox"])
        doc.close()
        for a in assets:
            if a.get("xref") in by_xref:
                a["bbox_pt"] = list(by_xref[a["xref"]])

    crops: list[dict] = []
    for spec in args.crop or []:
        name, rect = _parse_crop(spec)
        crops.append(extract_vector_region(src, out_dir / "assets", name, rect, args.crop_dpi))
        crops[-1]["alt"] = ""  # the agent fills in real alt / sr-only text

    pages = []
    for i, ref in enumerate(references, start=1):
        if src.suffix.lower() in PDF_LIKE_SUFFIXES:
            data = analyze_page(src, i, ref)
            data["images"] = [a for a in assets if a.get("page", 1) == i]
            if not args.no_strip_text:
                base = strip_text_page(src, i, ref.parent / f"page_{i}.notext.png", args.dpi)
                if base:
                    data["base_layer_png"] = str(
                        base.relative_to(out_dir)).replace("\\", "/")
        else:
            from PIL import Image
            with Image.open(ref) as im:
                w, h = im.size
            data = {"page": i, "size_pt": [w, h], "aspect_ratio": round(w / h, 5),
                    "reference_png": ref.name, "fonts_used": [],
                    "palette": palette_of(ref), "text_spans": [],
                    "images": assets, "vector_regions": [], "drawing_count": 0}
        data["reference_png"] = str(ref.relative_to(out_dir)).replace("\\", "/")
        pages.append(data)

    design = {
        "source": str(src),
        "out_dir": str(out_dir),
        "pages": pages,
        "assets": assets,
        "crops": crops,
    }
    (out_dir / "design.json").write_text(
        json.dumps(design, indent=2, ensure_ascii=False), encoding="utf-8")

    scaffold = render_scaffold(pages[0], assets, crops, src.stem,
                               dict(args.font_map or []),
                               pages[0].get("base_layer_png"))
    (out_dir / "scaffold.html").write_text(scaffold, encoding="utf-8")

    n_text = sum(len(p["text_spans"]) for p in pages)
    n_vec = sum(len(p["vector_regions"]) for p in pages)
    isolated = sum(
        1 for p in pages for r in p["vector_regions"] if r["note"].startswith("isolated")
    )
    log.info("Wrote %s", out_dir / "design.json")
    log.info("Wrote %s", out_dir / "scaffold.html")
    log.info("%d text span(s), %d asset(s), %d vector region(s) [%d isolated -> "
             "likely outlined text]", n_text, len(assets), n_vec, isolated)
    if pages[0]["fonts_used"]:
        log.info("Fonts in source (map each to a web font with --font-map): %s",
                 ", ".join(pages[0]["fonts_used"]))
    if isolated:
        log.info("Outlined-text candidates -- crop with e.g. --crop NAME=x0,y0,x1,y1")


def cmd_compare(args) -> None:
    html_path: Path = args.html
    if not html_path.exists():
        raise SystemExit(f"HTML file not found: {html_path}")
    reference = Path(args.reference)
    if not reference.exists():
        raise SystemExit(f"Reference image not found: {reference}")

    out_dir = args.out_dir or html_path.parent / "_compare"
    out_dir.mkdir(parents=True, exist_ok=True)
    shot = out_dir / f"render_{args.width}.png"

    w, h = render_html(html_path, shot, args.width, args.wait)
    log.info("Rendered %s at %dpx -> %dx%d", html_path.name, args.width, w, h)

    stats = diff_images(reference, shot,
                        out_dir / "diff.png", out_dir / "side_by_side.png")
    stats["render"] = str(shot)
    (out_dir / "score.json").write_text(json.dumps(stats, indent=2), encoding="utf-8")

    log.info("mismatch %.2f%% | mean delta %.2f/255 | %s",
             stats["mismatch_pct"], stats["mean_delta_0_255"], stats["verdict"])
    log.info("diff -> %s | side-by-side -> %s",
             out_dir / "diff.png", out_dir / "side_by_side.png")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)

    ap = sub.add_parser("analyze", help="Rasterize, extract, measure, scaffold")
    ap.add_argument("input", type=Path, help="Image, PDF, .ai or .psd file")
    ap.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="Reference render DPI")
    ap.add_argument("--out-dir", type=Path, default=None)
    ap.add_argument("--skip-assets", action="store_true")
    ap.add_argument("--min-asset-size", type=int, default=DEFAULT_MIN_ASSET_DIM)
    ap.add_argument("--crop", action="append", metavar="NAME=x0,y0,x1,y1",
                    help="Crop a PDF-point rect into assets/NAME.png (repeatable)")
    ap.add_argument("--crop-dpi", type=int, default=300, help="DPI for --crop output")
    ap.add_argument("--no-strip-text", action="store_true",
                    help="Skip generating the text-free base layer PNG")
    ap.add_argument("--font-map", action="append", nargs=1, metavar="PDFFONT=WebFont",
                    help="Map a source font to a web font (repeatable)")
    ap.set_defaults(func=cmd_analyze)

    cp = sub.add_parser("compare", help="Render HTML and pixel-diff vs the reference")
    cp.add_argument("html", type=Path)
    cp.add_argument("--reference", required=True, help="Reference PNG from analyze")
    cp.add_argument("--width", type=int, default=1440, help="Viewport width to render at")
    cp.add_argument("--wait", type=int, default=1500, help="ms to wait after load")
    cp.add_argument("--out-dir", type=Path, default=None)
    cp.set_defaults(func=cmd_compare)

    args = parser.parse_args()

    # --font-map arrives as [['BestSchool=Fredoka'], ...]; flatten it.
    raw_map = getattr(args, "font_map", None) or []
    flat = []
    for item in raw_map:
        entry = item[0] if isinstance(item, list) else item
        if "=" not in entry:
            raise SystemExit(f"--font-map must look like PDFFONT=WebFont (got {entry!r})")
        k, v = entry.split("=", 1)
        flat.append((k.strip(), v.strip()))
    args.font_map = flat

    args.func(args)


if __name__ == "__main__":
    main()
