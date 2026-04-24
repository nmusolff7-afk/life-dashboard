import { Stack } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface FAQ {
  q: string;
  a: string;
}

const QUESTIONS: FAQ[] = [
  {
    q: "How does Life Dashboard calculate my calorie target?",
    a: "Target = TDEE + deficit, floored at 1,200 kcal for safety. TDEE is resting metabolic rate (RMR) + NEAT (occupation + steps) + a thermic-effect-of-food estimate. You can override the deficit on Settings → Profile → Macro targets.",
  },
  {
    q: "Why does my weight not update immediately on the Home ring?",
    a: "The Home card reads from today's logged data. Changes in Body Stats trigger a refresh the next time the Home screen comes into focus — switch tabs once if it looks stale.",
  },
  {
    q: "What does the AI use to estimate meal / workout calories?",
    a: "Claude Opus (meal photo scans) and Sonnet (text estimates). Inputs: your description + your profile context (weight, age, goal). Never your logged-data history. On the Privacy page you can disable specific sources from flowing into AI prompts.",
  },
  {
    q: "Why is there no scale connected?",
    a: "HealthKit integration (iOS) and Health Connect (Android) ship with a later phase. Today you log weight manually from Fitness → Today.",
  },
  {
    q: "Can I switch between metric and imperial?",
    a: "Yes — Settings → Preferences → Units. Canonical storage is pounds + feet/inches; metric is a display-only conversion so switching back and forth loses no precision.",
  },
  {
    q: "What happens to my data when I sign out?",
    a: "Data stays on the Life Dashboard server. Signing out clears the local token and returns you to the sign-in screen; your meals, workouts, weight history, and profile persist. Delete account (Settings → Data & account) is the only permanent option.",
  },
  {
    q: "How does time-to-goal work?",
    a: "Uses the standard 3,500 kcal ≈ 1 lb rule. Projected weeks = absolute weight delta / (absolute deficit × 7 ÷ 3,500). Real-world results depend on adherence and metabolic adaptation; the projection is an upper bound, not a guarantee.",
  },
  {
    q: "Why can't I log a meal below 1,200 calories?",
    a: "You can log whatever you ate. The 1,200 floor applies only to the daily calorie TARGET on the Macros page. It exists so the deficit slider doesn't set a target below safe intake.",
  },
  {
    q: "How do I regenerate my AI profile?",
    a: "Settings → Profile → Regenerate AI profile map. Uses one AI call, updates your one-sentence summary, leverage point, and recomputes targets. Your logged history stays untouched.",
  },
  {
    q: "What's a 'streak' on the Home page?",
    a: "Consecutive days with at least one meal OR workout logged. Missing a full day breaks the streak — logging late (same date) doesn't.",
  },
];

export default function FAQ() {
  const t = useTokens();
  const [open, setOpen] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'FAQ',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {QUESTIONS.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <Pressable
              key={i}
              onPress={() => toggle(i)}
              style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <View style={styles.row}>
                <Text style={[styles.q, { color: t.text }]}>{item.q}</Text>
                <Text style={[styles.caret, { color: t.muted }]}>{isOpen ? '–' : '+'}</Text>
              </View>
              {isOpen ? (
                <Text style={[styles.a, { color: t.muted }]}>{item.a}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  q: { flex: 1, fontSize: 14, fontWeight: '600' },
  caret: { fontSize: 20, fontWeight: '500' },
  a: { fontSize: 13, lineHeight: 19 },
});
