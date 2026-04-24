import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTokens } from '../../lib/theme';

interface Props {
  /** Score 0–100 or null. Null renders a grey empty ring. */
  score: number | null | undefined;
  band?: 'green' | 'amber' | 'red' | 'grey';
  /** Outer diameter in pt. Default 18 — small enough to sit next to a
   *  numeric score without adding visual weight. */
  size?: number;
  /** Ring stroke width in pt. Default 2.5. */
  stroke?: number;
}

/** Small circular progress arc used anywhere a score is shown inline.
 *  Replaces the older "band dot" visual per 11.5.8 — arc fills clockwise
 *  proportional to score/100. Colour is driven by band, not score, so
 *  callers that already have the band categorized pass it through.
 *  Null score renders a faint grey track only. */
export function ScoreArc({ score, band = 'grey', size = 18, stroke = 2.5 }: Props) {
  const t = useTokens();

  const trackColor = band === 'grey' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)';
  const fillColor =
    band === 'green' ? t.green :
    band === 'amber' ? t.amber :
    band === 'red'   ? t.danger :
    t.muted;

  const clamped = score == null ? 0 : Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = clamped / 100;
  // Start from 12 o'clock and sweep clockwise: rotate the whole Svg -90°
  // and use strokeDasharray/offset to draw only the arc's active length.
  const dashOffset = circumference * (1 - progress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={trackColor}
          strokeWidth={stroke}
          fill="transparent"
        />
        {/* Progress arc — only drawn when score is not null */}
        {score != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={fillColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="transparent"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
          />
        ) : null}
      </Svg>
    </View>
  );
}
