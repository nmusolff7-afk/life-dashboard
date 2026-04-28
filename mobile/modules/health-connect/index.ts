// Local Expo module: thin TS wrapper over our custom Kotlin
// HealthConnectModule. The interface mirrors the upstream
// react-native-health-connect API closely enough that consumers
// (currently just useHealthData.ts) only see the names of the
// methods.

import { requireNativeModule } from 'expo-modules-core';

/** SDK availability status, mirrors HealthConnectClient.getSdkStatus():
 *  1 = SDK_UNAVAILABLE (provider package not installed)
 *  2 = SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED (HC app too old)
 *  3 = SDK_AVAILABLE
 */
export const SDK_UNAVAILABLE = 1;
export const SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED = 2;
export const SDK_AVAILABLE = 3;

/** Health Connect record types we can read. Strings match the
 *  AndroidX class names. */
export type HCRecordType =
  | 'Steps'
  | 'SleepSession'
  | 'HeartRate'
  | 'HeartRateVariabilityRmssd'
  | 'ActiveCaloriesBurned';

/** Permission strings — Health Connect uses the form
 *  `android.permission.health.READ_<RECORD>`. We pass the AndroidX
 *  HealthPermission strings the SDK expects. */
export const HC_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
];

export interface DailyAggregates {
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  active_kcal: number | null;
}

interface HealthConnectModuleType {
  /** Synchronous SDK availability check. Returns one of the
   *  SDK_* constants. */
  getSdkStatus(): number;

  /** Opens the Health Connect app's settings (or its main page if
   *  the dedicated settings intent isn't recognized). Fire-and-forget
   *  — user navigates back to our app on their own. */
  openHealthConnectSettings(): void;

  /** Returns the list of permission strings currently granted to
   *  this app. */
  getGrantedPermissions(): Promise<string[]>;

  /** Triggers Health Connect's system permission sheet for the given
   *  permissions. Resolves with the subset of those that the user
   *  granted. The call ALSO causes our app to appear in HC's app
   *  list — first successful invocation registers us with the
   *  PermissionController. */
  requestPermissions(perms: string[]): Promise<string[]>;

  /** Reads + aggregates the day's records into a single map. Date
   *  is `YYYY-MM-DD` in the user's local timezone. Missing record
   *  types (no permission, or no data) come back as null fields,
   *  not errors. */
  readDailyAggregates(dateIso: string): Promise<DailyAggregates>;
}

const HealthConnect = requireNativeModule<HealthConnectModuleType>('HealthConnect');
export default HealthConnect;
