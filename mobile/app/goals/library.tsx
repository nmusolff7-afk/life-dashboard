import { Stack } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

type Category = 'Fitness' | 'Nutrition' | 'Finance' | 'Time';

interface GoalDef {
  id: string;
  name: string;
  category: Category;
  description: string;
  /** true only for fitness body-composition goals per PRD v1.27 §4.10 */
  affectsCalorieMath?: boolean;
}

// PRD §4.10.3 — 22 goals. Exact IDs are placeholders; founder will reconcile with PRD library.
const GOALS: GoalDef[] = [
  // Fitness (6)
  { id: 'FIT-01', category: 'Fitness', name: 'Reach goal weight', description: 'Hit a target body weight', affectsCalorieMath: true },
  { id: 'FIT-02', category: 'Fitness', name: 'Hit a new strength PR', description: 'Beat a personal best on a lift' },
  { id: 'FIT-03', category: 'Fitness', name: '14-day lift streak', description: 'Strength train on schedule for 14 days' },
  { id: 'FIT-04', category: 'Fitness', name: 'Run a 5K under 25 min', description: 'Improve cardio performance' },
  { id: 'FIT-05', category: 'Fitness', name: '12-week program consistency', description: 'Follow a training plan 12 weeks' },
  { id: 'FIT-06', category: 'Fitness', name: 'Maintain body fat %', description: 'Hold body composition while training' },

  // Nutrition (5)
  { id: 'NUT-01', category: 'Nutrition', name: 'Hit protein 30 days', description: 'Reach protein target for 30 consecutive days' },
  { id: 'NUT-02', category: 'Nutrition', name: 'Log every meal (30 days)', description: 'Log at least one meal per day' },
  { id: 'NUT-03', category: 'Nutrition', name: 'Stay under sugar target', description: 'Keep added sugar below FDA default' },
  { id: 'NUT-04', category: 'Nutrition', name: 'Stay under sodium target', description: 'Keep sodium under 2300mg' },
  { id: 'NUT-05', category: 'Nutrition', name: 'Hold weekly deficit', description: 'Average weekly calories within deficit band' },

  // Finance (5)
  { id: 'FIN-01', category: 'Finance', name: 'Save $10,000', description: 'Cumulative savings target' },
  { id: 'FIN-02', category: 'Finance', name: 'Pay off a credit card', description: 'Balance to zero' },
  { id: 'FIN-03', category: 'Finance', name: 'Build 3-month emergency fund', description: 'Reach 3× monthly expenses' },
  { id: 'FIN-04', category: 'Finance', name: 'Stay within budget 4 weeks', description: 'Weekly spend under target 4 weeks running' },
  { id: 'FIN-05', category: 'Finance', name: 'No impulse > $100 (30 days)', description: 'No unplanned discretionary spend over $100' },

  // Time (6)
  { id: 'TIM-01', category: 'Time', name: 'Inbox zero 30 days', description: 'Keep important inbox clear' },
  { id: 'TIM-02', category: 'Time', name: 'Workday boundary', description: 'Consistent workday start and end' },
  { id: 'TIM-03', category: 'Time', name: '60-min focus block daily', description: 'One uninterrupted focus block every workday' },
  { id: 'TIM-04', category: 'Time', name: 'Reduce screen time 20%', description: 'Under baseline for 30 days' },
  { id: 'TIM-05', category: 'Time', name: 'No-phone dinners', description: 'No phone pickups during dinner window' },
  { id: 'TIM-06', category: 'Time', name: 'Bedtime consistency', description: 'Bedtime SD under 30 min for 14 days' },
];

const CATEGORY_ORDER: Category[] = ['Fitness', 'Nutrition', 'Finance', 'Time'];

export default function GoalLibraryScreen() {
  const t = useTokens();
  const colorFor = (c: Category) =>
    c === 'Fitness' ? t.fitness : c === 'Nutrition' ? t.nutrition : c === 'Finance' ? t.finance : t.time;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: 'Goal library', headerStyle: { backgroundColor: t.bg }, headerTintColor: t.text, headerShadowVisible: false }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: t.muted }]}>
          22 goals across four categories. Goal picker is non-functional in the skeleton.
        </Text>
        {CATEGORY_ORDER.map((cat) => (
          <View key={cat} style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colorFor(cat) }]}>{cat}</Text>
            {GOALS.filter((g) => g.category === cat).map((g) => (
              <Pressable
                key={g.id}
                onPress={() =>
                  Alert.alert('Goal selection coming soon', `${g.name}\n\n${g.description}${g.affectsCalorieMath ? '\n\nThis goal recomputes calorie targets.' : ''}`)
                }
                style={[styles.goalRow, { backgroundColor: t.surface, borderColor: t.border }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.goalHeader}>
                    <Text style={[styles.goalName, { color: t.text }]}>{g.name}</Text>
                    {g.affectsCalorieMath ? <Text style={[styles.calorieTag, { color: t.accent, borderColor: t.accent }]}>affects calorie math</Text> : null}
                  </View>
                  <Text style={[styles.goalDesc, { color: t.muted }]}>{g.description}</Text>
                </View>
                <Text style={[styles.goalId, { color: t.subtle }]}>{g.id}</Text>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 40 },
  intro: { fontSize: 13, fontStyle: 'italic' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  goalRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  goalName: { fontSize: 15, fontWeight: '700' },
  calorieTag: { fontSize: 10, fontWeight: '600', borderWidth: 1, borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2 },
  goalDesc: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  goalId: { fontSize: 10, fontWeight: '600' },
});
