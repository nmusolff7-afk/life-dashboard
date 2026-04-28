import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useTokens } from '../lib/theme';

// No-op landing screen for Outlook's OAuth deep-link callback.
// expo-auth-session captures the URL via Linking events independently;
// this file just exists so expo-router doesn't show "Unmatched Route".
export default function OutlookCallback() {
  const t = useTokens();
  useEffect(() => {
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
