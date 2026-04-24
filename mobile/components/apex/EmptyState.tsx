import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useHaptics } from '../../lib/useHaptics';
import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  description?: string;
  /** Ionicon name (preferred) OR a single emoji string for legacy
   *  call-sites. Defaults to a neutral hollow circle. */
  icon?: React.ComponentProps<typeof Ionicons>['name'] | string;
  /** Optional call-to-action button below the description. */
  cta?: { label: string; onPress: () => void; icon?: React.ComponentProps<typeof Ionicons>['name'] };
}

/** Consistent empty-state block used across every "no data yet"
 *  surface (no meals logged, no workouts today, no weight history…).
 *  Pattern per 11.5.15: icon → short title → ≤1-line description →
 *  optional CTA button. */
export function EmptyState({ title, description, icon, cta }: Props) {
  const t = useTokens();
  const haptics = useHaptics();
  const isIonicon = typeof icon === 'string' && !/^[\p{Emoji}\p{Emoji_Component}]$/u.test(icon);

  return (
    <View style={styles.wrap}>
      {icon ? (
        isIonicon ? (
          <View style={[styles.iconBubble, { backgroundColor: t.surface2 }]}>
            <Ionicons name={icon as never} size={22} color={t.muted} />
          </View>
        ) : (
          <Text style={styles.emoji}>{icon}</Text>
        )
      ) : (
        <View style={[styles.iconBubble, { backgroundColor: t.surface2 }]}>
          <Ionicons name="ellipse-outline" size={22} color={t.muted} />
        </View>
      )}
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {description ? <Text style={[styles.desc, { color: t.muted }]}>{description}</Text> : null}
      {cta ? (
        <Pressable
          onPress={() => {
            haptics.fire('tap');
            cta.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={cta.label}
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: t.accent, opacity: pressed ? 0.85 : 1 },
          ]}>
          {cta.icon ? <Ionicons name={cta.icon} size={16} color="#fff" /> : null}
          <Text style={styles.ctaLabel}>{cta.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 24, gap: 10 },
  emoji: { fontSize: 40 },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  desc: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 100,
    marginTop: 4,
  },
  ctaLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
