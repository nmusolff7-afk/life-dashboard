"""
Gmail integration — OAuth 2.0 flow, email fetching, and AI summarization.

Uses Google's OAuth2 for user-authorized Gmail access (read-only).
Tokens are stored per-user in the database, not in env vars.
"""

import os
import json
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
import anthropic

logger = logging.getLogger(__name__)

# ── OAuth config (from env / Google Cloud Console) ──────────────────────────

GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GMAIL_SCOPES         = "https://www.googleapis.com/auth/gmail.readonly"
GOOGLE_AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL     = "https://oauth2.googleapis.com/token"
GMAIL_API_BASE       = "https://gmail.googleapis.com/gmail/v1/users/me"


def is_configured() -> bool:
    """True if Google OAuth client credentials are set."""
    return bool(GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)


# ── OAuth helpers ───────────────────────────────────────────────────────────

def get_auth_url(redirect_uri: str, state: str = "") -> str:
    """Build the Google OAuth consent URL."""
    params = {
        "client_id":     GOOGLE_CLIENT_ID,
        "redirect_uri":  redirect_uri,
        "response_type": "code",
        "scope":         GMAIL_SCOPES,
        "access_type":   "offline",
        "prompt":        "consent",
        "state":         state,
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, redirect_uri: str) -> dict:
    """Exchange authorization code for access + refresh tokens.

    Returns: {access_token, refresh_token, expires_in, token_type}
    """
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "code":          code,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri":  redirect_uri,
        "grant_type":    "authorization_code",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh an expired access token.

    Returns: {access_token, expires_in, token_type}
    """
    resp = requests.post(GOOGLE_TOKEN_URL, data={
        "refresh_token": refresh_token,
        "client_id":     GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "grant_type":    "refresh_token",
    }, timeout=15)
    resp.raise_for_status()
    return resp.json()


def get_user_email(access_token: str) -> str:
    """Fetch the authenticated user's email address."""
    resp = requests.get(
        f"{GMAIL_API_BASE}/profile",
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json().get("emailAddress", "")


def compute_expiry(expires_in: int) -> str:
    """Compute ISO timestamp for when the token expires."""
    return (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()


# ── Token management ───────────────────────────────────────────────────────

def get_valid_token(user_id: int, db_get_tokens, db_update_token) -> str | None:
    """Return a valid access token, refreshing if expired.

    db_get_tokens: callable(user_id) -> dict with access_token, refresh_token, token_expiry
    db_update_token: callable(user_id, access_token, token_expiry)
    """
    tokens = db_get_tokens(user_id)
    if not tokens:
        return None

    expiry_str = tokens.get("token_expiry", "")
    try:
        expiry = datetime.fromisoformat(expiry_str)
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        expiry = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    if now < expiry - timedelta(minutes=2):
        return tokens["access_token"]

    # Token expired or about to expire — refresh
    try:
        refreshed = refresh_access_token(tokens["refresh_token"])
        new_access = refreshed["access_token"]
        new_expiry = compute_expiry(refreshed["expires_in"])
        db_update_token(user_id, new_access, new_expiry)
        logger.info("Gmail: refreshed access token for user %s", user_id)
        return new_access
    except Exception as e:
        logger.error("Gmail: token refresh failed for user %s: %s", user_id, e)
        return None


# ── Email fetching ──────────────────────────────────────────────────────────

def _parse_header(headers: list, name: str) -> str:
    """Extract a header value from Gmail message headers."""
    for h in headers:
        if h.get("name", "").lower() == name.lower():
            return h.get("value", "")
    return ""


def _parse_sender(from_header: str) -> str:
    """Extract a clean sender name/email from the From header."""
    if "<" in from_header:
        name = from_header.split("<")[0].strip().strip('"')
        if name:
            return name
        return from_header.split("<")[1].rstrip(">").strip()
    return from_header.strip()


def fetch_recent_emails(access_token: str, max_results: int = 20) -> list[dict]:
    """Fetch recent inbox messages with metadata.

    Returns list of:
        {message_id, thread_id, sender, subject, snippet, received_at, is_read, has_replied}
    """
    # List recent messages from inbox
    resp = requests.get(
        f"{GMAIL_API_BASE}/messages",
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "maxResults": max_results,
            "labelIds":   "INBOX",
            "q":          "newer_than:2d",
        },
        timeout=15,
    )
    resp.raise_for_status()
    message_list = resp.json().get("messages", [])

    if not message_list:
        return []

    results = []
    for msg_ref in message_list:
        try:
            msg_resp = requests.get(
                f"{GMAIL_API_BASE}/messages/{msg_ref['id']}",
                headers={"Authorization": f"Bearer {access_token}"},
                params={"format": "metadata", "metadataHeaders": "From,Subject,Date"},
                timeout=10,
            )
            msg_resp.raise_for_status()
            msg = msg_resp.json()

            headers   = msg.get("payload", {}).get("headers", [])
            label_ids = msg.get("labelIds", [])

            sender  = _parse_sender(_parse_header(headers, "From"))
            subject = _parse_header(headers, "Subject") or "(no subject)"
            snippet = msg.get("snippet", "")
            date_str = _parse_header(headers, "Date")

            # Determine replied status: if thread has a SENT message, user replied
            # We check thread-level: fetch thread and see if any message has SENT label
            thread_id = msg.get("threadId", "")
            has_replied = 0
            try:
                thread_resp = requests.get(
                    f"{GMAIL_API_BASE}/threads/{thread_id}",
                    headers={"Authorization": f"Bearer {access_token}"},
                    params={"format": "minimal"},
                    timeout=10,
                )
                thread_resp.raise_for_status()
                thread_msgs = thread_resp.json().get("messages", [])
                for tm in thread_msgs:
                    if "SENT" in tm.get("labelIds", []):
                        has_replied = 1
                        break
            except Exception:
                pass

            is_read = 0 if "UNREAD" in label_ids else 1

            results.append({
                "message_id":  msg_ref["id"],
                "thread_id":   thread_id,
                "sender":      sender,
                "subject":     subject,
                "snippet":     snippet,
                "received_at": date_str,
                "is_read":     is_read,
                "has_replied": has_replied,
            })
        except Exception as e:
            logger.warning("Gmail: failed to fetch message %s: %s", msg_ref.get("id"), e)
            continue

    return results


# ── AI summarization ────────────────────────────────────────────────────────

def summarize_emails(emails: list[dict]) -> str:
    """Use Claude Haiku to generate a concise summary of recent emails."""
    if not emails:
        return "No new emails to summarize."

    unreplied = [e for e in emails if not e["has_replied"] and not e["is_read"]]
    replied   = [e for e in emails if e["has_replied"]]

    email_text = ""
    for e in emails[:20]:
        status = ""
        if not e["is_read"]:
            status = " [UNREAD]"
        if not e["has_replied"]:
            status += " [NO REPLY]"
        else:
            status += " [REPLIED]"
        email_text += f"- From: {e['sender']} | Subject: {e['subject']}{status}\n  Preview: {e['snippet'][:120]}\n"

    prompt = f"""Summarize these recent emails in 3-5 concise bullet points for a daily life dashboard.
Focus on what needs attention — highlight unreplied messages that seem important.
Group related emails if possible. Keep each bullet under 20 words.
Don't mention spam, promotions, or newsletters unless they seem important.

Emails:
{email_text}

Stats: {len(unreplied)} unread & unreplied, {len(replied)} replied, {len(emails)} total in last 48h.

Return ONLY the bullet points, no intro text. Use • as bullet character."""

    try:
        client = anthropic.Anthropic()
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        return resp.content[0].text.strip()
    except Exception as e:
        logger.error("Gmail: AI summarization failed: %s", e)
        return "Could not generate summary — check back later."
