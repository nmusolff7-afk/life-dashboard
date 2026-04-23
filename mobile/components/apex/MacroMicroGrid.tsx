import { useRef, useState } from 'react';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTokens } from '../../lib/theme';

interface Values {
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarG: number;
  fiberG: number;
  sodiumMg: number;
}

interface Targets {
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  sugarG?: number | null;
  fiberG?: number | null;
  sodiumMg?: number | null;
}

interface Props {
  consumed: Values;
  targets?: Targets;
  /** When true, render empty-state copy (no meals logged). */
  empty?: boolean;
}

interface RowProps {
  label: string;
  color: string;
  consumed: number;
  target: number | null | undefined;
  unit: string;
}

function ProgressRow({ label, color, consumed, target, unit }: RowProps) {
  const t = useTokens();
  const hasTarget = target != null && target > 0;
  const pct = hasTarget ? Math.min(1, consumed / (target as number)) : 0;
  const hit = hasTarget && consumed >= (target as number) * 0.95 && consumed <= (target as number) * 1.05;
  const over = hasTarget && consumed > (target as number) * 1.2;
  const fillColor = over ? t.danger : hit ? t.green : color;
  const valueColor = over ? t.danger : hit ? t.green : color;

  const valueText = hasTarget
    ? `${Math.round(consumed)}${unit} / ${Math.round(target as number)}${unit}`
    : `${Math.round(consumed)}${unit}`;

  return (
    <View style={rowStyles.row}>
      <View style={rowStyles.header}>
        <Text style={[rowStyles.label, { color: t.muted }]}>{label}</Text>
        <Text style={[rowStyles.value, { color: valueColor }]}>{valueText}</Text>
      </View>
      <View style={[rowStyles.track, { backgroundColor: 'rgba(255,255,255,0.06)' }]}>
        <View
          style={[
            rowStyles.fill,
            { backgroundColor: fillColor, width: `${Math.max(pct * 100, hasTarget ? 2 : 0)}%` },
          ]}
        />
      </View>
    </View>
  );
}

/** Mirrors Flask dash-macro-card: two swipeable pages (macros / micros) with
 *  horizontal progress bars and a page dot indicator at the bottom. */
export function MacroMicroGrid({ consumed, targets, empty }: Props) {
  const t = useTokens();
  const [page, setPage] = useState(0);
  const widthRef = useRef<number>(Dimensions.get('window').width - 32);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = widthRef.current || 1;
    const idx = Math.round(e.nativeEvent.contentOffset.x / w);
    if (idx !== page) setPage(idx);
  };

  const onLayout = (e: { nativeEvent: { layout: { width: number } } }) => {
    widthRef.current = e.nativeEvent.layout.width;
  };

  return (
    <View
      onLayout={onLayout}
      style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        style={{ width: '100%' }}>
        <View style={[styles.page, { width: widthRef.current }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Macros</Text>
          {empty ? (
            <Text style={[styles.emptyText, { color: t.muted }]}>Log meals to see macros.</Text>
          ) : (
            <>
              <ProgressRow label="Protein" color={t.protein} consumed={consumed.proteinG} target={targets?.proteinG} unit="g" />
              <ProgressRow label="Carbs"   color={t.carbs}   consumed={consumed.carbsG}   target={targets?.carbsG}   unit="g" />
              <ProgressRow label="Fat"     color={t.fat}     consumed={consumed.fatG}     target={targets?.fatG}     unit="g" />
            </>
          )}
        </View>
        <View style={[styles.page, { width: widthRef.current }]}>
          <Text style={[styles.cardTitle, { color: t.muted }]}>Micros</Text>
          {empty ? (
            <Text style={[styles.emptyText, { color: t.muted }]}>Log meals to see micros.</Text>
          ) : (
            <>
              <ProgressRow label="Sugar"  color={t.sugar}  consumed={consumed.sugarG}   target={targets?.sugarG}   unit="g" />
              <ProgressRow label="Fiber"  color={t.fiber}  consumed={consumed.fiberG}   target={targets?.fiberG}   unit="g" />
              <ProgressRow label="Sodium" color={t.sodium} consumed={consumed.sodiumMg} target={targets?.sodiumMg} unit="mg" />
            </>
          )}
        </View>
      </ScrollView>
      <View style={styles.dots}>
        <View style={[styles.dot, { backgroundColor: page === 0 ? t.accent : t.surface2 }]} />
        <View style={[styles.dot, { backgroundColor: page === 1 ? t.accent : t.surface2 }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 3,
  },
  page: { padding: 20 },
  cardTitle: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 12,
  },
  emptyText: { fontSize: 14 },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 6,
    paddingBottom: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

const rowStyles = StyleSheet.create({
  row: { marginBottom: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 13 },
  value: { fontSize: 13, fontWeight: '600' },
  track: { height: 6, borderRadius: 100, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 100 },
});
