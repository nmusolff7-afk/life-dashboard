import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme, useTokens } from '../../lib/theme';
import { useLiveDateTime } from '../../lib/useLiveDateTime';

interface Props {
  title: string;
  /** Override profile tap. Defaults to routing to /settings. */
  onProfilePress?: () => void;
  /** Hide the profile icon (e.g. on Settings screens where it's redundant). */
  hideProfile?: boolean;
}

/** Mirrors Flask's fixed top `<header>` — 56px bar, bg-colored, hairline border
 *  underneath, logo + title on the left, profile icon on the right. */
export function ScreenHeader({ title, onProfilePress, hideProfile }: Props) {
  const t = useTokens();
  const { resolved } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const dateTime = useLiveDateTime();
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
          style={[
            styles.logo,
            // Flask does `filter: invert(1) brightness(0.2)` on the logo in
            // light theme. RN has no filter prop, so we tint the image to
            // the text color — works cleanly for a single-color logo. If the
            // PNG has multi-color detail, swap to a dedicated light-theme
            // asset instead.
            resolved === 'light' ? { tintColor: t.text } : null,
          ]}
          resizeMode="contain"
        />
        <View style={styles.brandText}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.subtitle, { color: t.muted }]} numberOfLines={1}>
            {dateTime}
          </Text>
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
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  subtitle: { fontSize: 11, fontWeight: '400', marginTop: 1 },

  profileBtn: { alignItems: 'center', gap: 2, paddingHorizontal: 4, flexShrink: 0 },
  profileLabel: { fontSize: 9, fontWeight: '500' },
});
