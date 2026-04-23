import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  /** Override profile tap. Defaults to routing to /settings. */
  onProfilePress?: () => void;
  /** Hide the profile icon (e.g. on Settings screens where it's redundant). */
  hideProfile?: boolean;
  /** Optional weather pill text; hidden if empty. */
  weather?: string | null;
  /** Show a calendar icon that navigates to /history. */
  showHistory?: boolean;
  /** Override calendar tap. Defaults to routing to /history. */
  onHistoryPress?: () => void;
}

/** Mirrors Flask's fixed top `<header>` — 56px bar, bg-colored, hairline border
 *  underneath. Respects the device status bar via safe-area inset top. */
export function ScreenHeader({ title, onProfilePress, hideProfile, weather, showHistory, onHistoryPress }: Props) {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleProfile = onProfilePress ?? (() => router.push('/settings'));
  const handleHistory = onHistoryPress ?? (() => router.push('/history'));

  return (
    <View
      style={[
        styles.header,
        {
          backgroundColor: t.bg,
          borderBottomColor: 'rgba(255,255,255,0.04)',
          paddingTop: insets.top,
          height: 56 + insets.top,
        },
      ]}>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>
        {weather ? (
          <Text style={[styles.weather, { color: t.muted }]}>{weather}</Text>
        ) : null}
        {showHistory ? (
          <Pressable onPress={handleHistory} accessibilityRole="button" accessibilityLabel="History">
            <View style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.iconText, { color: t.text }]}>📅</Text>
            </View>
          </Pressable>
        ) : null}
        {!hideProfile ? (
          <Pressable onPress={handleProfile} accessibilityRole="button" accessibilityLabel="Settings">
            <View style={[styles.iconBtn, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.iconText, { color: t.text }]}>◉</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    maxWidth: '55%',
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weather: { fontSize: 13, fontWeight: '500' },
  iconBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 16 },
});
