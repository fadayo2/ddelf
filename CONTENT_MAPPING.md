# delfA2 — Source mapping and fidelity report

**Primary source:** `delfa2exam.pdf` (20 pages), plus the three user-provided MP3 recordings. No substitute questions, audio, or answer keys were invented.

## PDF components

| PDF pages | Source | Import |
| --- | --- | --- |
| 1 | Overview and official section durations | Three collective sections, 25 + 30 + 45 minutes |
| 2–3 | Listening candidate sheet | Listening exercises 1–3 (3 + 4 + 6 = **13** questions; 5 + 8 + 12 = 25 points) |
| 4–7 | Reading candidate sheets | Reading exercises 1–4 (5 + 6 + 7 + 4 = **22** questions; 5 + 6 + 9 + 5 = 25 points) |
| 8–9 | Writing candidate prompts | Two writing tasks, 60–80 words each (13 and 12 points) |
| 10 | Speaking candidate sheet | **Excluded** |
| 11–14 | Official answer key | 35 listening/reading answers kept ONLY in `supabase/seed.sql` and the database's `private.answer_keys` table |
| 15 | Writing rubric | Exact per-task rubric maxima reproduced in 12 database criteria |
| 16–18 | Speaking examiner materials | **Excluded** |
| 19–20 | Original listening transcripts / administration instructions | Checks audio exercise pairing; 30 s reading, two plays, 30 s between and after |

## Audio pairing

| Original upload | Correct exercise | Duration measured with ffprobe |
| --- | --- | --- |
| audio-1-comprehension-orale-3.mp3 | Listening E1 — Théâtre Molière | 61.231 s |
| audio-2-comprehension-orale-3.mp3 | Listening E2 — France Info petrol prices | 22.857 s |
| audio-3-comprehension-orale-3.mp3 | Listening E3 — Monsieur Leblanc's washing-machine order | 51.931 s |

Files were copied **without modification** to `public/assets/audio/exercice-[1-3].mp3`. The Supabase bucket contains the same originals after upload. Premium uses two plays per audio and explicit 30-second reading/answer intervals. Standard has unlimited replays. The uploaded MP3 files are the underlying short recordings, not one complete 25-minute supervised cassette with built-in long pauses.

## Question and assessment details

- Listening E1: theatre keypad, weekend show times, lowest ticket price — 5 points.
- Listening E2: broadcast type, picture-based topic selection (original picture crop), super petrol price and diesel price — 8 points.
- Listening E3: six three-way statements — 12 points.
- Reading E1: matching five statements to eight original signs; the image was cropped from candidate page 4, including distractors — 5 points.
- Reading E2: six headlines matched to six rubric categories — 6 points.
- Reading E3: article on Visan, two multiple-choice questions and five vrai/faux questions with source justifications — 9 points.
- Reading E4: Aventure Globale promotional email, three selection/short questions and a justified vrai/faux — 5 points.
- Writing E1: Paris diary, 60–80 words, 13 points. Rubric 1 + 4 + 2 + 2 + 2.5 + 1.5.
- Writing E2: reply to Philippe declining an invitation, 60–80 words, 12 points. Rubric 1 + 1 + 4 + 2 + 2.5 + 1.5.

**Important limitation:** Automatic quote checking intentionally accepts only clearly matching answer-key passages; other valid quotations are flagged for teacher review rather than guessed correct. Written-production assessment uses conservative, transparent rules (task keywords, word count, connectors and a few safe grammatical corrections) and **cannot judge open-ended French writing as reliably as a human examiner**. All writing grades are labeled practice estimates and can be corrected by authorized teachers.

## Unresolved source ambiguity

No entire listening/reading question or answer key was missing in the supplied paper. Picture-only items have original images preserved, and the app adds accessible interface labels such as "Illustration 1" without replacing the image choices. Sentence spacing and paragraph line wrapping were adapted for a responsive display. The image references and the core question/answer wording were retained as accurately as possible.

**Out of scope:** Speaking exam, official DELF final pass/fail determination, official certificate, payments or subscriptions. Premium denotes **simulation mode**, not a paid subscription system.


## Original candidate-paper images (expanded viewer)

- Listening Ex. 2, question 2: three illustrated choices from page 3: `assets/img/listening-pictures.png`.
- Reading Ex. 1: all eight signs (A–H), from page 4: `assets/img/reading-signs.png`.
- Reading Ex. 4: original Aventure Globale email screenshot from page 7: `assets/img/reading-email.png`.
- Writing Ex. 1: four Paris reference illustrations from page 8: `assets/img/writing-paris.png`.
- Writing Ex. 2: Philippe's letter from page 9: `assets/img/writing-letter.png`.

Images were cropped strictly from the candidate-paper pages (never correction pages). The source text is available via an optional text disclosure for accessibility when the image also contains the full text. The reader has an optional fullscreen viewer with zoom, fit and Escape to close. Each writing textarea has an interactive French accent keyboard; insertion dispatches an input event and therefore uses existing autosave and word counting.
