import { StyleSheet, Text, View } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props {
  title: string;
  description?: string;
  icon?: string;
}

export function EmptyState({ title, description, icon }: Props) {
  const t = useTokens();
  return (
    <View style={styles.wrap}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.title, { color: t.text }]}>{title}</Text>
      {description ? <Text style={[styles.desc, { color: t.muted }]}>{description}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 24, gap: 8 },
  icon: { fontSize: 40 },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  desc: { fontSize: 13, lineHeight: 18, textAlign: 'center', maxWidth: 280 },
});
