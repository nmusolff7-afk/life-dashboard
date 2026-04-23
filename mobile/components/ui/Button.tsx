import { Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { useTokens } from '../../lib/theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', title, disabled, style, ...rest }: Props) {
  const t = useTokens();
  const bg =
    variant === 'primary' ? t.accent :
    variant === 'secondary' ? t.surface :
    variant === 'danger' ? t.danger : 'transparent';
  const color =
    variant === 'primary' || variant === 'danger' ? '#FFFFFF' :
    variant === 'secondary' ? t.text : t.accent;
  const borderColor = variant === 'secondary' ? t.border : 'transparent';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor, opacity: disabled ? 0.4 : pressed ? 0.82 : 1 },
        typeof style === 'function' ? undefined : style,
      ]}
      {...rest}>
      <Text style={[styles.text, { color }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, alignItems: 'center' },
  text: { fontSize: 16, fontWeight: '600' },
});
