import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

/**
 * HealthKit / Health Connect connection state — scaffolding only.
 *
 * v1 stub: AsyncStorage-persisted boolean per-user, per-platform, with a
 * "connected since" timestamp. No actual native HealthKit permission
 * request yet — that requires `react-native-health` (iOS) or
 * `expo-health-connect` (Android) plus a prebuild, which is a Phase 7+
 * infra lift.
 *
 * What this hook does today:
 *  - Records that the user has "granted" Sleep/Recovery data access
 *  - Gates the Sleep + Recovery subsystem empty-state vs. "syncing…" copy
 *  - Gives the scoring engine a single place to learn when to include
 *    HealthKit-dependent signals (Phase 7 wire-through: pass
 *    connected=true to /api/score/fitness so Sleep/Recovery subsystems
 *    switch from null to pending)
 *
 * What it does NOT do yet:
 *  - Does not request actual HealthKit permission
 *  - Does not read any real sleep/HRV samples
 *  - Connecting = marking the flag true; disconnecting = marking it false
 */

export type HealthPlatform = 'healthkit' | 'health-connect';

interface StoredState {
  connected: boolean;
  connectedAt: string | null;
}

const DEFAULT_STATE: StoredState = { connected: false, connectedAt: null };

function storageKey(platform: HealthPlatform): string {
  return `apex.health.${platform}`;
}

/** The platform this device would natively use — iOS → HealthKit,
 *  Android → Health Connect. Others (web) → null, so the Settings screen
 *  can hide the row. */
export function devicePlatformKey(): HealthPlatform | null {
  if (Platform.OS === 'ios') return 'healthkit';
  if (Platform.OS === 'android') return 'health-connect';
  return null;
}

export interface HealthConnectionState {
  loading: boolean;
  connected: boolean;
  connectedAt: string | null;
  /** Returns the platform this device supports — useful for UI copy. */
  platform: HealthPlatform | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refetch: () => Promise<void>;
}

export function useHealthConnection(platform?: HealthPlatform): HealthConnectionState {
  const effectivePlatform = platform ?? devicePlatformKey();
  const [state, setState] = useState<StoredState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!effectivePlatform) {
      setState(DEFAULT_STATE);
      setLoading(false);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(storageKey(effectivePlatform));
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        setState({
          connected: Boolean(parsed.connected),
          connectedAt: parsed.connectedAt ?? null,
        });
      } else {
        setState(DEFAULT_STATE);
      }
    } catch {
      setState(DEFAULT_STATE);
    } finally {
      setLoading(false);
    }
  }, [effectivePlatform]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const connect = useCallback(async () => {
    if (!effectivePlatform) return;
    const next: StoredState = { connected: true, connectedAt: new Date().toISOString() };
    await AsyncStorage.setItem(storageKey(effectivePlatform), JSON.stringify(next));
    setState(next);
  }, [effectivePlatform]);

  const disconnect = useCallback(async () => {
    if (!effectivePlatform) return;
    await AsyncStorage.setItem(
      storageKey(effectivePlatform),
      JSON.stringify(DEFAULT_STATE),
    );
    setState(DEFAULT_STATE);
  }, [effectivePlatform]);

  return {
    loading,
    connected: state.connected,
    connectedAt: state.connectedAt,
    platform: effectivePlatform,
    connect,
    disconnect,
    refetch,
  };
}
