---
name: owiki
description: "Convert vault RAW files (pdf, docx, html, txt, ...) into English WIKI markdown for coding agents. Use for /owiki, 'convert raw to wiki', new files in a project's RAW/, or refreshing stale KNOWLEDGE.md/AGENTS.md."
version: 4.4.0
author: espan
license: MIT
platforms: [linux, macos, windows]
tags: [Obsidian, vault, markdown, conversion, wiki]
---

# Owiki — RAW→WIKI Vault Converter

Converts `<vault>/<project>/RAW/` files into Obsidian markdown in
`<vault>/<project>/WIKI/` as project knowledge for coding agents.
WIKI content is **English**: the converter extracts mechanically, the
agent translates and enriches (see Enrichment).

Script: `scripts/owiki_convert.py`, next to this file — resolve paths
relative to it. No vault, OS, or agent is hardcoded anywhere.
Incremental via SHA-256+size cache; WIKI/ always mirrors RAW/ (orphans,
including stale notes/assets from older caches, are cleaned up). A failed
source conversion is reported and makes the run non-zero without aborting
other projects.

The converter extracts text and figures and writes complete mechanical
notes. The agent running this skill then **enriches** those notes —
translates them into English, then summaries, tags, body structure,
figure descriptions — using whatever capabilities its environment
provides. The converter never translates: no translation service,
model, or API key is involved anywhere. See the Enrichment section
below.

## When to Use
- `/owiki <project>` or "convert raw to wiki for <project>"
- new file dropped in a project's RAW/ → WIKI update
- `/owiki` from vault root (all subfolders) or inside one (just it)
- `/owiki --all` from anywhere
- stale repo KNOWLEDGE.md/AGENTS.md → `/owiki --update` from the repo
- after conversion, enrich the generated WIKI notes and translate them
  into English (see Enrichment)

## Prerequisites
`pip install beautifulsoup4 markdownify pymupdf python-docx openpyxl python-pptx pillow pyyaml`
- LibreOffice only for ODF/legacy formats (.odt .ods .odp .doc .xls .ppt .rtf)
- figure understanding uses the active owiki agent model; no separate model,
  provider, URL, API key, or environment variable is required

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
- each figure gets a deterministic mechanical caption, an
  `![[assets/...]]` embed, and an `images:` frontmatter entry
- the converter writes a mechanical caption for every figure. The agent
  running the enrichment step replaces these with semantic descriptions
  using whatever image-viewing capability its environment provides. If
  the agent has no image-viewing capability, it marks the caption with a
  `<!-- caption-pending -->` marker so the next agent run with image
  capability can complete it. The converter never calls a separate
  vision service, model, provider, or API key.

## Supported Formats
| Format | How |
| --- | --- |
| .html .htm | BeautifulSoup + markdownify (charset sniffed) |
| .txt .md | passthrough (source frontmatter stripped from .md) |
| .pdf | PyMuPDF — text + figures |
| .docx / .xlsx / .pptx / .csv | python-docx / openpyxl / python-pptx / csv |
| images | copied + captioned |
| .odt .ods .odp .doc .xls .ppt .rtf | LibreOffice headless -> intermediate |

## Enrichment (after extraction)

The converter produces complete, readable notes with mechanical
metadata. The agent running this skill enriches them after the
converter finishes. This is the workflow:

### What to enrich

For each note in `WIKI/` (read the `.md` file and its YAML frontmatter):

1. **Translation to English** — if the note body is not entirely in
   English, translate it first, so summary, tags, and captions written
   afterwards are English too. Rules:

   - translate prose, headings, and table header/label text
   - keep verbatim, untranslated: code blocks, commands, file paths,
     URLs, identifiers, error strings, and data values (part numbers,
     pin names, model codes). Keep `![[...]]` embeds, `assets/` names,
     and `<!-- page N -->` markers exactly as they are
   - never rename the note file: the slug maps to the RAW filename in
     the cache and in every `[[wikilink]]`. Translate the `title:`
     frontmatter instead — the original title stays in `aliases:`
   - when done, add `language: en` to the frontmatter, plus
     `source-language: <ISO 639-1 code>` when the source was not
     English. A note without `language: en` is a note the agent has
     not enriched yet — that is the pending-work signal

   Example frontmatter after translating an Italian source:

   ```
   ---
   title: Wiring Diagram
   aliases: [Schema Collegamento, Schema Collegamento.pdf]
   language: en
   source-language: it
   ...
   ---
   ```

2. **Summary** — replace the mechanical `summary:` in frontmatter
   (first-line scrape) with a 2-3 sentence factual summary **in
   English**, based on the note body content.

3. **Tags** — replace the filename word-split `tags:` in frontmatter
   with semantic tags **in English** that reflect what the document is
   about, based on the note body content.

4. **Body cleanup** (for PDF-sourced notes) — the converter now strips
   repeated page headers/footers, uses HTML comments (`<!-- page N -->`)
   for page provenance instead of `## Page N` headings, and fences
   code blocks automatically. HTML source `<h1>` tags are demoted to
   `<h2>` so the note template's `# {title}` is the sole H1. Remaining
   cleanup: merge content across page boundaries into coherent prose
   where the page breaks split a sentence or paragraph; verify heading
   hierarchy matches the document's actual structure. Do not add new
   content — only reorganize and clean.

5. **Figure descriptions** — for each image listed in the note's
   `images:` frontmatter, look at the image file in `WIKI/assets/` and
   write a semantic description **in English** of what it shows: figure
   type (photo, schematic, diagram, chart, table), every visible label
   and piece of text verbatim, the layout, and what it represents.
   Replace the mechanical placeholder caption (the line starting with
   `>` after the figure heading) with your description.

   Use whatever image-viewing capability your environment provides
   (multimodal model, image analysis tool, vision capability, etc.) to
   look at the image file. If your environment has no way to view
   images, do not skip the rest of the enrichment — complete the
   translation, summaries, tags, and body cleanup, and mark the caption
   with a `<!-- caption-pending -->` marker so a later agent with image
   capability can complete it.

### How caption-pending completion works across runs

The converter's cache preserves agent enrichment for unchanged files.
When the RAW source has not changed, the converter skips the file
entirely and the note is preserved as-is — including your enrichment
and any `<!-- caption-pending -->` markers.

- A text-only agent translates and enriches summaries, tags, body
  cleanup, and marks figure captions with `<!-- caption-pending -->`.
- A later agent with image capability runs the converter (all unchanged
  files are skipped — no re-extraction), scans `WIKI/*.md` for
  `<!-- caption-pending -->` markers, views each referenced asset image,
  replaces the mechanical placeholder with a real description, removes
  the marker, and writes the note back. No re-enrichment of
  translation, summaries, or tags is needed — those are already done
  and preserved.
- If a RAW source does change, the converter re-extracts that file and
  overwrites the note with a fresh mechanical version. The agent
  re-enriches from scratch. Other files are untouched.

### caption-pending marker format

A text-only agent leaves:

```
### Figure 1 — page 3
<!-- caption-pending -->
> Embedded figure 1 from page 3 (800×600px). The active owiki model can add a semantic description.
![[assets/MyNote-p3-fig1.png]]
```

A vision-capable agent replaces it with:

```
### Figure 1 — page 3
> Pinout diagram for the Lynx M20 expansion header. Labels from left: VIN, GND, SDA, SCL, GPIO4, GPIO5, TX, RX. 2×4 grid layout, top row mirrored to bottom row.
![[assets/MyNote-p3-fig1.png]]
```

The `<!-- caption-pending -->` marker is removed. The `![[...]]` embed
stays. The `images:` frontmatter entry stays.

### Enrichment scope

Check what is left to do before and after working (Git Bash / Linux):

    grep -L "^language: en" WIKI/*.md | grep -v _Index   # notes not yet enriched
    grep -l "caption-pending" WIKI/*.md                  # notes with pending captions

A note is fully enriched when its frontmatter has `language: en` and
its body has no `<!-- caption-pending -->` marker.

- Enrich each note independently. Read the note, make improvements,
  write it back.
- If both greps come back empty and the converter reported only
  "Skip (unchanged)", enrichment is already complete — nothing to do.
- If the converter re-extracted files (source changed), enrich only
  those notes. The converter prints which files were converted.
- Always check for `<!-- caption-pending -->` markers after the converter
  finishes, even if no files were re-extracted. Complete them if you
  have image capability; leave them if you don't.

### After enrichment: refresh the index

Re-run the converter once after enriching. Unchanged files are skipped
(no re-extraction, enrichment preserved), but `_Index.md` is rebuilt
and every note's `## Related` section is refreshed from the enriched
frontmatter — so index summaries/tags and cross-links match the notes.

## Notes
- frontmatter (title, aliases, category, summary, tags, source, project,
  converted, images) is real YAML; `language` and `source-language` are
  added by the agent during enrichment. Manual and agent enrichment
  preserved for unchanged files
- tags: significant words pulled from filename + title (no fixed
  vocabulary — works for any project or language); `general` fallback
- duplicate basenames get `-1`, `-2`... slug suffixes
- cache is per-project; delete it to force full reconversion.
  Pre-3.2 caches lack per-note asset lists — one `--force` run
  migrates them. Unchanged notes load their cached `images` metadata so
  assets are not removed during cleanup.

## Pitfalls
- the converter never translates and cannot detect language — both are
  agent enrichment. Unchanged notes keep their translation via the
  cache; a changed source is re-extracted in its original language and
  must be translated and re-enriched from scratch
- scanned PDFs return empty text — use OCR or rely on rendered pages
  + captions
- figure descriptions require the active agent to view the image file.
  If the agent's environment has no image-viewing capability, mark
  unprocessed captions with `<!-- caption-pending -->` and continue
  enriching the rest of the note — a later agent run with image
  capability can complete them without re-running the converter
- DOCX/PPTX inline images are NOT extracted (PDF + standalone images
  only); DOCX vertical cell merges not deduplicated (horizontal are)
- no cap on total figures extracted — an image-heavy or huge PDF can
  fill `assets/` with many PNGs (every image ≥200px and every
  text-sparse vector page gets its own file)
- WIKI notes are extracted by the converter and enriched by the active
  agent model. The cache preserves agent enrichment for unchanged
  files; changed sources are re-extracted and need re-enrichment.
  Unknown/stale `.md` files and unreferenced files in `WIKI/assets/` are
  removed during the next converter run, even if they are missing from
  the cache.
- LibreOffice runs headless with a dedicated profile, retried 3x;
  close a running LibreOffice if conversion fails
- the wizard needs a real terminal — configure instead via `--init`,
  `OWIKI_VAULT_PATH`, or `--vault`

## Verification
- `WIKI/_Index.md` lists all notes; each note has `---` frontmatter
- rerun with no changes -> "Skip (unchanged)" everywhere
- malformed or unsupported source conversion -> other files continue, but
  the process exits non-zero and reports the failed file
- figures: assets/ PNGs + `![[...]]` embeds + `images:` frontmatter
- enrichment: summaries are factual (not first-line scrapes), tags
  reflect content (not filename words), figure captions describe what
  is visible (when the agent has image-viewing capability)
- translation: every note except `_Index.md` has `language: en` in
  frontmatter (`grep -L "^language: en" WIKI/*.md | grep -v _Index`
  returns nothing); translated notes carry `source-language:`; code
  blocks, paths, identifiers, and `![[...]]` embeds are untouched
- `<!-- caption-pending -->` markers: present only when the agent lacks
  image-viewing capability; absent after a run by an agent that has it
