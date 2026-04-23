import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Button } from '../../components/ui';
import { apiFetch } from '../../lib/api';
import { useTokens } from '../../lib/theme';

type Status = 'pending' | 'done' | 'error';

export default function GeneratingScreen() {
  const t = useTokens();
  const router = useRouter();
  const [status, setStatus] = useState<Status>('pending');
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      while (!cancelled) {
        try {
          const res = await apiFetch('/api/onboarding/poll');
          const data = await res.json();
          if (cancelled) return;
          if (data?.status === 'done') {
            setStatus('done');
            setInsight(data?.profile?.personalized_insight ?? data?.profile?.one_sentence_summary ?? null);
            return;
          }
          if (data?.status === 'error') {
            setStatus('error');
            setError(data?.error ?? 'Profile generation failed');
            return;
          }
        } catch (err) {
          if (cancelled) return;
          setStatus('error');
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
        await new Promise<void>((r) => setTimeout(r, 1500));
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, []);

  const next = () => router.replace('/(onboarding)/workout-builder');

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      {status === 'pending' ? (
        <>
          <ActivityIndicator size="large" color={t.accent} />
          <Text style={[styles.title, { color: t.text, marginTop: 18 }]}>Building your plan…</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            We&apos;re calculating your metabolism, macros, and a personalized profile. This usually takes 5–15 seconds.
          </Text>
        </>
      ) : null}
      {status === 'done' ? (
        <>
          <Text style={styles.emoji}>✨</Text>
          <Text style={[styles.title, { color: t.text }]}>Your plan is ready</Text>
          {insight ? <Text style={[styles.insight, { color: t.body }]}>{insight}</Text> : null}
          <Button title="Continue" onPress={next} style={{ marginTop: 24, alignSelf: 'stretch' }} />
        </>
      ) : null}
      {status === 'error' ? (
        <>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={[styles.title, { color: t.text }]}>Profile generation failed</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            Your body stats and goal are saved. The AI profile step needs Claude to succeed before
            onboarding can finalize server-side. Common cause: ANTHROPIC_API_KEY is invalid or
            revoked — check the Flask terminal for the exact error.
          </Text>
          <Text style={[styles.insight, { color: t.subtle, fontStyle: 'normal', fontSize: 12 }]}>
            Debug: {error}
          </Text>
          <Button
            title="Try again"
            onPress={() => {
              setStatus('pending');
              setError(null);
              router.replace('/(onboarding)/step-3');
            }}
            style={{ marginTop: 16, alignSelf: 'stretch' }}
          />
          <Button
            title="Continue without AI profile"
            variant="secondary"
            onPress={next}
            style={{ marginTop: 8, alignSelf: 'stretch' }}
          />
          <Text style={[styles.subtitle, { color: t.subtle, fontSize: 11, marginTop: 8 }]}>
            &quot;Continue&quot; will land you in the app but the onboarding gate will keep redirecting you here
            until the server marks you complete. Fix the Claude key first.
          </Text>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 64, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  insight: { fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 14, maxWidth: 340, fontStyle: 'italic' },
});
