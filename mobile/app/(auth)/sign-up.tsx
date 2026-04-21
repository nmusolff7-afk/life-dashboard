import { useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { extractClerkError } from '../../lib/clerkError';

export default function SignUpScreen() {
  const { isLoaded, signUp, setActive } = useSignUp();
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
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onVerify() {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Verification is incomplete. Please try again.');
      }
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
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
          disabled={loading}
        />
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
});
