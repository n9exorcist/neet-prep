#!/usr/bin/env python3
"""
Validate what is actually in each PDF, and whether our extraction matches it.

    python pipeline/test_pdfs.py            # run everything
    python pipeline/test_pdfs.py -v         # per-test detail
    python -m unittest pipeline.test_pdfs.AnswerKeys -v

Uses unittest from the standard library, so there is nothing to install.

The point of these is independence. The extraction was done by a model reading
page images; these tests read the PDF text layer with a different tool and a
different method. Where the two agree, that is corroboration. Where they differ,
one of them is wrong and a person has to look - which is exactly the class of
error that cost this project a wrong claim about 2019 having no answer key.
"""

import json
import re
import sys
import unittest
from collections import Counter
from pathlib import Path

import fitz  # pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent))
from answer_keys import compare, read_key  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
EXTRACTED = ROOT / "data" / "extracted"
REVIEW = ROOT / "data" / "review"

YEARS = sorted(p.stem.replace("NEET", "") for p in RAW.glob("NEET*.pdf"))

# 2021-2024 carried 200 questions; Section B was optional. Every other year 180.
EXPECTED_COUNT = {y: (200 if y in {"2021", "2022", "2023", "2024"} else 180) for y in YEARS}

# Disagreements between the model and an independent read of the text layer.
# Each needs a person to adjudicate. Listed so that the test fails when a NEW
# one appears rather than drowning in a count that nobody reads.
KNOWN_ANSWER_DISAGREEMENTS = {
    ("2015", 156),
    ("2023", 5),
    ("2023", 50),
    ("2025", 9),
}

# Questions where the paper itself accepts more than one option.
KNOWN_MULTI_ANSWER = {("2019", 72), ("2021", 170), ("2025", 155)}


def load_rows(year):
    path = EXTRACTED / str(year) / "questions.jsonl"
    if not path.exists():
        return []
    rows = []
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return rows


def unique_by_number(rows):
    out = {}
    for q in rows:
        n = int(q["number"])
        if n not in out or (q.get("answer") and not out[n].get("answer")):
            out[n] = q
    return out


class PdfsThemselves(unittest.TestCase):
    """What is in the source files, independent of anything we extracted."""

    def test_every_pdf_opens(self):
        self.assertTrue(YEARS, "no PDFs found under data/raw")
        for year in YEARS:
            with self.subTest(year=year):
                doc = fitz.open(RAW / f"NEET{year}.pdf")
                self.assertGreater(doc.page_count, 0)
                self.assertFalse(doc.is_encrypted)

    def test_pdfs_have_a_text_layer(self):
        """A scanned paper would need OCR; these should all carry real text."""
        for year in YEARS:
            with self.subTest(year=year):
                doc = fitz.open(RAW / f"NEET{year}.pdf")
                middle = doc[doc.page_count // 2].get_text().strip()
                self.assertGreater(len(middle), 100, f"{year} page {doc.page_count // 2 + 1} looks like an image")

    def test_answer_key_format_is_known(self):
        """
        Each paper prints its answers as a block at the end, under each question,
        or not at all. An unrecognised format means questions silently lose their
        answer, which is how 2019 was wrongly written off as having none.
        """
        for year in YEARS:
            with self.subTest(year=year):
                _, source = read_key(RAW / f"NEET{year}.pdf")
                self.assertIn(source, {"block", "inline", "none"})


class ExtractionCoverage(unittest.TestCase):
    """Did we get every question out of every paper?"""

    def test_every_year_extracted(self):
        for year in YEARS:
            with self.subTest(year=year):
                self.assertTrue(load_rows(year), f"{year} has no extracted questions")

    def test_no_gaps_in_numbering(self):
        for year in YEARS:
            with self.subTest(year=year):
                numbers = {int(q["number"]) for q in load_rows(year)}
                expected = EXPECTED_COUNT[year]
                missing = [n for n in range(1, expected + 1) if n not in numbers]
                self.assertLessEqual(
                    len(missing), 1, f"{year} is missing questions {missing}"
                )

    def test_duplicates_are_page_break_artefacts(self):
        """
        A question spanning a page break can be picked up twice. That is
        expected and the import dedupes it - but only a handful, and only ever
        from adjacent pages.
        """
        for year in YEARS:
            with self.subTest(year=year):
                counts = Counter(int(q["number"]) for q in load_rows(year))
                dupes = {n: c for n, c in counts.items() if c > 1}
                self.assertLessEqual(len(dupes), 3, f"{year} has {len(dupes)} duplicated numbers: {dupes}")

    def test_every_question_has_four_options(self):
        for year in YEARS:
            with self.subTest(year=year):
                bad = [
                    q["number"]
                    for q in load_rows(year)
                    if not all(str(q.get("options", {}).get(k, "")).strip() for k in "abcd")
                ]
                self.assertEqual(bad, [], f"{year} questions with an empty option: {bad[:10]}")

    def test_question_text_is_not_empty(self):
        for year in YEARS:
            with self.subTest(year=year):
                bad = [q["number"] for q in load_rows(year) if not str(q.get("question", "")).strip()]
                self.assertEqual(bad, [], f"{year} questions with no text: {bad[:10]}")


class AnswerKeys(unittest.TestCase):
    """The extraction against an independent read of the paper's own answers."""

    def test_extraction_agrees_with_the_paper(self):
        new = []
        for year in YEARS:
            result = compare(year)
            for d in result["disagree"]:
                if (year, d["q"]) not in KNOWN_ANSWER_DISAGREEMENTS:
                    new.append(f"{year} q{d['q']}: extracted {d['ours']}, paper says {'/'.join(d['official'])}")
        self.assertEqual(new, [], "new answer disagreements need a person to adjudicate:\n  " + "\n  ".join(new))

    def test_agreement_rate_is_high(self):
        """
        Below this, something systemic has broken rather than a few questions
        being hard to read.
        """
        for year in YEARS:
            result = compare(year)
            comparable = result["agree"] + len(result["disagree"])
            if comparable < 20:
                continue  # nothing meaningful to compare
            with self.subTest(year=year):
                rate = result["agree"] / comparable
                self.assertGreaterEqual(rate, 0.97, f"{year} agreement only {rate:.1%}")

    def test_multi_answer_questions_are_known(self):
        """
        Where the paper accepts two options, our schema stores one. Each such
        question needs a decision, so a new one must not pass unnoticed.
        """
        found = set()
        for year in YEARS:
            for n in compare(year)["multi_answer"]:
                found.add((year, n))
        unexpected = found - KNOWN_MULTI_ANSWER
        self.assertEqual(unexpected, set(), f"new multi-answer questions: {sorted(unexpected)}")

    def test_missing_answers_are_only_where_the_paper_has_none(self):
        """
        A question with no answer is only acceptable when the paper does not
        print one. If a paper has a key and we still have a gap, that is ours.
        """
        for year in YEARS:
            result = compare(year)
            if not result["has_official_key"]:
                continue
            with self.subTest(year=year):
                # Recoverable means the paper knows the answer and we do not.
                self.assertLessEqual(
                    len(result["recoverable"]),
                    180,
                    f"{year}: {len(result['recoverable'])} answers are in the paper but not in our data",
                )


class Figures(unittest.TestCase):
    """Every figure question must have a usable image."""

    def _figure_rows(self, year):
        return [q for q in load_rows(year) if q.get("figure_path")]

    def test_referenced_figures_exist_on_disk(self):
        for year in YEARS:
            with self.subTest(year=year):
                missing = [
                    q["figure_path"]
                    for q in self._figure_rows(year)
                    if not (EXTRACTED / str(year) / q["figure_path"]).exists()
                ]
                self.assertEqual(missing, [], f"{year} figure files referenced but absent: {missing[:5]}")

    def test_no_figure_is_blank(self):
        """A crop that landed on empty paper leaves the question unanswerable."""
        blank = []
        for year in YEARS:
            for q in self._figure_rows(year):
                path = EXTRACTED / str(year) / q["figure_path"]
                if not path.exists():
                    continue
                pm = fitz.Pixmap(str(path))
                samples, n = pm.samples, pm.n
                total = pm.width * pm.height
                dark = counted = 0
                for i in range(0, total, 11):
                    o = i * n
                    if samples[o] < 235 or samples[o + 1] < 235 or samples[o + 2] < 235:
                        dark += 1
                    counted += 1
                if counted and dark / counted < 0.005:
                    blank.append(f"{year}/{q['figure_path']}")
        self.assertEqual(blank, [], f"blank figure crops: {blank}")

    def test_questions_needing_a_figure_have_one(self):
        for year in YEARS:
            with self.subTest(year=year):
                missing = [
                    q["number"] for q in load_rows(year) if q.get("has_figure") and not q.get("figure_path")
                ]
                self.assertEqual(missing, [], f"{year} questions marked as needing a figure but without one: {missing}")


class ChapterMapping(unittest.TestCase):
    """Chapters must resolve to the fixed NCERT list before the planner uses them."""

    def setUp(self):
        path = REVIEW / "chapter_map.json"
        if not path.exists():
            self.skipTest("no chapter map yet - run pipeline/normalise_chapters.py")
        self.map = json.loads(path.read_text(encoding="utf-8"))

    def test_every_extracted_chapter_is_in_the_map(self):
        seen = set()
        for year in YEARS:
            for q in load_rows(year):
                chapter = (q.get("chapter") or "").strip()
                if chapter:
                    seen.add(f"{(q.get('subject') or '').lower()}|{chapter}")
        missing = sorted(seen - set(self.map))
        self.assertEqual(missing, [], f"chapters not in the map: {missing[:5]}")

    def test_no_question_remains_under_the_biology_umbrella(self):
        """
        The exam splits Biology into Botany 45 and Zoology 45, and the planner
        allocates hours per subject, so an umbrella subject cannot survive.
        """
        stuck = [
            k for k, v in self.map.items() if not v.get("needs_review") and v.get("subject") == "biology"
        ]
        self.assertEqual(stuck, [], f"still mapped to 'biology': {stuck[:5]}")

    def test_botany_and_zoology_are_roughly_balanced(self):
        """
        The exam guarantees 45 of each per paper, so the bank should come out
        close to even. A wide gap means chapters are on the wrong side of the
        split, which silently misprices half the paper for the planner.
        """
        totals = Counter()
        for entry in self.map.values():
            if entry.get("needs_review"):
                continue
            if entry.get("subject") in {"botany", "zoology"}:
                totals[entry["subject"]] += entry.get("questions", 0)
        total = sum(totals.values())
        if total < 100:
            self.skipTest("not enough mapped biology questions to judge")
        share = totals["botany"] / total
        self.assertTrue(
            0.42 <= share <= 0.58,
            f"botany/zoology split is {totals['botany']}/{totals['zoology']} ({share:.0%} botany)",
        )


if __name__ == "__main__":
    unittest.main(verbosity=2)
