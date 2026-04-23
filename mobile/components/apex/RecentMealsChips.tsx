import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SavedMeal } from '../../../shared/src/types/home';
import { deleteSavedMeal, logMeal } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  saved: SavedMeal[];
  onLogged: () => void;
  onRemoved: () => void;
}

/** Horizontal scroll of saved-meal chips. Tap a chip to re-log it with its
 *  saved macros; tap the × button to delete the template. */
export function RecentMealsChips({ saved, onLogged, onRemoved }: Props) {
  const t = useTokens();
  if (saved.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: t.muted }]}>Recent meals</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.strip}>
        {saved.map((m) => (
          <View
            key={m.id}
            style={[styles.chip, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Pressable
              onPress={() => {
                Alert.alert('Log this meal?', `${m.description} · ${m.calories} kcal`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Log',
                    onPress: async () => {
                      try {
                        await logMeal({
                          description: m.description,
                          calories: m.calories,
                          protein_g: m.protein_g,
                          carbs_g: m.carbs_g,
                          fat_g: m.fat_g,
                          sugar_g: m.sugar_g ?? 0,
                          fiber_g: m.fiber_g ?? 0,
                          sodium_mg: m.sodium_mg ?? 0,
                        });
                        onLogged();
                      } catch (e) {
                        Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
                      }
                    },
                  },
                ]);
              }}
              style={styles.chipMain}>
              <Ionicons name="bookmark" size={12} color={t.nutrition} />
              <Text style={[styles.chipLabel, { color: t.text }]} numberOfLines={1}>
                {m.description}
              </Text>
              <Text style={[styles.chipKcal, { color: t.cal }]}>{m.calories}</Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => {
                Alert.alert('Remove template?', m.description, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteSavedMeal(m.id);
                        onRemoved();
                      } catch (e) {
                        Alert.alert('Remove failed', e instanceof Error ? e.message : String(e));
                      }
                    },
                  },
                ]);
              }}
              style={[styles.chipClose, { backgroundColor: t.surface2 }]}
              accessibilityLabel="Remove saved meal">
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
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.1, paddingHorizontal: 2 },
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
