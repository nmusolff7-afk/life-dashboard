import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '../../components/apex';
import { useTokens } from '../../lib/theme';

function formatDate(iso: string | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

interface StatCellProps {
  label: string;
  value: string;
  color?: string;
}

function StatCell({ label, value, color }: StatCellProps) {
  const t = useTokens();
  return (
    <View style={[styles.statCell, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.statLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: color ?? t.subtle }]}>{value}</Text>
    </View>
  );
}

export default function DayDetailScreen() {
  const t = useTokens();
  const router = useRouter();
  const { date } = useLocalSearchParams<{ date: string }>();
  const formatted = formatDate(date);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Text style={[styles.back, { color: t.accent }]}>‹ Back</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={[styles.headerTitle, { color: t.text }]}>{formatted || 'Day'}</Text>
          <Text style={[styles.headerHint, { color: t.muted }]}>{date}</Text>
        </View>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Summary stat grid */}
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Summary</Text>
        <View style={styles.statGrid}>
          <StatCell label="Weight" value="—" />
          <StatCell label="Steps" value="—" />
          <StatCell label="Calories" value="—" color={t.cal} />
          <StatCell label="Deficit" value="—" />
          <StatCell label="Protein" value="—" color={t.protein} />
          <StatCell label="Carbs" value="—" color={t.carbs} />
          <StatCell label="Fat" value="—" color={t.fat} />
          <StatCell label="Sodium" value="—" color={t.sodium} />
        </View>

        {/* Fitness section */}
        <View style={[styles.catSection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.catTitle, { color: t.fitness }]}>Fitness</Text>
          <EmptyState title="No fitness activity logged" description="Workouts, weight, sleep, HRV for this day." />
        </View>

        <View style={[styles.catSection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.catTitle, { color: t.nutrition }]}>Nutrition</Text>
          <EmptyState title="No meals logged" description="Meals, macros, and water for this day." />
        </View>

        <View style={[styles.catSection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.catTitle, { color: t.finance }]}>Finance</Text>
          <EmptyState title="No transactions" description="Spending and bills on this day." />
        </View>

        <View style={[styles.catSection, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.catTitle, { color: t.time }]}>Time</Text>
          <EmptyState title="No timeline data" description="Calendar, Screen Time, and location for this day." />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: 1, justifyContent: 'space-between' },
  back: { fontSize: 16, fontWeight: '600' },
  headerTitle: { fontSize: 15, fontWeight: '700' },
  headerHint: { fontSize: 11, marginTop: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCell: { flexBasis: '22%', flexGrow: 1, borderWidth: 1, borderRadius: 14, padding: 12, gap: 2 },
  statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 18, fontWeight: '700' },
  catSection: { borderWidth: 1, borderRadius: 20, padding: 14, gap: 6 },
  catTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
});
