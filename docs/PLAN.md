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
| 2 | Backend + Claude call + schema validation, tested on sample images | Next |
| 3 | Red overlay with tap-for-explanation; app wired to backend | |
| 4 | Corrections list with math rendering; SQLite history | |
| 5 | Unit selector, SymPy verification, OCR box snapping, error states | |
| 6 | Device testing on the Pixel 9, known limitations | |

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
