#!/usr/bin/env python3
"""
NEET PYQ extractor - runs through `claude -p`, so it uses your Claude Max
subscription rather than paid API credits.

Requires: Claude Code installed and logged in (`claude --version` should work).
Do NOT set ANTHROPIC_API_KEY - that would switch billing to pay-as-you-go.

    pip install pymupdf
    python pipeline/extract_pyq.py data/raw/NEET2023.pdf --year 2023 --start 1 --end 3

Add --workers 3 to process three pages at once. That is roughly twice as fast in
wall-clock and does not change the total work, so it reaches your usage limit
sooner rather than costing more.

Output, under data/extracted/2023/:
    questions.jsonl     one JSON object per question
    pages/p012.png      full page renders
    figures/q045.png    cropped figure bands
    .done               pages already processed - safe to stop and resume

This draws on your subscription usage limits, so a long run will hit the 5-hour
window. That is fine: stop, wait, run the same command again. Pages already done
are skipped.
"""

import argparse, json, os, shutil, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz  # pymupdf

DPI = 200

NEXT_PAGE_NOTE = """Then read the FOLLOWING page image at: {img2}

The second image is CONTEXT ONLY. Questions here often run over the page break,
with the options or the "Answer:" line printed on the next page. Use the second
image to complete any such question. Do NOT extract questions that begin on the
second image - they belong to the next page's batch.
"""

SPEC = """You are extracting exam questions from an image of a NEET (Indian medical
entrance) past paper.

Read the image at: {img}

{next_note}
Return ONLY a JSON array. No prose, no explanation, no markdown fences.

Each element:
{{
  "number": 23,
  "subject": "physics",
  "chapter": "Gravitation",
  "topic": "Gravitational potential",
  "question": "...",
  "options": {{"a": "...", "b": "...", "c": "...", "d": "..."}},
  "answer": "a",
  "has_figure": false,
  "figure_span": null,
  "difficulty": "medium",
  "confidence": "high"
}}

Field rules:
- subject: physics | chemistry | botany | zoology | biology
- chapter: the NCERT chapter name, your best guess
- question: use LaTeX for all mathematics, wrapped in $...$
- answer: the key printed for that question, on either image, or null if not shown
- has_figure: true if the QUESTION needs a diagram, graph, circuit, or chemical
  structure to be answerable
- figure_span: if has_figure, [top, bottom] as fractions of the height of the
  FIRST image, covering the question generously, e.g. [0.31, 0.48]. Measure
  against the first image only, never the second. Otherwise null.
- difficulty: easy | medium | hard
- confidence: "low" if anything was unclear or the question is cut off

Other rules:
- Do NOT copy the printed worked solution. Question, options, and answer key only.
- If options are chemical structures or graphs rather than text, set has_figure true
  and put a short description as each option value, e.g. "structure (a)".
- If the page has no questions (cover, instructions, answer grid), return [].
"""


def find_claude():
    for name in ("claude", "claude.cmd", "claude.exe"):
        p = shutil.which(name)
        if p:
            return p
    sys.exit("claude not found on PATH. Run `claude --version` to check your install.")


def call_claude(claude_bin, img_path, next_img_path, page_no, retries=3):
    note = ""
    if next_img_path is not None:
        note = NEXT_PAGE_NOTE.format(img2=str(next_img_path).replace("\\", "/"))
    prompt = SPEC.format(img=str(img_path).replace("\\", "/"), next_note=note)
    for attempt in range(retries):
        try:
            r = subprocess.run(
                [claude_bin, "-p",
                 "--allowedTools", "Read",
                 "--output-format", "text"],
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                timeout=300,
            )
            out = (r.stdout or "").strip()
            if not out:
                raise RuntimeError((r.stderr or "empty output")[:300])
            if out.startswith("```"):
                out = out.split("\n", 1)[1].rsplit("```", 1)[0]
            start, end = out.find("["), out.rfind("]")
            if start == -1 or end == -1:
                raise json.JSONDecodeError("no JSON array found", out, 0)
            return json.loads(out[start:end + 1])
        except json.JSONDecodeError:
            print(f"  page {page_no}: unparseable output, retry {attempt + 1}", file=sys.stderr)
        except subprocess.TimeoutExpired:
            print(f"  page {page_no}: timed out, retry {attempt + 1}", file=sys.stderr)
        except Exception as e:
            wait = 30 * (attempt + 1)
            print(f"  page {page_no}: {e} - waiting {wait}s "
                  f"(if this is a rate limit, stop and re-run later)", file=sys.stderr)
            time.sleep(wait)
    print(f"  page {page_no}: GAVE UP - will be retried on the next run", file=sys.stderr)
    return None


def crop_band(page, span, out_path):
    try:
        top, bottom = float(span[0]), float(span[1])
    except (TypeError, ValueError, IndexError):
        return False
    top = max(0.0, min(1.0, top) - 0.02)
    bottom = min(1.0, max(0.0, bottom) + 0.02)
    if bottom <= top:
        return False
    r = page.rect
    clip = fitz.Rect(r.x0, r.y0 + top * r.height, r.x1, r.y0 + bottom * r.height)
    page.get_pixmap(dpi=DPI, clip=clip).save(out_path)
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--year", required=True)
    ap.add_argument("--out", default="data/extracted")
    ap.add_argument("--start", type=int, default=1)
    ap.add_argument("--end", type=int, default=0, help="0 = last page")
    ap.add_argument("--workers", type=int, default=1,
                    help="pages to process at once (default 1). Higher is faster "
                         "in wall-clock but reaches your usage limit sooner; the "
                         "total work is the same either way.")
    args = ap.parse_args()

    if os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit("ANTHROPIC_API_KEY is set - that bills you per token. "
                 "Unset it and open a fresh terminal so this runs on your subscription.")

    claude_bin = find_claude()
    base = Path(args.out) / args.year
    (base / "pages").mkdir(parents=True, exist_ok=True)
    (base / "figures").mkdir(parents=True, exist_ok=True)
    done_file = base / ".done"
    done = set(done_file.read_text().split()) if done_file.exists() else set()

    doc = fitz.open(args.pdf)
    last = args.end or doc.page_count
    print(f"{args.pdf}: {doc.page_count} pages, doing {args.start}-{last}")

    out_f = (base / "questions.jsonl").open("a", encoding="utf-8")
    kept = 0

    def page_png(page_no):
        """Render a page if we have not already. Main thread only - pymupdf
        page objects are not safe to touch from several threads at once."""
        p = base / "pages" / f"p{page_no:03d}.png"
        if not p.exists():
            doc[page_no - 1].get_pixmap(dpi=DPI).save(p)
        return p

    todo = [i + 1 for i in range(args.start - 1, min(last, doc.page_count))
            if str(i + 1) not in done]
    if not todo:
        print("  nothing to do - every requested page is already in .done")

    for page_no in todo:
        page_png(page_no)
        if page_no + 1 <= doc.page_count:
            page_png(page_no + 1)  # context for questions crossing the break

    def work(page_no):
        img = page_png(page_no).resolve()
        nxt = page_png(page_no + 1).resolve() if page_no + 1 <= doc.page_count else None
        return page_no, call_claude(claude_bin, img, nxt, page_no)

    pool = ThreadPoolExecutor(max_workers=args.workers)
    # map keeps results in page order; writing stays on the main thread so the
    # jsonl, the .done file and pymupdf are all touched by one thread only.
    for page_no, questions in pool.map(work, todo):
        page = doc[page_no - 1]
        if questions is None:
            continue  # left unmarked so a later run retries it

        for q in questions:
            if not isinstance(q, dict) or "number" not in q:
                continue
            q["year"] = int(args.year)
            q["source_page"] = page_no
            q["reviewed"] = False
            q["figure_path"] = None
            if q.get("has_figure") and q.get("figure_span"):
                name = f"q{int(q['number']):03d}_p{page_no:03d}.png"
                if crop_band(page, q["figure_span"], base / "figures" / name):
                    q["figure_path"] = f"figures/{name}"
            out_f.write(json.dumps(q, ensure_ascii=False) + "\n")
            kept += 1

        out_f.flush()
        with done_file.open("a") as d:
            d.write(f"{page_no}\n")
        print(f"  page {page_no}: {len(questions)} questions")

    pool.shutdown()
    out_f.close()
    print(f"\n{kept} questions added -> {base / 'questions.jsonl'}")

    rows = [json.loads(l) for l in (base / "questions.jsonl").open(encoding="utf-8")]
    if not rows:
        return
    nums = sorted(int(r["number"]) for r in rows)
    missing = [n for n in range(1, 181) if n not in set(nums)]
    print(f"  total={len(rows)}  "
          f"low_confidence={sum(1 for r in rows if r.get('confidence') == 'low')}  "
          f"with_figure={sum(1 for r in rows if r.get('figure_path'))}  "
          f"no_answer_key={sum(1 for r in rows if not r.get('answer'))}")
    print(f"  duplicate numbers: {len(nums) - len(set(nums))}")
    print(f"  missing of 1-180: {missing if len(missing) < 30 else str(len(missing)) + ' missing'}")


if __name__ == "__main__":
    main()