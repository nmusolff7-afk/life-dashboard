import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StrengthSet {
  completed: boolean;
  weight: string; // kept as string so TextInput state doesn't fight the user
  reps: string;
}

export interface StrengthExercise {
  name: string;
  sets: StrengthSet[];
}

const TEMPLATE_KEY = 'apex.strength.template';

/** The last session's exercise list, used to pre-fill the tracker on open so
 *  users don't have to retype their plan each time. Mirrors Flask's
 *  localStorage `weeklyPlan` pattern (templates/index.html:6000s). */
export async function loadTemplate(): Promise<StrengthExercise[] | null> {
  try {
    const raw = await AsyncStorage.getItem(TEMPLATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StrengthExercise[];
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveTemplate(exercises: StrengthExercise[]): Promise<void> {
  // Persist clean weights/reps but clear the completed flags so next session
  // starts fresh.
  const cleaned = exercises.map((ex) => ({
    name: ex.name,
    sets: ex.sets.map((s) => ({ completed: false, weight: s.weight, reps: s.reps })),
  }));
  await AsyncStorage.setItem(TEMPLATE_KEY, JSON.stringify(cleaned));
}

/** Build the single descriptive string Flask expects in workout_logs.description.
 *  Matches Flask's description format:
 *    "Strength workout (23 min): Bench: 3/3 sets (135x8, 135x8, 135x7); Squat: 2/3 sets (185x5, 185x5)"
 */
export function buildWorkoutDescription(
  exercises: StrengthExercise[],
  durationSec: number,
): string {
  const minutes = Math.max(1, Math.round(durationSec / 60));
  const parts: string[] = [];
  for (const ex of exercises) {
    const done = ex.sets.filter((s) => s.completed);
    if (done.length === 0) continue;
    const setStrs = done.map((s) => {
      const w = s.weight.trim();
      const r = s.reps.trim();
      if (w && r) return `${w}x${r}`;
      if (w) return `${w} lbs`;
      if (r) return `${r} reps`;
      return '';
    }).filter(Boolean);
    parts.push(`${ex.name}: ${done.length}/${ex.sets.length} sets${setStrs.length ? ` (${setStrs.join(', ')})` : ''}`);
  }
  if (parts.length === 0) return `Strength workout (${minutes} min)`;
  return `Strength workout (${minutes} min): ${parts.join('; ')}`;
}

export function formatTimer(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Starter exercise block for a brand-new session when no template exists. */
export function blankExercise(name = 'Exercise 1'): StrengthExercise {
  return {
    name,
    sets: [blankSet(), blankSet(), blankSet()],
  };
}

export function blankSet(): StrengthSet {
  return { completed: false, weight: '', reps: '' };
}
