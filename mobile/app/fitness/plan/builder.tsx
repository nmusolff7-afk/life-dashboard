import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { DayName, WorkoutPlanQuiz } from '../../../../shared/src/types/plan';
import {
  relevantSourcesFor,
  type WorkoutPlanSource,
} from '../../../../shared/src/data/workoutPlanSources';
import { generateWorkoutPlan } from '../../../lib/api/plan';
import { useProfile } from '../../../lib/hooks/useHomeData';
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
  const profile = useProfile();
  const params = useLocalSearchParams<{ initial?: string }>();

  // PRD §4.3.10 "Edit Plan opens the Workout Builder with pre-populated
  // answers". When the user lands here with `?initial=<urlencoded JSON>`
  // (set by plan/index.tsx's "Edit Plan" button), reverse-map the saved
  // quiz_payload into the builder's per-step state. Defensively try-catch
  // so a malformed param doesn't crash the whole screen — fall back to
  // empty defaults.
  const initialState = useMemo(() => parseInitialQuiz(params.initial), [params.initial]);

  const [step, setStep] = useState<Step>('days');
  const [trainingDays, setTrainingDays] = useState<DayName[]>(
    initialState?.trainingDays ?? ['Monday', 'Wednesday', 'Friday'],
  );
  const [goal, setGoal] = useState<Goal>(initialState?.goal ?? 'build_muscle');
  const [experience, setExperience] = useState<Experience>(
    initialState?.experience ?? 'intermediate',
  );
  const [sessionLength, setSessionLength] = useState<SessionLength>(
    initialState?.sessionLength ?? '30_to_60',
  );
  const [equipment, setEquipment] = useState<string[]>(initialState?.equipment ?? ['Full gym']);
  const [focus, setFocus] = useState(initialState?.focus ?? '');
  const [injuries, setInjuries] = useState(initialState?.injuries ?? '');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Build the full payload + active-source set from the current answers.
  // Matches the shape generate_comprehensive_plan expects, including
  // aiFlags + scientificSources — without these the AI prompt produces
  // malformed JSON (root cause of the "AI build fails" report).
  const { payload, activeSources } = useMemo(
    () => buildPayload({
      trainingDays,
      goal,
      experience,
      sessionLength,
      equipment,
      focus,
      injuries,
      profile: profile.data ?? null,
    }),
    [trainingDays, goal, experience, sessionLength, equipment, focus, injuries, profile.data],
  );

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
    setGenerating(true);
    try {
      await generateWorkoutPlan(payload);
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

            {/* "How we built your plan" transparency panel — matches the
                PWA's onboarding Summary step. Shows the peer-reviewed
                citations that drove the decisions for this user's
                specific quiz answers. */}
            <Pressable
              onPress={() => { haptics.fire('tap'); setSourcesOpen((v) => !v); }}
              style={[styles.sourcesToggle, { borderColor: t.border }]}>
              <Ionicons name="library-outline" size={14} color={t.accent} />
              <Text style={[styles.sourcesToggleLabel, { color: t.accent }]}>
                How we built your plan ({activeSources.length} source{activeSources.length === 1 ? '' : 's'})
              </Text>
              <Ionicons
                name={sourcesOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={t.accent}
              />
            </Pressable>

            {sourcesOpen ? (
              <View style={[styles.sourcesPanel, { backgroundColor: t.surface2, borderColor: t.border }]}>
                <Text style={[styles.sourcesHeader, { color: t.text }]}>
                  Peer-reviewed references
                </Text>
                <Text style={[styles.sourcesBody, { color: t.muted }]}>
                  Your plan is built on these citations, selected based on your answers. Tap any
                  name to read the research.
                </Text>
                {activeSources.map((s) => (
                  <SourceRow key={s.shortName} source={s} />
                ))}
              </View>
            ) : null}
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

function SourceRow({ source }: { source: WorkoutPlanSource }) {
  const t = useTokens();
  return (
    <Pressable
      onPress={() => { void Linking.openURL(source.url); }}
      accessibilityRole="link"
      accessibilityLabel={`Read ${source.shortName}`}
      style={({ pressed }) => [
        styles.sourceRow,
        { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <Text style={[styles.sourceName, { color: t.text }]}>{source.shortName}</Text>
      <Text style={[styles.sourceCitation, { color: t.muted }]}>{source.fullCitation}</Text>
      <View style={styles.sourceTags}>
        {source.relevantTo.slice(0, 3).map((tag) => (
          <Text key={tag} style={[styles.sourceTag, { backgroundColor: t.surface, color: t.subtle }]}>
            {tag.replace(/_/g, ' ')}
          </Text>
        ))}
      </View>
    </Pressable>
  );
}

// ── Payload builder ──────────────────────────────────────────────────────
// Build the PWA-shape payload that generate_comprehensive_plan expects.
// Without aiFlags / userProfile / recovery / scientificSources the AI
// prompt produces malformed JSON (Phase-12 review "AI build fails"
// report). We synthesise sensible defaults from the user's profile
// where the mobile builder doesn't collect a field directly.

interface PayloadArgs {
  trainingDays: DayName[];
  goal: Goal;
  experience: Experience;
  sessionLength: SessionLength;
  equipment: string[];
  focus: string;
  injuries: string;
  profile: {
    age?: number | null;
    gender?: string | null;
    current_weight_lbs?: number | null;
    height_ft?: number | null;
    height_in?: number | null;
    work_style?: string | null;
    stress_level_1_10?: number | null;
  } | null;
}

const GOAL_TAG_MAP: Record<Goal, string> = {
  build_muscle: 'hypertrophy',
  lose_weight: 'fat_loss',
  recomp: 'recomposition',
  maintain: 'maintenance',
};

function buildPayload(args: PayloadArgs): {
  payload: WorkoutPlanQuiz;
  activeSources: WorkoutPlanSource[];
} {
  const {
    trainingDays, goal, experience, sessionLength, equipment, focus, injuries, profile,
  } = args;

  const stressRaw = profile?.stress_level_1_10 ?? 5;
  const stressLevel =
    stressRaw <= 3 ? 'low' :
    stressRaw <= 6 ? 'moderate' :
    stressRaw <= 8 ? 'high' : 'very_high';

  // Mobile builder doesn't ask about sleep directly — default to the
  // median bucket. The AI can still produce a valid plan from this.
  const sleepHours = '7_to_8';

  const heightIn =
    (profile?.height_ft ?? 0) * 12 + (profile?.height_in ?? 0);

  const aiFlags = {
    recoveryOnly: trainingDays.length === 0,
    noRestDays: trainingDays.length === 7,
    forcedFullBody: trainingDays.length > 0 && trainingDays.length <= 2,
    beginnerOnHighFrequency: experience !== 'advanced' && trainingDays.length >= 6,
    equipmentLimitation: equipment.includes('Bodyweight only') || equipment.includes('Bands'),
    volumeReductionFromStress: stressLevel === 'high' || stressLevel === 'very_high',
    hasPhysicalConstraints: injuries.trim().length > 0,
  };

  // Tags used to pick relevant sources.
  const activeTags = new Set<string>([
    'training_frequency',
    'training_volume',
    'exercise_selection',
    GOAL_TAG_MAP[goal],
  ]);
  if (aiFlags.volumeReductionFromStress) activeTags.add('stress');
  if (aiFlags.hasPhysicalConstraints) activeTags.add('injury_modification');
  if (trainingDays.length >= 5) activeTags.add('split_selection');

  const activeSources = relevantSourcesFor(activeTags);

  const payload: WorkoutPlanQuiz = {
    userProfile: {
      age: profile?.age ?? null,
      sex: profile?.gender ?? null,
      weightLbs: profile?.current_weight_lbs ?? null,
      heightIn: heightIn > 0 ? heightIn : null,
    } as never,
    primaryGoal: GOAL_TAG_MAP[goal],
    goal: GOAL_TAG_MAP[goal],
    experience,
    schedule: {
      daysPerWeek: trainingDays.length,
      trainingDays,
    },
    sessionLength,
    equipment,
    recovery: {
      sleepHours,
      stressLevel,
      outsideActivity: profile?.work_style ?? 'lightly_active',
    } as never,
    trainingStyle: [],
    cardio: {
      mode: 'build',
      preference: 'cardio_balanced',
      committedCardioType: null,
      buildGoal: goal === 'lose_weight' ? 'fat_burn' : 'heart_health',
      buildIntensity: 'moderate',
      buildDaysPerWeek: 2,
    } as never,
    selectedExercises: focus.trim() ? focus.split(',').map((s) => s.trim()).filter(Boolean) : [],
    preferredFocus: focus.trim() ? focus.split(',').map((s) => s.trim()).filter(Boolean) : [],
    physicalConstraints: injuries.trim() || null,
    aiFlags: aiFlags as never,
    scientificSources: activeSources.map((s) => s.shortName) as never,
  };

  return { payload, activeSources };
}

// ── Initial-state parser (Edit Plan flow) ────────────────────────────────
// Reverses the GOAL_TAG_MAP + extracts builder fields from a saved
// `quiz_payload`. Defensive — bad input returns null and the builder
// shows defaults instead.

interface BuilderInitialState {
  trainingDays: DayName[];
  goal: Goal;
  experience: Experience;
  sessionLength: SessionLength;
  equipment: string[];
  focus: string;
  injuries: string;
}

const TAG_TO_GOAL: Record<string, Goal> = {
  hypertrophy: 'build_muscle',
  fat_loss: 'lose_weight',
  recomposition: 'recomp',
  maintenance: 'maintain',
};

function parseInitialQuiz(raw: string | string[] | undefined): BuilderInitialState | null {
  if (!raw || typeof raw !== 'string') return null;
  let quiz: Partial<WorkoutPlanQuiz> & {
    schedule?: { trainingDays?: DayName[] };
    physicalConstraints?: string | null;
    preferredFocus?: string[];
    selectedExercises?: string[];
  };
  try {
    quiz = JSON.parse(decodeURIComponent(raw));
  } catch {
    return null;
  }
  const goalTag = (quiz.primaryGoal || quiz.goal) as string | undefined;
  const goal = (goalTag && TAG_TO_GOAL[goalTag]) || 'build_muscle';

  const exp = (quiz.experience as Experience | undefined) || 'intermediate';
  const isExp = (e: string): e is Experience =>
    e === 'beginner' || e === 'intermediate' || e === 'advanced';

  const sess = quiz.sessionLength as SessionLength | undefined;
  const isSess = (s: string | undefined): s is SessionLength =>
    s === 'under_30' || s === '30_to_60' || s === '60_to_90' || s === '90_plus';

  const focusList = quiz.preferredFocus || quiz.selectedExercises || [];

  return {
    trainingDays: Array.isArray(quiz.schedule?.trainingDays)
      ? (quiz.schedule!.trainingDays as DayName[])
      : ['Monday', 'Wednesday', 'Friday'],
    goal,
    experience: isExp(exp) ? exp : 'intermediate',
    sessionLength: isSess(sess) ? sess : '30_to_60',
    equipment: Array.isArray(quiz.equipment) ? (quiz.equipment as string[]) : ['Full gym'],
    focus: Array.isArray(focusList) ? focusList.join(', ') : '',
    injuries: typeof quiz.physicalConstraints === 'string' ? quiz.physicalConstraints : '',
  };
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

  sourcesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  sourcesToggleLabel: { flex: 1, fontSize: 13, fontWeight: '700' },

  sourcesPanel: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginTop: 4,
  },
  sourcesHeader: { fontSize: 14, fontWeight: '700' },
  sourcesBody: { fontSize: 12, lineHeight: 17 },
  sourceRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  sourceName: { fontSize: 12, fontWeight: '700' },
  sourceCitation: { fontSize: 11, lineHeight: 15 },
  sourceTags: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', marginTop: 4 },
  sourceTag: {
    fontSize: 9,
    fontWeight: '600',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 100,
    overflow: 'hidden',
  },
});
