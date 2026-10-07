# Calculus Tutor

A React Native (Expo) app for iOS and Android. A student photographs a page of
college calculus work; the app marks mistakes in red on the photo and builds a
list of corrections, like a personal tutor. Correct work is left alone.

A personal project, not published to app stores. The test device is a
Google Pixel 9. The plan, decisions and phase details are in
[`docs/PLAN.md`](docs/PLAN.md).

**How it fits together:** [`app-diagram.png`](app-diagram.png) (source:
`app-diagram.svg`; regenerate with `npm run diagram`). It's updated at the end
of every phase.

![App diagram](app-diagram.png)

**Status: Phase 2 of 6.** The app captures, crops and rotates pages (Phase 1).
The grading server reads a page with Claude and returns the mistakes with
boxes, explanations and fixes (Phase 2). The app isn't connected to the
server yet (Phase 3).

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Scaffold, navigation, capture, crop/rotate | Done |
| 2 | Backend proxy, Claude vision call, JSON schema validation | Done |
| 3 | Red error overlay with tap-for-explanation | Next |
| 4 | Corrections list with math rendering, local history | |
| 5 | Unit selector, SymPy verification, OCR box snapping, error states | |
| 6 | On-device testing, known limitations | |

## Repository layout

```
apps/mobile/                Expo app (TypeScript, Expo Router)
  src/app/                  Screens. Every file here is a route.
    (tabs)/                 Scan, Corrections, History, Settings tabs
    scan/crop.tsx           Crop & rotate
    scan/review.tsx         Final image before grading
  src/features/capture/     Scanner/camera/library capture, crop geometry, image export
  src/components/           Shared UI (Button, EmptyState)
  src/theme/                Light/dark color tokens
  src/config.ts             Image size and quality settings
packages/shared/            Zod schemas for the grading result, shared by app and server
services/api/               Grading server (Node/TypeScript, Hono, Anthropic SDK)
  src/prompt.ts             Grading instructions for Claude
  src/grader.ts             Claude call, validation, one retry on invalid output
  src/app.ts                HTTP API: POST /v1/grade (JSON or streamed progress)
  scripts/grade.ts          Command-line grader that saves annotated copies
  scripts/eval.ts           Scores the grader against answer keys
  test/fixtures/pages/      Test pages and answer keys (local only, gitignored)
```

Phase 5 adds `services/cas` (Python SymPy checker).

## Prerequisites

- Node.js 20 or newer (developed on Node 22) and npm
- **iOS:** a Mac with Xcode to build locally, or an [Expo](https://expo.dev)
  account plus a paid Apple Developer account to build in the cloud with EAS
- **Android:** Android Studio (SDK + an emulator or a USB-debuggable phone) to
  build locally, or an Expo account to build with EAS

## Why a development build (not Expo Go)

The app uses one native module that isn't in Expo Go:
`react-native-document-scanner-plugin`. It wraps Apple's VisionKit scanner and
Google's ML Kit Document Scanner, which find the page edges, correct
perspective and clean up contrast. Everything else (camera, photo picker,
image manipulation, gestures) is a standard Expo module.

The app still runs in Expo Go for a quick look: "Scan a page" falls back to the
plain system camera, without edge detection.

## Setup

```sh
npm install                 # from the repo root (npm workspaces)
```

For Android, the placeholder app ID `com.example.calculustutor` is fine for
personal use. An iOS build needs a bundle identifier you own: change
`ios.bundleIdentifier` in `apps/mobile/app.json` first.

### iOS

**Local build (Mac with Xcode):**

```sh
cd apps/mobile
npx expo run:ios            # Simulator
npx expo run:ios --device   # plugged-in iPhone (pick your signing team in Xcode if asked)
```

The Simulator has no camera. Use "Choose from photos" there, and test
scanning on a real iPhone.

**Cloud build (EAS, no Mac needed):**

```sh
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest device:create                          # register your iPhone once
npx eas-cli@latest build --profile development --platform ios
```

Install the build from the link EAS gives you, then start the bundler with
`npm run mobile` from the repo root and open the app.

### Android

**Local build (Android Studio installed):**

1. Install [Android Studio](https://developer.android.com/studio). Its setup
   wizard installs the Android SDK, platform tools and a JDK.
2. Set these user environment variables, then **open a new terminal** (open
   ones don't see the change). On Windows with default install locations:
   - `JAVA_HOME` = `C:\Program Files\Android\Android Studio\jbr` (the Java that
     ships with Android Studio; fixes "JAVA_HOME is not set")
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk` (shown in Android Studio
     under Settings → Languages & Frameworks → Android SDK)
   - Add `%JAVA_HOME%\bin` and `%ANDROID_HOME%\platform-tools` to `Path`
3. On the phone (e.g. Pixel 9): Settings → About phone → tap **Build number**
   seven times. Then turn on Settings → System → Developer options → **USB
   debugging**.
4. Connect the phone by USB, accept the "Allow USB debugging?" prompt, and
   check that `adb devices` lists it.
5. Build, install and start the bundler:

```sh
cd apps/mobile
npx expo run:android --device   # USB-connected phone (first build takes 10–20 min)
npx expo run:android            # or an emulator
```

Later, when you've only changed JavaScript, run `npm run mobile` and open the
app on the phone. Rebuild only when native dependencies change.

**Cloud build (EAS):**

```sh
cd apps/mobile
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
```

Install the APK from the EAS link, then run `npm run mobile` from the repo root
and open the app.

The Android scanner runs inside Google Play services, so it needs a device or
emulator image with Play services. The first scan may download the scanner
module.

## Grading server

Copy `.env.example` to `.env` in the repo root and fill in `ANTHROPIC_API_KEY`
and `API_SHARED_SECRET`. `.env` is gitignored.

```sh
npm run api                                   # dev server on http://localhost:8787
npm run grade -- path/to/photo.jpg            # grade photos (or a folder) from the command line
npm run eval -- --set exam1 --efforts high    # score against answers-exam1.md
```

`grade` and `eval` save each result's JSON and an annotated copy of the page
(red boxes for mistakes, amber dashed for unreadable steps) under
`services/api/out/`. Every graded page costs real money: about 3–6¢ with
`claude-sonnet-5-5` at high effort.

**API:** `POST /v1/grade` with `Authorization: Bearer <API_SHARED_SECRET>` and a
multipart form: `image` (the photo) and optional `unit` (e.g. "Limits"). With
`Accept: text/event-stream` it streams progress events and then the result;
otherwise it returns the result as JSON. The shapes are in
`packages/shared/src/grade.ts`. Photos are processed in memory and never
saved or logged by the server.

## Checks

From the repo root:

```sh
npm run typecheck   # tsc
npm run lint        # ESLint (eslint-config-expo)
npm test            # Jest (app) and Vitest (server) unit tests; no API calls
```

## Phase 1 test checklist

1. **Scan:** Scan tab → "Scan a page". The native scanner opens (VisionKit on
   iOS, ML Kit on Android). Capture a page and you land on the crop screen.
2. **Crop:** drag the corner and edge handles, and drag inside the frame to
   move it. The frame can't leave the image or shrink below a minimum size.
3. **Rotate:** "Left" / "Right" rotate a quarter turn and the crop follows the
   page. "Reset" restores the full image.
4. **Export:** "Use this photo" opens "Ready to check", showing the cropped and
   rotated page and its pixel size (long edge at most 2048 px).
5. **Library:** "Choose from photos" goes through the same crop flow.
6. **Permission denied:** deny camera access and tap "Scan a page". You get an
   explanation with an "Open Settings" button.
7. **Dark mode:** switch the phone between light and dark mode. The app
   follows.

## Notes and known limitations (so far)

- **Native modules needing a development build:** `react-native-document-scanner-plugin`.
- Photos from the library get an axis-aligned crop and 90° rotation only. Perspective
  correction comes from the scanner, so use "Scan a page" for best results.
- The crop handles can't be operated with VoiceOver/TalkBack. The full image is
  used by default, and "Reset" restores it.
- **Grading speed:** about 9–17 s per exam page, and up to ~35 s for a dense
  photo with many problems. That's over the 15 s target on busy pages; the app
  shows live progress (Phase 3).
- **Already-graded pages:** a teacher's red-pen marks can sway the grader (it
  once read a red corrected answer as the student's). Real use is checking work
  before it's graded, so this rarely matters.
- The root `package.json` pins `react`/`react-dom` with `overrides`. Without it,
  npm hoists a second, newer React to the root for library peer dependencies,
  and two copies of React in one app break hooks at runtime.
