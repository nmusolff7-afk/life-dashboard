import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CategoryKey, CategoryScoreResponse } from '../../../shared/src/types/score';
import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';
import { ScoreArc } from './ScoreArc';

interface Props {
  category: CategoryKey;
  data: CategoryScoreResponse | null;
  loading: boolean;
  /** Most-important-data-point blurb per PRD §4.2.3. Parent assembles this
   *  from its existing hooks (today's meals, workouts, weight, etc.) and
   *  passes it in; the row just renders. Null → blurb section is hidden. */
  blurb?: string | null;
  /** Inline content rendered directly below the blurb (always visible). */
  richContent?: ReactNode;
  /** Extra content revealed only when the user taps the expand chevron.
   *  For Nutrition: sugar/fiber/sodium micros. For Fitness: deeper stats. */
  expandedContent?: ReactNode;
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
export function CategoryScoreRow({
  category,
  data,
  loading,
  blurb,
  richContent,
  expandedContent,
  href,
}: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);

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
          <ScoreArc
            score={hasScore ? data!.score : null}
            band={data?.band ?? 'grey'}
            size={20}
            stroke={2.5}
          />
        </View>
      </View>

      {richContent ? <View style={styles.richWrap}>{richContent}</View> : null}

      {expandedContent ? (
        <>
          {expanded ? <View style={styles.expandedWrap}>{expandedContent}</View> : null}
          <Pressable
            onPress={(e) => {
              // Prevent the row's outer Pressable (navigate) from firing
              // when the expand chevron is tapped.
              e.stopPropagation?.();
              haptics.fire('tap');
              setExpanded((v) => !v);
            }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Hide details' : 'Show details'}
            style={({ pressed }) => [
              styles.expandTab,
              { borderTopColor: t.border, backgroundColor: pressed ? t.surface2 : 'transparent' },
            ]}>
            <Text style={[styles.expandLabel, { color: t.muted }]}>
              {expanded ? 'Hide details' : 'Tap to expand'}
            </Text>
            <Ionicons
              name={expanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={t.muted}
            />
          </Pressable>
        </>
      ) : null}
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
  expandedWrap: {
    gap: 8,
  },
  expandTab: {
    marginTop: 6,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderRadius: 8,
  },
  expandLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
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
});
