import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState, FAB, StatCard, SubTabs } from '../../components/apex';
import { useTodayNutrition, useTodayWorkouts } from '../../lib/hooks/useHomeData';
import { useTokens } from '../../lib/theme';

type Tab = 'today' | 'progress' | 'history';

export default function NutritionScreen() {
  const t = useTokens();
  const [tab, setTab] = useState<Tab>('today');

  const nutrition = useTodayNutrition();
  const workouts = useTodayWorkouts();
  const burn = workouts.data?.burn ?? 0;
  const consumed = nutrition.data?.totals.total_calories ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
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
            {/* Calorie ring shell */}
            <View style={styles.ringWrap}>
              <View style={[styles.ringCircle, { borderColor: t.nutrition }]}>
                <Text style={[styles.ringBig, { color: t.text }]}>—</Text>
                <Text style={[styles.ringLabel, { color: t.muted }]}>kcal remaining</Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <StatCard
                label="Proj. Burn"
                value={burn > 0 ? String(Math.round(burn)) : '—'}
                valueColor={burn > 0 ? t.cal : undefined}
                style={styles.statHalf}
              />
              <StatCard
                label="Cals Consumed"
                value={consumed > 0 ? String(Math.round(consumed)) : '—'}
                valueColor={consumed > 0 ? t.cal : undefined}
                style={styles.statHalf}
              />
            </View>

            {/* Macro summary card shell */}
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>Macros today</Text>
              <View style={styles.macroRow}>
                <View style={styles.macroCell}>
                  <Text style={[styles.macroLabel, { color: t.protein }]}>Protein</Text>
                  <Text style={[styles.macroValue, { color: t.text }]}>— / —</Text>
                </View>
                <View style={styles.macroCell}>
                  <Text style={[styles.macroLabel, { color: t.carbs }]}>Carbs</Text>
                  <Text style={[styles.macroValue, { color: t.text }]}>— / —</Text>
                </View>
                <View style={styles.macroCell}>
                  <Text style={[styles.macroLabel, { color: t.fat }]}>Fat</Text>
                  <Text style={[styles.macroValue, { color: t.text }]}>— / —</Text>
                </View>
              </View>
            </View>

            {/* Meal logger card shell */}
            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>Log a meal</Text>
              <View style={[styles.inputBox, { borderColor: t.border }]}>
                <Text style={[styles.inputPlaceholder, { color: t.subtle }]}>
                  Describe what you ate — text, voice, photo, or barcode.
                </Text>
              </View>
            </View>

            {/* Recent meals chip strip */}
            <View style={styles.recentWrap}>
              <Text style={[styles.sectionLabel, { color: t.muted }]}>Recent meals</Text>
              <Text style={[styles.recentEmpty, { color: t.subtle }]}>No recent meals yet.</Text>
            </View>
          </>
        ) : null}
        {tab === 'progress' ? (
          <EmptyState icon="📊" title="Calorie & macro trends" description="7 / 30 / 90-day charts appear here." />
        ) : null}
        {tab === 'history' ? (
          <EmptyState icon="🍽️" title="Meal history" description="Logged meals by date appear here." />
        ) : null}
      </ScrollView>
      <FAB from="nutrition" />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 96, gap: 16 },
  ringWrap: { alignItems: 'center', paddingVertical: 8 },
  ringCircle: { width: 180, height: 180, borderRadius: 90, borderWidth: 10, alignItems: 'center', justifyContent: 'center' },
  ringBig: { fontSize: 40, fontWeight: '700' },
  ringLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 10 },
  statHalf: { flexBasis: '48%', flexGrow: 1 },
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  cardTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  macroRow: { flexDirection: 'row' },
  macroCell: { flex: 1, gap: 2 },
  macroLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  macroValue: { fontSize: 16, fontWeight: '700' },
  inputBox: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 64 },
  inputPlaceholder: { fontSize: 14 },
  recentWrap: { gap: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  recentEmpty: { fontSize: 13 },
});
