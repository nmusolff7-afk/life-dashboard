import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, GoalRow, TabHeader } from '../../components/apex';
import { SegmentedControl } from '../../components/ui';
import { useGoals } from '../../lib/hooks/useGoals';
import { deleteTask, toggleTask, useTasks, useTimeFocus } from '../../lib/hooks/useTasks';
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
  const [refreshing, setRefreshing] = useState(false);

  // Deps MUST be stable .refetch refs, not the hook-return objects.
  // Those objects are fresh each render, which made useFocusEffect's
  // callback identity change every render, which made the effect
  // re-fire every render, which called refetch, which flipped
  // loading=true, which re-rendered — infinite loop.
  const focusRefetch = focus.refetch;
  const tasksRefetch = tasks.refetch;
  const goalsRefetch = goals.refetch;
  useFocusEffect(
    useCallback(() => {
      focusRefetch();
      tasksRefetch();
      goalsRefetch();
    }, [focusRefetch, tasksRefetch, goalsRefetch]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([focusRefetch(), tasksRefetch(), goalsRefetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [focusRefetch, tasksRefetch, goalsRefetch]);

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
      <TabHeader title="Time" />

      <View style={styles.tabsWrap}>
        <SegmentedControl<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'patterns', label: 'Patterns' },
            { value: 'timeline', label: 'Timeline' },
          ]}
        />
      </View>

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
}) {
  const t = useTokens();
  const activeTasks = tasks.filter((x) => !x.completed);
  const completedTasks = tasks.filter((x) => !!x.completed).slice(0, 8);

  return (
    <>
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
          focus.map((f) => (
            <Pressable
              key={f.id}
              onPress={() => onToggleTask(f.id)}
              onLongPress={() => onEditTask(f.id)}
              style={[
                styles.focusRow,
                { borderLeftColor: FOCUS_COLORS[f._focus_priority] ?? t.accent },
              ]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.focusDesc, { color: t.text }]} numberOfLines={2}>
                  {f.description}
                </Text>
                <Text style={[styles.focusReason, { color: t.muted }]}>
                  {f._focus_reason}
                  {f.due_date ? ` · due ${f.due_date}` : ''}
                </Text>
              </View>
              <View style={[styles.checkbox, { borderColor: t.border }]} />
            </Pressable>
          ))
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

      {/* Email — backend is wired, mobile UI not yet. */}
      <DisconnectedSubsystem
        name="Email"
        description="Gmail inbox triage, unreplied important emails"
        note="Backend OAuth is ready; mobile connect flow ships in a later cycle."
      />

      {/* Calendar */}
      <DisconnectedSubsystem
        name="Calendar"
        description="Today's events, meeting hours, next-up"
        note="Google Calendar + Outlook integrations ship in a later cycle."
      />

      <Text style={[styles.sectionLabel, { color: t.muted }]}>Attention</Text>

      <DisconnectedSubsystem
        name="Screen Time"
        description="Pickups, longest focus block, top apps"
        note="Requires Apple Family Controls (iOS) or UsageStatsManager (Android). Ships after Apple approval."
      />

      <DisconnectedSubsystem
        name="Location"
        description="Home / work / gym visits, commute rhythm"
        note="CoreLocation Visits + Google Places. Ships in a later cycle."
      />

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
  return (
    <EmptyState
      icon="🕸️"
      title="Patterns"
      description="Wake time, screen-time peaks, place visits, meeting density — your personal rhythm map. Activates once Screen Time, Calendar, or Location is connected."
    />
  );
}

function TimelineView() {
  return (
    <EmptyState
      icon="⏱️"
      title="Day Timeline"
      description="Your day minute-by-minute, reconstructed from Calendar + Screen Time + Location. Activates once any of those three is connected."
    />
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  tabsWrap: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 60, gap: 12 },

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
