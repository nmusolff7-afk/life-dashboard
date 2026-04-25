"""Connector foundation: canonical per-user integration state (PRD §4.8.6).

One row per (user, provider) in `users_connectors`. Covers both OAuth
integrations (Gmail, Plaid, etc.) and device-native surfaces (HealthKit,
Health Connect) — the device-native rows carry no tokens, just status.

Status state machine:
  disconnected  — no row, or row with status='disconnected' (legacy backfill)
  pending_oauth — state token issued, user redirected to provider, callback
                  not yet received
  connected     — tokens stored, last_sync_at populated
  expired       — refresh token stopped working or scopes revoked by user
  revoked       — user disconnected from our side OR provider-side deletion
  error         — unexpected failure; last_error carries user-safe message

The catalog below is the source of truth for which providers exist and
what metadata the mobile tiles should render. Phase C1 will wire the
actual OAuth flows; B1 just sets up the scaffolding.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from db import get_conn


# ── Connector catalog ────────────────────────────────────────────────────


@dataclass(frozen=True)
class ConnectorMeta:
    provider: str
    display_name: str
    description: str
    category: str               # 'fitness' | 'nutrition' | 'finance' | 'time' | 'attention'
    kind: str                   # 'oauth' | 'device_native' | 'webhook_only'
    icon: str                   # emoji fallback; mobile can swap to a real icon
    ships_in_phase: str         # 'a0' (shipped), 'c1' (scaffolded, wired later), 'v1.1'
    note: str = ''              # short honest status string for tile footer
    platforms: tuple[str, ...] = ('ios', 'android')


_CATALOG: tuple[ConnectorMeta, ...] = (
    ConnectorMeta(
        provider='healthkit',
        display_name='Apple Health',
        description='Steps, weight, sleep, heart rate, HRV',
        category='fitness', kind='device_native', icon='❤️',
        ships_in_phase='a0',
        note='Connected via device permissions.',
        platforms=('ios',),
    ),
    ConnectorMeta(
        provider='health_connect',
        display_name='Health Connect',
        description='Steps, weight, sleep, heart rate',
        category='fitness', kind='device_native', icon='❤️',
        ships_in_phase='a0',
        note='Connected via device permissions.',
        platforms=('android',),
    ),
    ConnectorMeta(
        provider='gmail',
        display_name='Gmail',
        description='Read-only email triage for the Time tab',
        category='time', kind='oauth', icon='📧',
        ships_in_phase='c1',
        note='Backend OAuth is wired; mobile connect flow ships next phase.',
    ),
    ConnectorMeta(
        provider='gcal',
        display_name='Google Calendar',
        description='Today\'s events, meeting hours',
        category='time', kind='oauth', icon='📅',
        ships_in_phase='c1',
        note='OAuth flow ships next phase.',
    ),
    ConnectorMeta(
        provider='outlook',
        display_name='Outlook',
        description='Mail + calendar (Microsoft Graph)',
        category='time', kind='oauth', icon='📬',
        ships_in_phase='v1.1',
        note='Microsoft Graph integration targeted for v1.1.',
    ),
    ConnectorMeta(
        provider='plaid',
        display_name='Plaid (bank accounts)',
        description='Spending, budget, bills from linked banks',
        category='finance', kind='oauth', icon='🏦',
        ships_in_phase='v1.1',
        note='Requires Plaid production approval; manual Finance entry works today.',
    ),
    ConnectorMeta(
        provider='strava',
        display_name='Strava',
        description='Activity feed (read-only)',
        category='fitness', kind='oauth', icon='🏃',
        ships_in_phase='v1.1',
        note='Strava OAuth ships once the Fitness tab has richer surface.',
    ),
    ConnectorMeta(
        provider='garmin',
        display_name='Garmin Connect',
        description='Steps, HRV, sleep, workouts',
        category='fitness', kind='oauth', icon='⌚',
        ships_in_phase='v1.1',
        note='Needs Garmin Developer Program approval (4–12 week lead).',
    ),
    ConnectorMeta(
        provider='apple_family_controls',
        display_name='Apple Family Controls',
        description='Screen-time patterns for the attention pillar',
        category='attention', kind='device_native', icon='🛡️',
        ships_in_phase='v1.1',
        note='Requires Apple distribution entitlement (~2 week lead).',
        platforms=('ios',),
    ),
    ConnectorMeta(
        provider='location',
        display_name='Location',
        description='Home / work / gym visit rhythm',
        category='time', kind='device_native', icon='📍',
        ships_in_phase='v1.1',
        note='CoreLocation Visits + Google Places. Ships after onboarding-flow polish.',
    ),
)


def catalog() -> list[dict]:
    """Return the full provider catalog as serializable dicts (for the API)."""
    return [
        {
            'provider': m.provider,
            'display_name': m.display_name,
            'description': m.description,
            'category': m.category,
            'kind': m.kind,
            'icon': m.icon,
            'ships_in_phase': m.ships_in_phase,
            'note': m.note,
            'platforms': list(m.platforms),
        }
        for m in _CATALOG
    ]


def get_meta(provider: str) -> ConnectorMeta | None:
    return next((m for m in _CATALOG if m.provider == provider), None)


# ── Status + known values ────────────────────────────────────────────────

STATUS_DISCONNECTED = 'disconnected'
STATUS_PENDING_OAUTH = 'pending_oauth'
STATUS_CONNECTED = 'connected'
STATUS_EXPIRED = 'expired'
STATUS_REVOKED = 'revoked'
STATUS_ERROR = 'error'

_VALID_STATUSES = {
    STATUS_DISCONNECTED, STATUS_PENDING_OAUTH, STATUS_CONNECTED,
    STATUS_EXPIRED, STATUS_REVOKED, STATUS_ERROR,
}


def _now() -> int:
    return int(time.time())


# ── Connector CRUD ───────────────────────────────────────────────────────


def get_connector(user_id: int, provider: str) -> dict | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM users_connectors WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        ).fetchone()
    return dict(row) if row else None


def list_connectors(user_id: int) -> list[dict]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM users_connectors WHERE user_id = ? ORDER BY provider",
            (user_id,),
        ).fetchall()
    return [dict(r) for r in rows]


def save_connector(user_id: int, provider: str, **fields) -> int:
    """Upsert a connector row. Fields accepted: access_token, refresh_token,
    expires_at, scopes, status, external_user_id, last_sync_at, last_error,
    last_error_detail. Status validated against _VALID_STATUSES."""
    if fields.get('status') and fields['status'] not in _VALID_STATUSES:
        raise ValueError(f"invalid status: {fields['status']}")
    now = _now()
    allowed = {
        'access_token', 'refresh_token', 'expires_at', 'scopes', 'status',
        'external_user_id', 'last_sync_at', 'last_error', 'last_error_detail',
    }
    safe = {k: v for k, v in fields.items() if k in allowed}
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM users_connectors WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        ).fetchone()
        if existing:
            if not safe:
                return int(existing['id'])
            sets = ", ".join(f"{k} = ?" for k in safe) + ", updated_at = ?"
            params = list(safe.values()) + [now, user_id, provider]
            conn.execute(
                f"UPDATE users_connectors SET {sets} WHERE user_id = ? AND provider = ?",
                params,
            )
            conn.commit()
            return int(existing['id'])
        # Fresh row
        cols = ['user_id', 'provider', 'created_at', 'updated_at'] + list(safe)
        placeholders = ', '.join(['?'] * len(cols))
        # status defaults to 'disconnected' per schema; callers usually set it.
        if 'status' not in safe:
            safe['status'] = STATUS_DISCONNECTED
            cols.append('status')
            placeholders += ', ?'
        cur = conn.execute(
            f"INSERT INTO users_connectors ({', '.join(cols)}) VALUES ({placeholders})",
            [user_id, provider, now, now] + [safe[k] for k in cols[4:]],
        )
        conn.commit()
        return int(cur.lastrowid)


def mark_connector_error(user_id: int, provider: str,
                         message: str, detail: str | None = None) -> None:
    """Stamp an error on a connector without nuking the tokens. Caller
    decides whether to move status to 'error' or keep 'connected' for
    transient failures."""
    save_connector(
        user_id, provider,
        status=STATUS_ERROR,
        last_error=message[:300],
        last_error_detail=(detail or '')[:4000] or None,
    )


def mark_connector_connected(user_id: int, provider: str) -> None:
    """Convenience: flip to connected + clear error + stamp last_sync_at now."""
    save_connector(
        user_id, provider,
        status=STATUS_CONNECTED,
        last_sync_at=_now(),
        last_error=None,
        last_error_detail=None,
    )


def delete_connector(user_id: int, provider: str) -> bool:
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM users_connectors WHERE user_id = ? AND provider = ?",
            (user_id, provider),
        )
        conn.commit()
    return cur.rowcount > 0


def get_valid_access_token(user_id: int, provider: str,
                           refresh_fn=None) -> str | None:
    """Return a non-expired access token, auto-refreshing if needed.

    refresh_fn(refresh_token) -> dict with keys {access_token, refresh_token
    (optional), expires_at} is the provider-specific token-exchange call.
    Left callable so this module stays provider-agnostic.

    Returns None if:
      - no connector row
      - status != connected
      - token expired and no refresh_fn supplied
      - refresh_fn raised / returned None

    On refresh failure the row is flipped to status='expired' so the UI
    can surface a "reconnect" CTA.
    """
    row = get_connector(user_id, provider)
    if not row or row.get('status') != STATUS_CONNECTED:
        return None
    token = row.get('access_token')
    expires_at = row.get('expires_at') or 0
    # 60-second skew — refresh a bit early to avoid races mid-request.
    if token and (not expires_at or expires_at > _now() + 60):
        return token
    if not refresh_fn:
        return None
    rt = row.get('refresh_token')
    if not rt:
        save_connector(user_id, provider, status=STATUS_EXPIRED,
                       last_error='Refresh token missing; please reconnect.')
        return None
    try:
        refreshed = refresh_fn(rt)
        if not refreshed or not refreshed.get('access_token'):
            raise ValueError('refresh returned empty access_token')
        save_connector(
            user_id, provider,
            access_token=refreshed['access_token'],
            refresh_token=refreshed.get('refresh_token') or rt,
            expires_at=int(refreshed.get('expires_at') or 0) or None,
            status=STATUS_CONNECTED,
            last_error=None,
            last_error_detail=None,
        )
        return refreshed['access_token']
    except Exception as e:
        save_connector(
            user_id, provider,
            status=STATUS_EXPIRED,
            last_error='Token refresh failed; please reconnect.',
            last_error_detail=str(e)[:4000],
        )
        return None


# ── Gmail → users_connectors one-shot backfill ──────────────────────────


def backfill_gmail_tokens() -> int:
    """Copy legacy gmail_tokens rows into users_connectors once. Idempotent
    via UNIQUE(user_id, provider) — safe to run on every boot.

    Does NOT delete gmail_tokens; gmail_sync.py keeps reading from it for
    now. A future cycle will migrate gmail_sync.py to read from
    users_connectors and drop the legacy table.
    """
    import logging as _log_mod
    log = _log_mod.getLogger(__name__)
    try:
        with get_conn() as conn:
            legacy = conn.execute(
                "SELECT user_id, access_token, refresh_token, token_expiry, email_address "
                "FROM gmail_tokens"
            ).fetchall()
    except Exception as e:
        log.warning("gmail_tokens backfill skipped: %s", e)
        return 0

    moved = 0
    for r in legacy:
        existing = get_connector(int(r['user_id']), 'gmail')
        if existing:
            continue
        # Convert ISO `token_expiry` → unix ts (best effort)
        expires_at: int | None = None
        raw_exp = r['token_expiry']
        if raw_exp:
            try:
                from datetime import datetime as _dt
                expires_at = int(_dt.fromisoformat(raw_exp).timestamp())
            except Exception:
                expires_at = None
        save_connector(
            int(r['user_id']), 'gmail',
            access_token=r['access_token'],
            refresh_token=r['refresh_token'],
            expires_at=expires_at,
            scopes='https://www.googleapis.com/auth/gmail.readonly',
            external_user_id=r['email_address'],
            status=STATUS_CONNECTED,
        )
        moved += 1
    if moved:
        log.info("gmail_tokens backfill: migrated %d rows into users_connectors", moved)
    return moved


# ── Privacy / AI consent ─────────────────────────────────────────────────
# Per-source consent. Absence of a row = allowed=True (opt-out model, PRD
# §4.8.7). Enforcement is wired from chatbot.py when a source is in scope.

def get_consent_map(user_id: int) -> dict[str, bool]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT source, allowed FROM user_ai_consent WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    return {r['source']: bool(r['allowed']) for r in rows}


def is_source_allowed(user_id: int, source: str) -> bool:
    """Resolves consent for a single source. Default: True."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT allowed FROM user_ai_consent WHERE user_id = ? AND source = ?",
            (user_id, source),
        ).fetchone()
    return True if row is None else bool(row['allowed'])


def set_consent(user_id: int, source: str, allowed: bool) -> None:
    now = _now()
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO user_ai_consent (user_id, source, allowed, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, source) DO UPDATE SET
                allowed = excluded.allowed,
                updated_at = excluded.updated_at
        """, (user_id, source, 1 if allowed else 0, now))
        conn.commit()


# ── Serialization for API ────────────────────────────────────────────────


def serialize_for_client(row: dict, meta: ConnectorMeta | None) -> dict:
    """Never expose tokens to clients. Only status + metadata."""
    out = {
        'provider': row.get('provider'),
        'status': row.get('status') or STATUS_DISCONNECTED,
        'last_sync_at': row.get('last_sync_at'),
        'last_error': row.get('last_error'),
        'external_user_id': row.get('external_user_id'),
        'scopes': row.get('scopes'),
    }
    if meta:
        out.update({
            'display_name': meta.display_name,
            'description': meta.description,
            'category': meta.category,
            'kind': meta.kind,
            'icon': meta.icon,
            'ships_in_phase': meta.ships_in_phase,
            'note': meta.note,
            'platforms': list(meta.platforms),
        })
    return out
