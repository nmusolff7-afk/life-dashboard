import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Notifications prefs ──────────────────────────────────────────────────

export type Aggressiveness = 'quiet' | 'balanced' | 'active';

export interface NotificationPrefs {
  aggressiveness: Aggressiveness;
  categories: {
    mealReminders: boolean;
    goalMilestones: boolean;
    unrepliedEmail: boolean;
    billsDue: boolean;
    workoutPrompt: boolean;
    weeklySummary: boolean;
  };
}

const NOTIF_KEY = 'apex.notifications';

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  aggressiveness: 'balanced',
  categories: {
    mealReminders: true,
    goalMilestones: true,
    unrepliedEmail: true,
    billsDue: true,
    workoutPrompt: true,
    weeklySummary: true,
  },
};

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(NOTIF_KEY);
    if (!raw) return DEFAULT_NOTIFICATIONS;
    const parsed = JSON.parse(raw) as Partial<NotificationPrefs>;
    return {
      ...DEFAULT_NOTIFICATIONS,
      ...parsed,
      categories: {
        ...DEFAULT_NOTIFICATIONS.categories,
        ...(parsed.categories ?? {}),
      },
    };
  } catch {
    return DEFAULT_NOTIFICATIONS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(NOTIF_KEY, JSON.stringify(prefs));
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

/** PRD §3.5 / §6.4 — every source defaults to OFF. User explicitly opts in. */
export const DEFAULT_PRIVACY: PrivacyPrefs = {
  healthkit: false,
  healthConnect: false,
  plaid: false,
  gmail: false,
  outlook: false,
  calendar: false,
  screenTime: false,
  location: false,
  strava: false,
  weather: false,
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
