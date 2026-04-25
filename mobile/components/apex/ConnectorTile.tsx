import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ConnectorEntry, ConnectorStatus } from '../../../shared/src/types/connectors';
import { useTokens } from '../../lib/theme';

const STATUS_COPY: Record<ConnectorStatus, string> = {
  disconnected: 'Connect',
  pending_oauth: 'Finishing sign-in…',
  connected: 'Connected',
  expired: 'Reconnect',
  revoked: 'Reconnect',
  error: 'Error — tap for details',
};

const STATUS_COLORS: Record<ConnectorStatus, string> = {
  disconnected: '#9CA3AF',
  pending_oauth: '#F59E0B',
  connected: '#22C55E',
  expired: '#F59E0B',
  revoked: '#9CA3AF',
  error: '#EF4444',
};

interface Props {
  entry: ConnectorEntry;
  /** Called when the user taps the tile. Caller decides what to do based
   *  on entry.status + entry.ships_in_phase (connect flow / coming-soon
   *  hint / reconnect / etc). */
  onPress: () => void;
  /** Shipped = the mobile client has a wire-up for this. When false we
   *  render the tile in a "coming soon" visual state regardless of
   *  server status, and the press should just explain what's pending. */
  shipped: boolean;
  disabled?: boolean;
}

export function ConnectorTile({ entry, onPress, shipped, disabled }: Props) {
  const t = useTokens();
  const pillText = shipped ? STATUS_COPY[entry.status] : 'Coming soon';
  const pillColor = shipped ? STATUS_COLORS[entry.status] : t.subtle;
  const isConnected = shipped && entry.status === 'connected';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${entry.display_name} — ${pillText}`}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: t.surface,
          borderColor: isConnected ? pillColor : t.border,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}>
      <Text style={styles.icon}>{entry.icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.name, { color: t.text }]}>{entry.display_name}</Text>
        <Text style={[styles.desc, { color: t.muted }]} numberOfLines={2}>
          {entry.description}
        </Text>
        {!shipped && entry.note ? (
          <Text style={[styles.note, { color: t.subtle }]} numberOfLines={2}>
            {entry.note}
          </Text>
        ) : null}
        {shipped && entry.status === 'error' && entry.last_error ? (
          <Text style={[styles.note, { color: pillColor }]} numberOfLines={2}>
            {entry.last_error}
          </Text>
        ) : null}
      </View>
      <View style={[
        styles.pill,
        {
          backgroundColor: isConnected ? pillColor : 'transparent',
          borderColor: pillColor,
        },
      ]}>
        <Text style={[styles.pillText, { color: isConnected ? '#FFFFFF' : pillColor }]}>
          {pillText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: { fontSize: 26 },
  name: { fontSize: 15, fontWeight: '700' },
  desc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  note: { fontSize: 11, marginTop: 4, lineHeight: 14, fontStyle: 'italic' },
  pill: {
    borderWidth: 1, borderRadius: 100,
    paddingVertical: 5, paddingHorizontal: 12,
    maxWidth: 120, alignItems: 'center',
  },
  pillText: { fontSize: 11, fontWeight: '700' },
});
