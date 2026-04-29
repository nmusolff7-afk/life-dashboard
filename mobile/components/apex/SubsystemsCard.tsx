import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import {
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ProfileResponse, Workout } from '../../../shared/src/types/home';
import { useTokens } from '../../lib/theme';
import { useUnits } from '../../lib/useUnits';
import { classifyWorkout } from '../../lib/workout';

interface Props {
  profile?: ProfileResponse | null;
  weightLbs: number | null;
  todayStepsState: { steps: number | null };
  recentWorkouts: Workout[];
  onStartStrength: () => void;
}

type Key = 'body' | 'strength' | 'cardio' | 'movement' | 'sleep' | 'recovery' | 'plan';
const TABS: { key: Key; label: string }[] = [
  { key: 'body', label: 'Body' },
  { key: 'strength', label: 'Strength' },
  { key: 'cardio', label: 'Cardio' },
  { key: 'movement', label: 'Movement' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'recovery', label: 'Recovery' },
  { key: 'plan', label: 'Plan' },
];

/** Phase-5 subsystems card. Horizontally-scrollable tab row + horizontal
 *  paging ScrollView of detail panels — analogous to the Home TodayBalanceCard.
 *  Each panel shows its subsystem score (empty until scoring wires up) plus
 *  the most meaningful detail we can show today from Flask data. */
export function SubsystemsCard({
  profile,
  weightLbs,
  todayStepsState,
  recentWorkouts,
  onStartStrength,
}: Props) {
  const t = useTokens();
  const [active, setActive] = useState<Key>('body');
  const [pageWidth, setPageWidth] = useState(0);
  const pagerRef = useRef<ScrollView>(null);
  const tabRowRef = useRef<ScrollView>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== pageWidth) setPageWidth(w);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / pageWidth);
    const next = TABS[Math.max(0, Math.min(TABS.length - 1, idx))].key;
    if (next !== active) setActive(next);
  };

  const selectTab = (k: Key) => {
    setActive(k);
    const idx = TABS.findIndex((x) => x.key === k);
    pagerRef.current?.scrollTo({ x: idx * pageWidth, animated: true });
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <ScrollView
        ref={tabRowRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}>
        {TABS.map((x) => (
          <Pressable key={x.key} onPress={() => selectTab(x.key)} style={styles.tabBtn}>
            <Text
              style={[
                styles.tabLabel,
                {
                  color: active === x.key ? t.accent : t.muted,
                  fontWeight: active === x.key ? '700' : '500',
                },
              ]}>
              {x.label}
            </Text>
            {active === x.key ? (
              <View style={[styles.tabUnderline, { backgroundColor: t.accent }]} />
            ) : null}
          </Pressable>
        ))}
      </ScrollView>

      <View onLayout={onLayout}>
        <ScrollView
          ref={pagerRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onScrollEnd}>
          <View style={[styles.page, { width: pageWidth }]}>
            <BodyPanel profile={profile} weightLbs={weightLbs} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <StrengthPanel recentWorkouts={recentWorkouts} onStart={onStartStrength} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <CardioPanel recentWorkouts={recentWorkouts} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <MovementPanel todaySteps={todayStepsState.steps} profile={profile} />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <ConnectPanel icon="bed-outline" title="Sleep" body="Connect HealthKit to pull nightly duration + efficiency. No data today." />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <ConnectPanel icon="heart-outline" title="Recovery" body="HRV and readiness land when HealthKit is wired in. No data today." />
          </View>
          <View style={[styles.page, { width: pageWidth }]}>
            <PlanPanel onStart={onStartStrength} />
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function PanelHeader({ title, score }: { title: string; score?: number | null }) {
  const t = useTokens();
  return (
    <View style={panel.header}>
      <Text style={[panel.headerTitle, { color: t.muted }]}>{title}</Text>
      <Text style={[panel.score, { color: score == null ? t.subtle : t.text }]}>
        {score == null ? '—' : Math.round(score)}
      </Text>
    </View>
  );
}

function KeyValueRow({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTokens();
  return (
    <View style={panel.kv}>
      <Text style={[panel.kvLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[panel.kvValue, { color: color ?? t.text }]}>{value}</Text>
    </View>
  );
}

// ── Panels ─────────────────────────────────────────────────────────────

function BodyPanel({ profile, weightLbs }: { profile?: ProfileResponse | null; weightLbs: number | null }) {
  const t = useTokens();
  const units = useUnits();
  const heightIn = (profile?.height_ft ?? 0) * 12 + (profile?.height_in ?? 0);
  const bmi =
    weightLbs && heightIn > 0
      ? (weightLbs * 703) / (heightIn * heightIn)
      : null;
  return (
    <View>
      <PanelHeader title="Body" />
      <KeyValueRow label="Current weight" value={weightLbs != null ? `${units.formatWeight(weightLbs, { round: true })} ${units.weightUnit}` : '—'} />
      <KeyValueRow
        label="Target weight"
        value={profile?.target_weight_lbs != null ? `${units.formatWeight(profile.target_weight_lbs, { round: true })} ${units.weightUnit}` : '—'}
      />
      <KeyValueRow label="Body fat %" value={profile?.body_fat_pct != null ? `${profile.body_fat_pct}%` : '—'} />
      <KeyValueRow label="BMI" value={bmi != null ? bmi.toFixed(1) : '—'} />
      <Text style={[panel.hint, { color: t.subtle }]}>Weight trend + body composition chart lands when the subsystem score wires up.</Text>
    </View>
  );
}

function StrengthPanel({ recentWorkouts, onStart }: { recentWorkouts: Workout[]; onStart: () => void }) {
  const t = useTokens();
  const strengthCount = recentWorkouts.filter((w) => classifyWorkout(w.description) === 'strength').length;
  const mixedCount = recentWorkouts.filter((w) => classifyWorkout(w.description) === 'mixed').length;
  return (
    <View>
      <PanelHeader title="Strength" />
      <KeyValueRow label="Sessions (90d)" value={String(strengthCount + mixedCount)} />
      <KeyValueRow label="Per-set history" value="Not tracked" color={t.muted} />
      <Text style={[panel.hint, { color: t.subtle }]}>
        Per-lift progression charts need a workout_logs schema change (per-set rows). Start a session to begin building.
      </Text>
      <Pressable onPress={onStart} style={[panel.cta, { backgroundColor: t.accent }]}>
        <Ionicons name="barbell" size={14} color="#fff" />
        <Text style={panel.ctaLabel}>Start strength session</Text>
      </Pressable>
    </View>
  );
}

function CardioPanel({ recentWorkouts }: { recentWorkouts: Workout[] }) {
  const t = useTokens();
  const cardioCount = recentWorkouts.filter((w) => classifyWorkout(w.description) === 'cardio').length;
  const totalKcal = recentWorkouts
    .filter((w) => classifyWorkout(w.description) === 'cardio')
    .reduce((sum, w) => sum + (w.calories_burned ?? 0), 0);
  return (
    <View>
      <PanelHeader title="Cardio" />
      <KeyValueRow label="Sessions (90d)" value={String(cardioCount)} />
      <KeyValueRow label="Total burn (90d)" value={`${totalKcal.toLocaleString()} kcal`} />
      <KeyValueRow label="Heart rate zones" value="HealthKit pending" color={t.muted} />
      <Text style={[panel.hint, { color: t.subtle }]}>
        Weekly cardio volume + HR-zone breakdown land when HealthKit is wired in.
      </Text>
    </View>
  );
}

function MovementPanel({ todaySteps, profile }: { todaySteps: number | null; profile?: ProfileResponse | null }) {
  const t = useTokens();
  return (
    <View>
      <PanelHeader title="Movement" />
      <KeyValueRow label="Steps today" value={todaySteps != null ? todaySteps.toLocaleString() : '—'} />
      <KeyValueRow
        label="Baseline (onboarding)"
        value={profile?.steps_per_day_estimated != null ? `${profile.steps_per_day_estimated.toLocaleString()} / day` : '—'}
      />
      <KeyValueRow label="Work style" value={profile?.work_style ?? '—'} />
      <Text style={[panel.hint, { color: t.subtle }]}>
        Auto-pulled step count arrives with HealthKit. Log manually for now from the card below.
      </Text>
    </View>
  );
}

function PlanPanel({ onStart }: { onStart: () => void }) {
  const t = useTokens();
  return (
    <View>
      <PanelHeader title="Plan" />
      <Text style={[panel.body, { color: t.text }]}>Start a strength session to track exercises and sets.</Text>
      <Text style={[panel.hint, { color: t.subtle }]}>
        Your last session's exercises auto-restore as a template. Plan adherence score lands in a later phase.
      </Text>
      <Pressable onPress={onStart} style={[panel.cta, { backgroundColor: t.accent }]}>
        <Ionicons name="barbell" size={14} color="#fff" />
        <Text style={panel.ctaLabel}>Start strength session</Text>
      </Pressable>
    </View>
  );
}

function ConnectPanel({
  icon,
  title,
  body,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
}) {
  const t = useTokens();
  return (
    <View>
      <PanelHeader title={title} />
      <View style={panel.centerWrap}>
        <Ionicons name={icon} size={28} color={t.muted} />
        <Text style={[panel.connectBody, { color: t.muted }]}>{body}</Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    paddingVertical: 4,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  tabBtn: { paddingVertical: 10, paddingHorizontal: 10 },
  tabLabel: { fontSize: 13 },
  tabUnderline: {
    position: 'absolute',
    bottom: -1,
    left: 6,
    right: 6,
    height: 2,
    borderRadius: 1,
  },
  page: { paddingHorizontal: 18, paddingVertical: 16 },
});

const panel = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  score: { fontSize: 32, fontWeight: '700' },

  kv: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  kvLabel: { fontSize: 13 },
  kvValue: { fontSize: 14, fontWeight: '600' },

  hint: { fontSize: 12, marginTop: 12, lineHeight: 17 },
  body: { fontSize: 14, marginTop: 4 },

  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 10,
    marginTop: 14,
  },
  ctaLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },

  centerWrap: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  connectBody: { fontSize: 13, textAlign: 'center', maxWidth: 280 },
});
