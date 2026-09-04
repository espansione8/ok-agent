"""Turn one PDF page into discrete, addressable assets + exact text geometry.

This is the *analysis* half of the design-to-html skill. It never guesses and
never calls a model: everything it writes comes from the content stream.

Outputs (into --out):
  assets/        one cropped PNG per image, alpha preserved (soft masks baked in)
  fonts/         the page's embedded fonts, plus woff2 + measured metrics
  assets.json    ordered layer list: images, colour plates, vector-art clusters
  spans.json     every text run: font, size, colour, origin, per-glyph tracking
  offsets.json   exact baseline offset in px per (font, size) as *Chromium* lays it out

Usage:
  python pdf_page_to_assets.py design.pdf --out build [--page 0] [--gap 40]
"""
import argparse
import base64
import io
import json
import math
import os
import re
import sys

import pymupdf
from PIL import Image

# ----------------------------------------------------------------- content stream
# PyMuPDF's get_drawings() gives geometry but not interleaving with images, and
# get_image_info() gives placement but hides soft masks and clips. To paint in the
# right order you have to walk the content stream yourself.
OPS = {"q", "Q", "cm", "re", "m", "l", "c", "v", "y", "h", "n", "W", "W*",
       "f", "f*", "F", "S", "s", "B", "B*", "b", "b*", "Do", "BT", "ET",
       "Tj", "TJ", "'", '"', "Td", "TD", "Tm", "T*", "Tf", "gs", "G", "g",
       "RG", "rg", "K", "k", "CS", "cs", "SC", "sc", "SCN", "scn", "w",
       "J", "j", "M", "d", "ri", "i", "BI", "ID", "EI"}

IDENT = re.compile(r"^[A-Za-z0-9_.+-]+$")


def mul(a, b):
    """Concatenate PDF matrices: a applied after b."""
    return (a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
            a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
            a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5])


def tokenize(stream):
    """Whitespace/name-aware content-stream scanner.

    `0 TL/Fm0 Do` is legal PDF and has no space before the name, so a plain
    split() loses the XObject. Names are therefore split off explicitly.
    """
    out = []
    for raw in re.findall(r"/[^\s/\[\]<>()]*|[\s]+|[^\s/\[\]<>()]+", stream):
        t = raw.strip()
        if t:
            out.append(t)
    return out


def extgstate_map(doc, page):
    """/GSn -> fill alpha (/ca). Page resources only; forms rarely override it."""
    obj = doc.xref_object(page.xref, compressed=True) or ""
    m = re.search(r"/ExtGState\s*<<(.*?)>>", obj, re.S)
    if not m:
        return {}
    out = {}
    for nm, xr in re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", m.group(1)):
        try:
            v = doc.xref_get_key(int(xr), "ca")[1]
        except Exception:
            continue
        try:
            out[nm] = float(v)
        except (TypeError, ValueError):
            pass
    return out


def parse_content(page, gsmap=None):
    """Return an ordered event list with a real graphics-state stack."""
    toks = tokenize(page.read_contents().decode("latin-1"))
    H = page.rect.height
    events, stack, args, seq = [], [], [], 0
    ctm = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    clip = None
    alpha = 1.0
    path = []

    def ap(M, x, y):
        return (M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5])

    def to_screen(p):
        return (p[0], H - p[1])

    def flush_path(op):
        nonlocal path
        if not path:
            return
        pts = []
        for seg in path:
            for q in seg[1:]:
                if q:
                    pts.append(to_screen(ap(ctm, q[0], q[1])))
        if not pts:
            path = []
            return
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        events.append({"kind": "path", "op": op, "seq": seq,
                       "bbox": [min(xs), min(ys), max(xs), max(ys)]})
        path = []

    def nums(n):
        """Last n operands as floats, or None if the stream is short (malformed)."""
        if len(args) < n:
            return None
        try:
            return [float(v) for v in args[-n:]]
        except ValueError:
            return None

    i = 0
    while i < len(toks):
        t = toks[i]
        if t in OPS:
            op = t
            if op == "q":
                stack.append((ctm, clip, alpha))
            elif op == "Q":
                if stack:
                    ctm, clip, alpha = stack.pop()
            elif op == "gs" and gsmap:
                nm = args[-1].split("/")[-1] if args else ""
                if nm in gsmap:
                    alpha = gsmap[nm]
            elif op == "cm":
                m = nums(6)
                if m:
                    ctm = mul(tuple(m), ctm)
            elif op in ("m", "l"):
                p = nums(2)
                if p:
                    path.append((op, (p[0], p[1])))
            elif op == "c":
                p = nums(6)
                if p:
                    path.append((op, (p[0], p[1]), (p[2], p[3]), (p[4], p[5])))
            elif op == "re":
                r = nums(4)
                if r:
                    path.append(("re", r))
            elif op in ("W", "W*"):
                clip = (list(path), ctm)
            elif op == "Do":
                if args:
                    # `0 TL/Fm0 Do` has no space before the name, so take the
                    # trailing /Name rather than the whole operand.
                    events.append({"kind": "image",
                                   "name": args[-1].split("/")[-1],
                                   "ctm": ctm, "clip": clip, "alpha": alpha})
            elif op in ("BT", "ET"):
                events.append({"kind": "text", "op": op})
            if op in ("f", "f*", "F", "S", "s", "B", "B*", "b", "b*", "n"):
                flush_path(op)
                path = []
            args = []
            if op in ("f", "f*", "F", "S", "s", "B", "B*", "b", "b*", "re", "Do"):
                seq += 1
        else:
            # Operands. The tokenizer drops ( ) [ ] < > entirely, so every token
            # that is not an operator is an operand -- numbers included.
            args.append(t)
        i += 1
    return events


# ----------------------------------------------------------------- fonts
def glyph_to_unicode(gname):
    """CFF subsets keep glyph names but no cmap; recover codepoints by name."""
    from fontTools.agl import AGL2UV
    cp = AGL2UV.get(gname)
    if cp is not None:
        return cp
    if gname.startswith("uni") and len(gname) == 7:
        try:
            return int(gname[3:], 16)
        except ValueError:
            return None
    if gname.startswith("u") and len(gname) == 5:
        try:
            return int(gname[1:], 16)
        except ValueError:
            return None
    return None


def extract_fonts(doc, page, outdir):
    """Write every embedded font and record cmap/upem/hmtx.

    PyMuPDF's ext label is unreliable: a bare CFF table comes back as "Type1"
    and an OTF as "cid". Detect by magic bytes instead.
    """
    from fontTools.ttLib import TTFont, newTable
    from fontTools.fontBuilder import FontBuilder
    from fontTools.pens.recordingPen import RecordingPen
    from fontTools.cffLib import CFFFontSet

    meta = {}
    for f in page.get_fonts(full=True):
        xref, basefont = f[0], f[3]
        try:
            data = doc.extract_font(xref)[-1]
        except Exception as e:
            print("  font %s: %s" % (basefont, e), file=sys.stderr)
            continue
        if not isinstance(data, (bytes, bytearray)) or len(data) < 4:
            print("  font %s: no embedded program, skipped" % basefont,
                  file=sys.stderr)
            continue
        name = re.sub(r"^[A-Z]{6}\+", "", basefont)
        if name in meta:
            continue

        if data[:4] in (b"\x00\x01\x00\x00", b"true"):
            # TrueType. Re-save through fontTools: the raw PDF byte stream is
            # routinely rejected by Chromium's font sanitizer.
            path = os.path.join(outdir, name + ".ttf")
            t = TTFont(io.BytesIO(data))
            t.save(path)
            t.close()
            kind = "ttf"
        elif data[:4] == b"OTTO":
            path = os.path.join(outdir, name + ".otf")
            open(path, "wb").write(data)
            kind = "cff-otto"
        else:
            # Bare CFF: wrap it in an sfnt shell, then DISCARD the CFF table
            # FontBuilder generates and decompile the ORIGINAL bytes into it.
            # setupCFF() re-encodes charstrings against an empty Private dict,
            # so widths land relative to nominalWidthX=0 instead of ~396 and
            # Chromium reports advances roughly 110x too wide.
            cff = CFFFontSet()
            cff.decompile(io.BytesIO(bytes(data)), None)
            gs = cff.topDictIndex[0].CharStrings
            order = [g for g in gs.keys() if g != ".notdef"]
            charstrings, widths = {}, {}
            for g in order:
                ch = gs[g]
                ch.draw(RecordingPen())     # .width is lazily decompiled
                if ch.width is not None:
                    widths[g] = int(round(ch.width))
                charstrings[g] = ch
            cmap = {}
            for g in order:
                cp = glyph_to_unicode(g)
                if cp:
                    cmap[cp] = g
            fb = FontBuilder(1000, isTTF=False)
            fb.setupGlyphOrder([".notdef"] + order)
            fb.setupCharacterMap(cmap)
            hm = {".notdef": (0, 0)}
            hm.update({g: (widths.get(g, 0), 0) for g in order})
            fb.setupHorizontalMetrics(hm)
            fb.setupHorizontalHeader(ascent=800, descent=-200)
            fb.setupNameTable({"familyName": name, "styleName": "Regular"})
            fb.setupOS2()
            fb.setupPost()
            fb.setupCFF(name, {"FullName": name}, charstrings, {})
            tab = newTable("CFF ")
            tab.decompile(bytes(data), fb.font)
            fb.font["CFF "] = tab
            path = os.path.join(outdir, name + ".otf")
            fb.save(path)
            kind = "cff"

        t = TTFont(path)
        best = t.getBestCmap()
        meta[name] = {"file": os.path.basename(path), "kind": kind,
                      "upem": t["head"].unitsPerEm,
                      "cmap": {str(k): v for k, v in best.items()}}
        print("  font %-22s %-9s upem=%-5d %3d glyphs  %3d cmap"
              % (name, kind, t["head"].unitsPerEm,
                 len(t.getGlyphOrder()), len(best)))
        t.close()
    return meta


def to_woff2(meta, outdir):
    """Inline data URIs, not files: Chromium blocks @font-face over file://
    because each document gets an opaque origin."""
    from fontTools.ttLib import TTFont
    for name, info in meta.items():
        t = TTFont(os.path.join(outdir, info["file"]))
        t.flavor = "woff2"
        buf = io.BytesIO()
        t.save(buf)
        t.flavor = None
        t.close()
        meta[name]["woff2"] = ("data:font/woff2;base64,"
                               + base64.b64encode(buf.getvalue()).decode())
        meta[name]["woff2_bytes"] = len(buf.getvalue())


# ----------------------------------------------------------------- text spans
def text_spans(page, meta, fontdir):
    """Spans with baselines, rebuilt from rawdict, plus per-glyph tracking."""
    from fontTools.ttLib import TTFont

    cache = {}

    def advance(fam, ch, size):
        if fam not in cache:
            fp = os.path.join(fontdir, meta[fam]["file"])
            if not os.path.exists(fp):
                cache[fam] = None
            else:
                t = TTFont(fp)
                cache[fam] = (t.getBestCmap(), t["hmtx"], t["head"].unitsPerEm)
                t.close()
        c = cache[fam]
        if not c:
            return None
        cmap, hmtx, upem = c
        g = cmap.get(ord(ch))
        return None if g is None else hmtx[g][0] * size / upem

    def fam_of(name):
        if name in meta:
            return name
        for f in meta:
            if name.startswith(f) or f in name:
                return f
        return sorted(meta)[0] if meta else None

    spans = []
    for block in page.get_text("rawdict")["blocks"]:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                chars = span["chars"]
                if not chars:
                    continue
                fam = fam_of(span["font"])
                size = span["size"]
                kern = []
                for i, c in enumerate(chars):
                    fa = advance(fam, c["c"], size)
                    if fa is None:
                        kern.append(0.0)
                        continue
                    actual = (chars[i + 1]["origin"][0] - c["origin"][0]
                              if i + 1 < len(chars) else fa)
                    d = actual - fa
                    kern.append(round(d, 3) if abs(d) >= 0.20 else 0.0)
                col = span["color"]
                spans.append({
                    "i": len(spans), "font": fam, "size": round(size, 3),
                    "color": "#%02x%02x%02x" % ((col >> 16) & 255, (col >> 8) & 255, col & 255),
                    # rebuild from chars: PyMuPDF strips pad spaces from span text
                    "text": "".join(c["c"] for c in chars),
                    "x": round(chars[0]["origin"][0], 3),
                    "base": round(chars[0]["origin"][1], 3),
                    "kern": kern, "flags": span["flags"]})
    return spans


def probe_baseline_offsets(meta, spans, workdir):
    """Chromium rounds ascent/descent to whole pixels, so the baseline offset in
    em is NOT constant with size. Probe each (font, size) actually used."""
    from playwright.sync_api import sync_playwright

    fams = sorted(meta)
    pairs = sorted({(s["font"], round(s["size"], 4)) for s in spans})
    faces = "".join(
        "@font-face{font-family:F%d;src:url(%s) format('woff2');font-weight:400;"
        "font-style:normal;font-display:block;}" % (i, meta[f]["woff2"])
        for i, f in enumerate(fams))
    FN = {f: i for i, f in enumerate(fams)}
    body = "".join(
        '<div id="p%d" style="display:inline-block;font-family:F%d;font-size:%rpx;'
        'line-height:1">Hxg<span id="q%d" style="display:inline-block;width:0;'
        'height:0;vertical-align:baseline"></span></div>' % (k, FN[f], sz, k)
        for k, (f, sz) in enumerate(pairs))
    p = os.path.join(workdir, "_probe.html")
    open(p, "w", encoding="utf-8").write(
        "<!doctype html><meta charset=utf-8><style>body{margin:0;white-space:nowrap}"
        "%s</style><body>%s" % (faces, body))
    url = "file:///" + os.path.abspath(p).replace("\\", "/")
    out = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(viewport={"width": 6000, "height": 400})
        pg.goto(url)
        pg.wait_for_function("document.fonts.status === 'loaded'", timeout=30000)
        for k, (f, sz) in enumerate(pairs):
            v = pg.evaluate("""(k) => {
              const d = document.getElementById('p'+k);
              const q = document.getElementById('q'+k);
              return q.getBoundingClientRect().top - d.getBoundingClientRect().top;
            }""", k)
            out.setdefault(f, {})["%r" % sz] = v
        b.close()
    os.remove(p)
    return out


# ----------------------------------------------------------------- images
def xobject_map(doc, page):
    """Resolve /XObject resource names to xrefs.

    A Do operand is a *name*, not an xref, and the name may point at a Form
    XObject that itself wraps the image. Guessing by draw order silently
    mis-assigns images, so resolve the name and unwrap forms.
    """
    obj = doc.xref_object(page.xref, compressed=True) or ""
    m = re.search(r"/XObject\s*<<(.*?)>>", obj, re.S)
    names = {}
    if m:
        names = {k: int(v) for k, v in
                 re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", m.group(1))}
    inner, fcm = {}, {}
    for nm, xr in list(names.items()):
        try:
            if doc.xref_get_key(xr, "Subtype")[1] != "/Form":
                continue
        except Exception:
            continue
        s = doc.xref_stream(xr).decode("latin-1")
        sub = re.search(r"/XObject\s*<<(.*?)>>",
                        doc.xref_object(xr, compressed=True) or "", re.S)
        if sub:
            for k, v in re.findall(r"/(\w+)\s+(\d+)\s+0\s+R", sub.group(1)):
                inner[nm] = int(v)
        # the form places its image with its own cm; compose with the outer CTM
        cm = re.search(r"([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+"
                       r"([-\d.]+)\s+([-\d.]+)\s+cm", s)
        if cm:
            fcm[nm] = [float(g) for g in cm.groups()]
    return names, inner, fcm


def extract_images(doc, page, events, outdir):
    """Save each image with its /SMask baked in as real alpha.

    get_image_info() does not surface /SMask, so a cut-out comes back as an
    opaque rectangle unless you read the object dict and composite it yourself.
    """
    info = page.get_image_info(xrefs=True)
    byxref = {}
    for idx, im in enumerate(info):
        x = im.get("xref")
        if not x:
            continue
        d = doc.xref_object(x)
        pix = pymupdf.Pixmap(doc, x)
        if pix.n > 4:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        m = re.search(r"/SMask\s+(\d+)\s+0\s+R", d)
        if m:
            mask = pymupdf.Pixmap(doc, int(m.group(1)))
            if mask.size != pix.size:
                mask = pymupdf.Pixmap(mask, pix.width, pix.height)
            pix = pymupdf.Pixmap(pix, mask)          # bake the cut-out as alpha
        elif not pix.alpha:
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix) if pix.n == 3 else pix
        # keep the decoded image in memory; only the final cropped asset is
        # written, so the output tree holds no redundant raw copies
        im = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
        byxref[x] = {"idx": idx, "xref": x, "im": im, "smask": bool(m),
                     "px": "%dx%d" % (pix.width, pix.height)}

    names, inner, fcm = xobject_map(doc, page)
    out, order = [], 0
    for e in events:
        if e["kind"] != "image":
            continue
        nm = e.get("name", "")
        xr = inner.get(nm) or names.get(nm)
        rec = byxref.get(xr)
        if rec is None:
            print("  image %r: unresolved xobject, skipped" % nm, file=sys.stderr)
            continue
        ctm = e["ctm"]
        if nm in fcm:
            ctm = mul(tuple(fcm[nm]), ctm)
        e["ctm"], e["idx"], e["xref"] = ctm, rec["idx"], xr
        rec = dict(rec)
        rec["order"] = order
        out.append(rec)
        order += 1
    return out


# ----------------------------------------------------------------- vector art
def to_d(d):
    parts, first = [], True
    for it in d["items"]:
        op = it[0]
        if op == "l":
            p0, p1 = it[1], it[2]
            if first:
                parts.append("M%.2f %.2f" % (p0.x, p0.y))
                first = False
            parts.append("L%.2f %.2f" % (p1.x, p1.y))
        elif op == "c":
            p0, c1, c2, p3 = it[1], it[2], it[3], it[4]
            if first:
                parts.append("M%.2f %.2f" % (p0.x, p0.y))
                first = False
            parts.append("C%.2f %.2f %.2f %.2f %.2f %.2f"
                         % (c1.x, c1.y, c2.x, c2.y, p3.x, p3.y))
        elif op == "re":
            r = it[1]
            parts.append("M%.2f %.2fH%.2fV%.2fH%.2fZ" % (r.x0, r.y0, r.x1, r.y1, r.x0))
            first = False
        elif op == "qu":
            p0, q1, p3 = it[1], it[2], it[3]
            if first:
                parts.append("M%.2f %.2f" % (p0.x, p0.y))
                first = False
            parts.append("Q%.2f %.2f %.2f %.2f" % (q1.x, q1.y, p3.x, p3.y))
    if d.get("closePath"):
        parts.append("Z")
    return "".join(parts)


def hexof(c):
    if not c:
        return None
    # PyMuPDF truncates; round() would be 1/255 off on flat brand colours
    return "#%02x%02x%02x" % tuple(int(v * 255) for v in c)


# ----------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--out", default="build")
    ap.add_argument("--page", type=int, default=0)
    ap.add_argument("--gap", type=float, default=40.0,
                    help="proximity gap for grouping vector art into clusters")
    ap.add_argument("--no-browser", action="store_true",
                    help="skip the Chromium baseline probe")
    a = ap.parse_args()

    a.out = os.path.abspath(a.out)
    os.makedirs(a.out, exist_ok=True)
    adir = os.path.join(a.out, "assets")
    fdir = os.path.join(a.out, "fonts")
    os.makedirs(adir, exist_ok=True)
    os.makedirs(fdir, exist_ok=True)

    doc = pymupdf.open(a.pdf)
    page = doc[a.page]
    W, H = page.rect.width, page.rect.height
    print("page %d: %.2f x %.2f pt" % (a.page, W, H))

    events = parse_content(page, extgstate_map(doc, page))
    # stamp each image with the seqno of the last painted path before it, which
    # is what fixes its z-order relative to the vector art
    last = -1
    for e in events:
        if e["kind"] == "path" and e.get("seq") is not None:
            last = e["seq"]
        elif e["kind"] == "image":
            e["after_seq"] = last

    print("extracting fonts")
    meta = extract_fonts(doc, page, fdir)
    to_woff2(meta, fdir)

    print("extracting images")
    imgs = extract_images(doc, page, events, adir)

    # ---- image geometry: centre, unrotated size, rotation, visible clip
    def mul(a_, b):
        return (a_[0] * b[0] + a_[1] * b[2], a_[0] * b[1] + a_[1] * b[3],
                a_[2] * b[0] + a_[3] * b[2], a_[2] * b[1] + a_[3] * b[3],
                a_[4] * b[0] + a_[5] * b[2] + b[4], a_[4] * b[1] + a_[5] * b[3] + b[5])

    def apm(M, x, y):
        return (M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5])

    def inv(M):
        a_, b_, c_, d_, e_, f_ = M
        det = a_ * d_ - b_ * c_
        return (d_ / det, -b_ / det, -c_ / det, a_ / det,
                (c_ * f_ - d_ * e_) / det, (b_ * e_ - a_ * f_) / det)

    imgs_out = []
    for e in events:
        if e["kind"] != "image" or "idx" not in e:
            continue
        M = tuple(e["ctm"])
        cs = [ (lambda p: (p[0], H - p[1]))(apm(M, x, y))
               for x, y in ((0, 0), (1, 0), (1, 1), (0, 1))]
        dx, dy = cs[1][0] - cs[0][0], cs[1][1] - cs[0][1]
        css = {"cx": sum(p[0] for p in cs) / 4, "cy": sum(p[1] for p in cs) / 4,
               "w": math.hypot(dx, dy),
               "h": math.hypot(cs[3][0] - cs[0][0], cs[3][1] - cs[0][1]),
               # screen-space already, so this is the CSS rotate() angle as-is
               "rot": math.degrees(math.atan2(dy, dx))}
        quad = [min(p[0] for p in cs), min(p[1] for p in cs),
                max(p[0] for p in cs), max(p[1] for p in cs)]
        vis = quad
        if e.get("clip"):
            pth, cM = e["clip"]
            pts = []
            for seg in pth:
                if seg[0] == "re":
                    x, y, ww, hh = seg[1]
                    pts += [(x, y), (x + ww, y), (x + ww, y + hh), (x, y + hh)]
                elif seg[0] != "h":
                    for q in seg[1:]:
                        if q:
                            pts.append(q)
            pts = [(lambda p: (p[0], H - p[1]))(apm(cM, p[0], p[1])) for p in pts]
            if pts:
                cr = [min(p[0] for p in pts), min(p[1] for p in pts),
                      max(p[0] for p in pts), max(p[1] for p in pts)]
                # the visible region is the clip INTERSECTED with the placed quad
                vis = [max(quad[0], cr[0]), max(quad[1], cr[1]),
                       min(quad[2], cr[2]), min(quad[3], cr[3])]
        src = next(i for i in imgs if i["idx"] == e["idx"])
        im0 = src["im"]
        iw, ih = im0.size
        needs_crop = (vis[2] - vis[0] < quad[2] - quad[0] - 1
                      or vis[3] - vis[1] < quad[3] - quad[1] - 1)
        if needs_crop and abs(css["rot"]) < 0.01:
            Mi = inv(M)
            pts = []
            for sx, sy in ((vis[0], vis[1]), (vis[2], vis[1]),
                           (vis[2], vis[3]), (vis[0], vis[3])):
                u, v = apm(Mi, sx, H - sy)
                pts.append((u * iw, (1 - v) * ih))
            bx = (max(0, math.floor(min(p[0] for p in pts))),
                  max(0, math.floor(min(p[1] for p in pts))),
                  min(iw, math.ceil(max(p[0] for p in pts))),
                  min(ih, math.ceil(max(p[1] for p in pts))))

            def px2screen(px, py):
                sx, syp = apm(M, px / iw, 1 - py / ih)
                return sx, H - syp

            cn = [px2screen(bx[0], bx[1]), px2screen(bx[2], bx[1]),
                  px2screen(bx[2], bx[3]), px2screen(bx[0], bx[3])]
            # back-project the integer crop: cropping snaps to whole source
            # pixels and would otherwise shift the art by up to a full pixel
            disp = [min(p[0] for p in cn), min(p[1] for p in cn),
                    max(p[0] for p in cn) - min(p[0] for p in cn),
                    max(p[1] for p in cn) - min(p[1] for p in cn)]
            im0 = im0.crop(bx)
        else:
            disp = [quad[0], quad[1], quad[2] - quad[0], quad[3] - quad[1]]
        tw = int(min(round(disp[2] * 2), im0.width))
        th = max(1, round(im0.height * tw / im0.width))
        im0 = im0.resize((tw, th), Image.LANCZOS)
        name = "img-%02d" % e["idx"]
        p = os.path.join(adir, name + ".png")
        im0.save(p, "PNG", optimize=True)     # keep the cut-out alpha
        # ExtGState fill alpha (/ca) picked up from the `gs` operator
        op = round(e.get("alpha", 1.0), 4)
        rec = {"idx": e["idx"], "src": "assets/" + name + ".png",
               "x": disp[0], "y": disp[1], "w": disp[2], "h": disp[3],
               "rot": css["rot"], "order": e.get("after_seq", -1),
               "px": "%dx%d" % (tw, th), "kb": round(os.path.getsize(p) / 1024, 1),
               "opacity": op, "smask": src["smask"]}
        imgs_out.append(rec)
        print("  %s %9s %7.1fKB  at (%.0f,%.0f) %.0fx%.0f rot=%+.2f%s"
              % (name, rec["px"], rec["kb"], disp[0], disp[1], disp[2], disp[3],
                 css["rot"], "  [cropped]" if needs_crop else ""))

    # ---- vector art: big flat plates vs. grouped artwork clusters
    dr = page.get_drawings()
    plates, arts = [], []
    for d in dr:
        r = d["rect"]
        is_plate = (d["type"] in ("f", "fs") and (r.x1 - r.x0) > W * 0.8
                    and (r.y1 - r.y0) > H * 0.15)
        (plates if is_plate else arts).append(d)

    clusters = []
    for d in arts:
        r = d["rect"]
        hit = None
        for cl in clusters:
            if (r.x0 <= cl["x1"] + a.gap and cl["x0"] - a.gap <= r.x1 and
                    r.y0 <= cl["y1"] + a.gap and cl["y0"] - a.gap <= r.y1):
                hit = cl
                break
        if hit is None:
            hit = {"x0": r.x0, "y0": r.y0, "x1": r.x1, "y1": r.y1, "items": [],
                   "seq": d["seqno"], "seqmax": d["seqno"]}
            clusters.append(hit)
        hit["items"].append(d)
        hit["x0"] = min(hit["x0"], r.x0); hit["y0"] = min(hit["y0"], r.y0)
        hit["x1"] = max(hit["x1"], r.x1); hit["y1"] = max(hit["y1"], r.y1)
        hit["seq"] = min(hit["seq"], d["seqno"])
        hit["seqmax"] = max(hit["seqmax"], d["seqno"])
    clusters.sort(key=lambda c: c["seq"])

    cout = []
    for cl in clusters:
        x0, y0 = cl["x0"], cl["y0"]
        body = []
        for d in cl["items"]:
            dd = to_d(d)
            if not dd:
                continue
            st = []
            if d["type"] in ("f", "fs") and d.get("fill"):
                st.append("fill:" + hexof(d["fill"]))
                if d.get("fill_opacity") not in (None, 1.0):
                    st.append("fill-opacity:%s" % d["fill_opacity"])
                if d.get("even_odd"):
                    st.append("fill-rule:evenodd")
            else:
                st.append("fill:none")
            if d["type"] in ("s", "fs") and d.get("color"):
                st.append("stroke:" + hexof(d["color"]))
                st.append("stroke-width:%s" % (d.get("width") or 1))
                st.append("stroke-opacity:%s" % d.get("stroke_opacity", 1))
            body.append('<path d="%s" style="%s" transform="translate(%.2f,%.2f)"/>'
                        % (dd, ";".join(s for s in st if s), -x0, -y0))
        cout.append({"seq": cl["seq"], "seqmax": cl["seqmax"],
                     "bbox": [x0, y0, cl["x1"] - x0, cl["y1"] - y0],
                     "svg": ('<svg xmlns="http://www.w3.org/2000/svg" '
                             'viewBox="0 0 %.2f %.2f">%s</svg>'
                             % (cl["x1"] - x0, cl["y1"] - y0, "".join(body)))})
        print("  cluster seq=%-4d n=%-3d bbox=(%.0f,%.0f) %.0fx%.0f"
              % (cl["seq"], len(cl["items"]), x0, y0,
                 cl["x1"] - x0, cl["y1"] - y0))

    pout = [{"seq": d["seqno"], "fill": hexof(d["fill"]),
             # emit the real path, not the bbox: a "band" is often a slanted quad
             "d": to_d(d) if not any(i[0] == "re" for i in d["items"])
             else "M%.2f %.2fH%.2fV%.2fH%.2fZ" % (d["rect"].x0, d["rect"].y0,
                                                  d["rect"].x1, d["rect"].y1,
                                                  d["rect"].x0),
             "rect": [d["rect"].x0, d["rect"].y0, d["rect"].width, d["rect"].height]}
            for d in plates]
    for p in pout:
        print("  plate  seq=%-4d %s" % (p["seq"], p["fill"]))

    cwd = os.getcwd()
    os.chdir(a.out)
    try:
        spans = text_spans(page, meta, fdir)
    finally:
        os.chdir(cwd)

    json.dump({"w": W, "h": H, "imgs": imgs_out, "plates": pout,
               "clusters": cout}, open(os.path.join(a.out, "assets.json"), "w"),
              indent=1)
    json.dump({"w": W, "h": H, "spans": spans},
              open(os.path.join(a.out, "spans.json"), "w"), ensure_ascii=False,
              indent=1)
    json.dump(meta, open(os.path.join(a.out, "fonts.json"), "w"), indent=1)

    if not a.no_browser:
        print("probing Chromium baseline offsets")
        offs = probe_baseline_offsets(meta, spans, a.out)
        json.dump(offs, open(os.path.join(a.out, "offsets.json"), "w"), indent=1)
        for f in sorted(offs):
            print("  %-22s %s" % (f, " ".join(
                "%s:%g" % (k, v) for k, v in sorted(offs[f].items()))))

    print("\n%d spans, %d images, %d plates, %d clusters"
          % (len(spans), len(imgs_out), len(pout), len(cout)))
    print("wrote %s" % a.out)


if __name__ == "__main__":
    main()
