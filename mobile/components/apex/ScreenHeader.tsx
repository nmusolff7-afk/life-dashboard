import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  /** Override profile tap. Defaults to routing to /settings. */
  onProfilePress?: () => void;
  /** Hide the profile icon (e.g. on Settings screens where it's redundant). */
  hideProfile?: boolean;
  /** Optional weather pill text; hidden if empty. */
  weather?: string | null;
}

export function ScreenHeader({ title, onProfilePress, hideProfile, weather }: Props) {
  const t = useTokens();
  const router = useRouter();
  const handleProfile = onProfilePress ?? (() => router.push('/settings'));

  return (
    <View style={[styles.header, { backgroundColor: t.bg, borderBottomColor: t.border }]}>
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      <View style={styles.right}>
        {weather ? (
          <Text style={[styles.weather, { color: t.muted }]}>{weather}</Text>
        ) : null}
        {!hideProfile ? (
          <Pressable onPress={handleProfile} accessibilityRole="button" accessibilityLabel="Settings">
            <View style={[styles.profileIcon, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.profileIconText, { color: t.text }]}>◉</Text>
            </View>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  title: { fontSize: 20, fontWeight: '700', letterSpacing: 0.2 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weather: { fontSize: 13, fontWeight: '500' },
  profileIcon: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileIconText: { fontSize: 16 },
});
