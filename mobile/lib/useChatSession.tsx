import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { queryChatbot, type ChatMessage } from './api/chatbot';
import {
  classifyChatIntent,
  LOG_REDIRECTS,
  OUT_OF_SCOPE_RESPONSES,
  type ChatIntent,
} from './chat/classifier';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // PRD §4.7.7 — end after 30-min background.

export type Surface = 'home' | 'fitness' | 'nutrition' | 'finance' | 'time' | 'settings';

/** One of the FAB shortcut floating entry boxes. The QuickLogHost listens
 *  for this and renders the matching modal on top of any tab. */
export type QuickLog =
  | 'meal-manual'
  | 'meal-scan'
  | 'meal-barcode'
  | 'meal-saved'
  | 'workout-manual'
  | 'workout-strength'
  | 'workout-cardio'
  | 'workout-saved'
  | 'weight';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind: 'ai' | 'redirect' | 'out_of_scope';
  createdAt: number;
}

interface SessionValue {
  visible: boolean;
  surface: Surface;
  turns: ChatTurn[];
  sending: boolean;
  quickLog: QuickLog | null;
  /** Increments every time any quick-log entry successfully saves. Tabs
   *  watch this to refetch their own data slices — the QuickLogHost is
   *  mounted above the tabs so its hooks are separate from theirs. */
  dataVersion: number;
  open: (surface?: Surface) => void;
  close: () => void;
  send: (text: string) => Promise<void>;
  reset: () => void;
  openQuickLog: (kind: QuickLog) => void;
  closeQuickLog: () => void;
  bumpDataVersion: () => void;
  sessionId: string;
}

const Ctx = createContext<SessionValue | null>(null);

function newId(): string {
  return (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.randomUUID?.())
    || Math.random().toString(36).slice(2);
}

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [surface, setSurface] = useState<Surface>('home');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string>(newId());
  const [quickLog, setQuickLog] = useState<QuickLog | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  // End the session after 30min of background per §4.7.7.
  const backgroundedAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        backgroundedAt.current = Date.now();
      } else if (state === 'active' && backgroundedAt.current) {
        const gap = Date.now() - backgroundedAt.current;
        backgroundedAt.current = null;
        if (gap > SESSION_TIMEOUT_MS) {
          // Silent reset — conversation gone, new session id.
          setTurns([]);
          setSessionId(newId());
        }
      }
    });
    return () => sub.remove();
  }, []);

  const open = useCallback((s: Surface = 'home') => {
    setSurface(s);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  // openQuickLog always closes the overlay first so the shortcut rail
  // animates away before the entry modal appears.
  const openQuickLog = useCallback((kind: QuickLog) => {
    setVisible(false);
    setQuickLog(kind);
  }, []);

  const closeQuickLog = useCallback(() => {
    setQuickLog(null);
  }, []);

  const bumpDataVersion = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  const reset = useCallback(() => {
    setTurns([]);
    setSessionId(newId());
  }, []);

  const send = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || sending) return;

      const userTurn: ChatTurn = {
        id: newId(),
        role: 'user',
        content: q,
        kind: 'ai',
        createdAt: Date.now(),
      };

      // Client-side classifier — intercept logging / out-of-scope before
      // burning an AI call.
      const intent: ChatIntent = classifyChatIntent(q);
      if (intent.kind === 'logging') {
        setTurns((prev) => [...prev, userTurn, {
          id: newId(),
          role: 'assistant',
          content: LOG_REDIRECTS[intent.domain],
          kind: 'redirect',
          createdAt: Date.now(),
        }]);
        return;
      }
      if (intent.kind === 'out_of_scope') {
        setTurns((prev) => [...prev, userTurn, {
          id: newId(),
          role: 'assistant',
          content: OUT_OF_SCOPE_RESPONSES[intent.reason],
          kind: 'out_of_scope',
          createdAt: Date.now(),
        }]);
        return;
      }

      // Real AI call. Optimistically append the user turn so the UI renders.
      setTurns((prev) => [...prev, userTurn]);
      setSending(true);
      try {
        // Pull the last 8 turns (4 user + 4 assistant) into history per §4.7.7.
        const history: ChatMessage[] = [...turns, userTurn]
          .slice(-8)
          .map((m) => ({ role: m.role, content: m.content }));
        const res = await queryChatbot({
          query: q,
          conversation_history: history,
          surface,
          session_id: sessionId,
        });
        setTurns((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            content: res.response || 'Chat is temporarily unavailable.',
            kind: 'ai',
            createdAt: Date.now(),
          },
        ]);
      } catch (e) {
        setTurns((prev) => [
          ...prev,
          {
            id: newId(),
            role: 'assistant',
            content: e instanceof Error
              ? `Chat error: ${e.message}. Tap to retry.`
              : 'Chat is temporarily unavailable.',
            kind: 'ai',
            createdAt: Date.now(),
          },
        ]);
      } finally {
        setSending(false);
      }
    },
    [turns, surface, sessionId, sending],
  );

  const value = useMemo<SessionValue>(
    () => ({
      visible,
      surface,
      turns,
      sending,
      quickLog,
      dataVersion,
      open,
      close,
      send,
      reset,
      openQuickLog,
      closeQuickLog,
      bumpDataVersion,
      sessionId,
    }),
    [
      visible,
      surface,
      turns,
      sending,
      quickLog,
      dataVersion,
      open,
      close,
      send,
      reset,
      openQuickLog,
      closeQuickLog,
      bumpDataVersion,
      sessionId,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useChatSession must be used inside ChatSessionProvider');
  return v;
}
