#!/usr/bin/env python3
"""
pdf_image_to_html.py

Convert a screenshot, mockup, or PDF into one or more self-contained
HTML+Tailwind files using one vision-LLM call per page. No backend
service, no build step — this is a plain, deterministic script.

Requires:
    pip install openai pymupdf

Examples:
    # Local vision model behind an OpenAI-compatible server (e.g. llama-server)
    python pdf_image_to_html.py design.png \\
        --base-url http://localhost:8080/v1 --model qwen2.5-vl --api-key none

    # OpenAI
    python pdf_image_to_html.py spec.pdf \\
        --base-url https://api.openai.com/v1 --model gpt-4o \\
        --api-key-env OPENAI_API_KEY

    # Merge every PDF page into one flowing page instead of one file each
    python pdf_image_to_html.py spec.pdf --combine \\
        --model gpt-4o --api-key-env OPENAI_API_KEY
"""

from __future__ import annotations

import argparse
import base64
import logging
import mimetypes
import os
import re
import time
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("pdf_image_to_html")

DEFAULT_MAX_TOKENS = 8000
DEFAULT_DPI = 144

SYSTEM_PROMPT = """You are a meticulous frontend developer. You will be shown one or more
images: a reference design (a screenshot, mockup, or PDF page). Reproduce
it as a single, self-contained HTML page using Tailwind CSS utility
classes -- no build step, no framework.

Precision rules:
- Match layout, spacing, colors, and typography as closely as the image
  allows. If a color isn't a standard Tailwind shade, use an arbitrary
  value like bg-[#1a2b3c] rather than rounding to the nearest default.
- Reproduce the visible text exactly as written, including labels, prices,
  and body copy -- don't summarize or invent copy that isn't shown.
- Write out every repeated element in full (every nav link, every row,
  every card). Never collapse repetition into a comment like
  "<!-- repeat for remaining items -->" -- that comment is not valid
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
"""

COMBINE_INSTRUCTIONS = (
    "These images are consecutive sections of one page, in order. Reproduce "
    "them as a single HTML file with the sections stacked vertically in the "
    "order given, separated by a visible divider -- not as separate documents."
)
DEFAULT_INSTRUCTIONS = "Reproduce this design as a single HTML file."


def encode_image(path: Path) -> tuple[str, str]:
    mime = mimetypes.guess_type(str(path))[0] or "image/png"
    data = base64.b64encode(path.read_bytes()).decode()
    return mime, data


def pdf_to_images(pdf_path: Path, dpi: int, out_dir: Path) -> list[Path]:
    """Rasterize each page of a PDF to a PNG. Raises a clear error if
    PyMuPDF isn't installed rather than failing on an obscure import trace."""
    try:
        import fitz  # PyMuPDF
    except ImportError as exc:
        raise SystemExit(
            "PyMuPDF is required for PDF input. Install with: pip install pymupdf"
        ) from exc

    doc = fitz.open(pdf_path)
    out_dir.mkdir(parents=True, exist_ok=True)
    pages: list[Path] = []
    for i, page in enumerate(doc):
        pix = page.get_pixmap(dpi=dpi)
        out_path = out_dir / f"{pdf_path.stem}_p{i + 1}.png"
        pix.save(out_path)
        pages.append(out_path)
        log.info("Rasterized page %d -> %s", i + 1, out_path)
    doc.close()
    return pages


def extract_html(raw: str) -> str:
    """Pull a clean HTML document out of a model response, tolerating
    stray prose or code fences the model adds despite instructions."""
    cleaned = re.sub(r"^```(?:html)?\s*|\s*```$", "", raw.strip(), flags=re.M)
    match = re.search(r"<!DOCTYPE html.*?</html>", cleaned, re.S | re.I)
    if match:
        return match.group(0).strip()
    match = re.search(r"<html.*?</html>", cleaned, re.S | re.I)
    if match:
        return match.group(0).strip()
    log.warning(
        "Could not find a <html>...</html> block in the response. "
        "Returning the raw text as-is -- check the .raw.txt file next to "
        "the output to see exactly what the model sent back."
    )
    return cleaned.strip()


def call_vision_model(
    image_paths: list[Path],
    *,
    base_url: str,
    api_key: str,
    model: str,
    instructions: str,
    max_tokens: int,
) -> str:
    from openai import OpenAI

    client = OpenAI(base_url=base_url, api_key=api_key)
    content: list[dict] = [{"type": "text", "text": instructions}]
    for path in image_paths:
        mime, data = encode_image(path)
        content.append(
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}
        )

    log.info("Calling %s with %d image(s)...", model, len(image_paths))
    start = time.time()
    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        max_tokens=max_tokens,
    )
    log.info("Response received in %.1fs", time.time() - start)
    return response.choices[0].message.content


def write_result(raw: str, out_dir: Path, label: str) -> Path:
    """Always write the raw response alongside the extracted HTML.
    This is the single biggest debugging win: when extraction fails or
    the output looks wrong, you look at label.raw.txt, not the model's
    provider dashboard."""
    (out_dir / f"{label}.raw.txt").write_text(raw)
    html = extract_html(raw)
    out_path = out_dir / f"{label}.html"
    out_path.write_text(html)
    log.info("Wrote %s (raw response: %s.raw.txt)", out_path, label)
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("input", type=Path, help="Image (.png/.jpg/.webp) or PDF to convert")
    parser.add_argument("--model", required=True, help="Vision-capable model name")
    parser.add_argument(
        "--base-url", default="https://api.openai.com/v1", help="OpenAI-compatible API base URL"
    )
    parser.add_argument("--api-key", default=None, help="API key value (overrides --api-key-env)")
    parser.add_argument(
        "--api-key-env", default="OPENAI_API_KEY", help="Env var to read the API key from"
    )
    parser.add_argument("--dpi", type=int, default=DEFAULT_DPI, help="PDF rasterization DPI")
    parser.add_argument("--max-tokens", type=int, default=DEFAULT_MAX_TOKENS)
    parser.add_argument(
        "--combine", action="store_true",
        help="Merge all PDF pages into one HTML file instead of one file per page",
    )
    parser.add_argument("--out-dir", type=Path, default=None, help="Output directory")
    parser.add_argument(
        "--instructions", default=None, help="Override the default per-call instruction text"
    )
    args = parser.parse_args()

    if not args.input.exists():
        parser.error(f"Input file not found: {args.input}")

    api_key = args.api_key or os.environ.get(args.api_key_env)
    if not api_key:
        parser.error(f"No API key: pass --api-key or set ${args.api_key_env}")

    out_dir = args.out_dir or args.input.parent / f"{args.input.stem}_html"
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.input.suffix.lower() == ".pdf":
        images = pdf_to_images(args.input, args.dpi, out_dir / "pages")
    else:
        images = [args.input]

    if args.combine and len(images) > 1:
        raw = call_vision_model(
            images,
            base_url=args.base_url,
            api_key=api_key,
            model=args.model,
            instructions=args.instructions or COMBINE_INSTRUCTIONS,
            max_tokens=args.max_tokens,
        )
        write_result(raw, out_dir, "combined")
    else:
        for i, img in enumerate(images):
            label = args.input.stem if len(images) == 1 else f"{args.input.stem}_p{i + 1}"
            raw = call_vision_model(
                [img],
                base_url=args.base_url,
                api_key=api_key,
                model=args.model,
                instructions=args.instructions or DEFAULT_INSTRUCTIONS,
                max_tokens=args.max_tokens,
            )
            write_result(raw, out_dir, label)


if __name__ == "__main__":
    main()
