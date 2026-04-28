"""Location intelligence — converts raw lat/lon samples into meaningful
visits, clusters, and reverse-geocoded place names.

Scope:
- `detect_visits(samples)`: walk a day's samples in time order; group
  consecutive ones within ~75m into a single "visit" with a centroid
  + dwell duration. Skips visits shorter than 2 min (driving past).
- `update_clusters_from_visits(user_id, visits)`: associate each visit
  with an existing cluster (proximity match) or create a fresh one.
  Adds the visit's dwell time to the cluster's lifetime total.
- `reverse_geocode(lat, lon)`: hits Google Maps Geocoding API. Returns
  a human-friendly place name. Cheap to cache — once per cluster,
  forever.
- `static_map_url(samples)`: builds a Google Static Maps API URL that
  renders today's samples as a path. Mobile uses this as an <Image>
  src — no native maps lib required for v1.

Key env var: GOOGLE_MAPS_API_KEY (separate from GOOGLE_CLIENT_ID;
needs Geocoding API + Maps Static API enabled in the Google Cloud
project. Same project as Gmail/GCal is fine — Maps APIs use API keys
not OAuth).
"""

from __future__ import annotations

import logging
import math
import os
from datetime import datetime
from typing import Any

import requests

logger = logging.getLogger(__name__)

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")

# Visit-detection tuning. Conservative defaults: a "visit" is at least
# 2 min at a location within 75m of a moving centroid.
VISIT_RADIUS_M = 75.0
VISIT_MIN_DWELL_MIN = 2

# Cluster proximity — visits this close to an existing cluster's
# centroid are folded into it.
CLUSTER_PROXIMITY_M = 75.0


# ── Distance helper ─────────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Equirectangular approximation. Accurate to ~0.5% for distances
    under ~1km — what we care about for cluster matching."""
    avg_lat_rad = math.radians((lat1 + lat2) / 2)
    x = math.radians(lon2 - lon1) * math.cos(avg_lat_rad)
    y = math.radians(lat2 - lat1)
    return 6371000.0 * math.sqrt(x * x + y * y)


# ── Visit detection ─────────────────────────────────────────────────

def detect_visits(samples: list[dict]) -> list[dict]:
    """Walk samples in time order; emit a visit per cluster of nearby
    consecutive samples.

    Returns list of:
      { centroid_lat, centroid_lon, start_iso, end_iso,
        dwell_minutes, sample_count }
    """
    if not samples:
        return []

    visits: list[dict] = []

    # Running visit accumulator
    cur_lat = float(samples[0]["lat"])
    cur_lon = float(samples[0]["lon"])
    cur_count = 1
    cur_start = samples[0]["sampled_at"]
    cur_last = samples[0]["sampled_at"]

    for s in samples[1:]:
        lat = float(s["lat"])
        lon = float(s["lon"])
        ts = s["sampled_at"]

        # Distance from current accumulator's centroid
        dist = haversine_m(cur_lat, cur_lon, lat, lon)

        if dist <= VISIT_RADIUS_M:
            # Extend current visit; update running average
            new_count = cur_count + 1
            cur_lat = (cur_lat * cur_count + lat) / new_count
            cur_lon = (cur_lon * cur_count + lon) / new_count
            cur_count = new_count
            cur_last = ts
        else:
            # Close out current visit, start fresh
            visit = _close_visit(cur_lat, cur_lon, cur_start, cur_last, cur_count)
            if visit:
                visits.append(visit)
            cur_lat = lat
            cur_lon = lon
            cur_count = 1
            cur_start = ts
            cur_last = ts

    # Final visit
    visit = _close_visit(cur_lat, cur_lon, cur_start, cur_last, cur_count)
    if visit:
        visits.append(visit)

    # Filter out micro-visits (driving past, brief stops)
    return [v for v in visits if v["dwell_minutes"] >= VISIT_MIN_DWELL_MIN]


def _close_visit(lat: float, lon: float, start_iso: str, end_iso: str,
                 count: int) -> dict | None:
    try:
        start = datetime.fromisoformat(start_iso.replace("Z", "+00:00"))
        end = datetime.fromisoformat(end_iso.replace("Z", "+00:00"))
        dwell_min = max(0, int((end - start).total_seconds() / 60))
    except (ValueError, AttributeError):
        return None

    return {
        "centroid_lat":  lat,
        "centroid_lon":  lon,
        "start_iso":     start_iso,
        "end_iso":       end_iso,
        "dwell_minutes": dwell_min,
        "sample_count":  count,
    }


# ── Cluster updates from visits ─────────────────────────────────────

def update_clusters_from_visits(user_id: int, visits: list[dict]) -> list[dict]:
    """For each visit, find/create the matching cluster + update its
    dwell total. Returns the visits enriched with the cluster_id +
    place_name they now belong to."""
    from db import find_or_create_cluster, add_dwell_to_cluster

    enriched: list[dict] = []
    for v in visits:
        cluster = find_or_create_cluster(
            user_id, v["centroid_lat"], v["centroid_lon"],
            proximity_m=CLUSTER_PROXIMITY_M,
        )
        add_dwell_to_cluster(cluster["id"], v["dwell_minutes"])
        enriched.append({
            **v,
            "cluster_id": cluster["id"],
            "place_name": cluster.get("place_name"),
            "place_label": cluster.get("place_label"),
        })
    return enriched


# ── Reverse geocoding ───────────────────────────────────────────────

def reverse_geocode(lat: float, lon: float) -> str | None:
    """Returns a human-friendly place name. None if API is unconfigured
    or returns no usable result.

    Strategy: prefer "establishment" results (Starbucks, gym name); fall
    back to "premise" or "street_address" for residential areas; final
    fallback is the formatted address minus the country."""
    if not GOOGLE_MAPS_API_KEY:
        return None
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={
                "latlng": f"{lat},{lon}",
                "key":    GOOGLE_MAPS_API_KEY,
                "result_type": "establishment|premise|street_address",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results") or []
        if not results:
            return None

        # Prefer the most specific result that has a non-generic name.
        # Google returns results sorted from most specific to least.
        for r in results:
            types = r.get("types", []) or []
            # Establishment is gold (named businesses)
            if "establishment" in types or "point_of_interest" in types:
                name = _pick_establishment_name(r)
                if name:
                    return name
            # Otherwise use formatted_address but strip the country
            fa = r.get("formatted_address") or ""
            if fa:
                return _trim_country(fa)
        return None
    except Exception as e:
        logger.warning("reverse_geocode failed for (%s, %s): %s", lat, lon, e)
        return None


def _pick_establishment_name(result: dict) -> str | None:
    """Establishment results have an `address_components` array; the
    name is the first component with type 'establishment' or
    'point_of_interest'. Falls back to the formatted_address."""
    for c in result.get("address_components", []) or []:
        types = c.get("types", []) or []
        if "establishment" in types or "point_of_interest" in types:
            n = c.get("long_name")
            if n:
                return n
    fa = result.get("formatted_address") or ""
    return _trim_country(fa) if fa else None


def _trim_country(formatted_address: str) -> str:
    """Strip ", USA" / ", United States" / ", Canada" etc tail.
    formatted_address comes back as '123 Main St, City, ST 12345, USA'
    — for display we just want '123 Main St, City, ST 12345'."""
    parts = [p.strip() for p in formatted_address.split(",")]
    if not parts:
        return formatted_address
    last = parts[-1].lower()
    country_tails = {"usa", "united states", "canada", "uk", "united kingdom"}
    if last in country_tails:
        parts.pop()
    return ", ".join(parts)


def geocode_pending_clusters(user_id: int, max_calls: int = 5) -> int:
    """Reverse-geocode any clusters that haven't been attempted yet.
    Caps at `max_calls` per invocation to keep API spend bounded.
    Returns count of clusters successfully named."""
    from db import get_conn, update_cluster_geocode

    if not GOOGLE_MAPS_API_KEY:
        return 0

    with get_conn() as conn:
        rows = conn.execute(
            "SELECT id, centroid_lat, centroid_lon FROM location_clusters "
            "WHERE user_id = ? AND geocode_attempted = 0 "
            "ORDER BY total_dwell_minutes DESC "
            "LIMIT ?",
            (user_id, max_calls),
        ).fetchall()

    named = 0
    for row in rows:
        place_name = reverse_geocode(
            float(row["centroid_lat"]), float(row["centroid_lon"]),
        )
        update_cluster_geocode(int(row["id"]), place_name)
        if place_name:
            named += 1
    return named


# ── Static Maps URL ─────────────────────────────────────────────────

def static_map_url(samples: list[dict], *,
                   width: int = 600, height: int = 240,
                   zoom: int | None = None) -> str | None:
    """Builds a Google Static Maps API URL for an Image tag. Renders
    today's path as a polyline with start/end markers + dots at each
    sample. Returns None if the API key isn't configured.

    Cheap: ~5 cents per 1000 loads, mobile only loads it when the
    Time tab is open. Free tier gives 28k loads/month.
    """
    if not GOOGLE_MAPS_API_KEY or not samples:
        return None

    # Use centroid as map center to stay in-bounds.
    avg_lat = sum(float(s["lat"]) for s in samples) / len(samples)
    avg_lon = sum(float(s["lon"]) for s in samples) / len(samples)

    base = "https://maps.googleapis.com/maps/api/staticmap"
    params: list[str] = [
        f"size={width}x{height}",
        f"center={avg_lat:.5f},{avg_lon:.5f}",
        "scale=2",  # retina
        "maptype=roadmap",
        f"key={GOOGLE_MAPS_API_KEY}",
    ]
    if zoom is not None:
        params.append(f"zoom={zoom}")

    # Polyline of all samples — Google accepts |-delimited lat,lng
    # pairs. URL-length cap is 8KB; downsample if we'd exceed.
    coords = [f"{float(s['lat']):.5f},{float(s['lon']):.5f}" for s in samples]
    if len(coords) > 60:
        # Keep every Nth so the URL stays under cap and the line
        # still traces the path
        step = max(1, len(coords) // 60)
        coords = coords[::step]
    if len(coords) >= 2:
        params.append("path=color:0x4F46E5FF|weight:3|" + "|".join(coords))

    # Start + end markers
    if samples:
        start = samples[0]
        end = samples[-1]
        params.append(
            f"markers=color:green|label:S|"
            f"{float(start['lat']):.5f},{float(start['lon']):.5f}",
        )
        params.append(
            f"markers=color:red|label:E|"
            f"{float(end['lat']):.5f},{float(end['lon']):.5f}",
        )

    return f"{base}?" + "&".join(params)


# ── End-to-end pipeline ─────────────────────────────────────────────

def process_day(user_id: int, day_iso: str) -> dict:
    """Run the full pipeline for one day:
      1. Pull samples
      2. Detect visits
      3. Update clusters + dwell totals
      4. Reverse-geocode any new clusters (capped to 5/day per user)
      5. Build static map URL

    Returns a payload shaped for /api/location/today.
    """
    from db import get_location_samples_for_day

    samples = get_location_samples_for_day(user_id, day_iso)
    visits = detect_visits(samples)
    enriched_visits = update_clusters_from_visits(user_id, visits)

    # Geocode top clusters (bounded)
    geocode_pending_clusters(user_id, max_calls=5)

    # Re-fetch visit place names after geocoding (some may have just
    # been named in this call)
    from db import get_conn
    cluster_ids = [v["cluster_id"] for v in enriched_visits if v.get("cluster_id")]
    if cluster_ids:
        placeholders = ",".join("?" * len(cluster_ids))
        with get_conn() as conn:
            rows = conn.execute(
                f"SELECT id, place_name, place_label FROM location_clusters "
                f"WHERE id IN ({placeholders})",
                cluster_ids,
            ).fetchall()
        cluster_meta = {int(r["id"]): dict(r) for r in rows}
        for v in enriched_visits:
            cid = v.get("cluster_id")
            if cid and cid in cluster_meta:
                v["place_name"] = cluster_meta[cid].get("place_name")
                v["place_label"] = cluster_meta[cid].get("place_label")

    return {
        "samples_count": len(samples),
        "visits":        enriched_visits,
        "map_url":       static_map_url(samples),
        "has_api_key":   bool(GOOGLE_MAPS_API_KEY),
    }
