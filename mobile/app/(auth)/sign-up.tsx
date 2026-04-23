import { useAuth, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { extractClerkError } from '../../lib/clerkError';
import { clearFlaskToken } from '../../lib/flaskToken';

/** Match Clerk's "you're already signed in" family of errors. */
function isAlreadySignedIn(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("you're already signed in") ||
    m.includes('already signed in') ||
    m.includes('session_exists')
  );
}

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { signOut } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCreateAccount() {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      // eslint-disable-next-line no-console
      console.log('[signUp] creating account…');
      const createResult = await signUp.create({ emailAddress: email, password });
      // eslint-disable-next-line no-console
      console.log('[signUp] signUp.create →', { status: createResult.status, missingFields: createResult.missingFields });

      // eslint-disable-next-line no-console
      console.log('[signUp] preparing email verification…');
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      // eslint-disable-next-line no-console
      console.log('[signUp] verification prepared. Waiting for code.');

      setPendingVerification(true);
    } catch (err) {
      const msg = extractClerkError(err);
      // eslint-disable-next-line no-console
      console.log('[signUp] create failed:', msg);
      // If Clerk says we're already signed in, trust it — route straight into the app.
      if (isAlreadySignedIn(msg)) {
        router.replace('/(tabs)');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      // eslint-disable-next-line no-console
      console.log('[signUp] attempting verification…');
      const result = await signUp.attemptEmailAddressVerification({ code });
      // eslint-disable-next-line no-console
      console.log('[signUp] verify →', { status: result.status, missing: result.missingFields });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
        return;
      }

      setError(`Verification returned status "${result.status}". Missing: ${result.missingFields?.join(', ') || '(none reported)'}`);
    } catch (err) {
      const msg = extractClerkError(err);
      // eslint-disable-next-line no-console
      console.log('[signUp] verify failed:', msg);
      // "Already signed in" here means the verify already succeeded and Clerk
      // rejected the retry. Route the user into the app instead of showing an error.
      if (isAlreadySignedIn(msg)) {
        router.replace('/(tabs)');
        return;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // If the user got into a weird state (Clerk says already-signed-in but we
  // can't advance), let them wipe both sides and start over.
  async function onAbortAndSignOut() {
    clearFlaskToken();
    try {
      await signOut();
    } catch {
      // ignore
    }
    setPendingVerification(false);
    setCode('');
    setError(null);
  }

  if (pendingVerification) {
    return (
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Check your email</ThemedText>
        <ThemedText>Enter the 6-digit code we just sent to {email}.</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Code"
          value={code}
          onChangeText={setCode}
          keyboardType="number-pad"
          editable={!loading}
        />
        {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
        <Button
          title={loading ? 'Verifying…' : 'Verify'}
          onPress={onVerify}
          disabled={loading || !code}
        />
        <View style={styles.footer}>
          <ThemedText onPress={onAbortAndSignOut} type="link">Start over (sign out)</ThemedText>
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.title}>Create Account</ThemedText>
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
        title={loading ? 'Creating account…' : 'Create Account'}
        onPress={onCreateAccount}
        disabled={loading}
      />
      <View style={styles.footer}>
        <ThemedText onPress={onAbortAndSignOut} type="link">Sign out</ThemedText>
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
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
});
