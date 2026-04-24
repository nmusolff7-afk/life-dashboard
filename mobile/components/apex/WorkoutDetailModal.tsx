import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Workout } from '../../../shared/src/types/home';
import { deleteWorkout } from '../../lib/api/fitness';
import { classifyAsCardio, estimateCardioDuration } from '../../lib/cardioHelpers';
import { parseDescription as parseStrengthDescription } from '../../lib/strengthHelpers';
import { useTokens } from '../../lib/theme';
import { WorkoutEditSheet } from './WorkoutEditSheet';

interface Props {
  workout: Workout | null;
  onClose: () => void;
  onChanged: () => void;
}

interface ParsedSet {
  exercise_name: string;
  set_number: number;
  weight_lbs: number | null;
  reps: number;
  rpe: number | null;
}

/** Parse the workout description into display-ready strength sets and
 *  cardio stats. Mirrors the server's strength_parser.py enough to show
 *  rich metrics without a round-trip. */
function parseAllSets(description: string): ParsedSet[] {
  const SETS_REPS_AT = /([A-Za-z][A-Za-z0-9\- ]+?)\s+(\d+)\s*[x×]\s*(\d+)(?:\s*(?:@|at)\s*(\d+(?:\.\d+)?)(?:\s*(kg|lbs?))?)?(?:\s*(?:@|,)?\s*rpe\s*(\d+(?:\.\d+)?))?/gi;
  const out: ParsedSet[] = [];
  let match;
  while ((match = SETS_REPS_AT.exec(description)) !== null) {
    const name = match[1].trim().replace(/^(?:and|then|&)\s+/i, '').replace(/[,;:\s]+$/, '').trim();
    const sets = parseInt(match[2], 10);
    const reps = parseInt(match[3], 10);
    const rawWeight = match[4] ? parseFloat(match[4]) : 0;
    const unit = (match[5] || '').toLowerCase();
    const weightLbs = unit.startsWith('kg') ? rawWeight * 2.20462 : rawWeight;
    const rpe = match[6] ? parseFloat(match[6]) : null;
    if (sets > 0 && sets < 20 && reps > 0 && reps < 500) {
      for (let i = 0; i < sets; i++) {
        out.push({
          exercise_name: name,
          set_number: i + 1,
          weight_lbs: weightLbs > 0 ? Math.round(weightLbs * 10) / 10 : null,
          reps,
          rpe: rpe != null && rpe >= 1 && rpe <= 10 ? rpe : null,
        });
      }
    }
  }
  return out;
}

function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function WorkoutDetailModal({ workout, onClose, onChanged }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [editing, setEditing] = useState(false);

  const description = workout?.description ?? '';
  const isCardio = useMemo(() => classifyAsCardio(description), [description]);
  const sets = useMemo(() => (isCardio ? [] : parseAllSets(description)), [description, isCardio]);
  const strengthSummary = useMemo(() => parseStrengthDescription(description), [description]);

  if (!workout) return null;

  // Group strength sets by exercise for display.
  const byExercise = new Map<string, ParsedSet[]>();
  sets.forEach((s) => {
    const arr = byExercise.get(s.exercise_name);
    if (arr) arr.push(s);
    else byExercise.set(s.exercise_name, [s]);
  });

  const cardioMins = isCardio ? estimateCardioDuration(description) : 0;
  const mileMatch = description.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles)\b/i);
  const kmMatch = description.match(/(\d+(?:\.\d+)?)\s*km\b/i);
  const miles = mileMatch ? parseFloat(mileMatch[1]) : kmMatch ? +(parseFloat(kmMatch[1]) * 0.621371).toFixed(2) : null;
  const pace = isCardio && cardioMins > 0 && miles && miles > 0
    ? `${(cardioMins / miles).toFixed(1)} min/mi`
    : null;

  const handleDelete = () => {
    Alert.alert(
      'Delete workout?',
      'This removes the logged workout and any parsed sets.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteWorkout(workout.id);
              onChanged();
              onClose();
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={workout !== null}
      onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: t.bg, paddingTop: insets.top }]}>
        <View style={[styles.header, { borderBottomColor: t.border }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={t.text} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: t.text }]} numberOfLines={1}>
            {isCardio ? 'Cardio session' : 'Strength session'}
          </Text>
          <Pressable onPress={() => setEditing(true)} hitSlop={10}>
            <Ionicons name="create-outline" size={22} color={t.accent} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}>
          {/* Hero description */}
          <View style={[styles.heroCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.heroWhen, { color: t.muted }]}>
              {formatDateTime(workout.logged_at)}
            </Text>
            <Text style={[styles.heroDesc, { color: t.text }]}>{description}</Text>
            <View style={[styles.kcalChip, { backgroundColor: t.surface2 }]}>
              <Ionicons name="flame-outline" size={14} color={t.fitness} />
              <Text style={[styles.kcalValue, { color: t.text }]}>
                {workout.calories_burned ?? 0}
              </Text>
              <Text style={[styles.kcalUnit, { color: t.muted }]}>kcal</Text>
            </View>
          </View>

          {/* Strength: derived metrics + per-set breakdown */}
          {!isCardio && sets.length > 0 ? (
            <>
              <View style={[styles.metricCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.cardTitle, { color: t.muted }]}>Session metrics</Text>
                <View style={styles.metricGrid}>
                  <MetricCell label="Exercises" value={String(byExercise.size)} />
                  <MetricCell label="Total sets" value={String(strengthSummary.totalSets)} />
                  <MetricCell
                    label="Total reps"
                    value={String(sets.reduce((s, r) => s + r.reps, 0))}
                  />
                  <MetricCell
                    label="Volume"
                    value={strengthSummary.estimatedVolume.toLocaleString()}
                    unit="lbs"
                  />
                  <MetricCell
                    label="Top weight"
                    value={strengthSummary.topWeight > 0 ? String(strengthSummary.topWeight) : '—'}
                    unit="lbs"
                  />
                  <MetricCell
                    label="Avg RPE"
                    value={(() => {
                      const rpes = sets.filter((s) => s.rpe != null).map((s) => s.rpe!);
                      return rpes.length > 0
                        ? (rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1)
                        : '—';
                    })()}
                  />
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.cardTitle, { color: t.muted }]}>Exercises</Text>
                {Array.from(byExercise.entries()).map(([name, rows]) => {
                  const volume = rows.reduce(
                    (s, r) => s + (r.weight_lbs ?? 0) * r.reps,
                    0,
                  );
                  const top = Math.max(...rows.map((r) => r.weight_lbs ?? 0));
                  return (
                    <View key={name} style={[styles.exerciseBlock, { borderBottomColor: t.border }]}>
                      <View style={styles.exerciseHeader}>
                        <Text style={[styles.exerciseName, { color: t.text }]} numberOfLines={1}>
                          {name}
                        </Text>
                        <Text style={[styles.exerciseMeta, { color: t.muted }]}>
                          {rows.length} sets
                          {top > 0 ? ` · top ${top} lbs` : ''}
                          {volume > 0 ? ` · ${Math.round(volume).toLocaleString()} lbs volume` : ''}
                        </Text>
                      </View>
                      <View style={styles.setRow}>
                        {rows.map((r, i) => (
                          <View key={i} style={[styles.setChip, { backgroundColor: t.surface2 }]}>
                            <Text style={[styles.setChipValue, { color: t.text }]}>
                              {r.weight_lbs != null ? `${r.weight_lbs}×${r.reps}` : `BW×${r.reps}`}
                            </Text>
                            {r.rpe != null ? (
                              <Text style={[styles.setChipRpe, { color: t.muted }]}>
                                @{r.rpe}
                              </Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Cardio: distance/duration/pace + placeholder for HR zones */}
          {isCardio ? (
            <>
              <View style={[styles.metricCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.cardTitle, { color: t.muted }]}>Session metrics</Text>
                <View style={styles.metricGrid}>
                  <MetricCell
                    label="Duration"
                    value={cardioMins > 0 ? String(cardioMins) : '—'}
                    unit="min"
                  />
                  <MetricCell
                    label="Distance"
                    value={miles != null ? miles.toFixed(2) : '—'}
                    unit="mi"
                  />
                  <MetricCell label="Pace" value={pace ?? '—'} />
                  <MetricCell
                    label="Calories"
                    value={String(workout.calories_burned ?? 0)}
                    unit="kcal"
                  />
                </View>
              </View>

              <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.cardTitle, { color: t.muted }]}>Heart rate zones</Text>
                <Text style={[styles.placeholder, { color: t.muted }]}>
                  Connect Apple Health or Strava to see zone breakdown and
                  heart-rate timeline for this session.
                </Text>
              </View>

              <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
                <Text style={[styles.cardTitle, { color: t.muted }]}>Route</Text>
                <Text style={[styles.placeholder, { color: t.muted }]}>
                  Map + GPS trace available once Strava sync is wired.
                </Text>
              </View>
            </>
          ) : null}

          {/* Unparseable — fallback view so the modal still reads */}
          {!isCardio && sets.length === 0 ? (
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>Session</Text>
              <Text style={[styles.placeholder, { color: t.muted }]}>
                Couldn't auto-parse set/rep structure from this description.
                Tap the pencil icon in the header to edit and make it more
                explicit (e.g. "bench 3x8 @ 185"), or leave it as a freestyle
                log.
              </Text>
            </View>
          ) : null}

          {/* Danger zone */}
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.deleteBtn,
              {
                backgroundColor: pressed ? t.danger : 'rgba(255,77,77,0.08)',
                borderColor: t.danger,
              },
            ]}>
            <Ionicons name="trash-outline" size={14} color={t.danger} />
            <Text style={[styles.deleteLabel, { color: t.danger }]}>Delete workout</Text>
          </Pressable>
        </ScrollView>

        {/* Edit sheet reuses the existing component for consistency */}
        <WorkoutEditSheet
          workout={editing ? workout : null}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      </View>
    </Modal>
  );
}

function MetricCell({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const t = useTokens();
  return (
    <View style={styles.metricCell}>
      <Text style={[styles.metricLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: t.text }]}>
        {value}
        {unit ? <Text style={[styles.metricUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 14,
  },
  backBtn: { width: 28, alignItems: 'flex-start' },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12 },

  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  heroWhen: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  heroDesc: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
  kcalChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  kcalValue: { fontSize: 13, fontWeight: '700' },
  kcalUnit: { fontSize: 11 },

  metricCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metricCell: {
    width: '33.33%',
    paddingVertical: 8,
    gap: 2,
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricValue: { fontSize: 17, fontWeight: '700' },
  metricUnit: { fontSize: 11, fontWeight: '500' },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  placeholder: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },

  exerciseBlock: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  exerciseHeader: { gap: 2 },
  exerciseName: { fontSize: 14, fontWeight: '700' },
  exerciseMeta: { fontSize: 11 },
  setRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 100,
  },
  setChipValue: { fontSize: 12, fontWeight: '700' },
  setChipRpe: { fontSize: 10, fontWeight: '500' },

  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 12,
  },
  deleteLabel: { fontSize: 13, fontWeight: '600' },
});
