import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useMemo, useRef, useState } from 'react';
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

import { logMeal, lookupBarcodeAi } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}

type Stage = 'scan' | 'lookup' | 'not-found' | 'review';

interface OffNutriments {
  'energy-kcal_100g'?: number;
  energy_100g?: number; // kJ fallback
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
  sugars_100g?: number;
  fiber_100g?: number;
  sodium_100g?: number; // grams
  salt_100g?: number;   // grams (sodium fallback = salt * 0.4)
}

interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number;
  nutriments?: OffNutriments;
}

interface ProductMacros {
  label: string;
  per100: {
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    sugar_g: number;
    fiber_g: number;
    sodium_mg: number;
  };
  defaultServingG: number;
}

function parseOffProduct(barcode: string, product: OffProduct): ProductMacros {
  const n = product.nutriments ?? {};
  const kcal =
    n['energy-kcal_100g'] ??
    (n.energy_100g ? n.energy_100g / 4.184 : 0); // kJ → kcal
  const sodium_g = n.sodium_100g ?? (n.salt_100g != null ? n.salt_100g * 0.4 : 0);

  const name = product.product_name?.trim() || `Item ${barcode}`;
  const brand = product.brands?.split(',')[0]?.trim();
  const label = brand ? `${name} (${brand})` : name;

  return {
    label,
    per100: {
      calories: Math.round(kcal || 0),
      protein_g: n.proteins_100g ?? 0,
      carbs_g: n.carbohydrates_100g ?? 0,
      fat_g: n.fat_100g ?? 0,
      sugar_g: n.sugars_100g ?? 0,
      fiber_g: n.fiber_100g ?? 0,
      sodium_mg: (sodium_g ?? 0) * 1000,
    },
    defaultServingG: product.serving_quantity ?? 100,
  };
}

/** Open Food Facts v2 public API — no key needed, 10 req/min soft limit. */
async function fetchOpenFoodFacts(barcode: string): Promise<OffProduct | null> {
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
    { headers: { Accept: 'application/json' } },
  );
  if (!res.ok) throw new Error(`off → ${res.status}`);
  const body = (await res.json()) as { status?: number; product?: OffProduct };
  if (body.status !== 1 || !body.product) return null;
  return body.product;
}

/** Live-scan barcode modal. On detection, looks up Open Food Facts directly
 *  (no Flask bridge — OFF is public). Review screen lets the user adjust the
 *  serving size; macros scale linearly from the product's per-100g values. */
export function BarcodeScanner({ visible, onClose, onLogged }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('scan');
  const [scannedCode, setScannedCode] = useState<string>('');
  const [product, setProduct] = useState<ProductMacros | null>(null);
  const [servingText, setServingText] = useState<string>('100');
  const [saving, setSaving] = useState(false);
  const lastScannedRef = useRef<string>('');

  const reset = () => {
    setStage('scan');
    setScannedCode('');
    setProduct(null);
    setServingText('100');
    lastScannedRef.current = '';
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleBarcode = useCallback(async ({ data }: { data: string }) => {
    if (!data || data === lastScannedRef.current || stage !== 'scan') return;
    lastScannedRef.current = data;
    setScannedCode(data);
    setStage('lookup');
    try {
      const prod = await fetchOpenFoodFacts(data);
      if (!prod) {
        setStage('not-found');
        return;
      }
      const parsed = parseOffProduct(data, prod);
      setProduct(parsed);
      setServingText(String(parsed.defaultServingG));
      setStage('review');
    } catch (e) {
      Alert.alert('Lookup failed', e instanceof Error ? e.message : String(e));
      setStage('scan');
      lastScannedRef.current = '';
    }
  }, [stage]);

  const scaled = useMemo(() => {
    if (!product) return null;
    const grams = parseFloat(servingText) || 0;
    const factor = grams / 100;
    return {
      calories: Math.round(product.per100.calories * factor),
      protein_g: +(product.per100.protein_g * factor).toFixed(1),
      carbs_g: +(product.per100.carbs_g * factor).toFixed(1),
      fat_g: +(product.per100.fat_g * factor).toFixed(1),
      sugar_g: +(product.per100.sugar_g * factor).toFixed(1),
      fiber_g: +(product.per100.fiber_g * factor).toFixed(1),
      sodium_mg: Math.round(product.per100.sodium_mg * factor),
    };
  }, [product, servingText]);

  const handleLog = async () => {
    if (!product || !scaled) return;
    setSaving(true);
    try {
      await logMeal({
        description: `${product.label} — ${servingText}g`,
        ...scaled,
      });
      onLogged();
      close();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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
            {stage === 'scan' ? 'Scan barcode' :
             stage === 'lookup' ? 'Looking up…' :
             stage === 'not-found' ? 'Not found' :
             'Review'}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {stage === 'scan' ? (
          permission?.granted ? (
            <View style={styles.cameraWrap}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'qr'],
                }}
                onBarcodeScanned={handleBarcode}
              />
              <View style={styles.reticle}>
                <View style={[styles.reticleLine, { borderColor: '#fff' }]} />
              </View>
              <Text style={[styles.hint, { bottom: insets.bottom + 30 }]}>
                Point camera at the product barcode
              </Text>
            </View>
          ) : (
            <View style={styles.permWrap}>
              <Ionicons name="barcode-outline" size={48} color={t.muted} />
              <Text style={styles.permTitle}>Camera permission needed</Text>
              <Text style={styles.permBody}>
                The barcode scanner uses your camera to identify packaged foods.
              </Text>
              <Pressable onPress={requestPermission} style={[styles.permBtn, { backgroundColor: t.accent }]}>
                <Text style={styles.permBtnLabel}>Grant permission</Text>
              </Pressable>
            </View>
          )
        ) : null}

        {stage === 'lookup' ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#fff" />
            <Text style={styles.loadingText}>
              Looking up {scannedCode} on Open Food Facts…
            </Text>
          </View>
        ) : null}

        {stage === 'not-found' ? (
          <View style={styles.loadingWrap}>
            <Ionicons name="help-circle-outline" size={48} color="#fff" />
            <Text style={styles.loadingText}>
              Barcode {scannedCode} isn't in the Open Food Facts database.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Pressable
                onPress={async () => {
                  setStage('lookup');
                  try {
                    const ai = await lookupBarcodeAi(scannedCode);
                    // Reuse the review stage by shaping an AI response
                    // as a ProductMacros-like card. AI returns per-serving
                    // already, so use grams=serving=100 as a neutral base.
                    setProduct({
                      label: `${ai.description} (AI estimate)`,
                      per100: {
                        calories: ai.calories,
                        protein_g: ai.protein_g,
                        carbs_g: ai.carbs_g,
                        fat_g: ai.fat_g,
                        sugar_g: ai.sugar_g,
                        fiber_g: ai.fiber_g,
                        sodium_mg: ai.sodium_mg,
                      },
                      defaultServingG: 100,
                    });
                    setServingText('100');
                    setStage('review');
                  } catch (e) {
                    Alert.alert(
                      'AI estimate failed',
                      e instanceof Error ? e.message : String(e),
                    );
                    setStage('not-found');
                  }
                }}
                style={[styles.permBtn, { backgroundColor: t.accent }]}>
                <Text style={styles.permBtnLabel}>Estimate with AI</Text>
              </Pressable>
              <Pressable
                onPress={reset}
                style={[styles.permBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                <Text style={styles.permBtnLabel}>Scan another</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {stage === 'review' && product && scaled ? (
          <ScrollView contentContainerStyle={[styles.review, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.reviewDesc}>{product.label}</Text>
            <Text style={[styles.reviewBarcode, { color: '#aaa' }]}>Barcode {scannedCode}</Text>

            <View style={[styles.reviewCard, { backgroundColor: t.surface }]}>
              <Text style={[styles.servingLabel, { color: t.muted }]}>Serving size (grams)</Text>
              <TextInput
                value={servingText}
                onChangeText={setServingText}
                keyboardType="decimal-pad"
                placeholder="100"
                placeholderTextColor={t.subtle}
                style={[
                  styles.servingInput,
                  { color: t.text, backgroundColor: t.surface2, borderColor: t.border },
                ]}
              />

              <Text style={[styles.reviewKcal, { color: t.cal }]}>
                {scaled.calories.toLocaleString()}{' '}
                <Text style={[styles.reviewKcalUnit, { color: t.muted }]}>kcal</Text>
              </Text>

              <View style={styles.macroRow}>
                <MacroCell label="Protein" value={scaled.protein_g} unit="g" color={t.protein} />
                <MacroCell label="Carbs" value={scaled.carbs_g} unit="g" color={t.carbs} />
                <MacroCell label="Fat" value={scaled.fat_g} unit="g" color={t.fat} />
              </View>

              {(scaled.sugar_g > 0 || scaled.fiber_g > 0 || scaled.sodium_mg > 0) ? (
                <View style={styles.macroRow}>
                  <MacroCell label="Sugar" value={scaled.sugar_g} unit="g" color={t.sugar} />
                  <MacroCell label="Fiber" value={scaled.fiber_g} unit="g" color={t.fiber} />
                  <MacroCell label="Sodium" value={scaled.sodium_mg} unit="mg" color={t.sodium} />
                </View>
              ) : null}
            </View>

            <View style={styles.reviewActions}>
              <Pressable onPress={reset} style={[styles.secondaryBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="barcode-outline" size={16} color={t.text} />
                <Text style={[styles.secondaryLabel, { color: t.text }]}>Scan another</Text>
              </Pressable>
              <Pressable
                onPress={handleLog}
                disabled={saving}
                style={[styles.primaryBtn, { backgroundColor: t.accent, opacity: saving ? 0.8 : 1 }]}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryLabel}>Log meal</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
}

function MacroCell({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  const t = useTokens();
  return (
    <View style={styles.macroCell}>
      <Text style={[styles.macroCellLabel, { color }]}>{label}</Text>
      <Text style={[styles.macroCellValue, { color: t.text }]}>
        {Math.round(value * 10) / 10}
        <Text style={[styles.macroCellUnit, { color: t.muted }]}>{unit}</Text>
      </Text>
    </View>
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
  reticle: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reticleLine: {
    width: '70%',
    aspectRatio: 3,
    borderWidth: 2,
    borderRadius: 8,
    opacity: 0.6,
  },
  hint: {
    position: 'absolute',
    left: 0,
    right: 0,
    color: '#fff',
    fontSize: 13,
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

  review: { padding: 16, gap: 10 },
  reviewDesc: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  reviewBarcode: { fontSize: 11, marginTop: -4 },
  reviewCard: { borderRadius: 20, padding: 18, gap: 12, marginTop: 4 },

  servingLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8 },
  servingInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    width: 140,
    textAlign: 'center',
  },

  reviewKcal: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  reviewKcalUnit: { fontSize: 13, fontWeight: '500' },

  macroRow: { flexDirection: 'row', gap: 10 },
  macroCell: { flex: 1, gap: 2 },
  macroCellLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  macroCellValue: { fontSize: 16, fontWeight: '700' },
  macroCellUnit: { fontSize: 11, fontWeight: '500' },

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
