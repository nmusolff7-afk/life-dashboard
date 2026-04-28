import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MealDetailModal, WorkoutDetailModal } from '../../components/apex';
import { fetchDayDetail, type DayDetailResponse } from '../../lib/api/day';
import { useProfile } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';
import { useUnits } from '../../lib/useUnits';
import type { Meal, Workout } from '../../../shared/src/types/home';

/** Day Detail per PRD §4.2a. Fixed header with date + prev/next day
 *  arrows, 6-cell summary stat grid, and four collapsible category
 *  sections (Fitness, Nutrition, Finance, Time). Finance + Time are
 *  stubbed until their data pipes land. Tap any workout to open the
 *  full WorkoutDetailModal; tap any meal to open MealDetailModal. */

function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatDateLong(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const now = new Date();
  const sameYear = dt.getUTCFullYear() === now.getFullYear();
  return dt.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export default function DayDetailScreen() {
  const t = useTokens();
  const router = useRouter();
  const units = useUnits();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const dateIso = typeof date === 'string' ? date : '';

  const profile = useProfile();
  const [data, setData] = useState<DayDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    fitness: true,
    nutrition: true,
    finance: false,
    time: false,
  });

  const load = useCallback(async () => {
    if (!dateIso) return;
    try {
      const result = await fetchDayDetail(dateIso);
      setData(result);
    } catch {
      // silent — empty-state covers the missing-data case
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateIso]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const calorieTarget = useMemo(() => {
    // Historical days: use the stored goal target (we don't persist per-
    // day step counts to reconstruct live TDEE, so the displayed goal
    // is the user's standing target, not a backfilled live number).
    return profile.data?.goal_targets?.calorie_target ?? null;
  }, [profile.data]);

  const meals = data?.meals ?? [];
  const workouts = data?.workouts ?? [];
  const totals = data?.totals;
  const weight = data?.weight_lbs ?? null;
  const workoutBurn = totals?.workout_burn ?? 0;
  const intake = totals?.calories ?? 0;
  const deficit = workoutBurn > 0 ? workoutBurn - intake : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: insets.bottom }}>
      <View
        style={[
          styles.header,
          {
            borderBottomColor: t.border,
            // Custom header (root Stack hides the default one for this
            // route) — pad the top so it sits below the status bar
            // instead of behind it. Founder-flagged 2026-04-28.
            paddingTop: 12 + insets.top,
          },
        ]}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={t.text} />
          <Text style={[styles.backLabel, { color: t.text }]}>Back</Text>
        </Pressable>

        <View style={styles.headerCenter}>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => router.setParams({ date: shiftIso(dateIso, -1) })}
              hitSlop={10}
              style={styles.arrowBtn}>
              <Ionicons name="chevron-back" size={18} color={t.muted} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: t.text }]}>
              {formatDateLong(dateIso)}
            </Text>
            <Pressable
              onPress={() => router.setParams({ date: shiftIso(dateIso, 1) })}
              hitSlop={10}
              style={styles.arrowBtn}>
              <Ionicons name="chevron-forward" size={18} color={t.muted} />
            </Pressable>
          </View>
        </View>

        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={t.muted}
            />
          }>
          {/* 6-cell summary stat grid per PRD §4.2a.3 */}
          <View style={styles.grid}>
            <GridCell
              t={t}
              label="Weight"
              value={weight != null ? units.formatWeight(weight) : '—'}
            />
            <GridCell
              t={t}
              label="Calories"
              value={
                calorieTarget != null
                  ? `${intake} / ${calorieTarget}`
                  : `${intake}`
              }
            />
            <GridCell t={t} label="Steps" value="—" />
            <GridCell
              t={t}
              label="Deficit"
              value={
                deficit != null
                  ? `${deficit >= 0 ? '+' : ''}${deficit}`
                  : '—'
              }
              valueColor={
                deficit == null
                  ? t.subtle
                  : deficit >= 0
                    ? t.green
                    : t.danger
              }
            />
            <GridCell t={t} label="Spending" value="—" />
            <GridCell t={t} label="Sleep" value="—" />
          </View>

          {/* Fitness section */}
          <CategorySection
            t={t}
            title="Fitness"
            accent={t.fitness}
            expanded={expanded.fitness}
            onToggle={() => setExpanded((e) => ({ ...e, fitness: !e.fitness }))}
            summary={
              workouts.length > 0
                ? `${workouts.length} workout${workouts.length === 1 ? '' : 's'} · ${workoutBurn} kcal burned`
                : 'No workouts logged'
            }>
            {workouts.length === 0 ? (
              <Text style={[styles.emptyText, { color: t.subtle }]}>
                No workouts logged for this day.
              </Text>
            ) : (
              workouts.map((w) => (
                <Pressable
                  key={w.id}
                  onPress={() => {
                    if (w.strava_activity_id) {
                      router.push({
                        pathname: '/fitness/strava-activity/[id]',
                        params: { id: w.strava_activity_id, name: w.description },
                      });
                    } else {
                      setEditingWorkout(w);
                    }
                  }}
                  style={({ pressed }) => [
                    styles.rowItem,
                    { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
                  ]}>
                  <Ionicons name="barbell-outline" size={16} color={t.fitness} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                      {w.description}
                      {w.strava_activity_id ? ' · Strava' : ''}
                    </Text>
                    <Text style={[styles.rowMeta, { color: t.muted }]}>
                      {formatTime(w.logged_at)}
                    </Text>
                  </View>
                  <Text style={[styles.rowKcal, { color: t.fitness }]}>
                    {w.calories_burned ?? 0} kcal
                  </Text>
                </Pressable>
              ))
            )}
          </CategorySection>

          {/* Nutrition section */}
          <CategorySection
            t={t}
            title="Nutrition"
            accent={t.nutrition}
            expanded={expanded.nutrition}
            onToggle={() => setExpanded((e) => ({ ...e, nutrition: !e.nutrition }))}
            summary={
              meals.length > 0
                ? `${meals.length} meal${meals.length === 1 ? '' : 's'} · ${intake} kcal`
                : 'No meals logged'
            }>
            {meals.length === 0 ? (
              <Text style={[styles.emptyText, { color: t.subtle }]}>
                No meals logged for this day.
              </Text>
            ) : (
              <>
                {meals.map((m) => (
                  <Pressable
                    key={m.id}
                    onPress={() => setEditingMeal(m)}
                    style={({ pressed }) => [
                      styles.rowItem,
                      { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
                    ]}>
                    <Ionicons name="restaurant-outline" size={16} color={t.nutrition} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                        {m.description}
                      </Text>
                      <Text style={[styles.rowMeta, { color: t.muted }]}>
                        {formatTime(m.logged_at)}
                      </Text>
                    </View>
                    <Text style={[styles.rowKcal, { color: t.nutrition }]}>
                      {m.calories ?? 0} kcal
                    </Text>
                  </Pressable>
                ))}
                {totals ? (
                  <View style={[styles.totalsRow, { borderTopColor: t.border }]}>
                    <Text style={[styles.totalsLabel, { color: t.muted }]}>
                      Macros · P {Math.round(totals.protein_g)}g ·
                      C {Math.round(totals.carbs_g)}g ·
                      F {Math.round(totals.fat_g)}g
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </CategorySection>

          {/* Finance — stubbed */}
          <CategorySection
            t={t}
            title="Finance"
            accent={t.finance}
            expanded={expanded.finance}
            onToggle={() => setExpanded((e) => ({ ...e, finance: !e.finance }))}
            summary="Not connected">
            <Text style={[styles.emptyText, { color: t.subtle }]}>
              Connect a bank to see transactions, bills, and spending
              categories for this day.
            </Text>
          </CategorySection>

          {/* Time — stubbed */}
          <CategorySection
            t={t}
            title="Time"
            accent={t.time}
            expanded={expanded.time}
            onToggle={() => setExpanded((e) => ({ ...e, time: !e.time }))}
            summary="Not connected">
            <Text style={[styles.emptyText, { color: t.subtle }]}>
              Connect calendar, email, and screen time to see your day
              timeline, focus blocks, and meeting load here.
            </Text>
          </CategorySection>
        </ScrollView>
      )}

      <MealDetailModal
        meal={editingMeal}
        onClose={() => setEditingMeal(null)}
        onChanged={() => {
          setEditingMeal(null);
          load();
        }}
      />
      <WorkoutDetailModal
        workout={editingWorkout}
        onClose={() => setEditingWorkout(null)}
        onChanged={() => {
          setEditingWorkout(null);
          load();
        }}
      />
    </View>
  );
}

function GridCell({
  t,
  label,
  value,
  valueColor,
}: {
  t: ReturnType<typeof useTokens>;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={[styles.gridCell, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.gridLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.gridValue, { color: valueColor ?? t.text }]}>{value}</Text>
    </View>
  );
}

function CategorySection({
  t,
  title,
  accent,
  expanded,
  onToggle,
  summary,
  children,
}: {
  t: ReturnType<typeof useTokens>;
  title: string;
  accent: string;
  expanded: boolean;
  onToggle: () => void;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, { backgroundColor: t.surface, borderLeftColor: accent, borderColor: t.border }]}>
      <Pressable onPress={onToggle} style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
          <Text style={[styles.sectionSummary, { color: t.muted }]} numberOfLines={1}>
            {summary}
          </Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.muted} />
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    width: 60,
  },
  backLabel: { fontSize: 15, fontWeight: '500' },
  headerCenter: { flex: 1, alignItems: 'center' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrowBtn: { padding: 4 },
  headerTitle: { fontSize: 15, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridCell: {
    width: '31%',
    flexGrow: 1,
    minWidth: 100,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  gridLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  gridValue: { fontSize: 16, fontWeight: '700' },

  section: {
    borderWidth: 1,
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionSummary: { fontSize: 12, marginTop: 2 },
  sectionBody: { marginTop: 10, gap: 2 },

  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowDesc: { fontSize: 13, lineHeight: 17, fontWeight: '500' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  rowKcal: { fontSize: 13, fontWeight: '700' },

  totalsRow: { paddingTop: 10, borderTopWidth: 1 },
  totalsLabel: { fontSize: 11, fontStyle: 'italic' },

  emptyText: { fontSize: 12, fontStyle: 'italic', padding: 8 },
});
