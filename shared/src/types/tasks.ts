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
}

export interface UpdateTaskInput {
  description?: string;
  due_date?: string | null;
  priority?: boolean;
  task_date?: string;
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
