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

import { logMeal, scanMealImage, type MealScanResponse } from '../../lib/api/nutrition';
import { useTokens } from '../../lib/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onLogged: () => void;
}

type Stage = 'capture' | 'scanning' | 'review';

/** Full-screen camera → one-tap capture → Claude vision scan → review macros →
 *  log meal. Mirrors Flask's scan-meal flow. Falls back gracefully when the
 *  user denies camera permission. */
export function MealPhotoScanner({ visible, onClose, onLogged }: Props) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>('capture');
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<MealScanResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [premium, setPremium] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const resetAndClose = () => {
    setStage('capture');
    setImageBase64(null);
    setImageUri(null);
    setScanResult(null);
    onClose();
  };

  const handleCapture = async () => {
    try {
      const photo = await cameraRef.current?.takePictureAsync({ base64: true, quality: 0.7 });
      if (!photo?.base64) {
        Alert.alert('Capture failed', 'Try again.');
        return;
      }
      setImageBase64(photo.base64);
      setImageUri(photo.uri ?? null);
      setStage('scanning');
      try {
        const result = await scanMealImage(photo.base64, 'image/jpeg', '', premium);
        setScanResult(result);
        setStage('review');
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // 402 from the server means the Premium Scan daily cap was hit —
        // give the user a clear message instead of a generic failure.
        if (msg.includes('402') || msg.toLowerCase().includes('limit')) {
          Alert.alert(
            'Premium Scan cap reached',
            'You\'ve used all 20 Premium Scans for today. Switching to Standard Scan or try again tomorrow.',
            [
              { text: 'Use Standard', onPress: () => {
                setPremium(false);
              }},
              { text: 'Cancel', style: 'cancel' },
            ],
          );
        } else {
          Alert.alert('Scan failed', msg);
        }
        setStage('capture');
      }
    } catch (e) {
      Alert.alert('Camera error', e instanceof Error ? e.message : String(e));
    }
  };

  const handleRetake = () => {
    setStage('capture');
    setImageBase64(null);
    setImageUri(null);
    setScanResult(null);
  };

  const handleLog = async () => {
    if (!scanResult) return;
    setSaving(true);
    try {
      await logMeal({
        description: scanResult.description,
        calories: scanResult.calories,
        protein_g: scanResult.protein_g,
        carbs_g: scanResult.carbs_g,
        fat_g: scanResult.fat_g,
        sugar_g: scanResult.sugar_g,
        fiber_g: scanResult.fiber_g,
        sodium_mg: scanResult.sodium_mg,
      });
      onLogged();
      resetAndClose();
    } catch (e) {
      Alert.alert('Log failed', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal animationType="slide" presentationStyle="fullScreen" visible={visible} onRequestClose={resetAndClose}>
      <View style={[styles.root, { backgroundColor: '#000', paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable
            onPress={resetAndClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close photo scanner"
            style={styles.closeBtn}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {stage === 'capture' ? 'Scan meal' : stage === 'scanning' ? 'Scanning…' : 'Review'}
          </Text>
          <View style={{ width: 26 }} />
        </View>

        {stage === 'capture' ? (
          permission?.granted ? (
            <View style={styles.cameraWrap}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back" />
              <View style={[styles.captureRow, { paddingBottom: insets.bottom + 30 }]}>
                {/* Premium Scan toggle (Pro, 20/day). All users are Pro
                    during build cycle per locked C2. */}
                <Pressable
                  onPress={() => setPremium((v) => !v)}
                  style={[
                    styles.premiumToggle,
                    {
                      backgroundColor: premium ? '#FFD060' : 'rgba(255,255,255,0.12)',
                    },
                  ]}>
                  <Ionicons
                    name={premium ? 'sparkles' : 'sparkles-outline'}
                    size={14}
                    color={premium ? '#1a1a1a' : '#fff'}
                  />
                  <Text style={[styles.premiumLabel, { color: premium ? '#1a1a1a' : '#fff' }]}>
                    {premium ? 'Premium Scan ON' : 'Premium Scan'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleCapture} style={styles.captureBtn}>
                  <View style={styles.captureInner} />
                </Pressable>
                <Text style={styles.captureHint}>
                  {premium ? 'Opus 4.6 · sharper portion detection' : 'Tap to capture meal'}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.permWrap}>
              <Ionicons name="camera-outline" size={48} color={t.muted} />
              <Text style={styles.permTitle}>Camera permission needed</Text>
              <Text style={styles.permBody}>
                The meal scanner uses your camera to identify food from photos.
              </Text>
              <Pressable onPress={requestPermission} style={[styles.permBtn, { backgroundColor: t.accent }]}>
                <Text style={styles.permBtnLabel}>Grant permission</Text>
              </Pressable>
            </View>
          )
        ) : null}

        {stage === 'scanning' ? (
          <View style={styles.scanningWrap}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
            ) : null}
            <View style={styles.scanningOverlay}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.scanningText}>Identifying food & macros…</Text>
            </View>
          </View>
        ) : null}

        {stage === 'review' && scanResult ? (
          <ScrollView
            contentContainerStyle={[styles.review, { paddingBottom: insets.bottom + 20 }]}>
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={styles.reviewImage} resizeMode="cover" />
            ) : null}

            <Text style={styles.reviewDesc}>{scanResult.description}</Text>

            <View style={[styles.reviewCard, { backgroundColor: t.surface }]}>
              <Text style={[styles.reviewKcal, { color: t.cal }]}>
                {scanResult.calories.toLocaleString()}{' '}
                <Text style={[styles.reviewKcalUnit, { color: t.muted }]}>kcal</Text>
              </Text>

              <View style={styles.macroRow}>
                <MacroCell label="Protein" value={scanResult.protein_g} unit="g" color={t.protein} />
                <MacroCell label="Carbs" value={scanResult.carbs_g} unit="g" color={t.carbs} />
                <MacroCell label="Fat" value={scanResult.fat_g} unit="g" color={t.fat} />
              </View>

              {scanResult.items && scanResult.items.length > 0 ? (
                <View style={styles.items}>
                  <Text style={[styles.itemsLabel, { color: t.muted }]}>Items</Text>
                  {scanResult.items.map((it, i) => (
                    <View key={i} style={styles.itemRow}>
                      <Text style={[styles.itemName, { color: t.text }]} numberOfLines={1}>
                        {it.name}
                      </Text>
                      <Text style={[styles.itemKcal, { color: t.cal }]}>
                        {it.calories}{' '}
                        <Text style={[styles.itemUnit, { color: t.muted }]}>kcal</Text>
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {scanResult.notes ? (
                <Text style={[styles.notes, { color: t.muted }]}>
                  <Ionicons name="information-circle-outline" size={12} color={t.muted} />{' '}
                  {scanResult.notes}
                </Text>
              ) : null}
            </View>

            <View style={styles.reviewActions}>
              <Pressable onPress={handleRetake} style={[styles.secondaryBtn, { backgroundColor: t.surface2 }]}>
                <Ionicons name="camera-reverse-outline" size={16} color={t.text} />
                <Text style={[styles.secondaryLabel, { color: t.text }]}>Retake</Text>
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
        {Math.round(value)}
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
  captureRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    gap: 10,
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
  captureHint: { color: '#fff', fontSize: 12, fontWeight: '500' },
  premiumToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    marginBottom: 16,
  },
  premiumLabel: { fontSize: 12, fontWeight: '700' },

  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 14 },
  permTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  permBody: { color: '#ccc', fontSize: 14, textAlign: 'center', maxWidth: 300, lineHeight: 20 },
  permBtn: { borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22, marginTop: 8 },
  permBtnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  scanningWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  preview: { ...StyleSheet.absoluteFillObject, opacity: 0.4 },
  scanningOverlay: { alignItems: 'center', gap: 12 },
  scanningText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  review: { padding: 16, gap: 14 },
  reviewImage: { width: '100%', height: 220, borderRadius: 16 },
  reviewDesc: { color: '#fff', fontSize: 20, fontWeight: '700', lineHeight: 26 },
  reviewCard: { borderRadius: 20, padding: 18, gap: 14 },
  reviewKcal: { fontSize: 32, fontWeight: '700' },
  reviewKcalUnit: { fontSize: 13, fontWeight: '500' },

  macroRow: { flexDirection: 'row', gap: 10 },
  macroCell: { flex: 1, gap: 2 },
  macroCellLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  macroCellValue: { fontSize: 16, fontWeight: '700' },
  macroCellUnit: { fontSize: 11, fontWeight: '500' },

  items: { gap: 6, marginTop: 4 },
  itemsLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemName: { fontSize: 13, flex: 1, paddingRight: 8 },
  itemKcal: { fontSize: 13, fontWeight: '700' },
  itemUnit: { fontSize: 10, fontWeight: '500' },

  notes: { fontSize: 12, fontStyle: 'italic', marginTop: 2 },

  reviewActions: { flexDirection: 'row', gap: 10 },
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
