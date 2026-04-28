import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTokens } from '../lib/theme';

// Catch-all destination for OAuth deep-link callbacks (Gmail uses
// lifedashboard://oauthredirect — set by expo-auth-session's Google
// provider, not configurable). Without this file, expo-router shows its
// "Unmatched Route" 404 because no app screen exists at /oauthredirect.
//
// expo-auth-session captures the URL via Linking events independently
// from expo-router's screen routing — by the time this component
// mounts, the OAuth session has typically already resolved. We just
// need a screen here so the user doesn't see a 404.
export default function OAuthRedirect() {
  const t = useTokens();
  useEffect(() => {
    // Bounce back to the previous screen (likely Settings → Connections)
    // so the user sees the connection result instead of an empty page.
    const id = setTimeout(() => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    }, 250);
    return () => clearTimeout(id);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={t.accent} />
    </View>
  );
}
