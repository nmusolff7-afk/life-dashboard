import { Stack, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WeightTrendCard } from '../../../components/apex';
import { useProfile } from '../../../lib/hooks/useHomeData';
import { useTokens } from '../../../lib/theme';
import { useUnits } from '../../../lib/useUnits';

/** Body subsystem detail — weight trend + body-comp stats + goal pace. */
export default function BodyDetail() {
  const t = useTokens();
  const router = useRouter();
  const units = useUnits();
  const profile = useProfile();

  const weight = profile.data?.current_weight_lbs;
  const target = profile.data?.target_weight_lbs;
  const bf = profile.data?.body_fat_pct;
  const heightFt = profile.data?.height_ft;
  const heightIn = profile.data?.height_in;
  const heightTotalIn = (heightFt ?? 0) * 12 + (heightIn ?? 0);
  const bmi = weight != null && heightTotalIn > 0
    ? +((weight * 703) / (heightTotalIn * heightTotalIn)).toFixed(1)
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen
        options={{
          title: 'Body',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <WeightTrendCard />

        <View style={[styles.statsCard, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Text style={[styles.statsTitle, { color: t.muted }]}>Body composition</Text>
          <StatRow label="Current" value={weight != null ? units.formatWeight(weight) : '—'} />
          <StatRow label="Target" value={target != null ? units.formatWeight(target) : '—'} />
          <StatRow label="Body fat" value={bf != null ? `${bf}%` : '—'} />
          <StatRow label="BMI" value={bmi != null ? String(bmi) : '—'} />
        </View>

        <Pressable
          onPress={() => router.push('/settings/profile/body-stats')}
          style={({ pressed }) => [
            styles.editBtn,
            { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          <Text style={styles.editLabel}>Edit body stats</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  const t = useTokens();
  return (
    <View style={[styles.row, { borderBottomColor: t.border }]}>
      <Text style={[styles.rowLabel, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: t.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 14 },
  statsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 2,
  },
  statsTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  editBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
  },
  editLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
