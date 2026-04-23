import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '../../components/apex';
import { useTokens } from '../../lib/theme';

export default function Subscription() {
  const t = useTokens();
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Stack.Screen options={{ title: 'Subscription' }} />
      <EmptyState icon="💳" title="Subscription & billing" description="Trial status, current plan, upgrade to Pro, manage via Apple/Google, billing history. Shipped by RevenueCat per PRD §13." />
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { flex: 1 } });
