import { Slider } from '@miblanchard/react-native-slider';
import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Override the color of the track fill + value text. Defaults to accent. */
  color?: string;
  /** Unit appended to the value (e.g. "g", "kcal"). */
  unit?: string;
  /** Formatter for the big value display; overrides `unit` if provided. */
  format?: (n: number) => string;
  /** Optional sub-text under the slider (e.g. "Suggested: 150g"). */
  hint?: string;
}

/** Horizontal slider row with a label + live-updating value + optional hint.
 *  Uses @miblanchard/react-native-slider (pure JS — avoids the Windows
 *  path-resolution bug on @react-native-community/slider). */
export function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  color,
  unit,
  format,
  hint,
}: Props) {
  const t = useTokens();
  const tint = color ?? t.accent;
  const display = format ? format(value) : `${Math.round(value)}${unit ?? ''}`;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: tint }]}>{label}</Text>
        <Text style={[styles.value, { color: t.text }]}>{display}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        minimumTrackTintColor={tint}
        maximumTrackTintColor={t.surface2}
        thumbTintColor={tint}
        containerStyle={styles.slider}
      />
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 16, fontWeight: '700' },
  slider: { height: 32 },
  hint: { fontSize: 11 },
});
