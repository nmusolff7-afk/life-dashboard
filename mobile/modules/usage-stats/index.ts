// Local Expo module: thin TS wrapper over our custom Kotlin
// UsageStatsModule. Exposes three methods that mirror the native
// definition.

import { requireNativeModule } from 'expo-modules-core';

export interface DailyAppUsage {
  /** Android package name, e.g. "com.instagram.android". */
  package: string;
  /** User-facing app label, e.g. "Instagram". Falls back to package
   *  when PackageManager can't resolve a label (rare). */
  label: string;
  minutes: number;
}

export interface DailyStats {
  total_minutes: number;
  /** Sorted descending by minutes; top 10 returned. */
  top_apps: DailyAppUsage[];
}

interface UsageStatsModuleType {
  /** Cheap AppOps check. True iff user has toggled this app on in
   *  Settings → Apps → Special access → Usage access. */
  hasPermission(): boolean;
  /** Opens system Settings to the Usage Access page (fire-and-forget;
   *  user has to come back to the app on their own). */
  openUsageAccessSettings(): void;
  /** Aggregates daily usage from UsageStatsManager.INTERVAL_DAILY for
   *  the local-day specified by dateIso (YYYY-MM-DD). System packages
   *  (launcher, system UI, settings) are filtered out, as is our own
   *  package — users don't want to see "Life Dashboard: 4 hours" in
   *  their own screen-time card. */
  queryDailyStats(dateIso: string): Promise<DailyStats>;
}

const UsageStats = requireNativeModule<UsageStatsModuleType>('UsageStats');
export default UsageStats;
