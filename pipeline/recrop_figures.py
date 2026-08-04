#!/usr/bin/env python3
"""
Re-crop the question figures from the source PDFs.

The original crops were full-page-width horizontal bands. These papers are laid
out in two columns, so a band aimed at a diagram in the left column also captured
whatever sat beside it in the right: unrelated questions, the printed "Answer (3)"
line, and the coaching company's worked solution. Of 181 crops, 56 exposed an
answer key and 58 contained solution text.

This re-crops from page geometry instead of a model's guess, using the question
label to find the right column and stopping at the answer line:

    python pipeline/recrop_figures.py --dry-run     # report only
    python pipeline/recrop_figures.py               # rewrite the PNGs

No model calls - everything needed is already in the PDF. Existing crops are
overwritten in place, so figure_path stays valid and questions.jsonl is not
touched. Re-runnable: it always re-derives from the PDF.
"""

import argparse, json, re, sys
from pathlib import Path

import fitz  # pymupdf

DPI = 200
PAD = 6.0            # points of breathing room around the crop
MIN_HEIGHT = 40.0    # a crop shorter than this is a failed match, not a figure

# The line that gives the game away, and the solution prose we must not reproduce.
STOP_RE = re.compile(r"^\s*(Answer|Ans\b|Sol\b|Solution)", re.I)


def page_columns(page):
    """
    Column x-ranges, left to right. Uses the text blocks' own extents: if
    everything fits one side of the midline the page is single-column, otherwise
    it is split. Deliberately simple - these papers are cleanly typeset, and a
    wrong guess is caught by the verification pass rather than shipped.
    """
    r = page.rect
    mid = (r.x0 + r.x1) / 2
    blocks = [b for b in page.get_text("blocks") if b[4].strip()]
    left = [b for b in blocks if b[2] <= mid + 2]
    right = [b for b in blocks if b[0] >= mid - 2]

    if not left or not right:
        return [(r.x0, r.x1)]

    left_edge = min(b[0] for b in left)
    left_right = max(b[2] for b in left)
    right_left = min(b[0] for b in right)
    right_edge = max(b[2] for b in right)
    gutter = (left_right + right_left) / 2
    return [(left_edge - PAD, gutter - 1), (gutter + 1, right_edge + PAD)]


def label_re(number):
    """
    The papers mark questions three different ways: "1." (2015-2018),
    "1)" and "Question 1:" (2020-2025). Matching only the first form silently
    skipped two thirds of the bank.
    """
    return re.compile(rf"^\s*(?:Question\s+)?{number}\s*[.):]")


def text_lines(page):
    """
    (x0, y0, x1, y1, text) per rendered line.

    Lines, not blocks: pymupdf routinely merges the previous question's answer
    line and the next question's opening into a single block, so "… Silver 6. A
    set of 'n' equal resistors" never matches a label at block start. Lines split
    that correctly. Still not words - a bare number would collide with option
    labels like "(1)".
    """
    out = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            text = "".join(span["text"] for span in line.get("spans", []))
            if text.strip():
                x0, y0, x1, y1 = line["bbox"]
                out.append((x0, y0, x1, y1, text))
    return out


def find_label(page, number, columns, lines):
    """Locate the line that opens this question."""
    want = label_re(number)
    best = None
    for x0, y0, x1, y1, text in lines:
        if not want.match(text):
            continue
        column = next(
            ((cx0, cx1) for cx0, cx1 in columns if cx0 - PAD <= x0 <= cx1),
            columns[0],
        )
        if best is None or y0 < best[0]:
            best = (y0, x0, column)
    return best


def stop_below(lines, column, y_from, number):
    """First line that ends the question within a column, or None."""
    cx0, cx1 = column
    next_label = label_re(number + 1)
    best = None
    for lx0, ly0, lx1, ly1, text in lines:
        if ly0 <= y_from + 1:
            continue
        # Only the column we are cropping; the neighbour is what caused this bug.
        if not (lx0 >= cx0 - PAD and lx1 <= cx1 + PAD):
            continue
        if STOP_RE.match(text) or next_label.match(text):
            if best is None or ly0 < best:
                best = ly0
    return best


def column_start(page, lines, column):
    """
    Top of a column's real content, skipping the running head. Everything in the
    top 6% of the page is the paper's header or the publisher's logo, and it must
    not end up inside a question's figure.
    """
    cx0, cx1 = column
    r = page.rect
    floor = r.y0 + 0.06 * r.height
    tops = [ly0 for lx0, ly0, lx1, ly1, _ in lines if lx0 >= cx0 - PAD and lx1 <= cx1 + PAD and ly0 >= floor]
    return min(tops) - PAD if tops else floor


def crop_segments(doc, page, number):
    """
    Where the question actually lives, as one or two rectangles.

    A question that runs to the foot of its column continues elsewhere - and
    which "elsewhere" depends on the layout. In a two-column paper the text flows
    into the right-hand column of the SAME page; in a single-column one it goes
    over to the next page. 63 of 181 figures continue past their column, so
    cropping one page only was leaving a third of them incomplete: 2024 Q37 kept
    its question text and lost all four circuit diagrams to page 16.
    """
    columns = page_columns(page)
    lines = text_lines(page)
    found = find_label(page, number, columns, lines)
    if found is None:
        return None, "label not found"

    y_start, x_start, column = found
    col_index = columns.index(column) if column in columns else 0
    r = page.rect

    y_end = stop_below(lines, column, y_start, number)
    if y_end is not None:
        rect = fitz.Rect(column[0], max(r.y0, y_start - PAD), column[1], y_end - 2)
        if rect.height < MIN_HEIGHT:
            return None, f"crop too short ({rect.height:.0f}pt)"
        return [(page, rect)], None

    # No end found on this column: the question carries on.
    first = fitz.Rect(column[0], max(r.y0, y_start - PAD), column[1], r.y1)

    if len(columns) > 1 and col_index == 0:
        nxt_page, nxt_col, nxt_lines = page, columns[1], lines
    elif page.number + 1 < doc.page_count:
        nxt_page = doc[page.number + 1]
        nxt_lines = text_lines(nxt_page)
        nxt_col = page_columns(nxt_page)[0]
    else:
        return [(page, first)], None

    top = column_start(nxt_page, nxt_lines, nxt_col)
    end = stop_below(nxt_lines, nxt_col, top - 1, number)
    if end is None:
        end = nxt_page.rect.y1
    second = fitz.Rect(nxt_col[0], top, nxt_col[1], max(top + 1, end - 2))

    segments = [(page, first)]
    if second.height >= 12:
        segments.append((nxt_page, second))
    return segments, None


def render(segments):
    """
    One image from one or two rectangles, stacked in reading order.

    Composed through a scratch PDF page rather than an image library so the
    pipeline keeps its single dependency on pymupdf.
    """
    pixmaps = [p.get_pixmap(dpi=DPI, clip=rect) for p, rect in segments]
    if len(pixmaps) == 1:
        return pixmaps[0]

    gap = 12
    width = max(p.width for p in pixmaps)
    height = sum(p.height for p in pixmaps) + gap * (len(pixmaps) - 1)

    scratch = fitz.open()
    page = scratch.new_page(width=width, height=height)
    y = 0
    for pm in pixmaps:
        page.insert_image(fitz.Rect(0, y, pm.width, y + pm.height), pixmap=pm)
        y += pm.height + gap
    return page.get_pixmap(dpi=72)  # 1pt == 1px, so no resampling


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/extracted")
    ap.add_argument("--year", help="limit to one year")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    base = Path(args.out)
    years = sorted(d.name for d in base.iterdir() if d.is_dir())
    if args.year:
        years = [y for y in years if y == args.year]

    rewritten = skipped = stitched = 0
    failures = []

    for year in years:
        jl = base / year / "questions.jsonl"
        pdf = Path("data/raw") / f"NEET{year}.pdf"
        if not jl.exists() or not pdf.exists():
            continue
        doc = fitz.open(pdf)

        seen = set()
        for line in jl.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                q = json.loads(line)
            except json.JSONDecodeError:
                continue
            fig = q.get("figure_path")
            if not fig or fig in seen:
                continue
            seen.add(fig)

            page = doc[q["source_page"] - 1]
            segments, why = crop_segments(doc, page, int(q["number"]))
            if segments is None:
                failures.append(f"{year} q{q['number']:>3} p{q['source_page']:<3} {why}")
                skipped += 1
                continue

            if len(segments) > 1:
                stitched += 1
            if not args.dry_run:
                render(segments).save(base / year / fig)
            rewritten += 1

        print(f"{year}: {len(seen)} figures")

    print(f"\n{'would rewrite' if args.dry_run else 'rewrote'}: {rewritten} "
          f"({stitched} stitched across a column or page break)")
    print(f"left alone (kept the original crop): {skipped}")
    for f in failures:
        print(f"  {f}")
    if skipped:
        print("\nThese keep their old full-width crop and must be checked by hand "
              "in /admin/review - they may still show an answer key.")


if __name__ == "__main__":
    main()
