// Task types (PRD §4.6.9). Mirrors the mind_tasks table.

export type TaskSource = 'manual' | 'imported';

export type FocusPriority = 'critical' | 'high' | 'medium' | 'normal';

export interface Task {
  id: number;
  user_id: number;
  task_date: string;           // YYYY-MM-DD — when the task was created/"for"
  description: string;
  completed: number;           // 0 | 1
  source: TaskSource;
  due_date?: string | null;    // YYYY-MM-DD — nullable deadline (separate from task_date)
  priority: number;            // 0 | 1 — feeds TIME-01 priority-complete streak
  /** HH:MM in the user's local timezone. When set, the task renders as
   *  a Day Timeline hard block on its `task_date`. */
  task_time?: string | null;
  /** Block duration in minutes. Defaults to 30 when null. */
  task_duration_minutes?: number | null;
  completed_at?: string | null;
  created_at: string;
}

export interface TaskListResponse {
  ok: boolean;
  tasks: Task[];
}

export interface CreateTaskInput {
  description: string;
  due_date?: string;
  priority?: boolean;
  /** HH:MM in user's local timezone — optional. When set, the task
   *  becomes a Day Timeline hard block. */
  task_time?: string | null;
  /** Block duration when task_time is set. Backend defaults to 30
   *  if null. */
  task_duration_minutes?: number | null;
}

export interface UpdateTaskInput {
  description?: string;
  due_date?: string | null;
  priority?: boolean;
  task_date?: string;
  task_time?: string | null;
  task_duration_minutes?: number | null;
}

/** Today's Focus — deterministic ranked list of work to do now (PRD §4.6.4).
 * Items can come from tasks, unreplied important emails, or upcoming calendar
 * events. Discriminated by `kind` so the UI can render kind-specific affordances
 * (checkbox for tasks, no checkbox for emails/events). */
export type FocusKind = 'task' | 'email' | 'event';

export interface FocusItemBase {
  kind: FocusKind;
  _focus_priority: FocusPriority;
  _focus_reason: string;
  /** Display text — what the user reads as the headline of the row. */
  description: string;
}

export interface FocusTaskItem extends FocusItemBase, Task {
  kind: 'task';
}

export interface FocusEmailItem extends FocusItemBase {
  kind: 'email';
  sender: string;
  subject: string;
  message_id: string;
}

export interface FocusEventItem extends FocusItemBase {
  kind: 'event';
  start_iso: string;
  end_iso: string;
  location: string;
  all_day: boolean;
}

export type FocusItem = FocusTaskItem | FocusEmailItem | FocusEventItem;

export interface TimeFocusResponse {
  ok: boolean;
  focus: FocusItem[];
  total_candidates: number;
}
