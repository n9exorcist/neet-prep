#!/usr/bin/env python3
"""
Read the official answer key out of a paper, where the paper prints one.

Some of these PDFs carry a key as a block at the end - "CODE: P1 - Answer Key:
1. (3)  2. (3) ..." - which is ground truth: it is the examiner's own answer,
not something a model read off a page. Where it exists it should be trusted over
anything the extractor produced, and it can be used to check the extractor's work.

    python pipeline/answer_keys.py            # report every paper
    python pipeline/answer_keys.py --year 2019

Options are printed as (1)-(4) and stored as a-d.
"""

import argparse, json, re, sys
from pathlib import Path

import fitz  # pymupdf

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EXTRACTED = ROOT / "data" / "extracted"

NUMBER_TO_LETTER = {"1": "a", "2": "b", "3": "c", "4": "d"}

# "Answer Key", "Answer Key:", "ANSWER KEY" - but not the per-question
# "Answer: (b)" that other papers use, which is handled by the extractor itself.
KEY_HEADING = re.compile(r"answer\s*key", re.I)

# "12. (3)" and the occasional "72. (1,2)" where two options were accepted.
KEY_ENTRY = re.compile(r"(\d{1,3})\s*[.)]\s*\(([1-4](?:\s*,\s*[1-4])*)\)")


# A question's own answer line: "Answer: (b)", "Answer Key: (2)", "Ans. (3)".
INLINE_ANSWER = re.compile(r"Ans(?:wer)?(?:\s*Key)?\s*[:.]?\s*\(?\s*([1-4a-dA-D])\s*\)?")

# The start of a question in the body text.
QUESTION_START = re.compile(r"(?m)^\s*(?:Question\s+)?(\d{1,3})\s*[.):]")

# A block key is a run of "N. (x)" entries. Requiring a good number of them
# stops a paper that merely prints "Answer Key: (2)" under each question from
# being mistaken for one - 2015 does exactly that, and matching loosely there
# invented two disagreements out of unrelated numbers.
MIN_BLOCK_ENTRIES = 30


def find_key_page(doc):
    """Page index of the answer key block, or None."""
    for i in range(doc.page_count):
        if KEY_HEADING.search(doc[i].get_text()):
            return i
    return None


def read_block_key(doc):
    """The end-of-paper key, as {number: [letters]}. Empty if there isn't one."""
    start = find_key_page(doc)
    if start is None:
        return {}

    text = "".join(doc[i].get_text() for i in range(start, doc.page_count))
    text = text[KEY_HEADING.search(text).start() :]

    entries = KEY_ENTRY.findall(text)
    if len(entries) < MIN_BLOCK_ENTRIES:
        return {}

    key = {}
    for number, options in entries:
        letters = [NUMBER_TO_LETTER[o] for o in re.findall(r"[1-4]", options)]
        # Later duplicates repeat the key for another paper code; keep the first,
        # which belongs to the code this PDF actually contains.
        key.setdefault(int(number), letters)
    return key


def read_inline_key(doc):
    """
    Answers printed beneath each question, as {number: [letters]}.

    Independent of the extractor: this reads the PDF's text layer directly, so
    where both produce an answer, agreement is real corroboration rather than
    the same guess counted twice.
    """
    text = "".join(doc[i].get_text() for i in range(doc.page_count))

    starts = [(int(m.group(1)), m.start()) for m in QUESTION_START.finditer(text)]
    key = {}
    for i, (number, pos) in enumerate(starts):
        end = starts[i + 1][1] if i + 1 < len(starts) else len(text)
        segment = text[pos:end]
        found = INLINE_ANSWER.search(segment)
        if not found:
            continue
        raw = found.group(1).lower()
        letter = NUMBER_TO_LETTER.get(raw, raw)
        if letter in "abcd":
            key.setdefault(number, [letter])
    return key


def read_key(pdf_path):
    """
    {question_number: [letters]} from the paper itself, and how it was found.

    A question with more than one letter had more than one option accepted. That
    is real - NEET does it - and the caller has to decide what to do about it
    rather than have this quietly pick the first.
    """
    doc = fitz.open(pdf_path)
    block = read_block_key(doc)
    if block:
        return block, "block"
    inline = read_inline_key(doc)
    return (inline, "inline") if inline else ({}, "none")


def extracted_answers(year):
    """{question_number: letter or None} from our own extraction."""
    path = EXTRACTED / str(year) / "questions.jsonl"
    out = {}
    if not path.exists():
        return out
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                q = json.loads(line)
            except json.JSONDecodeError:
                continue
            n = int(q["number"])
            # Prefer a row that actually has an answer over a page-break duplicate.
            if n not in out or (q.get("answer") and not out[n]):
                out[n] = q.get("answer")
    return out


def compare(year):
    """How our extraction stands against the paper's own key."""
    pdf = RAW / f"NEET{year}.pdf"
    key, source = read_key(pdf)
    ours = extracted_answers(year)

    result = {
        "year": year,
        "key_source": source,
        "has_official_key": bool(key),
        "key_entries": len(key),
        "extracted": len(ours),
        "we_have_an_answer": sum(1 for v in ours.values() if v),
        "agree": 0,
        "disagree": [],
        "recoverable": [],
        "multi_answer": sorted(n for n, v in key.items() if len(v) > 1),
    }
    for n, letters in key.items():
        mine = ours.get(n)
        if not mine:
            result["recoverable"].append(n)
        elif mine in letters:
            result["agree"] += 1
        else:
            result["disagree"].append({"q": n, "ours": mine, "official": letters})
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--year")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    args = ap.parse_args()

    years = [args.year] if args.year else sorted(p.stem.replace("NEET", "") for p in RAW.glob("NEET*.pdf"))
    results = [compare(y) for y in years]

    if args.json:
        print(json.dumps(results, indent=2))
        return

    print(f"{'year':6} {'key':>7} {'entries':>8} {'ours':>6} {'agree':>6} {'differ':>7} {'recoverable':>12}")
    print("-" * 62)
    for r in results:
        print(
            f"{r['year']:6} {r['key_source']:>7} "
            f"{(str(r['key_entries']) if r['has_official_key'] else '-'):>8} "
            f"{r['we_have_an_answer']:>6} {r['agree']:>6} {len(r['disagree']):>7} {len(r['recoverable']):>12}"
        )

    for r in results:
        if r["disagree"]:
            print(f"\n{r['year']} disagreements - the official key wins:")
            for d in r["disagree"][:20]:
                print(f"   q{d['q']}: we have {d['ours']}, key says {'/'.join(d['official'])}")
        if r["multi_answer"]:
            print(f"\n{r['year']} more than one option accepted: {r['multi_answer']}")


if __name__ == "__main__":
    sys.exit(main())
