import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CalendarTodayCard, DayStrip, EmptyState, GmailSummaryCard, GoalRow, LocationCard, OutlookCard, PatternsViewCard, ScreenTimeCard, SubTabs, TabHeader, TimeTodaySignals } from '../../components/apex';
import { useGoals } from '../../lib/hooks/useGoals';
import { deleteTask, toggleTask, useTasks, useTimeFocus } from '../../lib/hooks/useTasks';
import { useAutoSyncOnFocus, useGcalStatus, useGmailStatus, useOutlookStatus } from '../../lib/hooks/useTimeData';
import { useTokens } from '../../lib/theme';
import type { FocusItem, Task } from '../../../shared/src/types/tasks';

type Tab = 'today' | 'patterns' | 'timeline';

const FOCUS_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F59E0B',
  medium: '#5AB8FF',
  normal: '#22C55E',
};

export default function TimeScreen() {
  const t = useTokens();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('today');
  const focus = useTimeFocus();
  const tasks = useTasks(true);
  const goals = useGoals();
  const gmailStatus = useGmailStatus();
  const gcalStatus = useGcalStatus();
  const outlookStatus = useOutlookStatus();
  const [refreshing, setRefreshing] = useState(false);

  // Deps MUST be stable .refetch refs, not the hook-return objects.
  // Those objects are fresh each render, which made useFocusEffect's
  // callback identity change every render, which made the effect
  // re-fire every render, which called refetch, which flipped
  // loading=true, which re-rendered — infinite loop.
  const focusRefetch = focus.refetch;
  const tasksRefetch = tasks.refetch;
  const goalsRefetch = goals.refetch;
  const gmailRefetch = gmailStatus.refetch;
  const gcalRefetch = gcalStatus.refetch;
  const outlookRefetch = outlookStatus.refetch;
  useFocusEffect(
    useCallback(() => {
      focusRefetch();
      tasksRefetch();
      goalsRefetch();
      gmailRefetch();
      gcalRefetch();
      outlookRefetch();
    }, [focusRefetch, tasksRefetch, goalsRefetch, gmailRefetch, gcalRefetch, outlookRefetch]),
  );

  // Background auto-sync of connected providers — fires once per
  // 5-minute window per provider so opening this tab pulls fresh
  // data without forcing the user to tap "Sync now". Only syncs
  // providers we know are connected so we don't burn API calls or
  // throw 401s for unconfigured connectors.
  useAutoSyncOnFocus({
    gmail:   !!gmailStatus.data?.connected,
    gcal:    !!gcalStatus.data?.connected,
    outlook: !!outlookStatus.data?.connected,
    onAfterSync: () => {
      gmailRefetch();
      gcalRefetch();
      outlookRefetch();
      focusRefetch();
    },
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([focusRefetch(), tasksRefetch(), goalsRefetch(), gmailRefetch(), gcalRefetch(), outlookRefetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [focusRefetch, tasksRefetch, goalsRefetch, gmailRefetch, gcalRefetch, outlookRefetch]);

  const timeGoals = useMemo(
    () => (goals.data?.goals ?? []).filter((g) => g.category === 'time'),
    [goals.data],
  );

  const handleToggle = async (id: number) => {
    try { await toggleTask(id); await onRefresh(); }
    catch (e) { Alert.alert('Could not update', (e as Error).message); }
  };
  const handleDelete = async (id: number) => {
    try { await deleteTask(id); await onRefresh(); }
    catch (e) { Alert.alert('Could not delete', (e as Error).message); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* Match Fitness + Nutrition tab pattern (founder INBOX
       *  2026-04-28): SubTabs in TabHeader's right slot. */}
      <TabHeader
        title="Time"
        right={
          <SubTabs<Tab>
            tabs={[
              { value: 'today', label: 'Today' },
              { value: 'patterns', label: 'Patterns' },
              { value: 'timeline', label: 'Timeline' },
            ]}
            value={tab}
            onChange={setTab}
            compact
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.muted} />}>
        {tab === 'today' ? (
          <TodayView
            focus={focus.data?.focus ?? []}
            focusLoading={focus.loading && !focus.data}
            tasks={tasks.data?.tasks ?? []}
            tasksLoading={tasks.loading && !tasks.data}
            onAddTask={() => router.push('/time/task-new' as never)}
            onEditTask={(id) => router.push(`/time/task-edit?id=${id}` as never)}
            onToggleTask={handleToggle}
            onDeleteTask={handleDelete}
            timeGoals={timeGoals}
            onOpenGoal={(id) => router.push(`/goals/${id}` as never)}
            gmailStatus={gmailStatus.data}
            gmailLoading={gmailStatus.loading && !gmailStatus.data}
            onGmailChanged={gmailRefetch}
            gcalStatus={gcalStatus.data}
            gcalLoading={gcalStatus.loading && !gcalStatus.data}
            onGcalChanged={gcalRefetch}
            outlookStatus={outlookStatus.data}
            outlookLoading={outlookStatus.loading && !outlookStatus.data}
            onOutlookChanged={outlookRefetch}
          />
        ) : tab === 'patterns' ? (
          <PatternsView />
        ) : (
          <TimelineView />
        )}
      </ScrollView>
    </View>
  );
}

// ── Today ───────────────────────────────────────────────────────────────

function TodayView({
  focus, focusLoading, tasks, tasksLoading,
  onAddTask, onEditTask, onToggleTask, onDeleteTask,
  timeGoals, onOpenGoal,
  gmailStatus, gmailLoading, onGmailChanged,
  gcalStatus, gcalLoading, onGcalChanged,
  outlookStatus, outlookLoading, onOutlookChanged,
}: {
  focus: FocusItem[];
  focusLoading: boolean;
  tasks: Task[];
  tasksLoading: boolean;
  onAddTask: () => void;
  onEditTask: (id: number) => void;
  onToggleTask: (id: number) => void;
  onDeleteTask: (id: number) => void;
  timeGoals: NonNullable<ReturnType<typeof useGoals>['data']>['goals'];
  onOpenGoal: (id: number) => void;
  gmailStatus: import('../../lib/hooks/useTimeData').GmailStatusResponse | null;
  gmailLoading: boolean;
  onGmailChanged: () => void;
  gcalStatus: import('../../lib/hooks/useTimeData').GcalStatusResponse | null;
  gcalLoading: boolean;
  onGcalChanged: () => void;
  outlookStatus: import('../../lib/hooks/useTimeData').OutlookStatusResponse | null;
  outlookLoading: boolean;
  onOutlookChanged: () => void;
}) {
  const t = useTokens();
  const activeTasks = tasks.filter((x) => !x.completed);
  const completedTasks = tasks.filter((x) => !!x.completed).slice(0, 8);

  // Summary metrics — pulled from the same status payloads the cards
  // below render. Computed once per render (cheap) so the top-of-tab
  // matches what the user sees in the cards.
  const tasksLeft = activeTasks.length;

  // Inbox = unread combining both providers, defensively (server's
  // explicit unread_count for Outlook; computed for Gmail since the
  // cached email rows expose is_read).
  const gmailUnread = (gmailStatus?.emails ?? []).filter((e) => !e.is_read).length;
  const outlookUnread = outlookStatus?.unread_count
    ?? (outlookStatus?.emails ?? []).filter((e) => !e.is_read).length;
  const totalUnread = gmailUnread + outlookUnread;

  // Next-event detection — Google + Outlook merged, picked by start
  // time. Returns null if nothing in the next 24 hours.
  const allEvents = [
    ...(gcalStatus?.events ?? []),
    ...(outlookStatus?.events ?? []),
  ];
  const nextEvent = pickNextEvent(allEvents);
  const nextLabel = nextEvent ? eventCountdown(nextEvent.start_iso) : '—';

  // Day signal totals — count today's meetings (all-day excluded)
  // and sum focus minutes (events with "focus" in the title) for
  // the TimeTodaySignals chip row. Same provenance as Day Timeline
  // hard blocks so the numbers match.
  const todayIso = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const todayEvents = allEvents.filter((e) => !e.all_day && (e.start_iso ?? '').slice(0, 10) === todayIso);
  const meetingsToday = todayEvents.length;
  const focusMinutesToday = todayEvents.reduce((acc, e) => {
    if (!/focus/i.test(e.title ?? '')) return acc;
    const start = new Date(e.start_iso);
    const end = new Date(e.end_iso);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return acc;
    return acc + Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  }, 0);

  return (
    <>
      {/* Summary row — matches the Fitness/Nutrition density pattern.
          Three glanceable signals at the top of the tab so the user
          knows what the day looks like before scrolling. */}
      <View style={styles.summaryRow}>
        <SummaryCell
          label="Tasks"
          value={tasksLeft.toString()}
          unit={tasksLeft === 1 ? 'left' : 'left'}
          color={t.text}
        />
        <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
        <SummaryCell
          label="Unread"
          value={totalUnread.toString()}
          unit="emails"
          color={totalUnread > 0 ? t.accent : t.text}
        />
        <View style={[styles.summaryDivider, { backgroundColor: t.border }]} />
        <SummaryCell
          label="Next event"
          value={nextLabel}
          color={t.text}
        />
      </View>

      {/* Day signal chips + Right-now-from-timeline strip. Founder
       *  flagged Time tab feel-empty multiple turns; this densifies
       *  the top with concrete numbers + the in-progress block. */}
      <TimeTodaySignals
        meetingsToday={meetingsToday}
        focusMinutesToday={focusMinutesToday}
      />

      {/* Today's Focus */}
      <View style={[styles.focusCard, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.focusHeader}>
          <Text style={[styles.focusLabel, { color: t.muted }]}>Today's focus</Text>
          <Pressable onPress={onAddTask} hitSlop={10}>
            <Text style={[styles.linkText, { color: t.accent }]}>+ Task</Text>
          </Pressable>
        </View>
        {focusLoading ? (
          <ActivityIndicator color={t.accent} />
        ) : focus.length === 0 ? (
          <>
            <Text style={[styles.focusBig, { color: t.text }]}>Nothing urgent today</Text>
            <Text style={[styles.focusHint, { color: t.muted }]}>
              {tasks.length === 0
                ? "Add a task to start shaping your day. Connect calendar + email later for a richer focus list."
                : "All priority tasks are either complete or not due yet."}
            </Text>
          </>
        ) : (
          focus.map((f, idx) => {
            const isTask = f.kind === 'task';
            const subtitle = isTask
              ? `${f._focus_reason}${f.due_date ? ` · due ${f.due_date}` : ''}`
              : f._focus_reason;
            return (
              <Pressable
                key={isTask ? `task-${f.id}` : `${f.kind}-${idx}`}
                onPress={isTask ? () => onToggleTask(f.id) : undefined}
                onLongPress={isTask ? () => onEditTask(f.id) : undefined}
                style={[
                  styles.focusRow,
                  { borderLeftColor: FOCUS_COLORS[f._focus_priority] ?? t.accent },
                ]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.focusDesc, { color: t.text }]} numberOfLines={2}>
                    {f.description}
                  </Text>
                  <Text style={[styles.focusReason, { color: t.muted }]}>
                    {subtitle}
                  </Text>
                </View>
                {isTask ? (
                  <View style={[styles.checkbox, { borderColor: t.border }]} />
                ) : null}
              </Pressable>
            );
          })
        )}
      </View>

      {/* Productivity subsystem */}
      <Text style={[styles.sectionLabel, { color: t.muted }]}>Productivity</Text>

      {/* Tasks */}
      <View style={[styles.subsystem, { backgroundColor: t.surface, borderColor: t.border }]}>
        <View style={styles.subsystemHeader}>
          <Text style={[styles.subsystemTitle, { color: t.text }]}>Tasks</Text>
          <Pressable onPress={onAddTask} hitSlop={10}>
            <Text style={[styles.linkText, { color: t.accent }]}>+ Add</Text>
          </Pressable>
        </View>
        {tasksLoading ? (
          <ActivityIndicator color={t.accent} />
        ) : activeTasks.length === 0 ? (
          <Text style={[styles.subsystemEmpty, { color: t.muted }]}>
            No active tasks. Add one to get started.
          </Text>
        ) : (
          <View style={{ gap: 4 }}>
            {activeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => onToggleTask(task.id)}
                onEdit={() => onEditTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
              />
            ))}
          </View>
        )}
        {completedTasks.length > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[styles.completedHeader, { color: t.subtle }]}>Recently completed</Text>
            {completedTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={() => onToggleTask(task.id)}
                onEdit={() => onEditTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
                muted
              />
            ))}
          </View>
        ) : null}
      </View>

      <GmailSummaryCard
        status={gmailStatus}
        loading={gmailLoading}
        onChanged={onGmailChanged}
      />
      <CalendarTodayCard
        status={gcalStatus}
        loading={gcalLoading}
        onChanged={onGcalChanged}
      />
      <OutlookCard
        status={outlookStatus}
        loading={outlookLoading}
        onChanged={onOutlookChanged}
      />

      <Text style={[styles.sectionLabel, { color: t.muted }]}>Attention</Text>

      <ScreenTimeCard />
      <LocationCard />

      {/* Time goals */}
      {timeGoals.length > 0 ? (
        <>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>Time goals</Text>
          {timeGoals.map((g) => (
            <GoalRow key={g.goal_id} goal={g} onPress={() => onOpenGoal(g.goal_id)} />
          ))}
        </>
      ) : null}

      <Text style={[styles.footerNote, { color: t.subtle }]}>
        Tasks work without any integrations. Time Score activates once Calendar, Email, Screen Time, or Location is connected — task completion alone doesn't score (per design, it's self-reported).
      </Text>
    </>
  );
}

function TaskRow({
  task, onToggle, onEdit, onDelete, muted = false,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  muted?: boolean;
}) {
  const t = useTokens();
  const isDone = !!task.completed;
  const isPriority = !!task.priority;
  return (
    <Pressable
      onPress={onToggle}
      onLongPress={onDelete}
      style={({ pressed }) => [
        styles.taskRow,
        { borderColor: t.border, opacity: pressed ? 0.7 : muted ? 0.55 : 1 },
      ]}>
      <Pressable onPress={onToggle} hitSlop={8} style={[
        styles.checkbox,
        {
          borderColor: isDone ? t.accent : t.border,
          backgroundColor: isDone ? t.accent : 'transparent',
        },
      ]}>
        {isDone ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text
          style={[
            styles.taskDesc,
            { color: t.text, textDecorationLine: isDone ? 'line-through' : 'none' },
          ]}
          numberOfLines={2}>
          {isPriority ? '⭐ ' : ''}{task.description}
        </Text>
        {task.due_date || isPriority ? (
          <Text style={[styles.taskMeta, { color: t.muted }]}>
            {task.due_date ? `due ${task.due_date}` : ''}
            {task.due_date && isPriority ? ' · ' : ''}
            {isPriority ? 'priority' : ''}
          </Text>
        ) : null}
      </View>
      <Pressable onPress={onEdit} hitSlop={10} style={styles.editBtn}>
        <Text style={[styles.editBtnText, { color: t.subtle }]}>edit</Text>
      </Pressable>
    </Pressable>
  );
}

function SummaryCell({ label, value, unit, color }: {
  label: string; value: string; unit?: string; color: string;
}) {
  const t = useTokens();
  return (
    <View style={styles.summaryCell}>
      <Text style={[styles.summaryValue, { color }]}>
        {value}
        {unit ? <Text style={[styles.summaryUnit, { color: t.muted }]}> {unit}</Text> : null}
      </Text>
      <Text style={[styles.summaryLabel, { color: t.muted }]}>{label}</Text>
    </View>
  );
}

// ── Summary helpers ─────────────────────────────────────────────────────

interface MaybeEvent { start_iso?: string; title?: string; all_day?: number | boolean }

function pickNextEvent<T extends MaybeEvent>(events: T[]): T | null {
  const nowMs = Date.now();
  const horizonMs = nowMs + 24 * 60 * 60 * 1000;
  let best: T | null = null;
  let bestStart = Infinity;
  for (const ev of events) {
    if (!ev.start_iso || ev.all_day) continue;
    const ms = new Date(ev.start_iso).getTime();
    if (isNaN(ms) || ms <= nowMs || ms > horizonMs) continue;
    if (ms < bestStart) { bestStart = ms; best = ev; }
  }
  return best;
}

function eventCountdown(iso: string): string {
  try {
    const ms = new Date(iso).getTime();
    if (isNaN(ms)) return '—';
    const diffMin = Math.max(0, Math.round((ms - Date.now()) / 60000));
    if (diffMin < 60) return `in ${diffMin}m`;
    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;
    return m > 0 ? `in ${h}h ${m}m` : `in ${h}h`;
  } catch {
    return '—';
  }
}

function DisconnectedSubsystem({ name, description, note }: {
  name: string; description: string; note: string;
}) {
  const t = useTokens();
  return (
    <View style={[styles.subsystem, { backgroundColor: t.surface, borderColor: t.border, opacity: 0.85 }]}>
      <View style={styles.subsystemHeader}>
        <Text style={[styles.subsystemTitle, { color: t.text }]}>{name}</Text>
        <View style={[styles.disconnectedPill, { borderColor: t.border }]}>
          <Text style={[styles.disconnectedText, { color: t.subtle }]}>Not connected</Text>
        </View>
      </View>
      <Text style={[styles.subsystemDesc, { color: t.muted }]}>{description}</Text>
      <Text style={[styles.subsystemNote, { color: t.subtle }]}>{note}</Text>
    </View>
  );
}

// ── Patterns / Timeline ─────────────────────────────────────────────────

function PatternsView() {
  // 2026-04-28 §14.3 ship — was an EmptyState placeholder. Now
  // backed by patterns_engine 14-day rollups + Claude Haiku
  // insight synthesis (user-invoked). Card component lives in
  // components/apex/PatternsView.tsx.
  return <PatternsViewCard />;
}

function TimelineView() {
  // Renders the live DayStrip (calendar-event-only hard blocks for v1;
  // soft AI labels land in §14.2.2). Founder-flagged 2026-04-28: this
  // sub-tab was an EmptyState placeholder and never wired.
  return <DayStrip />;
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabsWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 60, gap: 12 },

  // Summary row — top-of-Today metrics matching Fitness/Nutrition.
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    gap: 0,
  },
  summaryDivider: { width: 1, height: 32, alignSelf: 'center' },
  summaryCell: { flex: 1, alignItems: 'center', gap: 2 },
  summaryValue: { fontSize: 16, fontWeight: '700' },
  summaryUnit: { fontSize: 10, fontWeight: '500' },
  summaryLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },

  focusCard: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 8 },
  focusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  focusLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  focusBig: { fontSize: 20, fontWeight: '700' },
  focusHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  focusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderLeftWidth: 3, paddingLeft: 10, paddingVertical: 8, marginTop: 4,
  },
  focusDesc: { fontSize: 14, fontWeight: '600' },
  focusReason: { fontSize: 11, marginTop: 2 },

  linkText: { fontSize: 13, fontWeight: '600' },

  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 10 },

  subsystem: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 6 },
  subsystemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subsystemTitle: { fontSize: 14, fontWeight: '700' },
  subsystemDesc: { fontSize: 12 },
  subsystemEmpty: { fontSize: 13, lineHeight: 18 },
  subsystemNote: { fontSize: 11, lineHeight: 15, marginTop: 4, fontStyle: 'italic' },

  disconnectedPill: { borderWidth: 1, borderRadius: 100, paddingVertical: 3, paddingHorizontal: 10 },
  disconnectedText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },

  completedHeader: {
    fontSize: 10, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 0.6, marginBottom: 6,
  },

  taskRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '800' },
  taskDesc: { fontSize: 14, fontWeight: '500' },
  taskMeta: { fontSize: 11, marginTop: 2 },
  editBtn: { paddingHorizontal: 6, paddingVertical: 2 },
  editBtnText: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },

  footerNote: { fontSize: 11, lineHeight: 15, marginTop: 16, fontStyle: 'italic' },
});
