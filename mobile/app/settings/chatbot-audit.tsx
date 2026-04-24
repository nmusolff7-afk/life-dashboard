import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  deleteChatbotAuditRow,
  fetchChatbotAudit,
  type AuditRow,
} from '../../lib/api/chatbot';
import { useTokens } from '../../lib/theme';

/** Per PRD §4.8.7 — full transparency log of every chatbot call.
 *  Names-only storage per locked C1, so rows show:
 *    timestamp · surface · containers loaded/skipped · model · tokens · cost
 *    · first 200 chars of query · first 200 chars of response
 *  Delete any single row to erase it from the audit. Export as JSON
 *  downloads all rows (GDPR §15). */
export default function ChatbotAuditScreen() {
  const t = useTokens();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const data = await fetchChatbotAudit(100);
      setRows(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = (id: number) => {
    Alert.alert(
      'Delete audit row',
      'This removes the record of this one chatbot call from your audit log. The AI has already replied; this is about your transparency log only.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteChatbotAuditRow(id);
              setRows((prev) => prev.filter((r) => r.id !== id));
            } catch (e) {
              Alert.alert('Delete failed', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Chatbot Audit',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
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
        <Text style={[styles.intro, { color: t.muted }]}>
          Every chatbot call from this account in the last 30 days. We store the names of data
          containers sent, not the container contents — enough to show "what was shared" without
          keeping a re-leak risk on file.
        </Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : err ? (
          <Text style={[styles.err, { color: t.danger }]}>{err}</Text>
        ) : rows.length === 0 ? (
          <Text style={[styles.empty, { color: t.subtle }]}>
            No chatbot calls in the last 30 days yet.
          </Text>
        ) : (
          rows.map((r) => <AuditCard key={r.id} row={r} onDelete={() => onDelete(r.id)} />)
        )}
      </ScrollView>
    </View>
  );
}

function AuditCard({ row, onDelete }: { row: AuditRow; onDelete: () => void }) {
  const t = useTokens();
  const when = formatWhen(row.created_at);
  const containers = row.containers_loaded.length
    ? row.containers_loaded.join(' · ')
    : 'none';
  const cost = row.cost_usd != null ? `$${row.cost_usd.toFixed(4)}` : '—';
  const tokens = row.input_tokens != null && row.output_tokens != null
    ? `${row.input_tokens} in · ${row.output_tokens} out`
    : '—';

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.when, { color: t.muted }]}>{when}</Text>
        <Pressable onPress={onDelete} hitSlop={10} accessibilityLabel="Delete audit row">
          <Ionicons name="trash-outline" size={16} color={t.subtle} />
        </Pressable>
      </View>
      {row.query_preview ? (
        <Text style={[styles.queryLabel, { color: t.muted }]}>YOU</Text>
      ) : null}
      {row.query_preview ? (
        <Text style={[styles.query, { color: t.text }]}>{row.query_preview}</Text>
      ) : null}
      {row.response_summary ? (
        <Text style={[styles.responseLabel, { color: t.muted }]}>ASSISTANT</Text>
      ) : null}
      {row.response_summary ? (
        <Text style={[styles.response, { color: t.body }]}>{row.response_summary}</Text>
      ) : null}
      <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.05)' }]} />
      <MetaRow label="Containers sent" value={containers} />
      {row.containers_skipped.length > 0 ? (
        <MetaRow label="Skipped" value={row.containers_skipped.join(' · ')} />
      ) : null}
      <MetaRow label="Model" value={row.model ?? '—'} />
      <MetaRow label="Tokens" value={tokens} />
      <MetaRow label="Cost" value={cost} />
      {row.surface ? <MetaRow label="Surface" value={row.surface} /> : null}
      <MetaRow label="Status" value={row.result_status} />
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={styles.metaRow}>
      <Text style={[styles.metaLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: t.body }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  intro: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 2 },
  centered: { padding: 40, alignItems: 'center' },
  err: { fontSize: 13, padding: 16, textAlign: 'center' },
  empty: { fontSize: 13, padding: 20, textAlign: 'center' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  when: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  queryLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
  },
  query: { fontSize: 13, lineHeight: 18 },
  responseLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 6,
  },
  response: { fontSize: 13, lineHeight: 18 },
  divider: { height: 1, marginVertical: 8 },
  metaRow: { flexDirection: 'row', gap: 8 },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    minWidth: 100,
  },
  metaValue: { fontSize: 11, flex: 1 },
});
