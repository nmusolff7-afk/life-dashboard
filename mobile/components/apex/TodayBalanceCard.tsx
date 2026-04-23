import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  caloriesConsumed: number;
  caloriesBurned: number;
  /** Projected TDEE or RMR. When provided, used as the burn figure in the equation
   *  (matching Flask: "tdee - consumed"). When absent, falls back to caloriesBurned. */
  projectedBurn?: number | null;
}

export function TodayBalanceCard({ caloriesConsumed, caloriesBurned, projectedBurn }: Props) {
  const t = useTokens();
  const burn = projectedBurn ?? caloriesBurned;
  const balance = burn - caloriesConsumed;
  const isDeficit = balance >= 0;
  const hasData = caloriesConsumed > 0 || burn > 0;

  const mainColor = !hasData ? t.muted : isDeficit ? t.green : t.danger;
  const label = !hasData ? 'Today’s balance' : isDeficit ? 'Calorie deficit' : 'Calorie surplus';
  const display = !hasData ? '—' : `${Math.abs(balance)} kcal`;

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
      <Text style={[styles.big, { color: mainColor }]}>{display}</Text>
      {hasData ? (
        <Text style={[styles.eq, { color: t.muted }]}>
          <Text style={{ color: t.text, fontWeight: '600' }}>{burn}</Text>
          {' burn − '}
          <Text style={{ color: t.text, fontWeight: '600' }}>{caloriesConsumed}</Text>
          {' eaten = '}
          <Text style={{ color: mainColor, fontWeight: '700' }}>{Math.abs(balance)}</Text>
          {isDeficit ? ' deficit' : ' surplus'}
        </Text>
      ) : (
        <Text style={[styles.eq, { color: t.subtle }]}>
          Log meals and workouts to see your balance.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 20, gap: 6, alignItems: 'center' },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  big: { fontSize: 36, fontWeight: '700', marginTop: 2 },
  eq: { fontSize: 12, marginTop: 6, textAlign: 'center' },
});
