---
name: design-to-html
description: Convert a screenshot, mockup, PDF page, or design image into a single self-contained HTML+Tailwind file by making one direct call to a vision-capable LLM — no backend service, no build step, no browser app to run. This replicates the core "drop an image, get code" capability of tools like screenshot-to-code, but as a lightweight function Hermes can call inline. Trigger this skill whenever the user uploads or references a screenshot, mockup, wireframe, Figma export, PDF design doc, or asks to "turn this image into a page", "clone this UI", "convert this PDF to HTML", or similar — even if they don't name a specific tool.
---

# PDF / Image → HTML (Tailwind, serverless, single LLM call)

## What this replicates, and what it deliberately skips

Open-source tools like `screenshot-to-code` do this well but ship as a two-process
app: a FastAPI backend plus a React/Vite frontend, with session state, a
provider-picker UI, and (in newer versions) an agent loop that renders its own
output in a headless browser to self-correct. That's the right shape for a
hosted product used by many people through a browser.

Hermes doesn't need any of that scaffolding. The actual capability is one
multimodal request: *send an image, get back a complete HTML document*. This
skill is that request, isolated, so it can run as a plain function call inside
an existing agent turn — no port to bind, no process to keep alive, no UI.

The one piece worth borrowing later if quality matters more than simplicity is
the **self-check loop** (render the generated HTML, compare it to the source,
ask the model to fix drift) — covered as an optional add-on near the end.

## Files in this skill

- `SKILL.md` — this file: when to use it, the prompt, and how to call the script.
- `scripts/pdf_image_to_html.py` — the actual pipeline (see below). Run it or
  import from it; don't re-derive its logic inline.

## Workflow

1. **Normalize the input to images.** Most vision LLM APIs take images, not
   PDFs.
   - If the input is already an image (PNG/JPG/WEBP), use it as-is.
   - If it's a PDF, rasterize each page to a PNG first (see below). Treat each
     page as its own design to convert, unless the user wants one continuous
     scrolling page.
   - Exception: if the call is going straight to Claude's Messages API, you
     can skip rasterization — Claude accepts a PDF directly as a `document`
     content block and reads pages itself. Rasterize for every other
     provider (OpenAI-style vision, Gemini, a local vision model behind an
     OpenAI-compatible server, etc.).

2. **Base64-encode the image(s)** and build a multimodal message: one text
   part with the instructions, one image part per page/screenshot.

3. **Call the model once** with the system prompt below (or your adapted
   version of it). Ask for a complete HTML document and nothing else.

4. **Extract the HTML** from the response defensively — models occasionally
   wrap output in commentary or code fences even when told not to.

5. **Write the file(s) out** and hand them back. That's the whole pipeline;
   there's no session to manage between steps 3 and 4.

## The system prompt

This is the load-bearing part. The instructions below encode lessons from
screenshot-to-code-style tools about where these models tend to cut corners —
adapt the specifics (stack, icon library, image strategy) but keep the shape:

```
You are a meticulous frontend developer. You will be shown one or more
images: a reference design (a screenshot, mockup, or PDF page). Reproduce
it as a single, self-contained HTML page using Tailwind CSS utility
classes — no build step, no framework.

Precision rules:
- Match layout, spacing, colors, and typography as closely as the image
  allows. If a color isn't a standard Tailwind shade, use an arbitrary
  value like bg-[#1a2b3c] rather than rounding to the nearest default.
- Reproduce the visible text exactly as written, including labels, prices,
  and body copy — don't summarize or invent copy that isn't shown.
- Write out every repeated element in full (every nav link, every row,
  every card). Never collapse repetition into a comment like
  "<!-- repeat for remaining items -->" — that comment is not valid
  output and will be treated as a failure.
- Don't leave TODO-style placeholders anywhere in the markup.
- For images you can't extract directly, use a placeholder from
  https://placehold.co sized to match the original, with a detailed
  alt description of what belongs there so an image model could fill
  it in later.

Libraries (all via CDN, no npm install):
- Tailwind: <script src="https://cdn.tailwindcss.com"></script>
- Icons: Font Awesome or Google Fonts via their standard CDN <link> tags,
  only if the design clearly uses icons/custom type.

Output format:
- Return ONLY the HTML document, starting at <!DOCTYPE html> and ending
  at </html>.
- No markdown code fences, no explanation before or after, no "Here's
  the code:" preamble.
```

If the source is a PDF with multiple pages and the user wants one flowing
document rather than N separate files, add a line telling the model to treat
each supplied image as a section stacked vertically, separated by a visible
divider, rather than starting a fresh `<html>` per page.

## Reference implementation

`scripts/pdf_image_to_html.py`, bundled with this skill, is the actual
pipeline — not a sketch to retype. It's deterministic on purpose: same
input and flags always produce the same request shape, and every run writes
the model's raw response to `<label>.raw.txt` next to the extracted HTML, so
a bad output is a file you can open, not a guess. Call it as a subprocess
from Hermes, or import its functions (`pdf_to_images`, `extract_html`,
`call_vision_model`) directly if Hermes prefers in-process calls.

Requires: `pip install openai pymupdf`

```bash
# Local vision model behind an OpenAI-compatible server (llama-server, vLLM, etc.)
python scripts/pdf_image_to_html.py design.png \
    --base-url http://localhost:8080/v1 --model qwen2.5-vl --api-key none

# OpenAI
python scripts/pdf_image_to_html.py spec.pdf \
    --base-url https://api.openai.com/v1 --model gpt-4o --api-key-env OPENAI_API_KEY

# Merge every PDF page into one flowing page instead of one file each
python scripts/pdf_image_to_html.py spec.pdf --combine \
    --model gpt-4o --api-key-env OPENAI_API_KEY
```

Flags worth knowing: `--dpi` controls PDF rasterization quality (raise it if
small text comes out garbled), `--out-dir` sets where files land (defaults
to `<input-stem>_html/` next to the source), and `--instructions` overrides
the default per-call user prompt if a particular design needs special
handling.

**If calling Claude specifically**, you can skip rasterization for PDF input
entirely — Claude accepts a PDF directly as a `document` content block and
reads its pages natively. The bundled script targets the OpenAI-compatible
shape since that covers local/open-weight models too; for a Claude-only path,
swap `call_vision_model`'s message construction for the Anthropic SDK's
`document` block instead of `pdf_to_images` + per-page `image_url` parts.

## Common failure modes to guard against

- **Truncated output.** Long, element-heavy designs (long lists, big nav
  bars) get cut short if `max_tokens` is too low, or the model starts
  summarizing with a comment instead of finishing. Raise the token limit
  first; if it still truncates, split the design into sections and generate
  each separately.
- **Markdown fences in the response.** Even with explicit instructions,
  some models wrap output in ` ```html ` anyway. `extract_html` above strips
  this, but always run input through it rather than trusting raw output.
- **Drifted colors/spacing.** Vision models are good at layout, mediocre at
  exact hex values. If pixel accuracy matters, tell the model to prefer
  arbitrary Tailwind values (`bg-[#0e7490]`) over guessing the nearest
  named shade.
- **Multi-page PDFs read as unrelated screenshots.** If the pages are
  meant to be one flow (e.g. a multi-section landing page spec), say so
  explicitly in the prompt — otherwise each page comes back as an
  independent, disconnected document.

## Optional: visual self-check loop

If output quality matters more than speed and a headless browser is
available locally (Playwright, not a persistent server — it launches, takes
a screenshot, and exits), you can close the loop the way agent-based
screenshot-to-code tools do:

1. Render the generated HTML to a PNG.
2. Send both the original reference image and the rendered PNG back to the
   model, asking it to point out mismatches and return corrected HTML.
3. Repeat once or twice — returns diminish fast after that.

This roughly doubles cost and latency per generation, so treat it as an
opt-in flag rather than the default path.

## Optional: feeding the output into a SvelteKit page

If the generated HTML is meant to land in an existing SvelteKit project
rather than ship as a standalone file, treat the model's output as markup to
paste into a component, not as the final deliverable — keep the Tailwind
classes, drop the `<!DOCTYPE html>`/`<head>` wrapper, and load any dynamic
values as props:

```typescript
// +page.ts (illustrative — adjust to how the design's data actually arrives)
export const load = async () => {
  const { data } = $props();
};
```

Static designs with no real data don't need a load function at all — the
generated markup can go straight into `+page.svelte` as-is.
