---
name: design-to-html
description: Convert a PDF page, mockup, or design image into a single self-contained responsive HTML+Tailwind file that is pixel-accurate to the source, with every image and piece of vector art as its own discrete element. Fully deterministic - no vision LLM, no API key, no network call. Use whenever the user references a screenshot, mockup, wireframe, Figma export, PDF design doc, or asks to "turn this image into a page", "clone this UI", "convert this PDF to HTML", "make this 1:1 with the design", or similar - even if they don't name a specific tool.
---

# PDF / Image → HTML (Tailwind, deterministic, no LLM call)

## The core idea

There is **no model call in this skill**. Not a local one, not a hosted one, not
one behind an OpenAI-compatible server. The agent running the skill *is* the
model; sending the picture to a second model just to have it guess at markup is
a round trip that throws away information you already have.

For anything with real geometry (a PDF, a vector export, a design file) the
source already contains the answer: exact text boxes, exact font names, exact
fill colours, and the fonts themselves. A script can read those numbers.
A language model looking at a raster cannot — and never gets closer than an
approximation, no matter how many self-correction loops you bolt on.

So the split is:

- **The script** does what a computer does better: rasterize, measure, extract,
  and score. Every number it reports is exact.
- **The agent** does what a model does better: read the extracted JSON, decide
  the structure, write real Tailwind markup, and drive the compare loop until
  the mismatch stops dropping.

The feedback signal is a pixel diff, not an opinion. That is the whole trick,
and it works even when the agent cannot see images at all.

## The output is real markup, never a background image

Every asset in the page becomes its **own element**:

- each photo/cut-out → its own `<img>`
- each block of vector art → its own inline `<svg>`
- each large flat colour field → its own `<svg>` plate using the real path data
- each text run → real, selectable HTML text

Do **not** composite the design into one raster and hang it behind the page as a
background. It looks perfect in a desktop screenshot and is worthless
everywhere else: it is invisible to screen readers, it defeats text selection,
it cannot restack, and on a narrow viewport the layout collapses while the
raster — the only thing carrying the actual content — is cropped or scaled
away. A design that only survives at one width is not a converted design.

If you catch yourself reaching for a full-page background image, the real fix is
almost always to extract one more asset properly.

## Files in this skill

- `SKILL.md` — this file: the workflow, the measurement rules, the traps.
- `scripts/pdf_page_to_assets.py` — **start here.** Turns one PDF page into
  discrete assets + exact text geometry. Run it; don't retype it.
- `scripts/render_diff.py` — renders the artboard and pixel-diffs it against the
  PDF, with raw + AA-robust metrics and a localisation grid.
- `scripts/responsive_audit.py` — asserts every asset survives at every width.
- `scripts/pdf_image_to_html.py` — rasterize helpers and the older
  analyze/compare subcommands.

## Requirements

```bash
pip install pymupdf pillow fonttools brotli   # extract + measure
pip install psd-tools                         # only for .psd input
pip install playwright && playwright install chromium   # baseline probe + compare
```

Nothing else. No `openai` package, no `ANTHROPIC_API_KEY`, no `--base-url`,
no `--model`, no `--api-key`, no `--api-key-env`. If you find yourself adding
one, you have taken a wrong turn — see "If you're tempted to call a model".

`fonttools` needs `brotli` for woff2; without it `t.save()` raises rather than
falling back.

## Workflow

### 1. Normalize the input

- **PDF** — the best case. You get text spans, fonts, colours, and vectors.
- **`.ai`** — usually opens the same way as a PDF (Illustrator embeds a
  PDF-compatible stream by default). Same path as PDF. If it won't open,
  the file was saved with "Create PDF Compatible File" off; re-export as PDF.
- **`.psd`** — not PDF-based. `psd-tools` composites it to a flat PNG. Layers
  give you nothing usable for geometry.
- **PNG/JPG/WEBP/GIF** — no text geometry at all. You cannot get 1:1 fidelity
  from a flat raster; tell the user so, and ask for the PDF or source file. Do
  not paper over it by shipping the raster as a background.

### 2. Run the asset extractor

```bash
python scripts/pdf_page_to_assets.py design.pdf --out build [--page 0] [--gap 40]
```

Writes into `build/`:

| Output | What it's for |
| --- | --- |
| `assets/img-NN.png` | One cropped PNG per image, **alpha preserved**. |
| `fonts/*.ttf\|*.otf` | The page's embedded fonts, repaired and usable. |
| `assets.json` | Ordered layers: `imgs`, `plates`, `clusters` — each with real geometry. |
| `spans.json` | Every text run: font, size, colour, baseline, per-glyph tracking. |
| `fonts.json` | cmaps, upem, and woff2 data URIs. |
| `offsets.json` | Exact Chromium baseline offset in px per (font, size). |

Add `--no-browser` to skip the Chromium baseline probe when Playwright isn't
installed; you then have to derive `top` yourself in step 4.

The extractor never guesses. Every number comes from the content stream, so its
output is the contract between the analysis and the markup.

### 3. Extract the real fonts (do not skip this)

Substituting a lookalike web font is the single biggest source of error. A
substituted font has different glyph metrics, so text drifts horizontally, and
you end up "fixing" it with a blanket `letter-spacing` that smears every glyph
to compensate for a handful. Two cases, and they are not handled the same way:

- **TrueType** — write the subset out, but **re-save through fontTools**; the
  raw PyMuPDF byte stream is routinely rejected by the browser's font
  sanitizer.
- **CFF** — `extract_font()` hands back a *bare CFF table*, not a font. Wrap it
  with `fontTools.FontBuilder`, then **throw away the CFF table fontTools
  generates** and decompile the original bytes into it:

  ```python
  fb.setupCFF(name, {"FullName": name}, charstrings, {})
  tab = newTable("CFF ")
  tab.decompile(cff_data, fb.font)    # raw bytes, not a BytesIO
  fb.font["CFF "] = tab
  ```

  This matters enormously. `setupCFF` re-encodes the charstrings against an
  empty Private dict, so every width operand gets written relative to
  `nominalWidthX = 0` instead of the real value (~396). The font loads, the
  glyphs look right, and every advance is **~110× too wide** — a 51 px string
  measures 5,695 px. Decompiling the original bytes preserves the Private dict.

  CFF `CharString.width` is lazily decompiled: read it only after
  `cs.draw(RecordingPen())`, or you get `MISSING`.

Serve them as **woff2 base64 data URIs** inside the HTML:

```python
f.flavor = "woff2"; f.save(buf); f.flavor = None
b64 = base64.b64encode(buf.getvalue()).decode()
```

Not as files. Chromium treats `file://` as an opaque origin and **blocks
`@font-face`** across it, so a relative `url(fonts/X.woff2)` fails with a bare
`NetworkError` and you get silent fallback to a system font. Data URIs sidestep
the origin check entirely and keep the deliverable self-contained.

### 4. Author the page — one element per asset

Paint in the order `assets.json` lists, each layer absolutely positioned on a
fixed-aspect artboard:

1. **plates** — large flat colour fields. Use the `d` path data, not the bbox.
2. **clusters** — grouped vector artwork, one inline `<svg>` each with
   `viewBox="0 0 w h"` translated by the cluster origin.
3. **imgs** — `<img>` per photo, with `opacity` and `rotate()` applied.
4. **text** — real HTML text from `spans.json`.

**Baseline anchoring.** Do not derive the offset from an em ratio. Chromium
rounds ascent/descent to whole pixels, so the em fraction is **not constant with
size** — measured on one page: 43.65 px → 0.7560 em, 84.58 px → 0.7685 em,
138.82 px → 0.7708 em. Assuming one constant put every line ~1 px high. Use the
probed per-(font, size) value from `offsets.json`:

```
top = baseline - offset[font][size]
```

`offsets.json` is produced by rendering a zero-height inline-block strut on the
baseline inside a `line-height:1` box — `canvas.measureText` font metrics are
useless here, because Chromium returns identical fallback values for every font.

**Per-glyph kerning.** Even with the exact font, the PDF's advances can differ
from `hmtx` because the PDF emitter applied its own tracking. Compare the real
per-glyph advances from `rawdict` against the font's, and emit each non-trivial
delta (skip anything under ~0.2 pt) as `letter-spacing` on that one character:

```python
delta = (ox[i+1] - ox[i]) - hmtx[cmap[ord(ch)]][0] * size / upem
```

Do **not** average one tracking value across the span; that's the smearing
mistake. Rebuild spans from `rawdict` characters rather than `get_text("dict")`
span text — PyMuPDF strips pad spaces from span text but keeps them in the bbox,
so `'&'` is really `' & '` and the bbox is 3× wider than the string.

**Responsive.** Two layouts in one file, sharing the same asset files:

- Desktop: fixed-aspect artboard — `mx-auto aspect-[W/H] max-w-[Wpx]` with
  absolutely positioned children, hidden below `md`.
- Mobile: an ordinary Tailwind flow layout that restacks properly, `md:hidden`.

Use container queries (`container-type: inline-size`) and `cqw` units on the
desktop artboard so type scales with the container. **Every asset must appear in
the mobile flow** — that is the whole point of extracting them separately.

Write the breakpoint as hand-rolled CSS (`@media (min-width:768px)`), not as a
Tailwind `md:` variant. If the CDN is slow or blocked, a Tailwind-only
breakpoint leaves both layouts visible or both hidden; a plain media query
always resolves.

### 5. Compare, then iterate

```bash
python scripts/render_diff.py out/index.html --pdf design.pdf \
    --selector .art --width 1920 --height 2820
```

Render the artboard at its natural width in headless Chromium and diff against
MuPDF's own raster (`page.get_pixmap(dpi=72)` — trust it completely as ground
truth).

Launch Chromium with `--disable-lcd-text --force-color-profile=srgb`. Without
those flags you are measuring Chromium's sub-pixel text antialiasing against
PyMuPDF's grayscale, and a perfectly placed footer reads as 7–9% mismatch.

Score with two metrics, because one lies:

- **raw** per-pixel mismatch — sensitive to rasterizer AA, always pessimistic.
- **AA-robust** — 2×2 box-average luminance, or a 1 px Gaussian blur before
  differencing. This separates real geometry error from edge fringe.

Localise with a coarse grid (e.g. 12×6) over both metrics. A region that is hot
raw but cold under blur is antialiasing; a region hot in both is a genuine
placement bug.

Sub-pixel agreement is achievable and is the bar: aim for |dx|, |dy| < 0.5 px in
every region. The residual you cannot remove is edge fringe — transitions like
`#e00613 → #ec6069` are one-pixel blends, not misplacement.

Verify responsive behaviour separately:

```bash
python scripts/responsive_audit.py out/index.html --expect 9 \
    --art .art --flow main.flow
```

At 390/430/768/1024/1440/1920 it asserts every `<img>` decoded
(`naturalWidth > 0`), the expected asset count is visible, no document
overflow, exactly one of the two layouts is live, and the console is clean.

Note that artwork legitimately bleeding past the artboard edge is *not* overflow
— it is clipped by the artboard's `overflow:hidden`, exactly as the PDF clips it.
Only chase elements flagged wide when the document itself overflows.

## Traps, in the order you will hit them

**`get_image_info()` does not surface `/SMask`.** Every cut-out photo on a real
page carries a soft mask, and without it you get an opaque rectangle where a
silhouette should be. Read `/SMask N 0 R` off the raw object dict and composite
it yourself: `pix = pymupdf.Pixmap(pix, mask)`.

**A `Do` operand is a name, not an xref — and it may be a Form XObject.** You
must resolve `/XObject << /Fm0 43 0 R >>` from the page resources, then check
`/Subtype /Form` and unwrap to the inner image, composing the form's own `cm`
with the outer CTM. Assigning images to `Do` events by draw order instead looks
plausible and silently mis-assigns them — on one page it swapped a 1030×805
photo for a 2×2 one.

**`0 TL/Fm0 Do` is legal PDF.** There is no space before the name, so a plain
`split()` loses the XObject. Take `args[-1].split("/")[-1]`.

**Numbers are operands too.** When building the graphics-state stack, it is easy
to write an operand filter that keeps names and drops numbers — then every `cm`
sees an empty operand list. Keep every non-operator token.

**A cluster `bbox` is `[x, y, w, h]`, not `[x0, y0, x1, y1]`.** Computing
`w = b[2] - b[0]` yields a negative width and Chromium rejects the `viewBox`.

**A "band" is often a slanted quadrilateral, not a rectangle.** Vector art that
looks like a horizontal stripe may be four `l` segments. Emitting the bbox as a
rect rendered a red band 31% wrong in that region. Always emit the real path
data and only substitute a rect for an actual `re` operator.

**Placement stores the rotated AABB; don't apply the rotation twice.** When an
image is rotated, the natural thing to store is the axis-aligned bounding box —
but then placing it and *also* setting `rotate()` double-counts the rotation,
landing images ~23 px off with boxes ~47 px too wide. Store the AABB for
sizing, then place the **unrotated** box centred on the measured centre.

**Cropping snaps to whole source pixels.** After cropping, back-project the
integer crop box through the CTM to recover the exact destination rect, or the
art shifts by up to a full pixel.

**PyMuPDF truncates colour components.** Use `int(v * 255)`, not
`round(v * 255)` — rounding made a brand blue `#214790` instead of `#204690` and
a red `#e10613` instead of `#e00613`.

**ExtGState alpha is per-draw, not per-image.** Read `/ca` from the `/GSn` dict
named by the `gs` operator and carry it in the graphics-state stack, or a
20%-opacity overlay renders fully opaque.

**JPEG chroma subsampling smears sharp colour edges.** Default 4:2:0 leaves
~0.8% mismatch on red/yellow boundaries that looks like a layout bug and isn't:
`save(..., "JPEG", quality=90, subsampling=0)`. WebP and AVIF are YUV420
internally and have the same problem. Prefer PNG for cut-outs — you need the
alpha anyway.

**Sub-pixel nudges don't work.** Chromium snaps glyph origins to the pixel
grid. A `+0.10` global vertical nudge doesn't slide the text, it flips which
pixel row each glyph lands on, and can make the score *worse*.

**Alignment-search sign.** `ref[r0:r1] ≈ got[r0+dy : r1+dy]` means got's content
sits `dy` rows *below* ref's, so got must move **up** — subtract from `top`.
Getting this backwards turns a 1 px fix into a 3 px error.

**Calibration regions get polluted by neighbours.** Padding a span's crop by
10 px catches the next line's ascenders. Tighten to ~3 px, cap-height band.

**`chdir` silently zeroes measurements.** If a step changes directory while a
later one resolves font paths relatively, the lookups fail and per-glyph kerning
comes back all zeros with no error. Use absolute paths throughout.

**Font substitution wastes days.** If you are tuning `letter-spacing` by more
than a few hundredths of an em, you are compensating for the wrong font.

## If you're tempted to call a model

Don't. Specifically:

- **Not for the first pass.** You have exact geometry in `assets.json`. A model
  guessing from pixels starts further away than the scaffold does.
- **Not for self-correction.** "Here are two images, what's different?" is a
  slow, expensive, lossy way to compute a number that `numpy` gives you exactly
  in milliseconds. The compare loop is not a nice-to-have add-on — it *is* the
  mechanism.
- **Not for a vision check when the agent can't see.** If the active model has
  no image input, an image-based loop is not merely expensive, it's impossible.
  The pixel diff is what makes the workflow work under that constraint.

The honest remaining use for a model is the part scripts can't judge: naming the
mobile breakpoints, grouping assets into sensible sections, and writing the copy
reflow. That's the agent's job, and the agent is already here.

## Anti-patterns

- **A full-page raster as the background.** The one that matters most — see "The
  output is real markup". It throws away accessibility, selection, and any
  chance of a real responsive layout, and it makes every downstream number lie:
  the diff says 1% while the mobile page is empty by construction.
- **`transform: scale()` on a fixed artboard as the responsive strategy.**
  Reproduces one screenshot at every width and never restacks a column. A
  scaled artboard is a debugging reference, not a deliverable.
- **Replaying vector paths as HTML boxes.** A compound path with fill holes
  (letterforms with counters, a badge) does not survive approximation by each
  sub-shape's bounding box — a dozen overlapping rectangles render as a blob.
  Emit the real path data, or crop it as a single image asset.
- **Trusting `doc.extract_image(xref)` blind.** For an Indexed-colorspace image
  with a separate SMask it can silently return just the alpha mask's flat
  silhouette — no colour data, no error, a valid-looking dict.
- **Batching all images after all vector fills.** An image meant to sit behind
  some vector art ends up on top and buries it. Paint order is data; read it.
- **Averaged tracking across a span.** See step 4.

## Failure modes and fixes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Text measures ~110× too wide | CFF rebuilt by `setupCFF` | Decompile the original CFF bytes |
| `CharString.width` is `MISSING` | Lazily decompiled | `cs.draw(RecordingPen())` first |
| `NetworkError` on font load | `file://` origin, or raw PyMuPDF bytes | woff2 data URI + fontTools re-save |
| All text ~1 px high | Constant em-ratio baseline | Probe offset per (font, size) |
| Footer reads 7–9% mismatch but looks right | Sub-pixel text AA | `--disable-lcd-text` + blur metric |
| `viewBox: A negative value is not valid` | bbox read as `[x0,y0,x1,y1]` | It's `[x, y, w, h]` |
| Image is a 2×2 or wrong photo | `Do` name unresolved / draw-order guess | Resolve `/XObject`; unwrap `/Form` |
| `IndexError` in matrix multiply | Operand filter dropped numbers | Keep every non-operator token |
| Images ~23 px off, ~47 px too wide | Rotated AABB + `rotate()` | Place unrotated box on the centre |
| Flat colour off by 1/255 | `round(v*255)` on truncated float | `int(v*255)` |
| Slanted band renders as a rectangle | bbox used instead of path | Emit real `d` data |
| Cut-outs show as opaque rectangles | `/SMask` not composited | `Pixmap(pix, mask)` |
| Overlay too opaque | ExtGState `/ca` ignored | Track `gs` in the state stack |
| Per-glyph kerning all zeros | Relative font path after `chdir` | Use absolute paths |
| One span's width is 39% off | PyMuPDF stripped pad spaces | Rebuild spans from `rawdict` |
| Correction made it 3× worse | Inverted shift sign | Subtract from `top` |

## Deliverable checklist

- One self-contained `index.html` — no external font or image requests
  (Tailwind CDN is the only network dependency, and it's expected).
- **Every image and vector cluster is its own element** — no full-page raster.
- Fonts embedded as woff2 data URIs.
- Desktop artboard + a real reflowable mobile layout via a **hand-rolled**
  media query, and **every asset present in the mobile flow**.
- CTAs are real anchors.
- Sub-pixel agreement (|dx|, |dy| < 0.5 px) in every diff region, measured with
  an AA-robust metric.
- No console errors, no horizontal overflow at 390 / 768 / 1920.
- **Temp files cleaned up.** Scratch scripts, probe renders, and intermediate
  crops go in a `_work/` directory outside the deliverable and get deleted when
  the loop finishes. Leave only the deliverable behind.
