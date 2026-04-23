import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTokens } from '../../lib/theme';

interface Props extends TextInputProps {
  label?: string;
  hint?: string;
}

export function TextField({ label, hint, style, ...rest }: Props) {
  const t = useTokens();
  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: t.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={t.subtle}
        {...rest}
        style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.border }, style]}
      />
      {hint ? <Text style={[styles.hint, { color: t.subtle }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  hint: { fontSize: 12 },
});
