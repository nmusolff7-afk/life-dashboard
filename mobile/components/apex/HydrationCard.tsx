import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { fetchHydrationToday, logHydration, resetHydration, type HydrationToday } from '../../lib/api/hydration';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  /** FDA-adjacent default 64 oz. Passed from user prefs. */
  goalOz: number;
}

/** Opt-in hydration widget per PRD §4.4.12. Three quick-add buttons
 *  (+8 / +16 / +24 oz), tappable progress bar, undo-to-zero. Renders
 *  only when hydrationActive=true in user prefs. */
export function HydrationCard({ goalOz }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const [state, setState] = useState<HydrationToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchHydrationToday();
      setState(data);
    } catch {
      // silent — widget renders 0 oz if fetch fails
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = async (oz: number) => {
    if (sending) return;
    setSending(true);
    haptics.fire('tap');
    // Optimistic local bump so the bar moves immediately even before the
    // server responds. Rolled back if the POST fails.
    const prev = state;
    setState((s) => ({ oz: (s?.oz ?? 0) + oz, date: s?.date ?? '' }));
    try {
      const data = await logHydration(oz);
      setState(data);
      haptics.fire('success');
    } catch (e) {
      haptics.fire('error');
      setState(prev);
      Alert.alert(
        'Hydration not saved',
        e instanceof Error ? e.message : 'Request failed. Try again in a moment.',
      );
    } finally {
      setSending(false);
    }
  };

  const reset = async () => {
    if (sending) return;
    setSending(true);
    haptics.fire('tap');
    const prev = state;
    setState({ oz: 0, date: state?.date ?? '' });
    try {
      const data = await resetHydration();
      setState(data);
    } catch (e) {
      setState(prev);
      Alert.alert(
        'Reset failed',
        e instanceof Error ? e.message : 'Request failed. Try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const oz = state?.oz ?? 0;
  const pct = Math.min(1, oz / goalOz);

  return (
    <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
      <View style={styles.header}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.label, { color: t.muted }]}>Hydration</Text>
          <Text style={[styles.value, { color: t.text }]}>
            {Math.round(oz)}
            <Text style={[styles.unit, { color: t.muted }]}> / {goalOz} oz</Text>
          </Text>
        </View>
        {loading ? (
          <ActivityIndicator color={t.muted} />
        ) : oz > 0 ? (
          <Pressable onPress={reset} hitSlop={8} accessibilityLabel="Reset hydration">
            <Ionicons name="refresh-outline" size={16} color={t.subtle} />
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.track, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: oz >= goalOz ? t.green : t.finance,
              width: `${Math.max(2, pct * 100)}%`,
            },
          ]}
        />
      </View>

      <View style={styles.buttonRow}>
        {[8, 16, 24].map((amt) => (
          <Pressable
            key={amt}
            onPress={() => add(amt)}
            disabled={sending}
            style={({ pressed }) => [
              styles.btn,
              {
                backgroundColor: pressed ? t.finance : t.surface2,
                borderColor: t.border,
              },
            ]}>
            <Text style={[styles.btnLabel, { color: t.text }]}>+{amt} oz</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  value: { fontSize: 22, fontWeight: '700' },
  unit: { fontSize: 12, fontWeight: '500' },
  track: { height: 6, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
  buttonRow: { flexDirection: 'row', gap: 8 },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 100,
    paddingVertical: 8,
    alignItems: 'center',
  },
  btnLabel: { fontSize: 13, fontWeight: '600' },
});
