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
| 2 | 0.5 | (pending) | Create ACTIVE_FEATURES.md, DORMANT_FEATURES.md, HARDENING_LOG.md | N/A (docs only) | 3 new |
| | | | | | |

---

## Issues Discovered During Hardening

| # | Severity | Description | Discovered In | Resolution |
|---|----------|-------------|---------------|------------|
| 1 | Info | `ResourceWarning: unclosed database` on boot | Phase 0 baseline | Pre-existing, not addressed in this pass |
| 2 | Info | `get_setting`/`set_setting` imported but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
| 3 | Info | `compute_mind_insights()` defined but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
| 4 | Info | `generate_evening_prompt()` defined but never called | Phase 0.5 audit | Classified as dormant, scheduled for Phase 4 deletion |
