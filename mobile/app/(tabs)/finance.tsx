import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, FAB, ScreenHeader, SubTabs } from '../../components/apex';
import { useTokens } from '../../lib/theme';

type Tab = 'today' | 'progress' | 'history';

const SUBSYSTEMS = [
  { name: 'Budget', desc: 'Weekly spend vs target' },
  { name: 'Spending', desc: 'Category breakdown' },
  { name: 'Bills', desc: 'Upcoming & on-time rate' },
  { name: 'Savings', desc: 'Rate & emergency fund' },
];

export default function FinanceScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Finance" />
      <SubTabs<Tab>
        tabs={[
          { value: 'today', label: 'Today' },
          { value: 'progress', label: 'Progress' },
          { value: 'history', label: 'History' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {tab === 'today' ? (
          <>
            {/* Safe to Spend hero */}
            <View style={[styles.hero, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.heroLabel, { color: t.muted }]}>Safe to spend this week</Text>
              <Text style={[styles.heroBig, { color: t.text }]}>$—</Text>
              <Text style={[styles.heroHint, { color: t.subtle }]}>Connect a bank account via Plaid to activate.</Text>
            </View>

            {/* Subsystem cards */}
            <View style={styles.grid}>
              {SUBSYSTEMS.map((s) => (
                <View key={s.name} style={[styles.subCard, { backgroundColor: t.surface, borderColor: t.border }]}>
                  <Text style={[styles.subTitle, { color: t.finance }]}>{s.name}</Text>
                  <Text style={[styles.subScore, { color: t.subtle }]}>—</Text>
                  <Text style={[styles.subHint, { color: t.muted }]}>{s.desc}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
        {tab === 'progress' ? (
          <EmptyState icon="📈" title="Finance trends" description="Spending trend and savings rate over time appear here." />
        ) : null}
        {tab === 'history' ? (
          <EmptyState icon="🧾" title="Transaction history" description="Transactions by date appear here." />
        ) : null}
      </ScrollView>
      <FAB from="finance" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },
  hero: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 6 },
  heroLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroBig: { fontSize: 36, fontWeight: '700' },
  heroHint: { fontSize: 12, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  subCard: { flexBasis: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 20, padding: 16, gap: 4 },
  subTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  subScore: { fontSize: 28, fontWeight: '700' },
  subHint: { fontSize: 11 },
});
