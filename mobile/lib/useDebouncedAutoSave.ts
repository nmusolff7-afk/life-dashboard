import { useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface Options<T> {
  /** The current form state. Auto-save fires after `delayMs` of inactivity. */
  payload: T;
  /** True when the current `payload` is allowed to be persisted. Use to
   *  gate "user is mid-typing" / "validation pending" cases. */
  enabled: boolean;
  /** True when the payload represents a meaningful change vs the last
   *  saved snapshot. Caller decides what's "different" — usually a JSON
   *  hash of the payload compared to the last successful save. */
  dirty: boolean;
  /** Persistence call. Receives the latest payload. Should throw on
   *  failure; the hook flips status to 'error' and exposes the message. */
  save: (payload: T) => Promise<void>;
  /** Wait this long after the last edit before firing. */
  delayMs?: number;
  /** Called once after a successful save (e.g. to refetch upstream data). */
  onSaved?: () => void | Promise<void>;
}

interface Result {
  status: AutoSaveStatus;
  error: string | null;
  /** When the last save succeeded (Date.now ms). null until first save. */
  lastSavedAt: number | null;
  /** Force-flush any pending debounce now. Useful on screen blur. */
  flush: () => void;
}

/**
 * Debounced auto-save: waits `delayMs` after the last `payload` change,
 * then calls `save`. Tracks status so callers can render a small
 * "Saved · 2s ago" / "Saving..." / "Unsaved" indicator instead of a
 * Save button.
 *
 * Validation gate (`enabled`) keeps mid-edit garbage from hitting the
 * backend — e.g. the user types "1" while entering height, the form's
 * validator says "incomplete," `enabled=false`, save sits idle until
 * the user types "10".
 *
 * Errors are NEVER alerts. The status flips to 'error' and the caller
 * shows it inline. Network blips that recover on the next debounce
 * silently re-save.
 */
export function useDebouncedAutoSave<T>({
  payload, enabled, dirty, save, delayMs = 800, onSaved,
}: Options<T>): Result {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest payload outside React state so the debounced
  // callback always saves the freshest value (not a stale closure).
  const latestPayloadRef = useRef(payload);
  latestPayloadRef.current = payload;
  const latestEnabledRef = useRef(enabled);
  latestEnabledRef.current = enabled;
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const fire = async () => {
    if (!latestEnabledRef.current) {
      // Validation no longer satisfied (user edited mid-debounce). Re-arm
      // by leaving status='dirty'; another payload change will re-trigger.
      return;
    }
    setStatus('saving');
    setError(null);
    try {
      await saveRef.current(latestPayloadRef.current);
      setLastSavedAt(Date.now());
      setStatus('saved');
      try { await onSavedRef.current?.(); } catch { /* don't surface refetch errors here */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!dirty) return;
    setStatus('dirty');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void fire(); }, delayMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // payload is the trigger — when its serialized form changes, dirty
    // flips true, this re-runs and arms the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, dirty, enabled, delayMs]);

  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (dirty) void fire();
  };

  return { status, error, lastSavedAt, flush };
}

/** Render-helper for the inline status pill. Returns the short label
 *  shown next to a form's title, e.g. "Saved · just now". */
export function autoSaveLabel(status: AutoSaveStatus, lastSavedAt: number | null): string {
  if (status === 'saving') return 'Saving…';
  if (status === 'error') return 'Save failed — will retry';
  if (status === 'dirty') return 'Unsaved changes';
  if (status === 'saved' || status === 'idle') {
    if (!lastSavedAt) return status === 'idle' ? '' : 'Saved';
    const ageMs = Date.now() - lastSavedAt;
    if (ageMs < 5_000) return 'Saved · just now';
    if (ageMs < 60_000) return `Saved · ${Math.round(ageMs / 1000)}s ago`;
    if (ageMs < 3_600_000) return `Saved · ${Math.round(ageMs / 60_000)}m ago`;
    return 'Saved';
  }
  return '';
}
