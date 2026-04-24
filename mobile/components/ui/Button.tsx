import { Pressable, StyleSheet, Text, type PressableProps, type GestureResponderEvent } from 'react-native';

import { useTokens } from '../../lib/theme';
import { useHaptics } from '../../lib/useHaptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: ButtonVariant;
}

export function Button({ variant = 'primary', title, disabled, style, onPressIn, ...rest }: Props) {
  const t = useTokens();
  const haptics = useHaptics();

  const bg =
    variant === 'primary' ? t.accent :
    variant === 'secondary' ? t.surface :
    variant === 'danger' ? t.danger : 'transparent';
  const color =
    variant === 'primary' || variant === 'danger' ? '#FFFFFF' :
    variant === 'secondary' ? t.text : t.accent;
  const borderColor = variant === 'secondary' ? t.border : 'transparent';

  const handlePressIn = (e: GestureResponderEvent) => {
    if (!disabled) haptics.fire('tap');
    onPressIn?.(e);
  };

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPressIn={handlePressIn}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: bg,
          borderColor,
          opacity: disabled ? 0.4 : pressed ? 0.88 : 1,
          transform: [{ scale: disabled ? 1 : pressed ? 0.97 : 1 }],
        },
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
