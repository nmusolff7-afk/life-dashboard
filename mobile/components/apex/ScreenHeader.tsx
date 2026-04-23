import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTokens } from '../../lib/theme';
import { useLiveDateTime } from '../../lib/useLiveDateTime';

interface Props {
  title: string;
  /** Shown below the title in smaller muted text. Defaults to a live date+time
   *  ticker matching Flask's header subtitle. Pass null to hide. */
  subtitle?: string | null;
  /** Override profile tap. Defaults to routing to /settings. */
  onProfilePress?: () => void;
  /** Hide the profile icon (e.g. on Settings screens where it's redundant). */
  hideProfile?: boolean;
}

/** Mirrors Flask's fixed top `<header>` — 56px bar, bg-colored, hairline border
 *  underneath, logo + uppercase title on the left, profile icon on the right. */
export function ScreenHeader({ title, subtitle, onProfilePress, hideProfile }: Props) {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const liveDateTime = useLiveDateTime();
  const resolvedSubtitle = subtitle === undefined ? liveDateTime : subtitle;
  const handleProfile = onProfilePress ?? (() => router.push('/settings'));

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
      <View style={styles.brand}>
        <Image
          source={require('../../assets/images/apex-logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.brandText}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {title}
          </Text>
          {resolvedSubtitle ? (
            <Text style={[styles.subtitle, { color: t.muted }]} numberOfLines={1}>
              {resolvedSubtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {!hideProfile ? (
        <Pressable
          onPress={handleProfile}
          accessibilityRole="button"
          accessibilityLabel="Profile"
          style={styles.profileBtn}
          hitSlop={8}>
          <Ionicons name="person-outline" size={22} color={t.muted} />
          <Text style={[styles.profileLabel, { color: t.muted }]}>Profile</Text>
        </Pressable>
      ) : null}
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
    // Clip any child that tries to bleed outside the 56px bar — guards against
    // the logo layout going sideways on image-load before dimensions settle.
    overflow: 'hidden',
  },
  // Logo occupies a hard-pinned box. `flexShrink: 0` keeps the flex container
  // from squeezing it to zero; explicit width + height prevent the
  // aspectRatio quirk where RN would expand the image to fill the row.
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  logo: { width: 84, height: 28, flexShrink: 0 },
  // flex:1 + minWidth:0 allows the text to shrink and ellipsize instead of
  // pushing the logo or profile button out of the header.
  brandText: { flex: 1, minWidth: 0 },
  title: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 12, fontWeight: '400', marginTop: 2 },

  profileBtn: { alignItems: 'center', gap: 2, paddingHorizontal: 4, flexShrink: 0 },
  profileLabel: { fontSize: 9, fontWeight: '500' },
});
