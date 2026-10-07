# Project plan and decisions

The working plan for Calculus Tutor, kept in the repo so any session (or
person) can pick up where the last one stopped. `README.md` covers setup.

## Goal

Point a phone at a page of handwritten college calculus. The app marks each
incorrect step in red on the photo, explains it, and adds the fix to a
Corrections list. Correct work is never flagged. Target: a page with 3–5
problems graded in about 15 seconds.

## Decisions

| Topic | Decision |
| --- | --- |
| Audience | Personal use only. Never published to an app store. |
| Test device | Google Pixel 9 (Android). Code stays cross-platform, but only Android is tested unless that changes. |
| App | Expo SDK 57, React Native 0.86, TypeScript, Expo Router, development build (not Expo Go) |
| Capture | Native document scanner (`react-native-document-scanner-plugin`: VisionKit / ML Kit), system camera fallback, photo library |
| Overlays | `react-native-svg` (not Skia) |
| Storage | `expo-sqlite` only (its kv-store for settings); images in app storage, stored as relative paths |
| Math display | Server renders LaTeX to SVG with MathJax (`fontCache: 'none'`); app draws it with `react-native-svg` |
| Model | `claude-sonnet-5-5` by default, set by config. Structured outputs via `messages.parse` + Zod. Effort level is configurable and gets tuned in Phase 2. |
| Verification | Python SymPy service. The model emits SymPy-syntax check data (no LaTeX parsing). Results: `cas_verified`, `cas_disagrees` or `not_checkable`. |
| Backend | Node/TypeScript (Hono) + Python SymPy in one container. Runs on the dev computer first; deploy (Fly.io / Render / Cloud Run) only when the phone needs it away from home. |
| Abuse/cost control | Personal use: one shared secret between app and server, a server-side daily request cap, and a monthly spend limit in the Anthropic Console. No App Attest / Play Integrity, no accounts. |
| Priority | Accuracy over speed. Aim for 15 s and show live progress. Favor fewer, surer flags over catching every error. |
| Test pages | Local only (gitignored): `services/api/test/fixtures/pages/`. First set: graded Exam 1 (7 work pages rendered from the scanned PDF, instructor stamps painted out) with `answers-exam1.md` built from the correction sheet. Real Pixel 9 photos come next. Format: `answers.md`. |

## Architecture

```
Phone (Expo app)                          Backend (one container)
 scan/crop → JPEG, long edge ≤ 2048px ──▶ POST /v1/grade   (shared secret, daily cap)
 on-device line boxes (ML Kit OCR) ─────▶   blur check (sharp) → Claude vision, structured JSON
                                            → semantic validation, 1 retry → snap boxes to OCR lines
                                            → SymPy verification → LaTeX → SVG
 SQLite + images on device ◀──── SSE ────── progress events, then the final result
```

Images exist on the server only in memory for one request. They're never
written to disk or logged.

## Grading output schema

The spec's schema (in this order: problems → issues), plus these additions:

```jsonc
{
  "page_status": "ok | no_math_found | unreadable",   // added: drives error screens
  "problems": [{
    "id": "p1",
    "transcription": "LaTeX of the problem as read",
    "issues": [{
      "id": "p1i1",
      "transcription": "LaTeX of the flawed step",
      "status": "incorrect | unclear",
      "bbox": { "x": 0, "y": 0, "w": 0, "h": 0 },      // normalized 0–1 to the image
      "explanation": "short, student-friendly",
      "correction": "LaTeX of corrected step (incorrect only)",
      "concept": "chain rule",
      "later_steps_note": "Later steps follow correctly from this mistake.", // added, optional
      "verification": "cas_verified | cas_disagrees | not_checkable",       // added by server
      "bbox_source": "ocr | model"                                            // added by server
    }],
    "final_answer_correct": true
  }],
  "overall_summary": "2–3 sentence tutor-style summary"
}
```

Grading rules for the prompt:
- Check each step against the previous step, not just the final answer.
- Flag the first error in a chain only, and note that later steps follow from it.
- Never invent a correction. Illegible or ambiguous steps are `unclear` and trigger a retake prompt.
- The optional "current unit" setting only tailors explanations and flags mistakes that come from a prerequisite outside the unit.
- The model returns pixel boxes on the image it was sent. The server normalizes them.

UI rules:
- `unclear` steps get an amber dashed box with a "?" icon, never red.
- `unclear` steps aren't added to the Corrections list.
- Every mark carries an icon and a label, not just a color.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, navigation, capture, crop/rotate | Done (awaiting Pixel 9 test) |
| 2 | Backend + Claude call + schema validation, tested on sample images | Done |
| 3 | Red overlay with tap-for-explanation; app wired to backend | Done (tested on the Pixel 9a) |
| 4 | Corrections list with math rendering; SQLite history | Done |
| 5 | Unit selector, SymPy verification, box snapping (ink-based), error states, hosting the server | Done (hosting: Dockerfile ready, provider not chosen yet) |
| 6 | **Differential equations support** (once the app is almost complete), then device testing on the Pixel 9 and known limitations | |
| 7 | **Usage tracker + cost reduction** (requested 2026-10-06) | |
| 8 | **Step-by-step tutor:** work out a problem you select (requested 2026-10-06) | |

### To do near the end: differential equations (requested 2026-10-06)

Add once the core app is almost complete (start of Phase 6). The grader
already reads DE work in general, but it needs dedicated support:
- Prompt guidance for the common types: separable, first-order linear
  (integrating factor), exact, homogeneous, Bernoulli, second-order constant
  coefficient (characteristic equation, undetermined coefficients, variation
  of parameters), initial value problems, and slope fields/direction fields.
- Typical mistakes to look for: lost constant of integration, wrong
  integrating factor, dropped absolute value in ln|y|, wrong characteristic
  roots, applying initial conditions before finding the general solution.
- SymPy verification: `dsolve` / `checkodesol` to confirm a proposed solution
  satisfies the equation and initial conditions (builds on the Phase 5 checker).
- A "Differential Equations" option in the unit selector.
- DE test pages with an answer key (`answers-de.md`) and an eval run.

### Phase 7: usage tracker and cost reduction (requested 2026-10-06)

Usage tracker:
- The server already computes each request's tokens and cost
  (`meta.cost_usd`). Record every request (time, model, effort, tokens, cost,
  latency, retries, success/error) in a small server-side log or SQLite table.
  Never store images.
- A `/v1/usage` endpoint and a Usage section in Settings: pages and dollars
  today / this month / all time, average cost per page, most expensive pages.
- A monthly budget in `.env` (e.g. `MONTHLY_BUDGET_USD`): warn in the app near
  the limit and refuse new grades once it's hit. Keep the Anthropic Console
  spend limit as the hard backstop.

Cost reduction, measured with the eval before and after each change (accuracy
must not drop):
- Prompt caching for the fixed system prompt.
- Image size: test a 1568 px vs 2048 px long edge (fewer image tokens) on the
  exam set and Pixel photos.
- Effort: keep `high` as default but try `medium` for simple, short pages if
  the eval allows; re-check line accuracy, since lower effort boxed wrong lines
  in Phase 2.
- Don't regrade identical photos: hash the image and reuse the saved result.
- Trim output: shorter explanations and notation notes where it doesn't hurt.
- Run the `claude-api` skill's `cost-optimize` workflow for a ranked list.

### Phase 8: step-by-step tutor (requested 2026-10-06)

A "Show me how" button that works out a problem the student selects, like a
tutor at the board:
- Select a problem: tap its label on the results page, pick it from a list, or
  photograph/type a single equation.
- A new endpoint (e.g. `POST /v1/solve`) asks Claude for a full worked
  solution as structured steps: each step's math (LaTeX → SVG), a one-line
  "why", and the rule used, plus the final answer.
- App: steps revealed one at a time ("Next step") so the student can try each
  step first, with a "show all" option.
- Where the student already made a mistake, start from the problem and point
  out where their work went off track.
- Verify the final answer with SymPy where possible (Phase 5 checker), and
  count tutor requests in the usage tracker (Phase 7).

### Phase 5 notes (2026-10-06)

- **SymPy checker** (`services/cas/cas_worker.py`, driven by
  `services/api/src/cas.ts`): for each mistake the model also writes a
  `cas_check` in SymPy syntax (equivalent / derivative / antiderivative /
  definite_integral / limit / evaluate, or none). A long-lived Python worker
  confirms the fix is right and the student's version is wrong. Inputs pass an
  allow-list before `parse_expr`; each check has a 4 s timeout. Verdicts show
  in the app as "Checked by the math engine" or an amber "couldn't confirm".
  Exam 1 eval: 6 verified, 0 disagreements, 2 not checkable (graph reasoning,
  a missing line).
- **Box snapping** (`boxes.ts`): instead of OCR, each model box is snapped to
  the ink around it (background-subtracted dark pixels, row then column runs).
  A snapped box is used only if it still overlaps the model's box well; else
  the model's box stays. Eval: 8 of 8 boxes snapped.
- **Blur check:** pages scoring under `MIN_SHARPNESS` (default 15) are
  rejected before calling Claude. Calibration: sharp photos/scans score
  280-600, readable blur ~30, unreadable blur under ~6.
- **Unit selector** in Settings, stored with `expo-sqlite/kv-store`, sent with
  each page.
- **Errors:** client gives up after 120 s with a "taking too long" message and
  Try again.
- **Cost/latency:** the extra `cas_check` output raised p50 to ~15 s and p95
  to ~21 s, about 3.4¢ per exam page (5.4¢ for a dense photo). Phase 7 looks
  at trimming this.
- **Hosting:** `Dockerfile` at the repo root (Node + Python + SymPy) runs on
  any container host (Fly.io, Render, Cloud Run). Alternative with no cloud
  account: keep the server on the PC and reach it through Tailscale or a
  Cloudflare tunnel. Not tested locally (no Docker on this PC).

### Phase 4 notes (2026-10-06)

- Math notation: the server renders each step and fix to SVG with MathJax
  (`services/api/src/math.ts`); the app draws it with `react-native-svg`
  (`MathView`), shrinking wide expressions and falling back to text.
- Storage: `expo-sqlite` with numbered migrations (`features/history/db.ts`).
  `scans` holds the full GradeResult; `corrections` has one row per mistake
  plus a `reviewed` flag. Photos are copied to the document directory and
  stored as relative paths.
- Both native additions (svg, sqlite) needed an app rebuild. After an
  `expo prebuild`, restart Metro: the regenerated android/ folder can hang
  Metro's file watcher (the app then shows a white screen).

### Phase 3 notes (2026-10-06)

- No native rebuild needed: marks are plain views (not react-native-svg),
  uploads use `expo/fetch` plus `expo-file-system`, both already in the build.
- `expo/fetch` can't upload a React Native `FormData` file by URI ("Unsupported
  FormDataPart implementation"), so the app reads the photo's bytes and builds
  the multipart body itself (`features/grading/multipart.ts`).
- The model sometimes put inline LaTeX in explanations. Fixed in the prompt
  (prose fields are plain text; 0 of 42 fields leaked afterwards) and on the
  phone (`proseText` cleans any that slip through).
- Exam 1 eval after the prompt change: still 8/8 caught, 0 false flags.
- Dev setup: the phone reaches the server through `adb reverse tcp:8787`. Using
  the app away from the computer needs a deployed server (Phase 5/6).

### Phase 2 results (2026-10-06)

Exam 1 set: 6 scored pages, 8 real errors, 1 all-correct page. Scored by part,
then every flag was checked by hand against the line it marked.

| Effort | Precision | Recall | Flags on the right line | Typical / slowest | Cost per page |
| --- | --- | --- | --- | --- | --- |
| low | 89% | 100% | 6 of 8 (4b on a correct step; 7a false flag) | 7.7 / 12.5 s | 2.3¢ |
| medium | 100% | 100% | 7 of 8 (4b on a correct step) | 7.0 / 13.1 s | 2.4¢ |
| high | 100% | 100% | 8 of 8 | 11.7–13.1 / 15.9–17.0 s | 3.0¢ |

- **Default effort: high.** Lower effort finds the right problem but sometimes
  boxes a correct line, which is exactly the wrong-flag harm we want to avoid.
- **Pixel photos (7, no answer key):** checked by eye. Real errors caught with
  tight boxes; 14–34 s per page (dense pages run long); 3–6¢ each.
- **Guard added:** a "correction" identical to the flagged step is treated as
  invalid output and retried.
- **Known weakness:** a teacher's red-pen marks on already-graded pages can sway
  the grader, even with a prompt rule to ignore them.
- The eval scores by part, not by line. Check line accuracy in the annotated
  images (`services/api/out/eval/...`) before changing the prompt or effort.

### Phase 2 scope

- `packages/shared`: Zod schemas for the grading result above and the request, shared by app and server.
- `services/api` (Node/TS, Hono, `@anthropic-ai/sdk`):
  - `POST /v1/grade` takes the image plus an optional current unit, and requires the shared-secret header.
  - Model and effort come from env (`ANTHROPIC_MODEL`, default `claude-sonnet-5-5`).
  - Use `messages.parse` with `zodOutputFormat`.
  - A second Zod pass checks bbox ranges and the "correction required when incorrect" rule, with one retry.
  - Enable the API's server-side refusal fallback. Check the current parameter shape with the `claude-api` skill before writing it.
  - Blur check with sharp (variance of the Laplacian) before spending a model call.
  - Stream progress events over SSE.
  - Never log image data.
- CLI: `npm run grade -- <image>` prints the JSON, latency and token cost, and writes a PNG with the boxes drawn on it.
- Eval harness: run every page in `test/fixtures/pages/` and score the flags against `answers.md`. Report:
  - precision: flagged steps that really are wrong
  - recall: known errors that got flagged
  - false flags on correct problems
  - latency p50/p95 and cost per page

  Sweep effort `low` / `medium` / `high` and pick a default.
- Unit tests run against recorded model responses and need no network.

## Environment notes for cloud sessions

- Blocked by the network policy: `docs.expo.dev`, `api.expo.dev`, `dl.google.com` (Android SDK).
  - Use `EXPO_OFFLINE=1 npx expo install …`, which reads Expo's version table from the installed `expo` package.
  - Read API details from the installed packages' type definitions.
- Reachable: `api.anthropic.com`, the npm registry, Maven Central, Google Maven, Gradle.
- No Android SDK or emulator in the container, so device testing happens on the Pixel 9.
- `ANTHROPIC_API_KEY` is set in the cloud environment's settings, never in the repo.
