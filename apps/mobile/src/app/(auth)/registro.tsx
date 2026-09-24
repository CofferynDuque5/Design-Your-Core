import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Device from 'expo-device';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthScreen, FormError } from '../../components/AuthScreen';
import { Button, Field } from '../../components/ui';
import { api, auth } from '../../lib/api';

export default function Register() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const register = useMutation({
    mutationFn: () => api.session.register({ name: name.trim() || undefined, email: email.trim(), password, device: Device.modelName ?? undefined }),
    onSuccess: (pair) => {
      qc.clear();
      return auth.signIn(pair);
    },
  });
  const tooShort = password.length < 8;
  const submit = () => {
    setTouched(true);
    if (!tooShort && email.trim()) register.mutate();
  };

  return (
    <AuthScreen
      title="Crea tu cuenta"
      lead="Te tomará un minuto. Después te haremos unas preguntas para adaptar la experiencia a ti."
      footer={<Button variant="ghost" label="Ya tengo cuenta" onPress={() => (router.canGoBack() ? router.back() : router.replace('/entrar'))} />}
    >
      <FormError error={register.error} />
      <Field label="Tu nombre" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" maxLength={80} />
      <Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Field
        label="Contraseña"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        hint="Al menos 8 caracteres."
        error={touched && tooShort ? 'La contraseña necesita al menos 8 caracteres.' : null}
        onSubmitEditing={submit}
      />
      <Button label="Crear cuenta" onPress={submit} busy={register.isPending} disabled={!email.trim()} />
    </AuthScreen>
  );
}
