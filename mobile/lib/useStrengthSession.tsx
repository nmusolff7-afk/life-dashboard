import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { blankExercise, loadTemplate, type StrengthExercise } from './strength';

/** In-flight session state persisted to AsyncStorage so it survives the user
 *  backgrounding / locking the phone mid-workout. Mirrors Flask's `workoutState`
 *  + `timerInterval` pair, but with a top-level React context so the minimize
 *  banner and the full-screen modal stay in sync. */

interface StoredSession {
  exercises: StrengthExercise[];
  startTs: number;
  lastTickTs: number;
}

interface StrengthSessionValue {
  active: boolean;
  exercises: StrengthExercise[];
  startTs: number | null;
  lastTickTs: number | null;
  modalVisible: boolean;

  /** Start a fresh session (pre-fills from saved template if one exists). */
  start: () => Promise<void>;
  /** Tear down — called on Save & Log or Discard. */
  end: () => Promise<void>;
  /** Hide the modal without ending the session. Banner appears. */
  minimize: () => void;
  /** Reopen the modal. If called with no active session, starts one. */
  maximize: () => void;

  setExercises: (ex: StrengthExercise[]) => void;
  /** Reset rest timer (call every time a set is checked/unchecked). */
  tickRest: () => void;
}

const StrengthSessionContext = createContext<StrengthSessionValue | null>(null);

const STORAGE_KEY = 'apex.strength.session';

async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      !Array.isArray(parsed.exercises) ||
      typeof parsed.startTs !== 'number' ||
      typeof parsed.lastTickTs !== 'number'
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function saveSession(s: StoredSession): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // storage can transiently fail; session is still in memory
  }
}

async function clearSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function StrengthSessionProvider({ children }: { children: ReactNode }) {
  const [exercises, setExercisesState] = useState<StrengthExercise[]>([]);
  const [startTs, setStartTs] = useState<number | null>(null);
  const [lastTickTs, setLastTickTs] = useState<number | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  // Hydrate from AsyncStorage once on mount so a foregrounded app resumes
  // exactly where it left off.
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    loadSession().then((s) => {
      if (!s) return;
      setExercises(s.exercises);
      setStartTs(s.startTs);
      setLastTickTs(s.lastTickTs);
      // Don't auto-open the modal — just leave the banner visible so the user
      // notices the active session and can tap to return.
    });
  }, []);

  // Persist on every material change.
  useEffect(() => {
    if (startTs == null || lastTickTs == null) return;
    saveSession({ exercises, startTs, lastTickTs });
  }, [exercises, startTs, lastTickTs]);

  const setExercises = useCallback((ex: StrengthExercise[]) => {
    setExercisesState(ex);
  }, []);

  const tickRest = useCallback(() => {
    setLastTickTs(Date.now());
  }, []);

  const start = useCallback(async () => {
    const template = await loadTemplate();
    const seed = template && template.length > 0 ? template : [blankExercise()];
    const now = Date.now();
    setExercisesState(seed);
    setStartTs(now);
    setLastTickTs(now);
    setModalVisible(true);
  }, []);

  const end = useCallback(async () => {
    setExercisesState([]);
    setStartTs(null);
    setLastTickTs(null);
    setModalVisible(false);
    await clearSession();
  }, []);

  const minimize = useCallback(() => setModalVisible(false), []);
  const maximize = useCallback(() => {
    if (startTs == null) {
      // Defensive: if somehow called with no active session, kick off a new one.
      void start();
      return;
    }
    setModalVisible(true);
  }, [startTs, start]);

  const value: StrengthSessionValue = {
    active: startTs != null,
    exercises,
    startTs,
    lastTickTs,
    modalVisible,
    start,
    end,
    minimize,
    maximize,
    setExercises,
    tickRest,
  };

  return <StrengthSessionContext.Provider value={value}>{children}</StrengthSessionContext.Provider>;
}

export function useStrengthSession(): StrengthSessionValue {
  const ctx = useContext(StrengthSessionContext);
  if (!ctx) throw new Error('useStrengthSession must be used inside StrengthSessionProvider');
  return ctx;
}
