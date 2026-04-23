import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProfileResponse } from '../../../shared/src/types/home';
import { pollOnboarding, regenerateProfile } from '../../lib/api/profile';
import { useTokens } from '../../lib/theme';

interface Props {
  profile: ProfileResponse | null;
  onDone: () => void | Promise<void>;
}

type Stage = 'idle' | 'running' | 'done' | 'error';

/** Ports Flask's "Regenerate AI profile" flow — kicks off
 *  /api/onboarding/complete and polls /api/onboarding/poll until status=done
 *  or error, then refetches the profile so Home / Fitness / Nutrition cards
 *  pick up new targets. */
export function RegenerateAiProfileCard({ profile, onDone }: Props) {
  const t = useTokens();
  const [stage, setStage] = useState<Stage>('idle');
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const handleRegenerate = async () => {
    setStage('running');
    setInsight(null);
    setError(null);
    try {
      await regenerateProfile();
    } catch (e) {
      setStage('error');
      setError(e instanceof Error ? e.message : String(e));
      return;
    }

    // Poll every 1.5s until terminal state.
    clearTimer();
    pollRef.current = setInterval(async () => {
      try {
        const res = await pollOnboarding();
        if (res.status === 'done') {
          clearTimer();
          const next = res.profile;
          setInsight(
            (next?.one_sentence_summary as string | undefined) ??
              (next as { personalized_insight?: string } | undefined)?.personalized_insight ??
              null,
          );
          setStage('done');
          await onDone();
        } else if (res.status === 'error') {
          clearTimer();
          setError(res.error ?? 'Generation failed');
          setStage('error');
        }
        // pending / not_started → keep polling
      } catch (e) {
        clearTimer();
        setError(e instanceof Error ? e.message : String(e));
        setStage('error');
      }
    }, 1500);
  };

  const handleReset = () => {
    setStage('idle');
    setInsight(null);
    setError(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <View style={[styles.card, { backgroundColor: t.surface, shadowColor: '#000' }]}>
      <View style={styles.header}>
        <Text style={styles.icon}>✨</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: t.text }]}>Regenerate AI profile</Text>
          <Text style={[styles.subtitle, { color: t.muted }]}>
            Recomputes calorie + macro targets, step baseline, behavioral archetype, and the
            one-sentence summary from your current body stats / daily life / goal.
          </Text>
        </View>
      </View>

      {/* Current insight, shown if profile has one and we're idle. */}
      {stage === 'idle' && profile?.one_sentence_summary ? (
        <View style={[styles.currentBox, { backgroundColor: t.surface2, borderColor: t.border }]}>
          <Text style={[styles.currentLabel, { color: t.muted }]}>Current summary</Text>
          <Text style={[styles.currentText, { color: t.text }]}>
            “{profile.one_sentence_summary}”
          </Text>
          {profile.biggest_leverage_point ? (
            <Text style={[styles.currentText, { color: t.muted, marginTop: 6 }]}>
              Leverage point: {profile.biggest_leverage_point}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Running spinner. */}
      {stage === 'running' ? (
        <View style={[styles.statusBox, { backgroundColor: t.surface2, borderColor: t.border }]}>
          <ActivityIndicator color={t.accent} />
          <Text style={[styles.statusText, { color: t.text }]}>
            Claude is regenerating your profile. This usually takes 15–30 seconds.
          </Text>
        </View>
      ) : null}

      {/* Done: show new insight. */}
      {stage === 'done' ? (
        <View style={[styles.statusBox, { backgroundColor: t.surface2, borderColor: t.green }]}>
          <Ionicons name="checkmark-circle" size={22} color={t.green} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: t.text }]}>Updated.</Text>
            {insight ? (
              <Text style={[styles.statusInsight, { color: t.muted }]}>“{insight}”</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {/* Error. */}
      {stage === 'error' ? (
        <View style={[styles.statusBox, { backgroundColor: 'rgba(255,77,77,0.08)', borderColor: t.danger }]}>
          <Ionicons name="warning-outline" size={22} color={t.danger} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.statusText, { color: t.danger }]}>Regeneration failed</Text>
            {error ? <Text style={[styles.statusInsight, { color: t.muted }]}>{error}</Text> : null}
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={stage === 'done' || stage === 'error' ? handleReset : handleRegenerate}
        disabled={stage === 'running'}
        style={({ pressed }) => [
          styles.btn,
          {
            backgroundColor: stage === 'done' ? t.surface2 : t.accent,
            opacity: stage === 'running' || pressed ? 0.85 : 1,
          },
        ]}>
        {stage === 'running' ? (
          <ActivityIndicator color="#fff" />
        ) : stage === 'done' ? (
          <Text style={[styles.btnLabel, { color: t.text }]}>Regenerate again</Text>
        ) : stage === 'error' ? (
          <Text style={styles.btnLabel}>Try again</Text>
        ) : (
          <>
            <Ionicons name="sparkles" size={15} color="#fff" />
            <Text style={styles.btnLabel}>  Regenerate</Text>
          </>
        )}
      </Pressable>

      <Text style={[styles.fineprint, { color: t.subtle }]}>
        Hits /api/onboarding/complete + polls /api/onboarding/poll. One AI call per run. Keeps all
        your logged meals / workouts / weight history intact.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    margin: 16,
    borderRadius: 20,
    padding: 18,
    gap: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 2,
  },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  icon: { fontSize: 28 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 13, lineHeight: 18, marginTop: 2 },

  currentBox: { borderWidth: 1, borderRadius: 14, padding: 12 },
  currentLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  currentText: { fontSize: 13, lineHeight: 18, marginTop: 4, fontStyle: 'italic' },

  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  statusText: { fontSize: 14, fontWeight: '600', flex: 1 },
  statusInsight: { fontSize: 12, lineHeight: 17, marginTop: 2, fontStyle: 'italic' },

  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingVertical: 12,
  },
  btnLabel: { color: '#fff', fontSize: 14, fontWeight: '700' },

  fineprint: { fontSize: 11, lineHeight: 15 },
});
