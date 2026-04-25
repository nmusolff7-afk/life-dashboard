import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Notifications prefs ──────────────────────────────────────────────────
// Persistence note: stored in AsyncStorage only (device-local). These prefs
// are read by the notification scheduler once push-send infra lands; until
// then they're honored as "what the user wants when we start sending."
// Matches PRD §4.8.8 category taxonomy (Fitness / Nutrition / Finance /
// Life + Account & billing non-disablable).

export type Aggressiveness = 'quiet' | 'balanced' | 'active';

export interface QuietHours {
  /** Master on/off for the quiet-hours window. */
  enabled: boolean;
  /** Start minute-of-day (0..1440). Default 22:00. */
  startMinute: number;
  /** End minute-of-day (0..1440). Default 07:00. Can wrap past midnight. */
  endMinute: number;
  /** When true, critical alerts (e.g. security) still fire during quiet
   *  hours. PRD §4.8.8 default: ON. */
  criticalOverride: boolean;
}

export interface NotificationPrefs {
  aggressiveness: Aggressiveness;
  /** PRD §4.8.8 category taxonomy — one toggle per category of experience.
   *  `accountBilling` is intentionally always-on at the UI level (you can't
   *  disable your own payment failure alerts) — it's stored for
   *  forward-compatibility, always true. */
  categories: {
    fitness: boolean;
    nutrition: boolean;
    finance: boolean;
    life: boolean;
    accountBilling: true;
  };
  /** Hide $ amounts on lock screen (PRD §4.8.8). Default OFF = show. */
  showAmounts: boolean;
  quietHours: QuietHours;
}

const NOTIF_KEY = 'apex.notifications';

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  aggressiveness: 'balanced',
  categories: {
    fitness: true,
    nutrition: true,
    finance: true,
    life: true,
    accountBilling: true,
  },
  showAmounts: true,
  quietHours: {
    enabled: false,
    startMinute: 22 * 60,
    endMinute: 7 * 60,
    criticalOverride: true,
  },
};

/** Legacy migration: users with the pre-§4.8.8 category shape
 *  (mealReminders/goalMilestones/unrepliedEmail/billsDue/workoutPrompt/
 *  weeklySummary) get collapsed into the new taxonomy. Fitness = workouts,
 *  Nutrition = meals, Finance = bills, Life = everything else. */
function migrate(parsed: unknown): NotificationPrefs {
  if (!parsed || typeof parsed !== 'object') return DEFAULT_NOTIFICATIONS;
  const p = parsed as Record<string, unknown>;
  const cats = (p.categories ?? {}) as Record<string, unknown>;
  const has = (k: string) => typeof cats[k] === 'boolean';
  const isNewShape = has('fitness') || has('nutrition') || has('finance') || has('life');
  const categories = isNewShape
    ? {
        fitness: (cats.fitness as boolean | undefined) ?? true,
        nutrition: (cats.nutrition as boolean | undefined) ?? true,
        finance: (cats.finance as boolean | undefined) ?? true,
        life: (cats.life as boolean | undefined) ?? true,
        accountBilling: true as const,
      }
    : {
        fitness: (cats.workoutPrompt as boolean | undefined) ?? true,
        nutrition: (cats.mealReminders as boolean | undefined) ?? true,
        finance: (cats.billsDue as boolean | undefined) ?? true,
        life:
          ((cats.goalMilestones as boolean | undefined) ??
           (cats.unrepliedEmail as boolean | undefined) ??
           (cats.weeklySummary as boolean | undefined)) ??
          true,
        accountBilling: true as const,
      };
  return {
    aggressiveness: (p.aggressiveness as Aggressiveness) ?? DEFAULT_NOTIFICATIONS.aggressiveness,
    categories,
    showAmounts: (p.showAmounts as boolean | undefined) ?? DEFAULT_NOTIFICATIONS.showAmounts,
    quietHours: {
      ...DEFAULT_NOTIFICATIONS.quietHours,
      ...((p.quietHours as Partial<QuietHours>) ?? {}),
    },
  };
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_KEY);
    if (!raw) return DEFAULT_NOTIFICATIONS;
    return migrate(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
}

/** "HH:MM" (24h) for display. */
export function formatQuietHour(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

// ── Privacy (AI-source consent) prefs ────────────────────────────────────

export interface PrivacyPrefs {
  healthkit: boolean;
  healthConnect: boolean;
  plaid: boolean;
  gmail: boolean;
  outlook: boolean;
  calendar: boolean;
  screenTime: boolean;
  location: boolean;
  strava: boolean;
  weather: boolean;
}

const PRIVACY_KEY = 'apex.privacy';

/** AI consent is granted at the time the user connects a source — once
 *  connected, feeding that source's data into AI prompts defaults to ON. The
 *  toggles on this screen exist to let users revoke consent post-connection
 *  without severing the connection itself. */
export const DEFAULT_PRIVACY: PrivacyPrefs = {
  healthkit: true,
  healthConnect: true,
  plaid: true,
  gmail: true,
  outlook: true,
  calendar: true,
  screenTime: true,
  location: true,
  strava: true,
  weather: true,
};

export async function loadPrivacyPrefs(): Promise<PrivacyPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PRIVACY_KEY);
    if (!raw) return DEFAULT_PRIVACY;
    const parsed = JSON.parse(raw) as Partial<PrivacyPrefs>;
    return { ...DEFAULT_PRIVACY, ...parsed };
  } catch {
    return DEFAULT_PRIVACY;
  }
}

export async function savePrivacyPrefs(prefs: PrivacyPrefs): Promise<void> {
  await AsyncStorage.setItem(PRIVACY_KEY, JSON.stringify(prefs));
}
