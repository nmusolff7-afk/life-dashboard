import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';
import { ProgressRow } from './ProgressRow';

interface MacroValues {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

interface MacroTargets {
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
}

interface Props {
  consumed: MacroValues;
  targets?: MacroTargets;
  /** No meals logged today — render an em-dash empty state. */
  empty?: boolean;
}

/** 6-bar vertical stack card for Nutrition Today: protein / carbs / fat above
 *  a thin divider, then sugar / fiber / sodium. Reuses the shared ProgressRow. */
export function NutritionMacrosCard({ consumed, targets, empty }: Props) {
  const t = useTokens();

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Macros &amp; micros</Text>
      {empty ? (
        <Text style={[styles.empty, { color: t.muted }]}>
          Log a meal to see your macros and micros.
        </Text>
      ) : (
        <>
          <ProgressRow label="Protein" color={t.protein} consumed={consumed.proteinG}  target={targets?.proteinG}  unit="g" />
          <ProgressRow label="Carbs"   color={t.carbs}   consumed={consumed.carbsG}    target={targets?.carbsG}    unit="g" />
          <ProgressRow label="Fat"     color={t.fat}     consumed={consumed.fatG}      target={targets?.fatG}      unit="g" />
          <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
          <ProgressRow label="Sugar"   color={t.sugar}   consumed={consumed.sugarG}    target={targets?.sugarG}    unit="g" />
          <ProgressRow label="Fiber"   color={t.fiber}   consumed={consumed.fiberG}    target={targets?.fiberG}    unit="g" />
          <ProgressRow label="Sodium"  color={t.sodium}  consumed={consumed.sodiumMg}  target={targets?.sodiumMg}  unit="mg" />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    gap: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1 },
  empty: { fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  divider: { height: 1 },
});
