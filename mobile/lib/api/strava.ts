import { apiFetch } from '../api';

// One Strava split (per-mile or per-km segment with pace/HR/elevation).
// Strava can return either splits_metric or splits_standard depending
// on the activity's measurement preference; both share this shape.
export interface StravaSplit {
  split: number;
  distance: number;          // meters
  elapsed_time: number;      // seconds
  moving_time: number;       // seconds
  average_speed: number;     // m/s
  average_heartrate?: number;
  average_grade_adjusted_speed?: number;
  elevation_difference?: number;
  pace_zone?: number;
}

// HR zone bucket from /activities/{id}/zones — each is a HR-range
// + total seconds spent in that range.
export interface StravaZoneBucket {
  min: number;
  max: number;
  time: number;              // seconds
}

export interface StravaZone {
  type: string;              // 'heartrate' | 'pace' | etc.
  distribution_buckets: StravaZoneBucket[];
  custom_zones?: boolean;
}

export interface StravaActivityDetail {
  user_id: number;
  activity_id: string;
  activity_type: string | null;
  polyline: string | null;
  distance_m: number | null;
  moving_time_s: number | null;
  elapsed_time_s: number | null;
  elevation_gain_m: number | null;
  avg_hr: number | null;
  max_hr: number | null;
  avg_speed_mps: number | null;
  max_speed_mps: number | null;
  avg_watts: number | null;
  fetched_at: string;
  splits: StravaSplit[] | null;
  zones: StravaZone[] | null;
  streams: {
    heartrate?: number[];
    altitude?: number[];
    distance?: number[];      // cumulative distance in meters
  } | null;
  /** Pre-built Google Static Maps URL with the polyline rendered as
   *  the route. Backend builds it server-side so the API key never
   *  reaches the client. Null when polyline is empty or
   *  GOOGLE_MAPS_API_KEY isn't set. */
  map_url: string | null;
}

/** Lazy-fetch detail for a single Strava activity. First call hits
 *  Strava's /activities/{id} + /streams + /zones (~3 API calls,
 *  cached server-side after that). Subsequent calls hit the
 *  strava_activity_detail row instantly. */
export async function fetchStravaActivityDetail(
  activityId: string,
  opts: { refresh?: boolean } = {},
): Promise<StravaActivityDetail> {
  const qs = opts.refresh ? '?refresh=1' : '';
  const res = await apiFetch(`/api/strava/activity/${encodeURIComponent(activityId)}${qs}`);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string; detail?: string };
      detail = body.detail || body.error || '';
    } catch { /* ignore */ }
    throw new Error(`strava activity ${activityId} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as StravaActivityDetail;
}
