# Deploy runbook — backend public URL + release APK

> **Goal:** the app works on cellular, off the dev box's LAN. One
> Railway-hosted Flask backend + one signed release APK installed on
> the phone.
>
> **Status:** scoped 2026-04-28; founder picks up when ready. Most of
> the steps require founder-side accounts (Railway, Google Cloud
> Console allowlist edits) so this is a runbook you paste into a
> terminal, not a one-shot Claude action.

---

## What needs to change (high level)

| Layer | Today | After deploy |
|---|---|---|
| Backend host | `python app.py` on dev box, port 5000 | Railway Flask app, public HTTPS URL |
| SQLite DB | `./life_dashboard.db` next to source | Railway volume `/data/life_dashboard.db` |
| Mobile API base | `http://10.0.0.22:5000` (LAN) | `https://<your-app>.up.railway.app` |
| APK | Debug APK (needs Metro at runtime) | Release APK (JS bundle baked in) |
| OAuth | Deep-links via `lifedashboard://` (already mobile-native) | Same — no backend-hosted callback needed |

**Plaid is the only connector with public-URL dependencies in v1**
and Plaid isn't wired yet, so we don't need the backend URL in any
OAuth allowlist for this round. Google / Strava / Microsoft all use
the deep-link mobile flow.

---

## Step 1 — Pick Railway (recommended) or Fly.io

**Railway pros:** dashboard-driven env vars, automatic GitHub-push
deploy, persistent volume for SQLite is one click, free tier handles
solo-founder traffic, no Dockerfile needed (uses our `nixpacks.toml`).

**Fly.io pros:** more configurable, lower latency in some regions,
better suited if we eventually shard. Steeper setup (flyctl,
fly.toml).

For v1 / personal-use / SQLite single-file persistence: **Railway.**
Migrate to Fly later if scale demands.

---

## Step 2 — Create the Railway project

1. Go to <https://railway.app> → log in (GitHub auth).
2. New Project → "Deploy from GitHub repo" → pick
   `nmusolff7-afk/life-dashboard`.
3. Railway will auto-detect `nixpacks.toml` + `Procfile` and start a
   build. The first deploy will likely fail (env vars missing) —
   that's expected; we set them next.

---

## Step 3 — Set env vars in Railway

Project → Variables → Raw Editor. Paste the block below, replacing
each empty value with your real key. Most are copies of what's in
your local `.env`:

```env
ANTHROPIC_API_KEY=
SECRET_KEY=
JWT_SECRET=
RECOVERY_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
DB_PATH=/data/life_dashboard.db
APP_URL=https://<your-railway-subdomain>.up.railway.app
CORS_ORIGINS=*
```

Notes:
- **`DB_PATH=/data/...`** points at the volume we mount in the next
  step. Do not skip — without it, Railway's ephemeral filesystem
  will reset the DB on every redeploy.
- **`APP_URL`** is used to build OAuth redirect URIs in the legacy
  web flow. Mobile uses deep links so this is mostly cosmetic for
  v1, but set it correctly anyway.
- **`CORS_ORIGINS=*`** is fine for personal use. Tighten before
  inviting other users.
- `SECRET_KEY` and `JWT_SECRET` should be unique random strings
  (32+ chars). Generate with `python -c "import secrets;
  print(secrets.token_urlsafe(32))"`.

---

## Step 4 — Add a persistent volume

Railway's filesystem is ephemeral — every redeploy wipes the disk.
SQLite needs a volume.

1. Project → New → Volume.
2. Mount path: `/data`.
3. Size: 1 GB (more than enough; bump later).
4. Attach to the Flask service.
5. Redeploy (Settings → Restart).

After redeploy, `health_daily` etc. will write to
`/data/life_dashboard.db` and survive restarts.

---

## Step 5 — Verify the backend boots

Railway → Deployments → latest → View logs. You want to see:

```
[INFO] Starting gunicorn 23.x.x
[INFO] Listening at: http://0.0.0.0:8080
[INFO] Booting worker with pid: ...
```

Then hit `https://<your-railway-subdomain>.up.railway.app/api/health`
in a browser. Should return JSON (login-protected route may 401 —
that's fine, just confirms Flask is up).

---

## Step 6 — Flip mobile/.env API base

In `mobile/.env`, change:

```env
EXPO_PUBLIC_API_BASE_URL=http://10.0.0.22:5000
```

to:

```env
EXPO_PUBLIC_API_BASE_URL=https://<your-railway-subdomain>.up.railway.app
```

> **Keep the LAN URL noted somewhere** — switching back during dev
> sessions for hot-reload speed is the obvious workflow.

---

## Step 7 — Build a release APK

Release APKs bake the JS bundle in, so the app boots without Metro
on the dev box. The release build still uses the debug keystore for
signing (good enough for side-load installs; a real keystore is only
needed for Play Store).

```powershell
cd C:\Users\nmuso\Documents\life-dashboard\mobile
npx expo prebuild --platform android --clean
cd android
# JAVA_HOME + ANDROID_HOME already set from prior builds
.\gradlew.bat :app:assembleRelease
adb install -r .\app\build\outputs\apk\release\app-release.apk
```

First release build: ~10-15 min (R8 minification). Subsequent
release builds with the Gradle cache warm: ~5-7 min.

**Why release vs debug:** debug APK at runtime fetches the JS bundle
from `http://localhost:8081` (Metro). When the phone leaves the LAN,
Metro is unreachable and the app stays on the splash screen. Release
APK has the bundle in `assets/index.android.bundle` — no Metro
dependency.

---

## Step 8 — Verify cellular runs

- Disconnect the phone from your dev-box's wifi.
- Switch to cellular only.
- Open Life Dashboard.
- Login / open Today tab — the app should load + show data.
- Tap any "Sync now" — connector should hit Railway, return data.

If it works, you're done. If anything 401s or 503s, check Railway
logs — usually a missing env var or volume not yet mounted.

---

## Future / not-now

These were intentionally left out of v1 deploy because they require
more setup than the marginal value justifies right now:

- **Real release keystore.** `keytool -genkey -v -keystore
  release.keystore...`. Needed before Play Store submission. Not
  needed for personal side-load.
- **EAS Update channel** for over-the-air JS updates. Means JS-only
  edits don't require a new APK install. Set up `eas update:configure`
  + push channel set in `eas.json`. ~30 min once we want to iterate
  faster post-deploy.
- **HTTPS for the LAN URL.** Right now `mobile/.env`'s LAN URL is
  HTTP, and Android clear-text traffic is allowed for `10.0.0.0/8`
  via the network security config. Once we flip to HTTPS Railway,
  we may want to lock this down. Check
  `mobile/android/app/src/main/res/xml/network_security_config.xml`
  if any traffic 401s with cleartext errors.
- **Sentry / crash reporting.** Out of scope per Icebox. Add when
  user count > 10.
- **Plaid Developer Portal setup.** Founder is handling separately;
  Plaid env vars + webhook URL plug into Railway when ready.

---

## Rollback plan

Local development keeps working unchanged:

1. Revert `mobile/.env` `EXPO_PUBLIC_API_BASE_URL` to the LAN URL.
2. `npx expo start` for Metro + debug APK install.

The Railway backend stays up regardless — both backends can coexist.
The LAN backend reads/writes a different SQLite file, so no data
clash.
