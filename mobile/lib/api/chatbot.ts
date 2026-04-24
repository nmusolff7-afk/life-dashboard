import { apiFetch } from '../api';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatQueryPayload {
  query: string;
  conversation_history?: ChatMessage[];
  surface?: string;
  session_id?: string;
}

export interface ChatQueryResponse {
  response: string;
  containers_loaded: string[];
  containers_skipped: string[];
  model: string;
  tokens: { input: number; output: number };
  cost_usd: number;
  latency_ms: number;
  status: 'ok' | 'error' | 'refused';
}

async function jsonOrThrow<T>(res: Response, ctx: string): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      detail = body?.error ?? '';
    } catch {
      // ignore
    }
    throw new Error(`${ctx} → ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return (await res.json()) as T;
}

export async function queryChatbot(payload: ChatQueryPayload): Promise<ChatQueryResponse> {
  const res = await apiFetch('/api/chatbot/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return jsonOrThrow<ChatQueryResponse>(res, 'chatbot/query');
}

export interface AuditRow {
  id: number;
  created_at: string;
  surface: string | null;
  query_preview: string | null;
  containers_loaded: string[];
  containers_skipped: string[];
  response_summary: string | null;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_usd: number | null;
  latency_ms: number | null;
  result_status: string;
}

export async function fetchChatbotAudit(limit = 50): Promise<AuditRow[]> {
  const res = await apiFetch(`/api/chatbot/audit?limit=${limit}`);
  const body = await jsonOrThrow<{ rows: AuditRow[] }>(res, 'chatbot/audit');
  return body.rows;
}

export async function deleteChatbotAuditRow(id: number): Promise<boolean> {
  const res = await apiFetch(`/api/chatbot/audit/${id}`, { method: 'DELETE' });
  const body = await jsonOrThrow<{ ok: boolean }>(res, 'chatbot/audit/delete');
  return body.ok;
}
