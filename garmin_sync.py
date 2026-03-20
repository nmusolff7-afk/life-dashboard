"""
Garmin Connect sync — placeholder.

Full implementation pending official Garmin Health API access.
"""

import logging

logger = logging.getLogger(__name__)


def is_configured():
    return False


def get_client():
    raise NotImplementedError("Garmin API access not yet configured")


def fetch_day(date_str):
    raise NotImplementedError("Garmin API access not yet configured")


def invalidate():
    pass
