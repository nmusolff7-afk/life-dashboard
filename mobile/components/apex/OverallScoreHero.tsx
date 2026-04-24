import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { OverallScoreResponse } from '../../../shared/src/types/score';
import { useTokens } from '../../lib/theme';
import { ScoreArc } from './ScoreArc';

interface Props {
  data: OverallScoreResponse | null;
  loading: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  fitness: 'Fitness',
  nutrition: 'Nutrition',
  finance: 'Finance',
  time: 'Time',
};

/** Centerpiece of the Home tab. Large 0-100 number + small band indicator
 *  dot + 7-day sparkline behind. Contributing-categories label reads
 *  "Overall" if all 4 score, or joins the active categories ("Fitness +
 *  Nutrition") when graceful degradation is in effect (B2). */
export function OverallScoreHero({ data, loading }: Props) {
  const t = useTokens();
  const hasScore = data?.score != null;
  const bandColor =
    data?.band === 'green' ? t.green
      : data?.band === 'amber' ? t.amber
      : data?.band === 'red' ? t.danger
      : t.muted;

  const contributingLabel = buildContributingLabel(data);

  return (
    <View style={styles.wrap}>
      {/* Sparkline sits behind the number */}
      <Sparkline points={data?.sparkline_7d ?? []} color={bandColor} />

      <View style={styles.foreground}>
        <View style={styles.scoreRow}>
          <Text style={[styles.score, { color: t.text }]}>
            {hasScore ? String(data!.score) : '—'}
          </Text>
          <ScoreArc
            score={hasScore ? data!.score : null}
            band={data?.band ?? 'grey'}
            size={28}
            stroke={3}
          />
        </View>

        <Text style={[styles.label, { color: t.muted }]}>
          {loading && !data ? 'Loading…' : contributingLabel}
        </Text>

        {!hasScore && data?.cta ? (
          <Text style={[styles.cta, { color: t.subtle }]}>{data.cta}</Text>
        ) : null}
      </View>
    </View>
  );
}

function buildContributingLabel(data: OverallScoreResponse | null): string {
  if (!data) return '';
  const c = data.contributing ?? [];
  if (c.length === 0) return 'Overall';
  if (c.length === 4) return 'Overall';
  return c.map((k) => CATEGORY_LABELS[k] ?? k).join(' + ');
}

/** Minimal 7-point sparkline. Null entries are skipped (line breaks).
 *  Rendered under the big score with low opacity. */
function Sparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const width = 260;
  const height = 60;
  const padX = 4;
  const padY = 4;
  const valid = points.filter((p): p is number => p != null);
  if (valid.length < 2) return null;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;
  const step = (width - padX * 2) / (points.length - 1);

  let path = '';
  let started = false;
  points.forEach((p, i) => {
    if (p == null) {
      started = false;
      return;
    }
    const x = padX + i * step;
    const y = padY + (height - padY * 2) * (1 - (p - min) / range);
    path += `${started ? ' L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    started = true;
  });

  return (
    <View style={styles.sparklineWrap} pointerEvents="none">
      <Svg width={width} height={height}>
        <Path d={path} stroke={color} strokeWidth={1.5} fill="none" opacity={0.25} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 18,
    position: 'relative',
  },
  foreground: {
    alignItems: 'center',
    zIndex: 2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  score: {
    fontSize: 56,
    fontWeight: '700',
    lineHeight: 58,
    letterSpacing: -1.2,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginTop: 6,
  },
  cta: {
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  sparklineWrap: {
    position: 'absolute',
    top: 12,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 1,
  },
});
