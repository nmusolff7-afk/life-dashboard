import { Platform } from 'react-native';
import { useCallback, useEffect, useState } from 'react';

import { apiFetch } from '../api';

// Lazy require so bundling doesn't fail if expo-location isn't installed.
type LocationModule = typeof import('expo-location');
let _loc: LocationModule | null | undefined;
function getLoc(): LocationModule | null {
  if (_loc !== undefined) return _loc;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _loc = require('expo-location');
  } catch {
    _loc = null;
  }
  return _loc;
}

export interface LocationStatus {
  /** count of samples synced today (server-side) */
  samples_today: number;
  /** most recent sample we sent up */
  last_sample: { lat: number; lon: number; sampled_at: string } | null;
}

export interface LocationConnectorState {
  available: boolean;
  /** True after the user has granted foreground location permission. */
  permitted: boolean;
  /** Light status from /api/location/today (samples_today + last_sample). */
  status: LocationStatus | null;
  loading: boolean;
  error: string | null;
  /** Request permission, capture one sample now, push to backend. Returns
   * whether permission ended up granted. */
  connect: () => Promise<boolean>;
  /** Capture one foreground sample + post. Quiet on permission denial. */
  sample: () => Promise<void>;
  disconnect: () => Promise<void>;
}

export function useLocationConnector(): LocationConnectorState {
  const loc = getLoc();
  const available = !!loc;
  const [permitted, setPermitted] = useState(false);
  const [status, setStatus] = useState<LocationStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/location/today');
      if (!res.ok) return;
      setStatus(await res.json());
    } catch {
      /* swallow — status is non-critical */
    }
  }, []);

  const checkPermission = useCallback(async () => {
    if (!loc) return;
    try {
      const r = await loc.getForegroundPermissionsAsync();
      setPermitted(r.status === 'granted');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [loc]);

  useEffect(() => {
    if (available) {
      void checkPermission();
      void refreshStatus();
    }
  }, [available, checkPermission, refreshStatus]);

  const sample = useCallback(async () => {
    if (!loc) return;
    setLoading(true);
    setError(null);
    try {
      const r = await loc.getForegroundPermissionsAsync();
      if (r.status !== 'granted') return;
      const pos = await loc.getCurrentPositionAsync({
        accuracy: loc.Accuracy.Balanced,
      });
      await apiFetch('/api/location/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          samples: [{
            lat:        pos.coords.latitude,
            lon:        pos.coords.longitude,
            accuracy_m: pos.coords.accuracy ?? null,
            sampled_at: new Date(pos.timestamp).toISOString(),
            source:     'foreground',
          }],
        }),
      });
      await refreshStatus();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [loc, refreshStatus]);

  const connect = useCallback(async (): Promise<boolean> => {
    if (!loc) {
      setError('Location not available on this device.');
      return false;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await loc.requestForegroundPermissionsAsync();
      const granted = r.status === 'granted';
      setPermitted(granted);
      if (granted) await sample();
      return granted;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [loc, sample]);

  const disconnect = useCallback(async () => {
    // expo-location has no API to programmatically revoke — user goes
    // to Android Settings → Apps → Life Dashboard → Permissions →
    // Location to revoke. We just clear our local state and stop
    // sampling.
    setPermitted(false);
    setStatus(null);
  }, []);

  return { available, permitted, status, loading, error, connect, sample, disconnect };
}

// Platform check helper for callers that want to gate UI.
export const LOCATION_SUPPORTED = Platform.OS === 'android' || Platform.OS === 'ios';
