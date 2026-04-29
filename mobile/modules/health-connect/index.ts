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
 *  HealthPermission strings the SDK expects.
 *
 *  2026-04-28 §14.5.2 expansion: added READ_EXERCISE (so we can
 *  pull ExerciseSessionRecord — the path for Garmin / Pixel Watch
 *  / Fitbit activities to flow through HC into the app). Sleep
 *  stages reuse the existing READ_SLEEP scope. */
export const HC_READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_EXERCISE',
];

export interface DailyAggregates {
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  active_kcal: number | null;
}

/** One ExerciseSessionRecord from Health Connect — every running /
 *  cycling / weight-training session a wearable wrote to HC. The
 *  `exercise_type` is an int code; consumers map to a label via
 *  the EXERCISE_TYPE_LABEL table. */
export interface WorkoutSegment {
  start_iso: string;
  end_iso: string;
  duration_min: number;
  exercise_type: number;
  title: string;
  notes: string;
}

/** Per-stage sleep minutes for the most-recent night. `total` is
 *  the session length; the per-stage values sum to total when the
 *  wearable supplies stage detail (and are zero when only total
 *  duration was reported). */
export interface SleepStages {
  total: number;
  awake: number;
  light: number;
  deep: number;
  rem: number;
}

/** Subset of HC's ExerciseSessionRecord type codes. Full list:
 *  https://developer.android.com/reference/androidx/health/connect/client/records/ExerciseSessionRecord
 *  We map the common ones here; unknown codes fall through to
 *  "Workout" in the consumer. */
export const EXERCISE_TYPE_LABEL: Record<number, string> = {
  0:  'Other',
  2:  'Badminton',
  4:  'Baseball',
  5:  'Basketball',
  8:  'Biking',
  9:  'Biking (stationary)',
  10: 'Boot camp',
  11: 'Boxing',
  13: 'Calisthenics',
  14: 'Cricket',
  16: 'Dancing',
  25: 'Elliptical',
  26: 'Exercise class',
  27: 'Fencing',
  28: 'Football (American)',
  29: 'Football (Australian)',
  31: 'Frisbee',
  32: 'Golf',
  33: 'Guided breathing',
  34: 'Gymnastics',
  35: 'Handball',
  36: 'High-intensity interval training',
  37: 'Hiking',
  38: 'Ice hockey',
  39: 'Ice skating',
  44: 'Martial arts',
  46: 'Paddling',
  48: 'Paragliding',
  49: 'Pilates',
  50: 'Racquetball',
  51: 'Rock climbing',
  52: 'Roller hockey',
  53: 'Rowing',
  54: 'Rowing machine',
  55: 'Rugby',
  56: 'Running',
  57: 'Running (treadmill)',
  58: 'Sailing',
  59: 'Scuba diving',
  60: 'Skating',
  61: 'Skiing',
  62: 'Snowboarding',
  63: 'Snowshoeing',
  64: 'Soccer',
  65: 'Softball',
  66: 'Squash',
  68: 'Stair climbing',
  69: 'Stair climbing machine',
  70: 'Strength training',
  71: 'Stretching',
  72: 'Surfing',
  73: 'Swimming (open water)',
  74: 'Swimming (pool)',
  75: 'Table tennis',
  76: 'Tennis',
  78: 'Volleyball',
  79: 'Walking',
  80: 'Water polo',
  81: 'Weightlifting',
  82: 'Wheelchair',
  83: 'Yoga',
};

export function exerciseTypeLabel(code: number): string {
  return EXERCISE_TYPE_LABEL[code] ?? 'Workout';
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

  /** Reads ExerciseSessionRecord rows for the date. Each is one
   *  workout/activity session written by a wearable's companion
   *  app (Garmin / Pixel Watch / Fitbit). Empty list when no
   *  sessions or no READ_EXERCISE permission. */
  readWorkoutSegments(dateIso: string): Promise<WorkoutSegment[]>;

  /** Reads SleepSessionRecord stage breakdown for the night
   *  ENDING on dateIso — the window covers the prior evening
   *  through morning. `total` is the session length; the per-
   *  stage values sum to total when the wearable supplied stage
   *  detail (zero when only total duration was reported). */
  readSleepStages(dateIso: string): Promise<SleepStages>;
}

const HealthConnect = requireNativeModule<HealthConnectModuleType>('HealthConnect');
export default HealthConnect;
