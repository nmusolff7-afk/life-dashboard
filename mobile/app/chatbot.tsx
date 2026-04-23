import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useTokens } from '../lib/theme';

type Source = 'home' | 'fitness' | 'nutrition' | 'finance' | 'time';

const SHORTCUTS_BY_SOURCE: Record<Source, string[]> = {
  home: ['What should I focus on today?', 'How is my overall score trending?', 'Any unreplied emails?'],
  fitness: ['How is my training this week?', 'Should I skip today\'s workout?', 'How is my sleep?'],
  nutrition: ['What can I eat right now?', 'What\'s a high-protein option?', 'Suggest a meal from my pantry'],
  finance: ['Can I afford this?', 'How is my budget this week?', 'What bills are coming up?'],
  time: ['What\'s the best time for deep work today?', 'Summarize my important emails', 'How fragmented is my day?'],
};

export default function ChatbotScreen() {
  const t = useTokens();
  const router = useRouter();
  const { from = 'home', prefill } = useLocalSearchParams<{ from?: string; prefill?: string }>();
  const source = (SHORTCUTS_BY_SOURCE[from as Source] ? from : 'home') as Source;
  const [text, setText] = useState(typeof prefill === 'string' ? prefill : '');

  const handleSend = () => {
    if (!text.trim()) return;
    Alert.alert('Chat coming soon', 'The AI chatbot ships in a later phase — see PRD §4.7.');
    setText('');
  };

  const handleShortcut = (s: string) => {
    Alert.alert('Shortcut coming soon', `Would ask: "${s}"`);
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <View style={[styles.header, { borderBottomColor: t.border }]}>
        <Text style={[styles.title, { color: t.text }]}>Ask Life Dashboard</Text>
        <Pressable onPress={() => router.back()} accessibilityLabel="Close" hitSlop={10}>
          <Text style={[styles.close, { color: t.muted }]}>✕</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={[styles.sectionLabel, { color: t.muted }]}>Shortcuts</Text>
        <View style={styles.shortcuts}>
          {SHORTCUTS_BY_SOURCE[source].map((s) => (
            <Pressable
              key={s}
              onPress={() => handleShortcut(s)}
              style={[styles.shortcut, { backgroundColor: t.surface, borderColor: t.border }]}>
              <Text style={[styles.shortcutText, { color: t.text }]}>{s}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.notice, { color: t.subtle }]}>
          Chatbot responses ship in a later phase (PRD §4.7). Tapping a shortcut or pressing send will
          acknowledge but not answer for now.
        </Text>
      </ScrollView>

      <View style={[styles.inputBar, { borderTopColor: t.border, backgroundColor: t.bg }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask anything…"
          placeholderTextColor={t.subtle}
          style={[styles.input, { color: t.text, backgroundColor: t.surface, borderColor: t.border }]}
          multiline
        />
        <Pressable
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendBtn, { backgroundColor: t.accent, opacity: text.trim() ? 1 : 0.4 }]}>
          <Text style={styles.sendText}>↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1 },
  title: { fontSize: 16, fontWeight: '700' },
  close: { fontSize: 22 },
  body: { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  shortcuts: { gap: 10 },
  shortcut: { borderWidth: 1, borderRadius: 14, padding: 14 },
  shortcutText: { fontSize: 14 },
  notice: { fontSize: 12, lineHeight: 18, marginTop: 16, fontStyle: 'italic' },
  inputBar: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sendText: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
});
