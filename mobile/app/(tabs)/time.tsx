import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, FAB, SubTabs, TabHeader } from '../../components/apex';
import { ChatDock } from '../../components/chat/ChatDock';
import { useTokens } from '../../lib/theme';
import { useResetScrollOnFocus } from '../../lib/useResetScrollOnFocus';

type Tab = 'today' | 'patterns' | 'timeline';

const PRODUCTIVITY = [
  { name: 'Calendar', desc: 'Upcoming events, meeting hours' },
  { name: 'Email', desc: 'Important inbox, unreplied' },
  { name: 'Tasks', desc: 'Today\'s tasks & completion' },
];

const ATTENTION = [
  { name: 'Screen Time', desc: 'Pickups, longest focus block' },
  { name: 'Location', desc: 'Place pattern today' },
];

export default function TimeScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');
  const { ref: scrollRef, resetScroll } = useResetScrollOnFocus();

  useFocusEffect(
    useCallback(() => {
      setTab('today');
    }, []),
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
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
            onChange={(next) => {
              setTab(next);
              resetScroll();
            }}
            compact
          />
        }
      />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        {tab === 'today' ? (
          <>
            {/* Today's Focus card */}
            <View style={[styles.focusCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.focusLabel, { color: t.muted }]}>Today&apos;s focus</Text>
              <Text style={[styles.focusBig, { color: t.text }]}>—</Text>
              <Text style={[styles.focusHint, { color: t.subtle }]}>Connect calendar & tasks to activate.</Text>
            </View>

            {/* Productivity subsystem */}
            <Text style={[styles.sectionLabel, { color: t.muted }]}>Productivity</Text>
            {PRODUCTIVITY.map((s) => (
              <View key={s.name} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.time }]}>{s.name}</Text>
                  <Text style={[styles.rowHint, { color: t.muted }]}>{s.desc}</Text>
                </View>
                <Text style={[styles.rowScore, { color: t.subtle }]}>—</Text>
              </View>
            ))}

            {/* Attention subsystem */}
            <Text style={[styles.sectionLabel, { color: t.muted, marginTop: 8 }]}>Attention</Text>
            {ATTENTION.map((s) => (
              <View key={s.name} style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowTitle, { color: t.time }]}>{s.name}</Text>
                  <Text style={[styles.rowHint, { color: t.muted }]}>{s.desc}</Text>
                </View>
                <Text style={[styles.rowScore, { color: t.subtle }]}>—</Text>
              </View>
            ))}
          </>
        ) : null}
        {tab === 'patterns' ? (
          <EmptyState icon="🕸️" title="Patterns" description="Wake time, screen-time peaks, place visits, meeting density — your personal rhythm map." />
        ) : null}
        {tab === 'timeline' ? (
          <EmptyState icon="⏱️" title="Day Timeline" description="Your day minute-by-minute, inferred from calendar + Screen Time + location." />
        ) : null}
      </ScrollView>
      <FAB from="time" />
      <ChatDock surface="time" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 10 },
  focusCard: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 6 },
  focusLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  focusBig: { fontSize: 32, fontWeight: '700' },
  focusHint: { fontSize: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  rowTitle: { fontSize: 14, fontWeight: '700' },
  rowHint: { fontSize: 12, marginTop: 2 },
  rowScore: { fontSize: 22, fontWeight: '700' },
});
