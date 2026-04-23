import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { RegenerateAiProfileCard } from '../../../components/apex';
import { useProfile } from '../../../lib/hooks/useHomeData';
import { useTokens } from '../../../lib/theme';

export default function RegenerateAI() {
  const t = useTokens();
  const profile = useProfile();

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen
        options={{
          title: 'Regenerate profile',
          headerStyle: { backgroundColor: t.bg },
          headerTintColor: t.text,
          headerShadowVisible: false,
        }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <RegenerateAiProfileCard profile={profile.data} onDone={profile.refetch} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  scroll: { paddingBottom: 40 },
});
