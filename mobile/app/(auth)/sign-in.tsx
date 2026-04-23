import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { extractClerkError } from '../../lib/clerkError';

type Mode = 'form' | 'second-factor';

interface SecondFactor {
  strategy: string;
  emailAddressId?: string;
  phoneNumberId?: string;
  safeIdentifier?: string;
}

export default function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [secondFactor, setSecondFactor] = useState<SecondFactor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignIn() {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      let result = await signIn.create({ identifier: email, password });
      // eslint-disable-next-line no-console
      console.log('[signIn] after create:', {
        status: result.status,
        firstFactors: result.supportedFirstFactors?.map((f: { strategy: string }) => f.strategy),
        secondFactors: result.supportedSecondFactors?.map((f: SecondFactor) => ({
          strategy: f.strategy,
          safeId: f.safeIdentifier,
        })),
      });

      if (result.status === 'needs_first_factor') {
        result = await signIn.attemptFirstFactor({ strategy: 'password', password });
      }

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
        return;
      }

      if (result.status === 'needs_second_factor') {
        const factors = result.supportedSecondFactors ?? [];
        const email2fa = factors.find((f: SecondFactor) => f.strategy === 'email_code');
        const totp = factors.find((f: SecondFactor) => f.strategy === 'totp');
        const phone = factors.find((f: SecondFactor) => f.strategy === 'phone_code');
        const chosen = email2fa ?? phone ?? totp ?? factors[0];

        if (!chosen) {
          setError('MFA required but no supported second factor configured.');
          return;
        }

        setSecondFactor(chosen);

        // TOTP doesn't need a prepare step; email/phone codes do.
        if (chosen.strategy === 'email_code' && chosen.emailAddressId) {
          await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: chosen.emailAddressId });
        } else if (chosen.strategy === 'phone_code' && chosen.phoneNumberId) {
          await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: chosen.phoneNumberId });
        }

        setMode('second-factor');
        return;
      }

      setError(`Sign-in returned status "${result.status}" — check Metro log.`);
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onVerifySecondFactor() {
    if (!isLoaded || loading || !secondFactor) return;
    setError(null);
    setLoading(true);
    try {
      const strategy = secondFactor.strategy as 'email_code' | 'phone_code' | 'totp' | 'backup_code';
      const result = await signIn.attemptSecondFactor({ strategy, code } as never);
      // eslint-disable-next-line no-console
      console.log('[signIn] after attemptSecondFactor:', { status: result.status });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError(`Verification returned status "${result.status}"`);
      }
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  if (mode === 'second-factor') {
    const target = secondFactor?.safeIdentifier ?? 'your device';
    const strategyLabel =
      secondFactor?.strategy === 'totp' ? 'your authenticator app' :
      secondFactor?.strategy === 'backup_code' ? 'a backup code' :
      `the code we just sent to ${target}`;
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Verification required</ThemedText>
        <ThemedText>Enter {strategyLabel}.</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          editable={!loading}
          autoFocus
        />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        <Button
          title={loading ? 'Verifying…' : 'Verify'}
          onPress={onVerifySecondFactor}
          disabled={loading || !code}
        />
        <View style={styles.footer}>
          <ThemedText
            onPress={() => {
              setMode('form');
              setCode('');
              setError(null);
            }}
            type="link">
            Back
          </ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Sign In</ThemedText>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
        editable={!loading}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!loading}
      />
      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
      <Button
        title={loading ? 'Signing in…' : 'Sign In'}
        onPress={onSignIn}
        disabled={loading}
      />
      <View style={styles.footer}>
        <ThemedText>Don&apos;t have an account? </ThemedText>
        <Link href="/(auth)/sign-up">
          <ThemedText type="link">Sign Up</ThemedText>
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12, justifyContent: 'center' },
  title: { marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#888',
    padding: 12,
    borderRadius: 6,
    color: '#000',
    backgroundColor: '#fff',
  },
  error: { color: '#c00' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
});
