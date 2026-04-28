"""Microsoft Outlook integration — OAuth + Mail + Calendar via Microsoft
Graph (BUILD_PLAN_v2 §3.4).

Outlook bundles mail + calendar under a single OAuth grant (one token,
one scopes-list, one refresh_token). We expose them as a SINGLE
'outlook' connector — different from the Google split where Gmail and
Calendar are independent connector rows. Reasoning: Microsoft requires
all scopes up-front in one consent screen, and there's no UX where the
user would realistically connect Outlook mail without Outlook calendar.

OAuth notes:
  - Tenant in URL is 'common' (not the user's tenant ID), which lets
    multi-tenant + personal-account apps accept any account type.
  - The Entra app is registered as a "Public client" (mobile/desktop
    platform). Microsoft enforces this server-side: token requests for
    public clients MUST NOT include client_secret. AADSTS90023 fires
    if you send one. Authentication is via PKCE — the code_verifier
    matching the original code_challenge IS the auth.
  - MS_CLIENT_SECRET env var is therefore unused by this module. We
    keep it accepted so swapping to a Web-client registration in the
    future is a one-line change — but currently it's optional/ignored.
  - `offline_access` scope is REQUIRED for the refresh_token. Without
    it Microsoft only returns a 1-hour access token and the connection
    silently dies forever after that hour.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import requests

logger = logging.getLogger(__name__)


# ── OAuth + API config ─────────────────────────────────────────────────────

MS_CLIENT_ID     = os.environ.get("MS_CLIENT_ID", "")
MS_CLIENT_SECRET = os.environ.get("MS_CLIENT_SECRET", "")

# Multi-tenant + personal accounts → use /common/ as the tenant id in the
# URL. /common/ accepts any work, school, or personal Microsoft account.
MS_TENANT      = "common"
MS_AUTH_URL    = f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/authorize"
MS_TOKEN_URL   = f"https://login.microsoftonline.com/{MS_TENANT}/oauth2/v2.0/token"
GRAPH_API_BASE = "https://graph.microsoft.com/v1.0"

# offline_access is the magic scope that buys a refresh_token. The other
# three are what we actually USE the token for. User.Read is auto-granted
# but we list explicitly so the consent screen is honest about what we
# read.
OUTLOOK_SCOPES = "offline_access User.Read Mail.Read Calendars.Read"

REQUEST_TIMEOUT = 15


def is_configured() -> bool:
    """Public-client mode only requires client_id. The secret is currently
    unused (see module docstring) but tolerated in the env."""
    return bool(MS_CLIENT_ID)


# ── OAuth helpers ──────────────────────────────────────────────────────────

def get_auth_url(redirect_uri: str, state: str = "") -> str:
    """Build the Microsoft consent URL.

    Note `response_mode=query` — Microsoft defaults to fragment for some
    flows, but our deep-link flow needs the code in the query string so
    expo-linking parses it as URLSearchParams.
    """
    params = {
        "client_id":     MS_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "response_mode": "query",
        "scope":         OUTLOOK_SCOPES,
        "state":         state,
        # prompt=select_account means user gets the account picker even
        # if they're already signed in — better UX for "I want to connect
        # a different mailbox than my main one".
        "prompt":        "select_account",
    }
    return f"{MS_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, redirect_uri: str, *,
                  code_verifier: str | None = None) -> dict:
    """Exchange auth code for tokens.

    Microsoft returns:
      {
        "token_type": "Bearer",
        "expires_in": 3600,
        "scope": "...",
        "access_token": "...",
        "refresh_token": "..."   # only present if offline_access was requested
      }
    """
    # Public-client flow: NO client_secret. Microsoft rejects with
    # AADSTS90023 if you include one. PKCE provides the auth.
    payload: dict = {
        "client_id":     MS_CLIENT_ID,
        "code":          code,
        "redirect_uri":  redirect_uri,
        "grant_type":    "authorization_code",
        "scope":         OUTLOOK_SCOPES,
    }
    if code_verifier:
        payload["code_verifier"] = code_verifier
    resp = requests.post(MS_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        try:
            err_body = resp.json()
        except Exception:
            err_body = {"raw": resp.text[:500]}
        raise RuntimeError(f"Microsoft token endpoint {resp.status_code}: {err_body}")
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    """Microsoft rotates refresh_token frequently — caller must always
    persist whatever comes back, not assume the original keeps working.
    Returns dict shaped for connectors.get_valid_access_token's refresh_fn
    contract."""
    # Public-client flow: NO client_secret here either.
    payload = {
        "client_id":     MS_CLIENT_ID,
        "refresh_token": refresh_token,
        "grant_type":    "refresh_token",
        "scope":         OUTLOOK_SCOPES,
    }
    resp = requests.post(MS_TOKEN_URL, data=payload, timeout=REQUEST_TIMEOUT)
    if not resp.ok:
        try:
            err_body = resp.json()
        except Exception:
            err_body = {"raw": resp.text[:500]}
        raise RuntimeError(f"Microsoft token endpoint {resp.status_code}: {err_body}")
    return resp.json()


# ── Graph API: profile, mail, calendar ──────────────────────────────────────

def get_user_profile(access_token: str) -> dict:
    """Fetch the authenticated user's profile (display name + email)."""
    resp = requests.get(
        f"{GRAPH_API_BASE}/me",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_recent_emails(access_token: str, max_results: int = 20) -> list[dict]:
    """Fetch recent inbox messages.

    Graph endpoint: /me/mailFolders/Inbox/messages
    Filters to the last 7 days so we don't pull a lifetime mailbox.
    Returns shape that mirrors Gmail's fetch_recent_emails() output so the
    Time-tab card / chatbot LifeContext don't have to care about source.
    """
    headers = {"Authorization": f"Bearer {access_token}"}
    seven_days_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {
        "$top":      max_results,
        "$select":   "id,conversationId,from,subject,bodyPreview,receivedDateTime,isRead",
        "$orderby":  "receivedDateTime desc",
        "$filter":   f"receivedDateTime ge {seven_days_ago}",
    }
    resp = requests.get(
        f"{GRAPH_API_BASE}/me/mailFolders/Inbox/messages",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    raw = resp.json().get("value", []) or []

    out: list[dict] = []
    for msg in raw:
        sender_obj = (msg.get("from") or {}).get("emailAddress") or {}
        sender_name = sender_obj.get("name") or ""
        sender_email = sender_obj.get("address") or ""
        sender = sender_name or sender_email or "(unknown)"

        out.append({
            "message_id":  msg.get("id", ""),
            "thread_id":   msg.get("conversationId", ""),
            "sender":      sender,
            "subject":     msg.get("subject") or "(no subject)",
            "snippet":     msg.get("bodyPreview", ""),
            "received_at": msg.get("receivedDateTime", ""),
            "is_read":     1 if msg.get("isRead") else 0,
            # Microsoft doesn't expose "user replied to this thread" as a
            # cheap field — would require a per-thread fetch like Gmail.
            # Punt for v1; users can still see the unread count.
            "has_replied": 0,
        })
    return out


def fetch_events(access_token: str, *,
                 days_before: int = 1,
                 days_after: int = 7,
                 max_results: int = 50) -> list[dict]:
    """Fetch calendar events in a window around today. Returns same shape
    as gcal_sync.fetch_events() so downstream code (db, Time-tab card,
    chatbot) is provider-agnostic."""
    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days_before)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = (now + timedelta(days=days_after)).strftime("%Y-%m-%dT%H:%M:%SZ")

    headers = {"Authorization": f"Bearer {access_token}"}
    # /calendarView expands recurring events into individual instances —
    # what we want. /events returns the master with no expansions.
    params = {
        "startDateTime": start,
        "endDateTime":   end,
        "$top":          max_results,
        "$select":       "id,subject,location,start,end,isAllDay,organizer,attendees,webLink",
        "$orderby":      "start/dateTime",
    }
    resp = requests.get(
        f"{GRAPH_API_BASE}/me/calendarView",
        headers=headers,
        params=params,
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    raw = resp.json().get("value", []) or []

    out: list[dict] = []
    for ev in raw:
        start_obj = ev.get("start") or {}
        end_obj = ev.get("end") or {}
        organizer = (ev.get("organizer") or {}).get("emailAddress") or {}
        location_obj = ev.get("location") or {}
        attendees = ev.get("attendees") or []

        out.append({
            "event_id":          ev.get("id", ""),
            "calendar_id":       organizer.get("address", "primary"),
            "title":             ev.get("subject") or "(no title)",
            "location":          location_obj.get("displayName") or "",
            "start":             start_obj.get("dateTime") or "",
            "end":               end_obj.get("dateTime") or "",
            "all_day":           bool(ev.get("isAllDay")),
            "is_self_organizer": False,  # Graph doesn't expose it cleanly; punt
            "attendees_count":   len(attendees),
            "html_link":         ev.get("webLink", ""),
        })
    return out
