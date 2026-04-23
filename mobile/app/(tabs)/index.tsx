import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FAB, ScreenHeader } from '../../components/apex';
import { useTokens } from '../../lib/theme';

const STREAK_DAYS = 90;

interface CategoryCardProps {
  label: string;
  color: string;
  onPress: () => void;
}

function CategoryCard({ label, color, onPress }: CategoryCardProps) {
  const t = useTokens();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.catCard, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.catLabel, { color }]}>{label}</Text>
      <Text style={[styles.catScore, { color: t.subtle }]}>—</Text>
      <Text style={[styles.catHint, { color: t.subtle }]}>Connect sources to activate</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const t = useTokens();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScreenHeader title="Life Dashboard" weather="72°" />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Streak strip — 90 days, empty */}
        <View style={styles.streakWrap}>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>Streak · 90 days</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.streakStrip}>
            {Array.from({ length: STREAK_DAYS }).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => {
                  // Skeleton: link back N days from today. Real date math lives in Day Detail.
                  const d = new Date();
                  d.setDate(d.getDate() - (STREAK_DAYS - 1 - i));
                  const iso = d.toISOString().slice(0, 10);
                  router.push({ pathname: '/day/[date]', params: { date: iso } });
                }}
                style={[styles.streakDot, { backgroundColor: t.surface2 }]}
              />
            ))}
          </ScrollView>
        </View>

        {/* Overall Score */}
        <View style={styles.overallWrap}>
          <Text style={[styles.overallBig, { color: t.text }]}>—</Text>
          <Text style={[styles.overallLabel, { color: t.muted }]}>Overall</Text>
        </View>

        {/* 4 category cards */}
        <View style={styles.catGrid}>
          <CategoryCard label="Fitness" color={t.fitness} onPress={() => router.push('/(tabs)/fitness')} />
          <CategoryCard label="Nutrition" color={t.nutrition} onPress={() => router.push('/(tabs)/nutrition')} />
          <CategoryCard label="Finance" color={t.finance} onPress={() => router.push('/(tabs)/finance')} />
          <CategoryCard label="Time" color={t.time} onPress={() => router.push('/(tabs)/time')} />
        </View>

        {/* Day Timeline preview strip */}
        <View style={[styles.timelineStrip, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.muted, marginBottom: 6 }]}>Today</Text>
          <Text style={[styles.timelineEmpty, { color: t.subtle }]}>Day Timeline will appear here once connections are granted.</Text>
        </View>

        {/* Goals strip */}
        <Pressable onPress={() => router.push('/goals/index')} style={[styles.goalsStrip, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.sectionLabel, { color: t.muted }]}>Active goals</Text>
          <Text style={[styles.goalsEmpty, { color: t.subtle }]}>No active goals yet. Tap to browse the library.</Text>
        </Pressable>
      </ScrollView>
      <FAB />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 96, gap: 16 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  streakWrap: { paddingHorizontal: 16, paddingTop: 12, gap: 6 },
  streakStrip: { gap: 3, paddingVertical: 4 },
  streakDot: { width: 10, height: 28, borderRadius: 3 },
  overallWrap: { alignItems: 'center', paddingVertical: 12 },
  overallBig: { fontSize: 56, fontWeight: '700' },
  overallLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  catGrid: { paddingHorizontal: 16, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  catCard: { flexBasis: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 20, padding: 18, gap: 4 },
  catLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  catScore: { fontSize: 32, fontWeight: '700' },
  catHint: { fontSize: 11, marginTop: 4 },
  timelineStrip: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, padding: 16 },
  timelineEmpty: { fontSize: 13 },
  goalsStrip: { marginHorizontal: 16, borderRadius: 20, borderWidth: 1, padding: 16, gap: 6 },
  goalsEmpty: { fontSize: 13 },
});
