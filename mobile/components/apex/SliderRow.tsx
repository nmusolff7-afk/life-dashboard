import { Ionicons } from '@expo/vector-icons';
import { Slider } from '@miblanchard/react-native-slider';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
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
  /** Lock the slider by default and require tapping the lock icon to
   *  enable scrubbing. Mirrors the Flask PWA's tap-to-unlock pattern so
   *  macro/micro sliders can't shift from an accidental scroll or drag.
   *  Default ON — most settings-page sliders are safety-sensitive. */
  locked?: boolean;
}

/** Horizontal slider row with a label + live-updating value + optional hint.
 *  Uses @miblanchard/react-native-slider (pure JS — avoids the Windows
 *  path-resolution bug on @react-native-community/slider).
 *
 *  When `locked` is true (default), the slider starts in a read-only state
 *  behind a tap-to-unlock gate. Once unlocked, the lock icon flips to open
 *  and the slider becomes scrubbable; tapping again re-locks. This is the
 *  Flask PWA parity behaviour per founder review. */
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
  locked: lockedProp = true,
}: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const tint = color ?? t.accent;
  const display = format ? format(value) : `${Math.round(value)}${unit ?? ''}`;
  const [unlocked, setUnlocked] = useState(!lockedProp);

  const toggleLock = () => {
    haptics.fire('tap');
    setUnlocked((v) => !v);
  };

  const disabled = lockedProp && !unlocked;

  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <View style={styles.labelWrap}>
          {lockedProp ? (
            <Pressable
              onPress={toggleLock}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={unlocked ? 'Lock slider' : 'Unlock slider'}
              style={[styles.lockBtn, { backgroundColor: disabled ? t.surface2 : tint + '22' }]}>
              <Ionicons
                name={disabled ? 'lock-closed' : 'lock-open'}
                size={11}
                color={disabled ? t.muted : tint}
              />
            </Pressable>
          ) : null}
          <Text style={[styles.label, { color: tint }]}>{label}</Text>
        </View>
        <Text style={[styles.value, { color: t.text }]}>{display}</Text>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={max}
        step={step}
        disabled={disabled}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        minimumTrackTintColor={disabled ? t.surface2 : tint}
        maximumTrackTintColor={t.surface2}
        thumbTintColor={disabled ? t.muted : tint}
        containerStyle={disabled ? { ...styles.slider, opacity: 0.55 } : styles.slider}
      />
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 4 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  labelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lockBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  value: { fontSize: 16, fontWeight: '700' },
  slider: { height: 32 },
  hint: { fontSize: 11 },
});
