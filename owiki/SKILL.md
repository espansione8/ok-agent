---
name: owiki
description: "Convert vault RAW files to WIKI markdown for coding agents."
version: 4.0.0
author: espan
license: MIT
platforms: [linux, macos, windows]
tags: [Obsidian, vault, markdown, conversion, wiki]
---

# Owiki — RAW→WIKI Vault Converter

Converts `<vault>/<project>/RAW/` files into Obsidian markdown in
`<vault>/<project>/WIKI/` as project knowledge for coding agents.

Script: `scripts/owiki_convert.py`, next to this file — resolve paths
relative to it. No vault, OS, or agent is hardcoded anywhere.
Incremental via SHA-256+size cache; WIKI/ always mirrors RAW/ (orphans
and their assets cleaned up).

## When to Use
- `/owiki <project>` or "convert raw to wiki for <project>"
- new file dropped in a project's RAW/ → WIKI update
- `/owiki` from vault root (all subfolders) or inside one (just it)
- `/owiki --all` from anywhere
- stale repo KNOWLEDGE.md/AGENTS.md → `/owiki --update` from the repo

## Prerequisites
`pip install beautifulsoup4 markdownify pymupdf python-docx openpyxl python-pptx pillow pyyaml`
- LibreOffice only for ODF/legacy formats (.odt .ods .odp .doc .xls .ppt .rtf)
- vision model optional (figure captions only). Default: local Ollama;
  any OpenAI-compatible endpoint via `OWIKI_VISION_*`

## Vault Resolution (never hardcoded, never guessed from cwd)
1. `--vault <path>` flag
2. `OWIKI_VAULT_PATH` env var
3. `<skill_dir>/vault-config.json` (written by the wizard)
4. Setup wizard — fires whenever config is missing, regardless of cwd
   or agent; needs a real interactive terminal (agent shells have
   none). Auto-detects (Obsidian registry, then drive scan) and
   confirms before saving — nothing is saved without confirmation.
   After saving, lists discovered projects and asks to convert all
   subfolders now (same as `--all`), default yes.
5. Agent mode (no terminal): detection still runs — a single unambiguous candidate (or the unique one containing RAW/ projects) is adopted and saved automatically; --vault also saves the config. Only zero or tied candidates produce the fix list.

## How to Run

    python "<skill_dir>/scripts/owiki_convert.py" "<vault>/<project>"   # full path (WIKI only)
    python "<skill_dir>/scripts/owiki_convert.py" <name>                # named subfolder — ONLY form writing KNOWLEDGE.md/AGENTS.md (to cwd)
    python "<skill_dir>/scripts/owiki_convert.py" --vault "<vault>" <name>
    python "<skill_dir>/scripts/owiki_convert.py" --all                 # every subfolder, from anywhere
    python "<skill_dir>/scripts/owiki_convert.py" --list                # RAW/-bearing projects
    python "<skill_dir>/scripts/owiki_convert.py" --update              # re-sync KNOWLEDGE.md/AGENTS.md in cwd
    python "<skill_dir>/scripts/owiki_convert.py" --init                # setup wizard
    python "<skill_dir>/scripts/owiki_convert.py" <name> --project-root "<repo>"

Add `--force` to ignore the cache. Bare names map only to vault
subfolders (never cwd); missing RAW/ is created with an honest report.

## KNOWLEDGE.md + AGENTS.md (project root, never the vault)
Only the named form writes them:
- KNOWLEDGE.md — regenerated each run; points at `WIKI/_Index.md`,
  marks RAW read-only / WIKI generated, carries `Last wiki update:`
  from the subfolder's cache.
- AGENTS.md — created, or a `## Domain Knowledge` section upserted
  (idempotent, existing content preserved).

`--update` re-syncs both via the wiki path recorded in KNOWLEDGE.md —
no vault config needed. Notifies cleanly if not connected.

## vault-config.json

    {"vault": "<absolute vault path>", "saved": "<iso timestamp>"}

Lives in the skill folder (travels with the skill). A vault = any
folder with a `.obsidian/` marker or at least one `<name>/RAW/`
subfolder.

## Output Structure

    <vault>/<project>/
      RAW/                    <- source files (read-only)
      WIKI/
        _Index.md             <- categorized index
        Note-Name.md          <- notes with YAML frontmatter
        assets/               <- extracted/rendered figures
      .owiki-cache.json

## Hybrid Figure Handling
- PDF raster images (deduped, >200px) + vector-drawing pages (rendered
  150 DPI, text-sparse pages only) + standalone images -> WIKI/assets/
- each figure: vision caption (readable by any agent) +
  `![[assets/...]]` embed + `images:` frontmatter list
- no vision -> mechanical captions, "Captions pending" banner,
  `captions_pending: true` in cache; a later run with vision fully
  reconverts each pending file. Never fails or blocks on vision.

## Supported Formats
| Format | How |
| --- | --- |
| .html .htm | BeautifulSoup + markdownify (charset sniffed) |
| .txt .md | passthrough (source frontmatter stripped from .md) |
| .pdf | PyMuPDF — text + figures |
| .docx / .xlsx / .pptx / .csv | python-docx / openpyxl / python-pptx / csv |
| images | copied + captioned |
| .odt .ods .odp .doc .xls .ppt .rtf | LibreOffice headless -> intermediate |

## Notes
- frontmatter (title, category, summary, tags, source, project,
  images) is real YAML; manual edits preserved for unchanged files
- tags: significant words pulled from filename + title (no fixed
  vocabulary — works for any project or language); `general` fallback
- duplicate basenames get `-1`, `-2`... slug suffixes
- cache is per-project; delete it to force full reconversion.
  Pre-3.2 caches lack per-note asset lists — one `--force` run
  migrates them

## Pitfalls
- scanned PDFs return empty text — use OCR or rely on rendered pages
  + captions
- dense technical figures caption better with a stronger vision model
  (`OWIKI_VISION_*`)
- DOCX/PPTX inline images are NOT extracted (PDF + standalone images
  only); DOCX vertical cell merges not deduplicated (horizontal are)
- no cap on total figures extracted — an image-heavy or huge PDF can
  fill `assets/` with many PNGs (every image ≥200px and every
  text-sparse vector page gets its own file)
- WIKI is generated output — never edit; edits lost on reconversion
- LibreOffice runs headless with a dedicated profile, retried 3x;
  close a running LibreOffice if conversion fails
- the wizard needs a real terminal — configure instead via `--init`,
  `OWIKI_VAULT_PATH`, or `--vault`

## Verification
- `WIKI/_Index.md` lists all notes; each note has `---` frontmatter
- rerun with no changes -> "Skip (unchanged)" everywhere
- figures: assets/ PNGs + `![[...]]` embeds + `images:` frontmatter
- no vision -> pending banners + `captions_pending: true`