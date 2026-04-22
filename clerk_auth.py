"""Clerk session token verification via JWKS (RS256).

The Frontend API host is encoded in the publishable key:
    pk_test_<base64("<host>$")>  or  pk_live_<base64("<host>$")>

That host drives both the JWKS endpoint and the expected `iss` claim.
"""

import base64
import logging as _log
import os
from typing import Optional

import jwt
from jwt import PyJWKClient, PyJWKClientError


def _get_publishable_key() -> str:
    """Accept either CLERK_PUBLISHABLE_KEY or the Next.js-style name used by the dashboard copy-paste."""
    return (
        os.environ.get("CLERK_PUBLISHABLE_KEY")
        or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY")
        or ""
    )


def _decode_publishable_key_host(pk: str) -> str:
    """Decode pk_(test|live)_<base64> to the Frontend API host (strips trailing '$')."""
    if pk.startswith("pk_test_"):
        b64 = pk[len("pk_test_"):]
    elif pk.startswith("pk_live_"):
        b64 = pk[len("pk_live_"):]
    else:
        raise ValueError("Publishable key must start with pk_test_ or pk_live_")
    padding = "=" * (-len(b64) % 4)
    decoded = base64.b64decode(b64 + padding).decode("utf-8")
    return decoded[:-1] if decoded.endswith("$") else decoded


_jwks_client: Optional[PyJWKClient] = None
_issuer: Optional[str] = None


def _ensure_jwks_client() -> Optional[PyJWKClient]:
    """Lazily build and cache the JWKS client. Returns None if publishable key missing/invalid."""
    global _jwks_client, _issuer
    if _jwks_client is not None:
        return _jwks_client
    pk = _get_publishable_key()
    if not pk:
        return None
    try:
        host = _decode_publishable_key_host(pk)
    except Exception as e:
        _log.warning("Clerk: failed to decode publishable key: %s", e)
        return None
    _issuer = f"https://{host}"
    _jwks_client = PyJWKClient(f"{_issuer}/.well-known/jwks.json")
    return _jwks_client


def verify_clerk_token(token: str) -> Optional[dict]:
    """Verify a Clerk session token via JWKS. Returns claims dict on success, None otherwise."""
    client = _ensure_jwks_client()
    if client is None:
        _log.warning("Clerk verify: JWKS client unavailable (missing publishable key)")
        return None
    try:
        signing_key = client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=_issuer,
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        _log.warning("Clerk verify: token expired")
        return None
    except jwt.InvalidTokenError as e:
        _log.warning("Clerk verify: invalid token (%s)", type(e).__name__)
        return None
    except PyJWKClientError as e:
        _log.warning("Clerk verify: JWKS fetch error: %s", e)
        return None
    except Exception as e:
        _log.warning("Clerk verify: unexpected error: %s", e)
        return None
