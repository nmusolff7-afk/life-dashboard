import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Task } from '../../../shared/src/types/tasks';
import {
  fetchDayTimeline,
  type DayBlock,
} from '../../lib/api/timeline';
import { localToday } from '../../lib/localTime';
import { useTokens } from '../../lib/theme';
import { useTasks, toggleTask } from '../../lib/hooks/useTasks';

/** Time category card content for the Today tab. Replaces the
 *  empty-feeling generic CategoryScoreRow content with:
 *    - top 3 incomplete tasks for today (priority + overdue first)
 *    - next upcoming calendar block
 *    - "+ Add task" affordance
 *
 *  Pulls from `useTasks()` and `/api/day-timeline/<today>`. Both are
 *  cheap on a single read; the page already pulls scores + nutrition
 *  + workouts on Today tab focus, so adding two more isn't material.
 */
export function TimeCardContent() {
  const t = useTokens();
  const router = useRouter();
  const { data: taskData, refetch: refetchTasks } = useTasks(false);
  const [blocks, setBlocks] = useState<DayBlock[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchDayTimeline(localToday())
      .then((d) => { if (!cancelled) setBlocks(d.blocks ?? []); })
      .catch(() => { if (!cancelled) setBlocks([]); });
    return () => { cancelled = true; };
  }, []);

  const tasks: Task[] = useMemo(() => {
    const all = taskData?.tasks ?? [];
    return all
      .filter((t) => !t.completed)
      .sort((a, b) => {
        // Priority first
        if (a.priority !== b.priority) return b.priority - a.priority;
        // Then overdue (due_date < today) first
        const today = localToday();
        const aDue = a.due_date ?? null;
        const bDue = b.due_date ?? null;
        const aOverdue = aDue != null && aDue < today;
        const bOverdue = bDue != null && bDue < today;
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
        // Then nearest due_date
        if (aDue && bDue) return aDue.localeCompare(bDue);
        if (aDue) return -1;
        if (bDue) return 1;
        return 0;
      })
      .slice(0, 3);
  }, [taskData]);

  // Find the next block whose start is in the future, or the current
  // block if one is in progress. Hard blocks only (skip soft AI labels
  // for this preview).
  const nextBlock = useMemo(() => {
    const now = new Date();
    const hardBlocks = blocks.filter((b) => b.kind === 'hard');
    return hardBlocks.find((b) => {
      const end = new Date(b.block_end);
      return end >= now;
    }) ?? null;
  }, [blocks]);

  return (
    <View style={styles.wrap}>
      {/* Top tasks. Empty-state nudges to add one. */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>
            Top tasks
          </Text>
          <Pressable
            onPress={() => router.push('/time/task-new' as never)}
            hitSlop={8}>
            <Text style={[styles.addLabel, { color: t.accent }]}>+ Add</Text>
          </Pressable>
        </View>
        {tasks.length === 0 ? (
          <Pressable
            onPress={() => router.push('/time/task-new' as never)}
            style={[styles.emptyTask, { borderColor: t.border }]}>
            <Text style={[styles.emptyTaskLabel, { color: t.subtle }]}>
              No tasks for today. Tap to add one.
            </Text>
          </Pressable>
        ) : (
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={async () => {
                await toggleTask(task.id);
                await refetchTasks();
              }}
            />
          ))
        )}
      </View>

      {/* Next block from Day Timeline. Mini-strip preview of the
       *  full timeline lives on Time tab → Timeline subtab. */}
      {nextBlock ? (
        <Pressable
          onPress={() => router.push('/(tabs)/time' as never)}
          style={[styles.nextBlock, { backgroundColor: t.surface2 }]}>
          <View style={[styles.nextBlockBar, { backgroundColor: t.accent }]} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.nextBlockTime, { color: t.muted }]}>
              {formatBlockRange(nextBlock)}
            </Text>
            <Text style={[styles.nextBlockLabel, { color: t.text }]} numberOfLines={1}>
              {nextBlock.label || 'Calendar event'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={t.subtle} />
        </Pressable>
      ) : null}
    </View>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: () => Promise<void> }) {
  const t = useTokens();
  const today = localToday();
  const overdue = task.due_date != null && task.due_date < today;
  return (
    <Pressable
      onPress={() => { void onToggle(); }}
      style={({ pressed }) => [
        styles.taskRow,
        { borderBottomColor: t.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.checkbox, { borderColor: task.priority ? t.danger : t.border }]}>
        {task.priority ? (
          <Ionicons name="flag" size={9} color={t.danger} />
        ) : null}
      </View>
      <Text style={[styles.taskDesc, { color: t.text }]} numberOfLines={1}>
        {task.description}
      </Text>
      {overdue ? (
        <Text style={[styles.taskMeta, { color: t.danger }]}>overdue</Text>
      ) : task.due_date ? (
        <Text style={[styles.taskMeta, { color: t.subtle }]}>{formatDueShort(task.due_date)}</Text>
      ) : null}
    </Pressable>
  );
}

function formatBlockRange(b: DayBlock): string {
  const s = new Date(b.block_start);
  const e = new Date(b.block_end);
  const fmt = (d: Date) => {
    const h12 = d.getHours() % 12 === 0 ? 12 : d.getHours() % 12;
    const m = d.getMinutes() === 0 ? '' : `:${String(d.getMinutes()).padStart(2, '0')}`;
    const ampm = d.getHours() < 12 ? 'a' : 'p';
    return `${h12}${m}${ampm}`;
  };
  const now = new Date();
  if (s <= now && now < e) {
    return `Now → ${fmt(e)}`;
  }
  return `${fmt(s)} – ${fmt(e)}`;
}

function formatDueShort(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  section: { gap: 6 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
  addLabel: { fontSize: 12, fontWeight: '700' },
  emptyTask: { borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', padding: 10 },
  emptyTaskLabel: { fontSize: 12, textAlign: 'center' },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskDesc: { flex: 1, fontSize: 13, lineHeight: 17 },
  taskMeta: { fontSize: 10, fontWeight: '600' },
  nextBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  nextBlockBar: { width: 3, alignSelf: 'stretch', marginLeft: -12, marginRight: 7 },
  nextBlockTime: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  nextBlockLabel: { fontSize: 13, fontWeight: '600' },
});
