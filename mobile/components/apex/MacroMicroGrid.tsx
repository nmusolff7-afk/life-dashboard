import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Values {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

interface Targets {
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
}

interface Props {
  consumed: Values;
  targets?: Targets;
  /** When true, render "—" across all cells (meaningful "nothing logged" state). */
  empty?: boolean;
}

function fmt(n: number, unit: string): string {
  return `${Math.round(n)}${unit}`;
}

function fmtPair(consumed: number, target: number | null | undefined, unit: string): string {
  if (target == null) return fmt(consumed, unit);
  return `${Math.round(consumed)} / ${Math.round(target)}${unit}`;
}

/** 3×2 compact grid — protein/carbs/fat on top row, sugar/fiber/sodium bottom. */
export function MacroMicroGrid({ consumed, targets, empty }: Props) {
  const t = useTokens();

  const cells = empty
    ? [
        { label: 'Protein', color: t.protein, value: '—' },
        { label: 'Carbs',   color: t.carbs,   value: '—' },
        { label: 'Fat',     color: t.fat,     value: '—' },
        { label: 'Sugar',   color: t.sugar,   value: '—' },
        { label: 'Fiber',   color: t.fiber,   value: '—' },
        { label: 'Sodium',  color: t.sodium,  value: '—' },
      ]
    : [
        { label: 'Protein', color: t.protein, value: fmtPair(consumed.proteinG, targets?.proteinG, 'g') },
        { label: 'Carbs',   color: t.carbs,   value: fmtPair(consumed.carbsG,   targets?.carbsG,   'g') },
        { label: 'Fat',     color: t.fat,     value: fmtPair(consumed.fatG,     targets?.fatG,     'g') },
        { label: 'Sugar',   color: t.sugar,   value: fmtPair(consumed.sugarG,   targets?.sugarG,   'g') },
        { label: 'Fiber',   color: t.fiber,   value: fmtPair(consumed.fiberG,   targets?.fiberG,   'g') },
        { label: 'Sodium',  color: t.sodium,  value: fmtPair(consumed.sodiumMg, targets?.sodiumMg, 'mg') },
      ];

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <Text style={[styles.title, { color: t.muted }]}>Macros &amp; micros today</Text>
      <View style={styles.grid}>
        {cells.map((c) => (
          <View key={c.label} style={styles.cell}>
            <Text style={[styles.cellLabel, { color: c.color }]}>{c.label}</Text>
            <Text style={[styles.cellValue, { color: c.value === '—' ? t.subtle : t.text }]}>{c.value}</Text>
          </View>
        ))}
      </View>
      {empty ? (
        <Text style={[styles.footer, { color: t.subtle }]}>Log a meal to fill this in.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 20, padding: 16, gap: 12 },
  title: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '33.333%', paddingVertical: 6, gap: 2 },
  cellLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  cellValue: { fontSize: 14, fontWeight: '700' },
  footer: { fontSize: 11, marginTop: 2 },
});
