import type { Ionicons } from '@expo/vector-icons';

export type WorkoutType = 'strength' | 'cardio' | 'mixed';

/** Rough description → type classifier. Matches Flask's type badge affordance. */
export function classifyWorkout(description: string): WorkoutType {
  const d = description.toLowerCase();
  const strength = /\b(lift|bench|squat|deadlift|press|curl|row|pull[-\s]?up|push[-\s]?up|dumbbell|barbell|kettlebell|sets?|reps?)\b/;
  const cardio = /\b(run|jog|bike|cycle|row(?:ing)?|swim|walk|hike|elliptical|treadmill|zone|mile|km|pace|hiit)\b/;
  const s = strength.test(d);
  const c = cardio.test(d);
  if (s && c) return 'mixed';
  if (s) return 'strength';
  return c ? 'cardio' : 'mixed';
}

export function iconForWorkoutType(type: WorkoutType): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'strength': return 'barbell-outline';
    case 'cardio':   return 'walk-outline';
    default:         return 'sparkles-outline';
  }
}

/** Best-effort "3:47 PM" renderer that tolerates Flask's mixed ISO / time-only
 *  logged_at strings. */
export function formatWorkoutTime(isoOrTs: string): string {
  const d = new Date(isoOrTs);
  if (isNaN(d.getTime())) return isoOrTs;
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}
