# APEX Life Dashboard — Hardening Log

Branch: `pre-migration-hardening` | Started: 2026-04-17

---

## Baseline Metrics

| Metric | Value |
|--------|-------|
| Python files | 8 (5,039 lines) |
| HTML files | 3 (12,779 lines) |
| JS files | 2 (467 lines) |
| **Total LOC** | **18,285** |
| Anthropic API calls | 16 (6 Opus, 10 Haiku) |
| Anthropic calls with timeout | 0 of 16 |
| DB tables (total) | 24 |
| DB tables (active) | 15 |
| DB tables (dormant/orphan) | 9 |

---

## Change Log

| # | Phase | Commit | Description | Verified | Files Changed |
|---|-------|--------|-------------|----------|---------------|
| 1 | 0 | `eebfeae` | Relocate migration docs to /docs/migration/ | App boots, no code changes | 10 renamed |
| 2 | 0.5 | `32a0d9e` | Create ACTIVE_FEATURES.md, DORMANT_FEATURES.md, HARDENING_LOG.md | N/A (docs only) | 3 new |
| 3 | 1 | `1f26316` | P0-2: _ob_jobs memory leak — pop on terminal state + hourly TTL sweep | Onboarding poll clears entry; stale entries evicted; all endpoints 200 | app.py |
| 4 | 1 | `aa077b0` | P0-3: threading.Lock on _ob_jobs | 50 concurrent reader/writer threads, zero errors; all endpoints 200 | app.py |
| 5 | 2 | `f89660d` | P1-4: URL-encoded Gmail OAuth error param | XSS payload neutralized in redirect Location header | app.py |
| 6 | 2 | `038fa74` | P1-6: timeouts on all 17 Anthropic calls | 30s default, 60s for large prompts; 17/17 calls have timeout | claude_nutrition.py, claude_profile.py, gmail_sync.py |
| 7 | 2 | `7dae477` | P1-7: require SECRET_KEY in production | Dev boots with warning; production crashes without key; boots with key | app.py |
| 8 | 2 | `dba7421` | P1-5: log 7 silent exception swallows | Bare except→_log.warning in active paths; 3 dormant deferred | app.py |
| 9 | 3 | `55e57a0` | AI_CALL_INVENTORY.md — 15 calls audited, 78% cost reduction proposed | N/A (docs) | 1 new |
| 10 | 3 | `7c494dd` | Switch 5 Opus→Haiku (estimate_nutrition, identify_ingredients, suggest_meal, estimate_burn, parse_workout_plan) | App boots; endpoints 200; 1 Opus remains (scan_meal_image) | claude_nutrition.py |
| 11 | 4 | `f96cd3c` | Preserved check-in scoring logic in BUSINESS_LOGIC.md Appendix A | N/A (docs) | BUSINESS_LOGIC.md |
| 12 | 4 | `17f0fcf` | Removed dead get_setting/set_setting | App boots; endpoints 200 | app.py, db.py |
| 13 | 4 | `f565457` | Removed all dormant features: Garmin, sleep, check-ins | All active endpoints 200; dormant routes 404; 884 lines deleted | app.py, db.py, claude_profile.py, garmin_sync.py (deleted), requirements.txt |
| | | | | | |

---

## Issues Discovered During Hardening

| # | Severity | Description | Discovered In | Resolution |
|---|----------|-------------|---------------|------------|
| 1 | Info | `ResourceWarning: unclosed database` on boot | Phase 0 baseline | Pre-existing, not addressed in this pass |
| 2 | Info | `get_setting`/`set_setting` imported but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
| 3 | Info | `compute_mind_insights()` defined but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
| 4 | Info | `generate_evening_prompt()` defined but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
