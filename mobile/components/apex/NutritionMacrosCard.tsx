import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
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

/** Nutrition Today macros card. Default view shows macros only
 *  (protein / carbs / fat). Tap the expansion footer to reveal micros
 *  (sugar / fiber / sodium). Matches Home macros/micros pattern per
 *  11.5.6 founder spec. */
export function NutritionMacrosCard({ consumed, targets, empty }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    haptics.fire('tap');
    setExpanded((v) => !v);
  };

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <Text style={[styles.title, { color: t.muted }]}>Macros</Text>
      {empty ? (
        <Text style={[styles.empty, { color: t.muted }]}>
          Log a meal to see your macros and micros.
        </Text>
      ) : (
        <>
          <ProgressRow label="Protein" color={t.nutrition} consumed={consumed.proteinG}  target={targets?.proteinG}  unit="g" />
          <ProgressRow label="Carbs"   color={t.nutrition} consumed={consumed.carbsG}    target={targets?.carbsG}    unit="g" />
          <ProgressRow label="Fat"     color={t.nutrition} consumed={consumed.fatG}      target={targets?.fatG}      unit="g" />

          {expanded ? (
            <>
              <View style={[styles.divider, { backgroundColor: 'rgba(255,255,255,0.04)' }]} />
              <ProgressRow label="Sugar"   color={t.muted}     consumed={consumed.sugarG}    target={targets?.sugarG}    unit="g" />
              <ProgressRow label="Fiber"   color={t.muted}     consumed={consumed.fiberG}    target={targets?.fiberG}    unit="g" />
              <ProgressRow label="Sodium"  color={t.muted}     consumed={consumed.sodiumMg}  target={targets?.sodiumMg}  unit="mg" />
            </>
          ) : null}

          <Pressable
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide micros' : 'Tap to show sugar, fiber, and sodium'}
            style={({ pressed }) => [
              styles.expandBtn,
              { backgroundColor: t.surface2, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Text style={[styles.expandLabel, { color: t.muted }]}>
              {expanded ? 'Hide micros' : 'Tap to show sugar · fiber · sodium'}
            </Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={t.muted} />
          </Pressable>
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
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 8,
    marginTop: 2,
  },
  expandLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
});
