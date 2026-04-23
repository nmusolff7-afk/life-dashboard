import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  identifyIngredients,
  logMeal,
  type MealSuggestion,
  type PantryIngredient,
  suggestMeals,
} from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
  /** Calories already consumed today — helps /api/meals/suggest size
   *  suggestions to your remaining calorie budget. */
  caloriesConsumedToday?: number;
}

type Stage = 'capture' | 'scanning' | 'ingredients' | 'suggestions';
interface StackPhoto { uri: string; base64: string }

/** Multi-photo pantry / fridge scanner. User snaps one or more photos, sends
 *  to /api/meals/scan (Claude identifies ingredients), then /api/meals/suggest
 *  (Claude proposes 3 meal options fitting remaining calories). Pick one to
 *  log. Mirrors Flask's pantry scan + suggest flow. */
export function PantryScanner({ visible, onClose, onLogged, caloriesConsumedToday }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('capture');
  const [photos, setPhotos] = useState<StackPhoto[]>([]);
  const [ingredients, setIngredients] = useState<PantryIngredient[]>([]);
  const [suggestions, setSuggestions] = useState<MealSuggestion[]>([]);
  const [loggingIdx, setLoggingIdx] = useState<number | null>(null);
  const cameraRef = useRef<CameraView>(null);

  const reset = () => {
    setStage('capture');
    setPhotos([]);
    setIngredients([]);
    setSuggestions([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleCapture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.6 });
      if (!photo?.base64) {
        Alert.alert('Capture failed', 'Try again.');
        return;
      }
      setPhotos((prev) => [...prev, { uri: photo.uri ?? '', base64: photo.base64! }]);
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : String(e));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleIdentify = async () => {
    if (photos.length === 0) {
      Alert.alert('No photos', 'Capture at least one photo of your ingredients.');
      return;
    }
    setStage('scanning');
    try {
      const ings = await identifyIngredients(
        photos.map((p) => ({ b64: p.base64, media_type: 'image/jpeg' })),
      );
      if (ings.length === 0) {
        Alert.alert('No ingredients detected', 'Try a clearer or closer photo.');
        setStage('capture');
        return;
      }
      setIngredients(ings);
      setStage('ingredients');
    } catch (e) {
      Alert.alert('Identify failed', e instanceof Error ? e.message : String(e));
      setStage('capture');
    }
  };

  const handleSuggest = async () => {
    setStage('scanning');
    try {
      const res = await suggestMeals({
        ingredients: ingredients.map((i) => i.name),
        images: photos.map((p) => ({ b64: p.base64, media_type: 'image/jpeg' })),
        hour: new Date().getHours(),
        calories_consumed: caloriesConsumedToday,
      });
      setSuggestions(res.options ?? []);
      setStage('suggestions');
    } catch (e) {
      Alert.alert('Suggest failed', e instanceof Error ? e.message : String(e));
      setStage('ingredients');
    }
  };

  const handleLogSuggestion = async (s: MealSuggestion, idx: number) => {
    setLoggingIdx(idx);
    try {
      await logMeal({
        description: s.meal_name,
        calories: s.calories,
        protein_g: s.protein_g,
        carbs_g: s.carbs_g,
        fat_g: s.fat_g,
      });
      onLogged();
      close();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingIdx(null);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible={visible} onRequestClose={close}>
      <View style={[styles.root, { backgroundColor: '#000', paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={close} hitSlop={10} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {stage === 'capture' ? 'Scan pantry' :
             stage === 'scanning' ? 'Working…' :
             stage === 'ingredients' ? 'Ingredients' :
             'Suggestions'}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {stage === 'capture' ? (
          permission?.granted ? (
            <View style={styles.cameraWrap}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />

              {photos.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.stackStrip}
                  style={styles.stackStripWrap}>
                  {photos.map((p, i) => (
                    <View key={i} style={styles.thumbWrap}>
                      <Image source={{ uri: p.uri }} style={styles.thumb} />
                      <Pressable onPress={() => removePhoto(i)} hitSlop={6} style={styles.thumbRemove}>
                        <Ionicons name="close" size={14} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <View style={[styles.captureRow, { paddingBottom: insets.bottom + 24 }]}>
                <View style={{ width: 72 }} />
                <Pressable onPress={handleCapture} style={styles.captureBtn}>
                  <View style={styles.captureInner} />
                </Pressable>
                <Pressable
                  onPress={handleIdentify}
                  disabled={photos.length === 0}
                  style={[
                    styles.identifyBtn,
                    { backgroundColor: t.accent, opacity: photos.length === 0 ? 0.4 : 1 },
                  ]}>
                  <Text style={styles.identifyLabel}>
                    Done{photos.length > 0 ? ` (${photos.length})` : ''}
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.hint, { bottom: insets.bottom + 98 }]}>
                Snap multiple photos of shelves, fridge, pantry
              </Text>
            </View>
          ) : (
            <View style={styles.permWrap}>
              <Ionicons name="restaurant-outline" size={48} color={t.muted} />
              <Text style={styles.permTitle}>Camera permission needed</Text>
              <Text style={styles.permBody}>
                The pantry scanner uses your camera to identify ingredients from photos.
              </Text>
              <Pressable onPress={requestPermission} style={[styles.permBtn, { backgroundColor: t.accent }]}>
                <Text style={styles.permBtnLabel}>Grant permission</Text>
              </Pressable>
            </View>
          )
        ) : null}

        {stage === 'scanning' ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>
              {ingredients.length === 0 ? 'Identifying ingredients…' : 'Suggesting meals…'}
            </Text>
          </View>
        ) : null}

        {stage === 'ingredients' ? (
          <ScrollView contentContainerStyle={[styles.review, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.reviewDesc}>Detected ingredients</Text>
            <Text style={[styles.reviewBody, { color: '#aaa' }]}>
              {ingredients.length} found across {photos.length} photo{photos.length === 1 ? '' : 's'}.
            </Text>

            <View style={[styles.ingredientsCard, { backgroundColor: t.surface }]}>
              {ingredients.map((ing, i) => (
                <View key={i} style={[styles.ingredientRow, { borderBottomColor: t.border }]}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={t.green} />
                  <Text style={[styles.ingredientName, { color: t.text }]}>{ing.name}</Text>
                  {ing.confidence != null ? (
                    <Text style={[styles.ingredientConf, { color: t.muted }]}>
                      {Math.round((ing.confidence || 0) * 100)}%
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>

            <View style={styles.reviewActions}>
              <Pressable onPress={reset} style={[styles.secondaryBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="camera-reverse-outline" size={16} color={t.text} />
                <Text style={[styles.secondaryLabel, { color: t.text }]}>Redo</Text>
              </Pressable>
              <Pressable
                onPress={handleSuggest}
                style={[styles.primaryBtn, { backgroundColor: t.accent }]}>
                <Text style={styles.primaryLabel}>Suggest meals</Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : null}

        {stage === 'suggestions' ? (
          <ScrollView contentContainerStyle={[styles.review, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.reviewDesc}>Meal suggestions</Text>
            <Text style={[styles.reviewBody, { color: '#aaa' }]}>
              Tap a card to log that meal.
            </Text>

            {suggestions.length === 0 ? (
              <Text style={[styles.reviewBody, { color: '#aaa', textAlign: 'center', padding: 20 }]}>
                No suggestions returned. Try rescanning with different photos.
              </Text>
            ) : null}

            {suggestions.map((s, i) => (
              <Pressable
                key={i}
                onPress={() => handleLogSuggestion(s, i)}
                disabled={loggingIdx != null}
                style={({ pressed }) => [
                  styles.suggestionCard,
                  { backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 },
                ]}>
                <View style={styles.suggestionHeader}>
                  <Text style={[styles.suggestionName, { color: t.text }]}>{s.meal_name}</Text>
                  <Text style={[styles.suggestionKcal, { color: t.cal }]}>
                    {s.calories}{' '}
                    <Text style={[styles.suggestionKcalUnit, { color: t.muted }]}>kcal</Text>
                  </Text>
                </View>
                {s.why ? (
                  <Text style={[styles.suggestionWhy, { color: t.muted }]}>{s.why}</Text>
                ) : null}
                <View style={styles.suggestionMacros}>
                  <Text style={[styles.macroTag, { color: t.protein }]}>
                    P {Math.round(s.protein_g)}g
                  </Text>
                  <Text style={[styles.macroTag, { color: t.carbs }]}>
                    C {Math.round(s.carbs_g)}g
                  </Text>
                  <Text style={[styles.macroTag, { color: t.fat }]}>
                    F {Math.round(s.fat_g)}g
                  </Text>
                </View>
                {s.instructions ? (
                  <Text style={[styles.suggestionHow, { color: t.subtle }]}>{s.instructions}</Text>
                ) : null}
                {loggingIdx === i ? (
                  <View style={styles.loggingOverlay}>
                    <ActivityIndicator color={t.accent} />
                  </View>
                ) : null}
              </Pressable>
            ))}

            <Pressable onPress={reset} style={[styles.secondaryBtn, { backgroundColor: t.surface2, alignSelf: 'center', marginTop: 8 }]}>
              <Ionicons name="camera-reverse-outline" size={16} color={t.text} />
              <Text style={[styles.secondaryLabel, { color: t.text }]}>Start over</Text>
            </Pressable>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  closeBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },

  cameraWrap: { flex: 1 },
  camera: { flex: 1 },

  stackStripWrap: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    maxHeight: 90,
  },
  stackStrip: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
  },
  thumb: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: 'rgba(0,0,0,0.7)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  captureRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  captureBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  identifyBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 18,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identifyLabel: { color: '#fff', fontSize: 13, fontWeight: '700' },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },

  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
  permTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  permBody: { color: '#ccc', fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  permBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22, marginTop: 8 },
  permBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  loadingText: { color: '#fff', fontSize: 14, textAlign: 'center', maxWidth: 320 },

  review: { padding: 16, gap: 12 },
  reviewDesc: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  reviewBody: { fontSize: 13 },

  ingredientsCard: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  ingredientName: { flex: 1, fontSize: 14, fontWeight: '500' },
  ingredientConf: { fontSize: 11, fontWeight: '600' },

  suggestionCard: { borderRadius: 20, padding: 18, gap: 6 },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  suggestionName: { fontSize: 16, fontWeight: '700', flex: 1 },
  suggestionKcal: { fontSize: 18, fontWeight: '700' },
  suggestionKcalUnit: { fontSize: 11, fontWeight: '500' },
  suggestionWhy: { fontSize: 13, fontStyle: 'italic' },
  suggestionMacros: { flexDirection: 'row', gap: 14, marginTop: 2 },
  macroTag: { fontSize: 12, fontWeight: '700' },
  suggestionHow: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  loggingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },

  reviewActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryLabel: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
