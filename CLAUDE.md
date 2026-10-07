# Project notes for Claude

Calculus Tutor: a personal Expo app (Pixel 9) that grades photographed
calculus work through a small grading server that calls Claude.

- Read `docs/PLAN.md` first: decisions, phase status, eval results.
- `README.md` has setup and commands; `app-diagram.svg` shows how it fits together.

## Rules

- Work in phases and stop at the end of each phase for the user to test.
- **At the end of every phase, update `app-diagram.svg`** to match the code
  (box styles: `built`, `next`, `planned`; the "Updated at the end of Phase N"
  line; key facts), then run `npm run diagram` to regenerate
  `app-diagram.png`. Check the PNG visually before committing.
- Also update the phase table in `README.md` and the status/results in
  `docs/PLAN.md`.
- Never commit `.env`, anything in `services/api/test/fixtures/pages/` except
  `answers.md`, or `services/api/out/`. Test pages contain personal info.
- Live grading (`npm run grade`, `npm run eval`) costs real API money: say the
  expected cost before running large sweeps.
- Run `npm run typecheck`, `npm run lint` and `npm test` before committing.
