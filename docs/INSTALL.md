# Installing the app on another phone (Android or iPhone)

## How the pieces connect

There is no shared database to connect to. Each phone keeps its own History
and Corrections in a small database on the phone itself (SQLite), and photos
stay on that phone. What every phone needs is a way to reach **the grading
server** on your computer, because that's where pages are sent to be checked:

```
phone app ──Tailscale (https)──▶ grading server on your PC ──▶ Claude
```

So a phone works when all three are true:

1. The app is installed (Android APK or an iPhone build, below).
2. The phone is on Tailscale and allowed to reach your PC (next section).
3. Your PC is on and `npm run api` is running (later: the Raspberry Pi).

The server address and the app secret are built into the app from
`apps/mobile/.env`, so there's nothing to type on the phone.

## 1. Give the other phone access to your server (Tailscale)

Pick one:

- **Share just the server (recommended for someone else's phone).** In the
  Tailscale admin console (login.tailscale.com → Machines), open `ty-laptop`
  → **Share…** and send the invite to their email. They install Tailscale on
  their phone, sign in with their own account and accept the invite. They can
  reach only that one machine, not your other devices.
- **Your own second phone or iPad:** install Tailscale and sign in with your
  own account. Nothing else to do.

Check it worked: on the phone, with Tailscale on, open
`https://ty-laptop.tail1578e0.ts.net/health` in the browser. It should show
`{"ok":true}`. If it doesn't load, the app won't be able to grade either.
(If a shared machine's https name doesn't resolve for them, inviting them to
your tailnet as a user is the fallback; restrict them to `ty-laptop` with an
access rule in the admin console.)

## 2a. Android phone

1. Build the APK on your PC (if you haven't since the last code change):
   `powershell -ExecutionPolicy Bypass -File scripts\build-android-release.ps1 -NoInstall`
2. Send them `dist\calculus-tutor.apk` (USB, Google Drive, etc.).
3. On their phone, open the file and allow "Install unknown apps" for the app
   they opened it from when Android asks. Play Protect may warn that it's an
   unknown app; choose **Install anyway**.
4. Open **Calculus Tutor** with Tailscale on.

## 2b. iPhone

Apple only lets apps onto an iPhone through a signed build, so this needs
either a Mac or a paid Apple Developer account. **Not tested yet:** the app
has only been run on Android, so expect to fix small things on the first iOS
build (the document scanner uses Apple's VisionKit on iOS).

First, in `apps/mobile/app.config.js`, change both iOS `bundleIdentifier`
values from `com.example.…` to something unique to you, e.g.
`com.tyrusberggren.calculustutor` and `com.tyrusberggren.calculustutor.app`.
Apple won't sign `com.example` IDs.

### Option A: a Mac with Xcode (free Apple ID works)

1. Install Xcode from the App Store, open it once, and sign in under
   Xcode → Settings → Accounts with your Apple ID.
2. Clone this repo on the Mac, run `npm install` at the root, and copy
   `apps/mobile/.env` over from your PC (it's not in git).
3. Plug in the iPhone, tap **Trust**, and turn on Settings → Privacy &
   Security → **Developer Mode** (the phone restarts).
4. Build and install the standalone version:
   ```sh
   cd apps/mobile
   export APP_VARIANT=production
   npx expo prebuild --clean --platform ios
   npx expo run:ios --device --configuration Release
   ```
   If Xcode asks for a signing team, pick your Apple ID ("Personal Team").
5. On the iPhone: Settings → General → VPN & Device Management → trust your
   Apple ID.

With a free Apple ID the app stops opening after **7 days**; plug in and run
step 4 again. With a paid account it lasts a year.

### Option B: from Windows with EAS (Expo's cloud build; needs a paid Apple Developer account, $99/year)

1. Create an Expo account at expo.dev, then from `apps/mobile`:
   ```sh
   npx eas-cli@latest login
   npx eas-cli@latest init
   ```
2. Give the cloud build the server address and secret (`.env` isn't uploaded):
   ```sh
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_URL --value https://ty-laptop.tail1578e0.ts.net --visibility plaintext
   npx eas-cli@latest env:create --environment preview --name EXPO_PUBLIC_API_SECRET --value <API_SHARED_SECRET from the root .env> --visibility sensitive
   ```
   Never put the secret in `eas.json`; it's committed and this repo is public.
3. Register the iPhone (each phone that should run it):
   `npx eas-cli@latest device:create`, then open the link it prints **on that
   iPhone** and install the profile it offers.
4. Build: `npx eas-cli@latest build --platform ios --profile standalone`.
   It asks for your Apple Developer login and handles certificates.
5. Open the install link from the finished build on the iPhone, install, then
   turn on Settings → Privacy & Security → **Developer Mode** if asked.

A phone added later needs step 3 and a new build (step 4) before it can
install the app.

## Before giving it to someone else

- **It's your API bill.** Every page they grade is charged to your Anthropic
  key (about 2.5¢ a page, 2¢ a solution). Their use shows up in Settings →
  Usage on every phone, mixed with yours.
- **Limits are shared.** `DAILY_REQUEST_LIMIT` (default 100 a day) counts
  everyone together. Set `MONTHLY_BUDGET_USD` in the root `.env` to cap
  spending, and keep a spend limit in the Anthropic Console.
- **Privacy:** their photos go to your server (in memory only, never saved)
  and to Claude. Tell them that.
- **Taking access away:** stop sharing `ty-laptop` in the Tailscale admin
  console. They can't reach the server without Tailscale, even with the app.
  Changing `API_SHARED_SECRET` also locks out every installed copy, including
  yours, until each app is rebuilt with the new secret.
