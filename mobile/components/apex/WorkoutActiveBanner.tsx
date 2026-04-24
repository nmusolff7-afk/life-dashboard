import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatTimer } from '../../lib/strength';
import { useTokens } from '../../lib/theme';
import { useStrengthSession } from '../../lib/useStrengthSession';

/** PWA-parity minimized-workout pill. Renders when a session is active AND the
 *  modal is hidden. Tapping maximizes the modal. Mirrors Flask's #workout-banner
 *  (templates/index.html lines 481–491): 38px tall accent bar with "Workout
 *  Active" + workout timer · rest · rest timer + "Tap to return". */
export function WorkoutActiveBanner() {
  const t = useTokens();
  const session = useStrengthSession();
  const [now, setNow] = useState(Date.now());

  // Keep the clocks ticking regardless of modal state — user should see live
  // timers in the banner when the workout is minimized.
  useEffect(() => {
    if (session.startTs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.startTs]);

  if (!session.active || session.modalVisible || session.startTs == null) return null;

  const elapsed = Math.floor((now - session.startTs) / 1000);
  const rest = session.lastTickTs != null ? Math.floor((now - session.lastTickTs) / 1000) : 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Return to workout"
      onPress={session.maximize}
      style={[styles.bar, { backgroundColor: t.accent }]}>
      <View style={styles.left}>
        <Ionicons name="barbell" size={14} color="#fff" />
        <Text style={styles.label}>Workout Active</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.timer}>{formatTimer(elapsed)}</Text>
        <Text style={styles.divider}>·rest·</Text>
        <Text style={styles.rest}>{formatTimer(rest)}</Text>
      </View>
      <View style={styles.right}>
        <Text style={styles.tapHint}>Tap to return</Text>
        <Ionicons name="chevron-forward" size={14} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
    paddingHorizontal: 14,
    gap: 10,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  middle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 2 },

  label: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 0.3 },
  timer: { color: '#fff', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' },
  rest: { color: '#b3f0b3', fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  tapHint: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600' },
});
