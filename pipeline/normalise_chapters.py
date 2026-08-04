#!/usr/bin/env python3
"""
Map extracted chapter names onto the fixed NCERT list.

The extractor guessed a chapter name per question, so the bank carries 158
distinct names for roughly 106 real chapters: spelling drift ("Cell: The Unit of
Life" / "Cell - The Unit of Life"), en-dash versus hyphen, and 31 names used
exactly once. Worse, 162 questions are tagged with the umbrella subject
"biology" instead of botany or zoology.

That is not tidiness. pyq_question_count per chapter feeds `ceiling`, which
feeds `marginal_return` - the planner's whole ranking. Split one chapter across
three spellings and its PYQ count is divided by three.

    python pipeline/normalise_chapters.py            # propose and write the map
    python pipeline/normalise_chapters.py --report   # show what it would do only

Writes data/review/chapter_map.json: {"subject|raw name": {...}}. Confident
matches are applied automatically; anything uncertain is written with
"needs_review": true and left for a human. The file is meant to be hand-edited -
it is data, not output.
"""

import argparse, json, re, sys, unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANON_FILE = ROOT / "data" / "reference" / "ncert-chapters.json"
MAP_FILE = ROOT / "data" / "review" / "chapter_map.json"
EXTRACTED = ROOT / "data" / "extracted"

# Below this, a fuzzy match is a guess rather than a spelling variant, and a
# guess that silently moves questions between chapters is worse than a gap.
AUTO_ACCEPT = 0.90


def fold(s):
    """Compare names ignoring punctuation, case, dashes and spacing."""
    s = unicodedata.normalize("NFKD", s)
    s = s.replace("–", "-").replace("—", "-").replace("’", "'")
    s = re.sub(r"[^a-z0-9]+", " ", s.lower())
    return re.sub(r"\s+", " ", s).strip()


def load_canon():
    raw = json.loads(CANON_FILE.read_text(encoding="utf-8"))
    out = []
    for subject, chapters in raw.items():
        if subject.startswith("_"):
            continue
        for c in chapters:
            out.append(
                {
                    "subject": subject,
                    "name": c["name"],
                    "ncert_class": c.get("ncert_class"),
                    "in_current_syllabus": c.get("in_current_syllabus", True),
                    "split_disputed": c.get("split_disputed", False),
                    "folded": fold(c["name"]),
                }
            )
    return out


def observed():
    """Every (subject, chapter) pair in the extracted bank, with counts."""
    seen = Counter()
    for jl in sorted(EXTRACTED.glob("*/questions.jsonl")):
        for line in jl.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                q = json.loads(line)
            except json.JSONDecodeError:
                continue
            chapter = (q.get("chapter") or "").strip()
            subject = (q.get("subject") or "").strip().lower()
            if chapter:
                seen[(subject, chapter)] += 1
    return seen


def candidates(subject, chapter, canon):
    """
    Score every canonical chapter. A question tagged "biology" is matched against
    botany AND zoology, which is exactly how the umbrella gets resolved: the
    chapter name decides the paper.
    """
    # Botany and zoology are searched together, not just "biology". The split is
    # what this tool exists to decide, so trusting the extractor's guess would
    # make it unfixable: a question tagged zoology whose chapter is Principles of
    # Inheritance and Variation could never find its chapter, and would match
    # "Digestion and Absorption" at 0.51 instead. The chapter name decides the
    # paper; the incoming subject tag is only a hint.
    if subject in ("biology", "botany", "zoology"):
        pool = [c for c in canon if c["subject"] in ("botany", "zoology")]
    elif subject in ("physics", "chemistry"):
        pool = [c for c in canon if c["subject"] == subject]
    else:
        pool = canon

    target = fold(chapter)
    scored = []
    for c in pool:
        if c["folded"] == target:
            score = 1.0
        else:
            score = SequenceMatcher(None, target, c["folded"]).ratio()
            # "The p-Block Elements (Group 14)" should still find its chapter.
            if c["folded"] in target or target in c["folded"]:
                score = max(score, 0.93)
        scored.append((score, c))
    scored.sort(key=lambda x: (-x[0], x[1]["name"]))
    return scored


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--report", action="store_true", help="do not write the map")
    args = ap.parse_args()

    canon = load_canon()
    seen = observed()
    if not seen:
        sys.exit("No extracted questions found - run the extraction pipeline first.")

    existing = {}
    if MAP_FILE.exists():
        existing = json.loads(MAP_FILE.read_text(encoding="utf-8"))

    mapping = {}
    auto = manual = kept = 0
    subject_moves = Counter()
    unresolved = []

    for (subject, chapter), count in sorted(seen.items(), key=lambda kv: -kv[1]):
        key = f"{subject}|{chapter}"

        # Never overwrite a human's decision.
        prior = existing.get(key)
        if prior and not prior.get("needs_review"):
            mapping[key] = prior
            kept += 1
            continue

        scored = candidates(subject, chapter, canon)
        best_score, best = scored[0] if scored else (0.0, None)
        runner_up = scored[1][0] if len(scored) > 1 else 0.0

        entry = {
            "questions": count,
            "chapter": best["name"] if best else None,
            "subject": best["subject"] if best else subject,
            "ncert_class": best["ncert_class"] if best else None,
            "confidence": round(best_score, 3),
        }

        # A confident match that two chapters tie for is not confident.
        ambiguous = best_score - runner_up < 0.02 and best_score < 1.0
        if best is None or best_score < AUTO_ACCEPT or ambiguous:
            entry["needs_review"] = True
            entry["alternatives"] = [
                {"subject": c["subject"], "chapter": c["name"], "score": round(s, 3)}
                for s, c in scored[:3]
            ]
            unresolved.append((subject, chapter, count, entry))
            manual += 1
        else:
            auto += 1
            if best["subject"] != subject:
                subject_moves[f"{subject} -> {best['subject']}"] += count
            if best["split_disputed"]:
                entry["split_disputed"] = True
            if not best["in_current_syllabus"]:
                entry["in_current_syllabus"] = False

        mapping[key] = entry

    total_q = sum(seen.values())
    print(f"distinct (subject, chapter) pairs: {len(seen)}")
    print(f"  matched automatically:  {auto}")
    print(f"  need a human decision:  {manual}")
    print(f"  kept from previous map: {kept}")
    print()

    if subject_moves:
        print("subject reassignments (questions):")
        for k, v in subject_moves.most_common():
            print(f"   {k}: {v}")
        print()

    dropped = sum(
        e["questions"] for e in mapping.values() if e.get("in_current_syllabus") is False
    )
    disputed = sum(e["questions"] for e in mapping.values() if e.get("split_disputed"))
    print(f"questions in chapters believed dropped from the syllabus: {dropped} of {total_q}")
    print(f"questions in chapters whose botany/zoology split is disputed: {disputed}")
    print()

    if unresolved:
        print(f"NEEDS A DECISION ({len(unresolved)}), most questions first:")
        for subject, chapter, count, entry in sorted(unresolved, key=lambda u: -u[2])[:25]:
            alts = ", ".join(
                f"{a['chapter']} [{a['subject']}] {a['score']}" for a in entry["alternatives"]
            )
            print(f"   {count:>4}q  {subject}/{chapter!r}")
            print(f"          -> {alts}")
        if len(unresolved) > 25:
            print(f"   ... and {len(unresolved) - 25} more")

    if args.report:
        print("\n--report: nothing written.")
        return

    MAP_FILE.parent.mkdir(parents=True, exist_ok=True)
    MAP_FILE.write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nwrote {MAP_FILE.relative_to(ROOT)}")
    print("Edit the needs_review entries by hand; re-running keeps whatever you settle.")


if __name__ == "__main__":
    main()
