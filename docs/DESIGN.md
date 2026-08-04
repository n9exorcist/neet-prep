# Design System

Claude Code: read this before building or changing any UI. Every colour, type, and
spacing decision comes from here. If something isn't covered, ask rather than improvise.

---

## The idea

This product lives in the world of the Indian examination hall: the printed question
booklet, the OMR answer sheet, the blue-black pen, the graphite bubble. That world is
the design vocabulary — not the world of consumer edtech apps.

Polish comes from precision and material quality: exact alignment, considered type,
one well-made interaction. Not from gradients, glow, or decoration. A student sitting
this exam has three hours and one attempt. The interface should feel like a good
instrument, not a game.

---

## Colour

```
--paper        #EEF1F4   page background — pale, cool, answer-sheet stock
--paper-raised #F8FAFB   cards and raised surfaces
--ink          #131A24   primary text — the blue-black of an exam pen
--graphite     #5A6672   secondary text, labels, metadata
--rule         #D3DAE1   hairlines, borders, dividers
--mark         #D6006E   THE accent. Selection only. See below.
--correct      #1B7F5A
--incorrect    #C1272D
```

Dark mode: invert to `--ink` as background, `--paper` as text, keep `--mark` at
`#FF3D97` for contrast on dark.

**`--mark` is rationed.** It marks the student's current selection and nothing else.
Not headings, not links, not buttons, not icons. Its power comes from being the only
saturated thing on screen — the moment it appears everywhere, the interface stops
telling the student anything.

`--correct` and `--incorrect` appear only in review states, never during a live test.

---

## Type

IBM Plex, all three cuts. Load from Google Fonts with `display: swap`.

```
--font-ui      'IBM Plex Sans'    interface chrome, buttons, labels
--font-read    'IBM Plex Serif'   question text and options
--font-data    'IBM Plex Mono'    question numbers, timers, scores, chapter codes
```

Serif for question text is deliberate — it echoes the printed booklet, and it reads
better than sans for dense technical prose at length. It also sits well beside KaTeX,
which is serif by default.

Scale (rem):

```
display   2.75 / 1.1   700   Plex Sans, tight tracking
h1        2.00 / 1.2   600
h2        1.50 / 1.3   600
h3        1.25 / 1.4   600
body      1.0625/ 1.6  400   Plex Serif — never below 17px for question text
ui        0.9375/ 1.5  450   Plex Sans
label     0.8125/ 1.4  500   Plex Sans, uppercase, 0.08em tracking
data      1.0   / 1.0  500   Plex Mono, tabular figures
```

Always `font-variant-numeric: tabular-nums` on scores, timers, and counters so digits
don't jitter as they change.

---

## The signature: the bubble

Options are rendered as OMR bubbles, not checkboxes, not cards.

A 44px circle, 2px `--rule` border on `--paper-raised`, with the option letter in
Plex Mono at its centre. On selection it fills with `--mark` over 180ms with a slight
ease-out, letter reversing to white. That fill is the one piece of motion in the
product that gets to feel good, and it is the physical gesture of the exam.

Test progress renders as a horizontal strip of these bubbles — filled for answered,
outlined for unanswered, ringed for flagged. Same as the answer sheet in the student's
hand.

Under `prefers-reduced-motion: reduce`, the fill is instant. No exceptions.

---

## Layout

8px base unit. Spacing steps: 4, 8, 12, 16, 24, 32, 48, 64, 96.

Radii: 4px on cards and inputs, full round on bubbles. Nothing else is rounded.

Elevation: one level only — `0 1px 2px rgba(19,26,36,.06), 0 4px 12px rgba(19,26,36,.04)`.
Deeper shadows read as consumer app.

Max content width 720px for reading, 1120px for dashboards. Question text never
exceeds 68 characters per line.

---

## Responsive

Mobile is the primary target, not an adaptation. Many students will use a low-end
Android phone on an unreliable connection.

Breakpoints: 380 (base), 640, 1024. Design at 380 first.

- Touch targets minimum 44x44px, with 8px between them
- Question text stays at 17px on mobile — never shrink it to fit more on screen
- Figure images lazy-load with a fixed aspect-ratio placeholder so the layout never
  jumps once they arrive
- Everything must remain usable if images fail to load entirely — state that a figure
  failed rather than showing a broken frame
- No horizontal scroll at any width, except deliberately for wide figures

---

## Accessibility

Non-negotiable. Some of this is legally required; all of it is right.

**Contrast.** Body text uses `--ink` on `--paper` (about 14:1). `--graphite` on
`--paper` passes at 5.9:1 — fine for labels, never for body text. `--mark` is used
as a fill behind white text, not as text on light backgrounds.

**Keyboard.** The entire test is operable without a mouse: 1-4 or A-D select an
option, Enter advances, F flags for review, Shift+Tab moves back. Visible focus ring
on everything — 2px `--ink`, 2px offset. Never remove outlines.

**Never colour alone.** Correct and incorrect states carry an icon and a text label
as well as colour. Roughly 8% of the male students using this are colour blind.

**Figure alt text.** Every question image needs a description in the `questions`
table, written by a human. It must describe the diagram without revealing the answer —
"circuit with two resistors in parallel across a 6V cell", not "circuit where the
answer is 2 ohms". Add an `alt_text` column. If it's absent, the question is not
ready to ship.

**Live regions.** The exam timer updates in an `aria-live="off"` region polled on
demand, not announced every second — that would be unusable with a screen reader.
Announce only at 30, 10, and 5 minutes remaining.

**Semantics.** Options are a radio group with a proper `fieldset` and `legend`
carrying the question number. Not a list of buttons.

**Zoom.** Everything works at 200% browser zoom without loss of content or function.

**Motion.** Respect `prefers-reduced-motion` everywhere, not just the bubble.

---

## Not this

- Gradient heroes, glassmorphism, glow effects
- Mascots, celebratory confetti, streak flames
- Rounded blue cards on white
- Motivational copy about "crushing your goals"
- Anything that would look at home in a marketing screenshot

The student is not here to be entertained. They are here because a seat depends on it.
