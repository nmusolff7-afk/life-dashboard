import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  label: string;
  /** Brand color for the label text and the default fill color. */
  color: string;
  consumed: number;
  target?: number | null;
  unit: string;
}

/** Shared macro/micro bar row. Filled portion is `color` by default; flips to
 *  green when within ±5% of the target (hit) and danger when over 120% (over). */
export function ProgressRow({ label, color, consumed, target, unit }: Props) {
  const t = useTokens();
  const hasTarget = target != null && target > 0;
  const targetVal = (target as number) ?? 0;
  const pct = hasTarget ? Math.min(1, consumed / targetVal) : 0;
  const hit = hasTarget && consumed >= targetVal * 0.95 && consumed <= targetVal * 1.05;
  const over = hasTarget && consumed > targetVal * 1.2;
  const fillColor = over ? t.danger : hit ? t.green : color;
  const valueColor = over ? t.danger : hit ? t.green : color;

  const valueText = hasTarget
    ? `${Math.round(consumed)}${unit} / ${Math.round(targetVal)}${unit}`
    : `${Math.round(consumed)}${unit}`;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: t.muted }]}>{label}</Text>
        <Text style={[styles.value, { color: valueColor }]}>{valueText}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: fillColor, width: `${Math.max(pct * 100, hasTarget ? 2 : 0)}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  track: { height: 6, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
});
