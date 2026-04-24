import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DayName, WorkoutPlanQuiz } from '../../../../shared/src/types/plan';
import { generateWorkoutPlan } from '../../../lib/api/plan';
import { useHaptics } from '../../../lib/useHaptics';
import { useTokens } from '../../../lib/theme';

const ALL_DAYS: DayName[] = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
];

const GOALS = [
  { key: 'build_muscle', label: 'Build muscle' },
  { key: 'lose_weight', label: 'Lose weight' },
  { key: 'recomp', label: 'Recomp' },
  { key: 'maintain', label: 'Maintain' },
] as const;

const EXPERIENCE = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
] as const;

const SESSION_LENGTHS = [
  { key: 'under_30', label: '< 30 min' },
  { key: '30_to_60', label: '30–60' },
  { key: '60_to_90', label: '60–90' },
  { key: '90_plus', label: '90+' },
] as const;

const EQUIPMENT = [
  'Full gym',
  'Home gym',
  'Dumbbells only',
  'Bands',
  'Bodyweight only',
];

type SessionLength = typeof SESSION_LENGTHS[number]['key'];
type Goal = typeof GOALS[number]['key'];
type Experience = typeof EXPERIENCE[number]['key'];

type Step = 'days' | 'goal' | 'experience' | 'session' | 'equipment' | 'focus' | 'injuries' | 'review';

/** Workout Builder (PRD §4.3.10). Guided flow that collects the quiz
 *  payload for /api/workout-plan/generate. Each step is tappable chip
 *  / pill selection; Focus + Injuries are free-text. Review page shows
 *  the summary before the AI generate call (which takes a few seconds
 *  because Haiku is called). */
export default function WorkoutBuilder() {
  const t = useTokens();
  const router = useRouter();
  const haptics = useHaptics();

  const [step, setStep] = useState<Step>('days');
  const [trainingDays, setTrainingDays] = useState<DayName[]>(['Monday', 'Wednesday', 'Friday']);
  const [goal, setGoal] = useState<Goal>('build_muscle');
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [sessionLength, setSessionLength] = useState<SessionLength>('30_to_60');
  const [equipment, setEquipment] = useState<string[]>(['Full gym']);
  const [focus, setFocus] = useState('');
  const [injuries, setInjuries] = useState('');
  const [generating, setGenerating] = useState(false);

  const toggleDay = (d: DayName) => {
    haptics.fire('tap');
    setTrainingDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]);
  };

  const toggleEquipment = (e: string) => {
    haptics.fire('tap');
    setEquipment((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]);
  };

  const STEPS: Step[] = ['days', 'goal', 'experience', 'session', 'equipment', 'focus', 'injuries', 'review'];
  const idx = STEPS.indexOf(step);

  const next = () => {
    haptics.fire('tap');
    const i = STEPS.indexOf(step);
    if (i < STEPS.length - 1) setStep(STEPS[i + 1]);
  };
  const back = () => {
    haptics.fire('tap');
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
    else router.back();
  };

  const handleGenerate = async () => {
    haptics.fire('tap');
    const quiz: WorkoutPlanQuiz = {
      goal,
      experience,
      schedule: { daysPerWeek: trainingDays.length, trainingDays },
      sessionLength,
      equipment,
      preferredFocus: focus.trim() ? focus.split(',').map((s) => s.trim()).filter(Boolean) : [],
      physicalConstraints: injuries.trim() || null,
    };
    setGenerating(true);
    try {
      await generateWorkoutPlan(quiz);
      haptics.fire('success');
      router.replace('/fitness/plan' as never);
    } catch (e) {
      haptics.fire('error');
      Alert.alert('Generation failed', e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Build a plan' }} />
      <View style={[styles.progressBar, { backgroundColor: t.surface2 }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: t.accent, width: `${((idx + 1) / STEPS.length) * 100}%` },
          ]}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'days' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Which days will you train?</Text>
            <Text style={[styles.sub, { color: t.muted }]}>
              Pick the days of the week that fit your schedule. You can train 1–7 days.
            </Text>
            <View style={styles.chipRow}>
              {ALL_DAYS.map((d) => (
                <Chip
                  key={d}
                  label={d.slice(0, 3)}
                  active={trainingDays.includes(d)}
                  onPress={() => toggleDay(d)}
                />
              ))}
            </View>
            <Text style={[styles.footNote, { color: t.subtle }]}>
              {trainingDays.length} day{trainingDays.length === 1 ? '' : 's'}/week
            </Text>
          </>
        ) : null}

        {step === 'goal' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Primary goal</Text>
            <View style={styles.chipRow}>
              {GOALS.map((g) => (
                <Chip
                  key={g.key}
                  label={g.label}
                  active={goal === g.key}
                  onPress={() => { haptics.fire('tap'); setGoal(g.key); }}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 'experience' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Experience level</Text>
            <View style={styles.chipRow}>
              {EXPERIENCE.map((e) => (
                <Chip
                  key={e.key}
                  label={e.label}
                  active={experience === e.key}
                  onPress={() => { haptics.fire('tap'); setExperience(e.key); }}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 'session' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Session length</Text>
            <Text style={[styles.sub, { color: t.muted }]}>
              Time per workout. Longer sessions get more exercises per day.
            </Text>
            <View style={styles.chipRow}>
              {SESSION_LENGTHS.map((s) => (
                <Chip
                  key={s.key}
                  label={s.label}
                  active={sessionLength === s.key}
                  onPress={() => { haptics.fire('tap'); setSessionLength(s.key); }}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 'equipment' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Equipment available</Text>
            <View style={styles.chipRow}>
              {EQUIPMENT.map((e) => (
                <Chip
                  key={e}
                  label={e}
                  active={equipment.includes(e)}
                  onPress={() => toggleEquipment(e)}
                />
              ))}
            </View>
          </>
        ) : null}

        {step === 'focus' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Preferred focus</Text>
            <Text style={[styles.sub, { color: t.muted }]}>
              Exercises or muscle groups you want prioritized. Comma-separated. Leave blank for a
              balanced plan.
            </Text>
            <TextInput
              value={focus}
              onChangeText={setFocus}
              placeholder="e.g. bench press, pull-ups, glutes"
              placeholderTextColor={t.subtle}
              multiline
              style={[
                styles.input,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />
          </>
        ) : null}

        {step === 'injuries' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Injuries or limitations</Text>
            <Text style={[styles.sub, { color: t.muted }]}>
              Anything the plan should avoid or substitute. Leave blank if none.
            </Text>
            <TextInput
              value={injuries}
              onChangeText={setInjuries}
              placeholder="e.g. no barbell squat (knee), avoid overhead press"
              placeholderTextColor={t.subtle}
              multiline
              style={[
                styles.input,
                { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
              ]}
            />
          </>
        ) : null}

        {step === 'review' ? (
          <>
            <Text style={[styles.heading, { color: t.text }]}>Review</Text>
            <ReviewRow label="Days" value={`${trainingDays.length}/wk · ${trainingDays.map((d) => d.slice(0, 3)).join(', ')}`} />
            <ReviewRow label="Goal" value={GOALS.find((g) => g.key === goal)?.label ?? goal} />
            <ReviewRow label="Experience" value={EXPERIENCE.find((e) => e.key === experience)?.label ?? experience} />
            <ReviewRow label="Session length" value={SESSION_LENGTHS.find((s) => s.key === sessionLength)?.label ?? sessionLength} />
            <ReviewRow label="Equipment" value={equipment.join(', ') || '—'} />
            {focus ? <ReviewRow label="Focus" value={focus} /> : null}
            {injuries ? <ReviewRow label="Limitations" value={injuries} /> : null}
            <Text style={[styles.sub, { color: t.subtle, marginTop: 12 }]}>
              Generating takes about 10 seconds. Uses 1 AI call.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.navBar, { borderTopColor: t.border, backgroundColor: t.bg }]}>
        <Pressable
          onPress={back}
          disabled={generating}
          style={({ pressed }) => [styles.navBtn, { opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="chevron-back" size={20} color={t.muted} />
          <Text style={[styles.navLabel, { color: t.muted }]}>{step === 'days' ? 'Cancel' : 'Back'}</Text>
        </Pressable>

        {step !== 'review' ? (
          <Pressable
            onPress={next}
            disabled={step === 'days' && trainingDays.length === 0}
            style={({ pressed }) => [
              styles.primaryBtn,
              {
                backgroundColor: t.accent,
                opacity: pressed || (step === 'days' && trainingDays.length === 0) ? 0.7 : 1,
              },
            ]}>
            <Text style={styles.primaryLabel}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        ) : (
          <Pressable
            onPress={handleGenerate}
            disabled={generating}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: t.accent, opacity: pressed || generating ? 0.8 : 1 },
            ]}>
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#fff" />
                <Text style={styles.primaryLabel}>Generate plan</Text>
              </>
            )}
          </Pressable>
        )}
      </View>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? t.accent : t.surface2,
          borderColor: active ? t.accent : t.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text style={[styles.chipLabel, { color: active ? '#fff' : t.text }]}>{label}</Text>
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={[styles.reviewRow, { borderBottomColor: t.border }]}>
      <Text style={[styles.reviewLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.reviewValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120, gap: 12 },
  progressBar: { height: 3, width: '100%' },
  progressFill: { height: 3 },

  heading: { fontSize: 22, fontWeight: '700', marginTop: 8 },
  sub: { fontSize: 13, lineHeight: 18 },
  footNote: { fontSize: 11, marginTop: 6 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 100,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 13, fontWeight: '600' },

  input: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    minHeight: 80,
    marginTop: 8,
  },

  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  reviewLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    minWidth: 110,
  },
  reviewValue: { fontSize: 13, flex: 1, textAlign: 'right' },

  navBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  navBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8 },
  navLabel: { fontSize: 14, fontWeight: '600' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 100,
    minWidth: 140,
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
