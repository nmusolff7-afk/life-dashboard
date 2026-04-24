import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { SavedMeal } from '../../../shared/src/types/home';
import { deleteSavedMeal, logMeal } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  visible: boolean;
  meals: SavedMeal[];
  onClose: () => void;
  onLogged: () => void;
  onRemoved: () => void;
}

/** Bottom-sheet picker for saved meals (templates). Full list with a search
 *  filter; tapping a row logs the meal with its saved macros. Long-press (or
 *  the inline × button) removes the template. */
export function SavedMealsPicker({ visible, meals, onClose, onLogged, onRemoved }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [loggingId, setLoggingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return meals;
    return meals.filter((m) => m.description.toLowerCase().includes(q));
  }, [meals, query]);

  const handleLog = async (m: SavedMeal) => {
    setLoggingId(m.id);
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
      onClose();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingId(null);
    }
  };

  const handleRemove = (m: SavedMeal) => {
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
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop}>
        <Pressable
          onPress={() => {}}
          style={[
            styles.sheet,
            {
              backgroundColor: t.surface,
              paddingBottom: insets.bottom + 10,
            },
          ]}>
          <View style={[styles.grabber, { backgroundColor: t.border }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: t.text }]}>Saved meals</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Close saved meals">
              <Ionicons name="close" size={22} color={t.muted} />
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search saved meals"
            placeholderTextColor={t.subtle}
            style={[
              styles.search,
              { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
            ]}
          />

          {meals.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: t.text }]}>No saved meals yet</Text>
              <Text style={[styles.emptyBody, { color: t.muted }]}>
                After logging a meal, tap "Save template" to keep it here for quick re-logging.
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => handleLog(m)}
                  onLongPress={() => handleRemove(m)}
                  disabled={loggingId != null}
                  style={({ pressed }) => [
                    styles.row,
                    {
                      backgroundColor: t.surface2,
                      borderColor: t.border,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowDesc, { color: t.text }]} numberOfLines={2}>
                      {m.description}
                    </Text>
                    <Text style={[styles.rowMacros, { color: t.muted }]}>
                      <Text style={{ color: t.protein }}>P {Math.round(m.protein_g)}g</Text>
                      {'  '}
                      <Text style={{ color: t.carbs }}>C {Math.round(m.carbs_g)}g</Text>
                      {'  '}
                      <Text style={{ color: t.fat }}>F {Math.round(m.fat_g)}g</Text>
                    </Text>
                  </View>
                  <View style={styles.rowRight}>
                    <Text style={[styles.rowKcal, { color: t.cal }]}>
                      {m.calories}{' '}
                      <Text style={[styles.rowKcalUnit, { color: t.muted }]}>kcal</Text>
                    </Text>
                    {loggingId === m.id ? (
                      <ActivityIndicator color={t.accent} />
                    ) : (
                      <Pressable
                        onPress={() => handleRemove(m)}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${m.description}`}
                        style={styles.rowRemove}>
                        <Ionicons name="close" size={16} color={t.subtle} />
                      </Pressable>
                    )}
                  </View>
                </Pressable>
              ))}
              {filtered.length === 0 && query ? (
                <Text style={[styles.noMatch, { color: t.subtle }]}>
                  No matches for “{query}”.
                </Text>
              ) : null}
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    maxHeight: '85%',
  },
  grabber: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700' },

  search: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 12,
  },

  list: { gap: 10, paddingBottom: 14 },
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  rowDesc: { fontSize: 14, fontWeight: '600' },
  rowMacros: { fontSize: 12, marginTop: 3, fontWeight: '600' },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowKcal: { fontSize: 15, fontWeight: '700' },
  rowKcalUnit: { fontSize: 10, fontWeight: '500' },
  rowRemove: { padding: 2 },

  empty: { paddingVertical: 40, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyBody: { fontSize: 13, textAlign: 'center', maxWidth: 280 },

  noMatch: { fontSize: 13, textAlign: 'center', paddingVertical: 12 },
});
