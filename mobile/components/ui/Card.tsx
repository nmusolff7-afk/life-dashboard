import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTokens } from '../../lib/theme';

export function Card({ style, children, ...rest }: ViewProps) {
  const t = useTokens();
  return (
    <View
      {...rest}
      style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },
});
