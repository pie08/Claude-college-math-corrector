# Answer key format (template)

Everything else in this folder is gitignored and stays on your computer:
page images, source PDFs and the real answer keys. This file only documents
the format; the eval doesn't read it.

Put page images in this folder (subfolders are fine) and describe them in an
`answers-<set>.md` file, e.g. `answers-exam1.md`. Run `npm run eval -- --set exam1`
to grade and score that set. The key only needs to say where the real
mistakes are; exact LaTeX isn't needed.

For each page, add a `### <image path relative to this folder>` heading, then
one line per entry, written `- <part>: <kind> ...`. The part is the problem
number as printed, including the question number (`2a`, `5`). The kind is one of:
- `correct`
- `wrong` at line N: <what's wrong> → <correct step> (N counts lines of work within that part, starting at 1)
- `incomplete`: something the question asks for is missing
- `notation`: a style point that isn't a math error (e.g. a dropped "lim")
- `excluded`: don't score this part (e.g. hand-drawn graphs)

A part can have more than one entry (e.g. `wrong` and `notation`). If a
mistake carries through later lines, list only the first wrong line. The eval
scores the grader by part: real errors it caught or missed, and flags on parts
marked correct.

## Example

### pictures/homework-01.jpg
- 1: correct (derivative of x² sin x)
- 2: wrong at line 2: forgot the + C → e^(x²) + C
- 3: wrong at line 1: treated sin(3x)/x as 1 → 3·sin(3x)/(3x) → 3; later lines follow from the mistake
- 3: notation: "lim" dropped on line 2
- 4: excluded (smudged on purpose)
