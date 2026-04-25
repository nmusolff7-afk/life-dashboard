# Connector handoff — what code is ready, what founder inputs are pending

Generated at end of Phase C1. Snapshots which integrations are scaffolded
and exactly what external action each needs to go live. Companion to
[BUILD_PLAN_v2.md](BUILD_PLAN_v2.md) Section 3 (Track C).

After B1 + C1, the app has:

- A canonical `users_connectors` table + 10-provider catalog
- A persistent `oauth_states` table with CSRF + PKCE + TTL
- A generic webhook receiver that dedupes by `(provider, event_id)`
- `http_utils.with_retry` exponential-backoff helper
- `api_errors.err()` canonical error-code contract
- `user_ai_consent` table + chatbot consent filter
- HealthKit / Health Connect sample ingestion at `POST /api/health/samples`
- Mobile `ConnectorTile` component + `useConnectors` / `useConsent` hooks
- Settings → Connections and Settings → Privacy rewired to backend

Everything below is waiting on external input. File them in the order shown.

---

## 1. Apple Developer Program — **$99/year**

**Blocks:** HealthKit production entitlement, APNs for push notifications, App Store distribution.

**Action:**
1. Enroll at https://developer.apple.com/programs/enroll (~24h approval).
2. Add HealthKit capability to the app's entitlements file (Xcode: Signing & Capabilities → + Capability → HealthKit).
3. Add APNs capability (same screen → Push Notifications).

**What's code-ready:**
- Settings → Connections HealthKit tile wired (native-module flow still stubbed; needs `react-native-health` or `expo-health` added to `mobile/package.json` then a prebuild).
- `POST /api/health/samples` accepts batches of `{ sample_type, value, unit, effective_start, source_sample_id?, metadata? }` with dedupe + bounds-check. Valid sample_types: `sleep_hours`, `steps`, `heart_rate_bpm`, `hrv_ms`, `resting_hr`, `active_energy_kcal`, `weight_lbs`, `workout_minutes`.
- `mark_connector_connected('healthkit'|'health_connect')` route + mobile helper for device-native providers.

**What remains after founder enrolls:**
- Add `react-native-health` (iOS) and `react-native-health-connect` (Android) to mobile package.json.
- `expo prebuild` to regenerate native projects.
- Implement a `useHealthSampler` hook that reads samples via the native module and POSTs to `/api/health/samples`.

---

## 2. Google Cloud Console — **OAuth consent + client setup**

**Blocks:** Gmail AND Google Calendar (they share the same OAuth app).

**Action:**
1. Create a project at https://console.cloud.google.com.
2. OAuth consent screen → external → list the scopes we need:
   - `https://www.googleapis.com/auth/gmail.readonly` (restricted — may trigger Google security review, **4–8 weeks** if it does)
   - `https://www.googleapis.com/auth/calendar.readonly`
3. Credentials → Create OAuth 2.0 Client → Application type: iOS + Android + Web (web for redirect URL).
4. Add redirect URI: `<backend-base>/api/gmail/callback` (and gcal's equivalent when that module ships).
5. Copy `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` into the backend's `.env` / Railway env.
6. While in verification-pending: app is "testing" mode, max 100 test users. Fine for beta.

**What's code-ready:**
- `gmail_sync.py` (281 lines) — OAuth exchange, token refresh, email fetch, AI summarization. 7 routes: connect, callback, sync, disconnect, status, debug, label.
- Token storage: legacy `gmail_tokens` table still in use; B1 backfill mirrors to `users_connectors`. A follow-up cycle migrates gmail_sync.py off the legacy table.
- Consent filter in chatbot gates Gmail/Outlook/GCal data behind `user_ai_consent`.

**What remains:**
- Mobile Gmail connect button — currently stubbed in `mobile/app/(onboarding)/connections.tsx`. Needs `expo-auth-session` wired to `GET /api/gmail/connect`'s returned URL.
- `gcal_sync.py` module + `/api/gcal/*` routes (not shipped in C1 — deliberately deferred as speculative code until OAuth creds unlock end-to-end testing).

---

## 3. Plaid — **Production approval, 2–4 weeks**

**Blocks:** Finance tab's bank-connection path. Manual Finance entry works today without this.

**Action:**
1. Sign up at https://dashboard.plaid.com.
2. Request production access. Need:
   - Business entity (LLC / Inc) — required.
   - Use-case writeup: "personal finance tracking, read-only, no money movement."
   - Consumer privacy policy URL (public).
   - Expected MAU.
3. Copy `PLAID_CLIENT_ID`, `PLAID_SECRET`, and `PLAID_ENV` (`sandbox` → `production`) into env.
4. Configure webhook URL: `<backend-base>/api/webhooks/plaid`.

**What's code-ready:**
- `finance_transactions` / `finance_accounts` / `finance_bills` tables have a `source` column and Plaid-compatible shape (amount sign convention matches Plaid).
- Manual Finance entry works today; Plaid data will INSERT into the same tables with `source='plaid'`.
- Generic webhook receiver at `/api/webhooks/plaid` dedupes and logs; real signature verification + dispatch ship when the mobile Link SDK is wired.

**What remains:**
- `plaid_sync.py` module (exchange public_token → access_token, list accounts, sync transactions).
- Mobile `react-native-plaid-link-sdk` integration.
- Plaid HMAC signature verification in the webhook handler (deferred to keep untested code out of the tree).

---

## 4. Strava — **API app approval, 1–2 weeks**

**Action:**
1. Register at https://www.strava.com/settings/api.
2. Fill the form; describe the app.
3. Copy `STRAVA_CLIENT_ID` + `STRAVA_SECRET` into env.
4. Configure webhook URL when subscribing.

**What's code-ready:**
- Nothing yet. Deliberately deferred per founder direction ("stop exactly where credentials... is required"). When creds arrive, `strava_sync.py` mirrors the shape of `gmail_sync.py` + uses `connectors.save_connector` / `get_valid_access_token`.

---

## 5. Garmin Developer Program — **4–12 week approval (longest lead)**

**Action:**
1. Apply at https://developer.garmin.com.
2. Health API partnership requires:
   - Product description.
   - Data-use disclosure.
   - Consumer privacy policy.
3. Copy `GARMIN_CONSUMER_KEY` + `GARMIN_CONSUMER_SECRET` when approved.

**What's code-ready:**
- Nothing. OAuth 1.0a complexity + long lead = speculative code risk is too high until creds are in hand. The `garmin_daily` legacy table exists and will map cleanly when the module lands.

---

## 6. Microsoft Entra ID — **Outlook OAuth, 1–2 weeks**

**Action:**
1. Create app registration at https://entra.microsoft.com.
2. Request `Mail.Read` + `Calendars.Read` scopes.
3. Publisher verification (takes a bit of back-and-forth).
4. Copy `MS_CLIENT_ID` + `MS_CLIENT_SECRET` + redirect URI into env.

**What's code-ready:**
- Nothing. Entra friction + lower priority than Gmail/GCal (which share Google infra). Deferred.

---

## 7. Apple Family Controls — **Apple distribution entitlement, ~2 weeks**

**Blocks:** Screen Time data for Attention pillar (Momentum score).

**Action:**
1. Request at https://developer.apple.com/contact/request/family-controls-distribution.
2. Add `com.apple.developer.family-controls` entitlement to the Xcode project.

**What's code-ready:**
- Catalog entry in `connectors.py` with honest "~2 week lead" note.

**What remains:**
- Native Swift module reading `DeviceActivity` + `FamilyControls` frameworks.
- iOS-only. Android has no equivalent in v1.

---

## 8. Google Play Console — **$25 one-time**

**Blocks:** Android distribution + FCM for push.

**Action:**
1. Register at https://play.google.com/console.
2. Create FCM project at Firebase console.
3. Copy `FCM_SENDER_ID` / server key into env.

**What's code-ready:**
- Nothing specific. Flows in once push notifications get wired (separate phase).

---

## 9. RevenueCat — **~1 hour of configuration**

**Blocks:** Paywall / subscription products.

**Action:** Out of scope for this build cycle (founder explicitly excluded billing work). When it's time:
1. Sign up at https://app.revenuecat.com.
2. Create offerings + entitlements + link to Apple / Play products.

**What's code-ready:**
- Nothing. No billing code this cycle.

---

## Quick-reference env var manifest

Required for shipped code-paths (B1/C1):
- `CLERK_SECRET_KEY` — already in use
- `CLERK_PUBLISHABLE_KEY` — already in use
- `ANTHROPIC_API_KEY` — already in use
- `SECRET_KEY` — Flask session signing, already in use

Not yet required (each unblocks the paired integration):

| Env var | Unblocks | Source |
|---------|----------|--------|
| `GOOGLE_CLIENT_ID` | Gmail + GCal | Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Gmail + GCal | Google Cloud Console |
| `PLAID_CLIENT_ID` | Finance / Plaid | Plaid dashboard |
| `PLAID_SECRET` | Finance / Plaid | Plaid dashboard |
| `PLAID_ENV` | `sandbox` → `production` | Plaid dashboard |
| `STRAVA_CLIENT_ID` | Strava | Strava API portal |
| `STRAVA_SECRET` | Strava | Strava API portal |
| `GARMIN_CONSUMER_KEY` | Garmin | Garmin Developer Program |
| `GARMIN_CONSUMER_SECRET` | Garmin | Garmin Developer Program |
| `MS_CLIENT_ID` | Outlook | Microsoft Entra |
| `MS_CLIENT_SECRET` | Outlook | Microsoft Entra |
| `FCM_SENDER_ID` | Android push | Firebase Console |
| `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_KEY_P8` | iOS push | Apple Developer |

---

## What NOT to expect from B1 / C1

These are explicit non-goals for this build cycle:

- No per-provider webhook signature verification (deferred until the first provider actually sends us webhooks).
- No `plaid_sync.py` / `gcal_sync.py` / `outlook_sync.py` / `strava_sync.py` / `garmin_sync.py`. Founder direction: "stop exactly where credentials… is required." Writing adapters for untestable providers = dead code risk.
- No background-job runner (APScheduler / RQ / etc.). Profile generation still runs on a thread; moving this is a separate phase.
- No token encryption at rest. Current plain-text SQLite is the same posture the app shipped with; a future phase adds encryption when the right key-management story lands.
- No full-route refactor of the 118 legacy `{"error": "msg"}` endpoints to `api_errors.err()`. New code uses the contract; legacy migrates opportunistically.
