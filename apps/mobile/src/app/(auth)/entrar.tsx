import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { AuthScreen, FormError } from '../../components/AuthScreen';
import { Button, Field } from '../../components/ui';
import { api, auth } from '../../lib/api';

export default function SignIn() {
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const passwordRef = useRef<TextInput>(null);
  const login = useMutation({
    mutationFn: () => api.session.login({ email: email.trim(), password, device: Device.modelName ?? undefined }),
    onSuccess: (pair) => {
      qc.clear();
      return auth.signIn(pair);
    },
  });
  const submit = () => email.trim() && password && login.mutate();

  return (
    <AuthScreen
      title="Hola de nuevo"
      lead="Entra para seguir con tu día."
      footer={
        <>
          <Button variant="ghost" label="¿Olvidaste tu contraseña?" onPress={() => router.push('/recuperar')} />
          <Button variant="secondary" label="Crear una cuenta" onPress={() => router.push('/registro')} style={{ alignSelf: 'stretch' }} />
        </>
      }
    >
      <FormError error={login.error} />
      <Field
        label="Correo"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />
      <Field
        ref={passwordRef}
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label="Entrar" onPress={submit} busy={login.isPending} disabled={!email.trim() || !password} />
    </AuthScreen>
  );
}
