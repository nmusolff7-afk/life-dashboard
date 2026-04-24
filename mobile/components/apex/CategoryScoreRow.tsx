import { useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CategoryKey, CategoryScoreResponse } from '../../../shared/src/types/score';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  category: CategoryKey;
  data: CategoryScoreResponse | null;
  loading: boolean;
  /** Most-important-data-point blurb per PRD §4.2.3. Parent assembles this
   *  from its existing hooks (today's meals, workouts, weight, etc.) and
   *  passes it in; the row just renders. Null → blurb section is hidden. */
  blurb?: string | null;
  /** Optional rich content rendered below the blurb — e.g. macro bars on
   *  the Nutrition row, stats grid on the Fitness row. Kept as a slot so
   *  category-specific detail lives in the parent, not this primitive. */
  richContent?: ReactNode;
  /** Expo Router path to navigate to on tap. */
  href?: Href;
}

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  fitness: 'Fitness',
  nutrition: 'Nutrition',
  finance: 'Finance',
  time: 'Time',
};

/** Full-width stacked row per locked D2. Shows category score + band dot +
 *  category-color left accent + most-important-data-point blurb. No trend
 *  arrows (also D2). Accent pattern per D1 — left border in category color
 *  is the only strong color on the card. */
export function CategoryScoreRow({ category, data, loading, blurb, richContent, href }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const router = useRouter();

  const categoryColor =
    category === 'fitness' ? t.fitness
      : category === 'nutrition' ? t.nutrition
      : category === 'finance' ? t.finance
      : t.time;

  const hasScore = data?.score != null;
  const bandColor =
    data?.band === 'green' ? t.green
      : data?.band === 'amber' ? t.amber
      : data?.band === 'red' ? t.danger
      : t.muted;

  const onPress = () => {
    if (!href) return;
    haptics.fire('tap');
    router.push(href);
  };

  return (
    <Pressable
      accessibilityRole={href ? 'button' : undefined}
      onPress={href ? onPress : undefined}
      disabled={!href}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: t.surface,
          borderLeftColor: categoryColor,
          transform: [{ scale: pressed ? 0.99 : 1 }],
          opacity: pressed ? 0.92 : 1,
        },
      ]}>
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <Text style={[styles.category, { color: categoryColor }]}>
            {CATEGORY_LABELS[category]}
          </Text>
          {blurb ? (
            <Text style={[styles.blurb, { color: t.body }]} numberOfLines={2}>
              {blurb}
            </Text>
          ) : loading && !data ? (
            <Text style={[styles.blurb, { color: t.subtle }]}>Loading…</Text>
          ) : data?.cta ? (
            <Text style={[styles.cta, { color: t.subtle }]} numberOfLines={2}>
              {data.cta}
            </Text>
          ) : null}
        </View>

        <View style={styles.rightCol}>
          <Text style={[styles.score, { color: t.text }]}>
            {hasScore ? String(data!.score) : '—'}
          </Text>
          {hasScore ? (
            <View style={[styles.bandDot, { backgroundColor: bandColor }]} />
          ) : null}
        </View>
      </View>

      {richContent ? <View style={styles.richWrap}>{richContent}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderLeftWidth: 3,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  richWrap: {
    gap: 8,
  },
  leftCol: {
    flex: 1,
    gap: 4,
  },
  rightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  category: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  blurb: {
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  score: {
    fontSize: 30,
    fontWeight: '700',
    lineHeight: 32,
    letterSpacing: -0.8,
  },
  bandDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 12,
  },
});
