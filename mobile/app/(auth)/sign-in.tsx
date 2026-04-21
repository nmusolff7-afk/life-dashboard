import { useSignIn } from '@clerk/clerk-expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { extractClerkError } from '../../lib/clerkError';

export default function SignInScreen() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSignIn() {
    if (!isLoaded || loading) return;
    setError(null);
    setLoading(true);
    try {
      const result = await signIn.create({ identifier: email, password });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Sign-in is incomplete. Please try again.');
      }
    } catch (err) {
      setError(extractClerkError(err));
    } finally {
      setLoading(false);
    }
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
