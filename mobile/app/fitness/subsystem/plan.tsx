import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../../lib/theme';
import { useStrengthSession } from '../../../lib/useStrengthSession';
import { loadTemplate, type StrengthExercise } from '../../../lib/strength';

/** Plan subsystem — current plan's "template" (last session exercises) +
 *  today's session launcher + adherence placeholder. Full plan generation
 *  (Sonnet 4.6 per PRD §10.3.9) is deferred to the next phase once server-
 *  side plan persistence lands. For now, the plan IS the last-session
 *  template that auto-restores for the next workout. */
export default function PlanDetail() {
  const t = useTokens();
  const strength = useStrengthSession();
  const [template, setTemplate] = useState<StrengthExercise[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    loadTemplate().then((tmpl) => {
      if (!cancelled) {
        setTemplate(tmpl);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const launchStrength = () => {
    if (strength.active) strength.maximize();
    else void strength.start();
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Plan',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : template && template.length > 0 ? (
          <>
            <View style={[styles.heroCard, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.heroLabel, { color: t.muted }]}>TODAY'S SESSION</Text>
              <Text style={[styles.heroTitle, { color: t.text }]}>
                {template.length} exercise{template.length === 1 ? '' : 's'}
              </Text>
              <Text style={[styles.heroSub, { color: t.muted }]}>
                Auto-restored from your last session
              </Text>
              <Pressable
                onPress={launchStrength}
                style={({ pressed }) => [
                  styles.launchBtn,
                  { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
                ]}>
                <Ionicons name="barbell" size={18} color="#fff" />
                <Text style={styles.launchLabel}>
                  {strength.active ? 'Return to session' : 'Start session'}
                </Text>
              </Pressable>
            </View>

            <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.cardTitle, { color: t.muted }]}>Exercise list</Text>
              {template.map((ex, i) => (
                <View key={i} style={[styles.exerciseRow, { borderBottomColor: t.border }]}>
                  <Text style={[styles.exerciseName, { color: t.text }]} numberOfLines={1}>
                    {ex.name}
                  </Text>
                  <Text style={[styles.exerciseMeta, { color: t.muted }]}>
                    {ex.sets.length} sets
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Ionicons name="calendar-outline" size={40} color={t.muted} />
            <Text style={[styles.emptyTitle, { color: t.text }]}>No plan yet</Text>
            <Text style={[styles.emptyBody, { color: t.muted }]}>
              Start a strength session from the Fitness tab. The exercises you
              log will become your auto-restoring template for the next
              session.
            </Text>
            <Pressable
              onPress={launchStrength}
              style={({ pressed }) => [
                styles.launchBtn,
                { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
              ]}>
              <Ionicons name="barbell" size={18} color="#fff" />
              <Text style={styles.launchLabel}>Start first session</Text>
            </Pressable>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Plan adherence</Text>
          <Text style={[styles.note, { color: t.subtle }]}>
            Adherence tracking (scheduled-vs-completed sessions) lands when
            server-side plan persistence ships. For now, the Plan subsystem
            score reflects your recent strength activity directly.
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>AI plan generation</Text>
          <Text style={[styles.note, { color: t.subtle }]}>
            AI-generated weekly plan (Sonnet, 1/30d Core · 3/30d Pro) launches
            in a later phase. For now, your logged sessions drive the
            auto-template.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  heroCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    alignItems: 'center',
    gap: 6,
  },
  heroLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroTitle: { fontSize: 24, fontWeight: '700' },
  heroSub: { fontSize: 12, marginBottom: 8 },
  launchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 100,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  launchLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  note: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  exerciseName: { fontSize: 13, fontWeight: '600', flex: 1 },
  exerciseMeta: { fontSize: 11 },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
});
