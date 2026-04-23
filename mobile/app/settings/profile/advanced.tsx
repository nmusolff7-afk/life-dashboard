import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AdvancedOverridesForm } from '../../../components/apex';
import { useTokens } from '../../../lib/theme';

export default function AdvancedOverrides() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: 'Advanced overrides',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <AdvancedOverridesForm />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
