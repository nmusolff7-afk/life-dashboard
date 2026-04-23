import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SavedWorkout } from '../../../shared/src/types/home';
import { deleteSavedWorkout, logWorkout } from '../../lib/api/fitness';
import { useTokens } from '../../lib/theme';

interface Props {
  saved: SavedWorkout[];
  /** Called after a chip is used to log (refetch today's list). */
  onLogged: () => void;
  /** Called after a template is removed (refetch chips). */
  onRemoved: () => void;
}

/** Horizontal scroll strip of saved workouts. Tap a chip to instantly log it
 *  with its saved calories; long-press to delete the template. */
export function SavedWorkoutsStrip({ saved, onLogged, onRemoved }: Props) {
  const t = useTokens();

  if (saved.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.muted }]}>Saved workouts</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {saved.map((w) => (
          <View
            key={w.id}
            style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Pressable
              onPress={() => {
                Alert.alert('Log this workout?', `${w.description} · ${w.calories_burned} kcal`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Log',
                    onPress: async () => {
                      try {
                        await logWorkout(w.description, w.calories_burned);
                        onLogged();
                      } catch (e) {
                        Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
                      }
                    },
                  },
                ]);
              }}
              style={styles.chipMain}>
              <Ionicons name="bookmark" size={12} color={t.accent} />
              <Text style={[styles.chipLabel, { color: t.text }]} numberOfLines={1}>
                {w.description}
              </Text>
              <Text style={[styles.chipKcal, { color: t.cal }]}>{w.calories_burned}</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                Alert.alert('Remove template?', w.description, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteSavedWorkout(w.id);
                        onRemoved();
                      } catch (e) {
                        Alert.alert('Remove failed', e instanceof Error ? e.message : String(e));
                      }
                    },
                  },
                ]);
              }}
              style={[styles.chipClose, { backgroundColor: t.surface2 }]}
              accessibilityLabel="Remove saved workout">
              <Ionicons name="close" size={13} color={t.muted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    paddingHorizontal: 2,
  },
  strip: { gap: 10, paddingVertical: 2, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 100,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 4,
    maxWidth: 260,
    gap: 6,
  },
  chipMain: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, paddingVertical: 4 },
  chipLabel: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  chipKcal: { fontSize: 12, fontWeight: '700' },
  chipClose: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
});
