import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { AuthScreen, FormError } from '../../components/AuthScreen';
import { Button, Card, Field, T } from '../../components/ui';
import { api } from '../../lib/api';

export default function Forgot() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: () => api.auth.forgotPassword(email.trim()) });
  const back = <Button variant="ghost" label="Volver a entrar" onPress={() => (router.canGoBack() ? router.back() : router.replace('/entrar'))} />;

  if (send.isSuccess) {
    return (
      <AuthScreen title="Revisa tu correo" footer={back}>
        <Card tone="sunken">
          <T v="body" accessibilityLiveRegion="polite">
            {send.data.message}
          </T>
        </Card>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Recupera tu acceso" lead="Te enviaremos un enlace para crear una contraseña nueva." footer={back}>
      <FormError error={send.error} />
      <Field label="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" onSubmitEditing={() => email.trim() && send.mutate()} />
      <Button label="Enviar enlace" onPress={() => send.mutate()} busy={send.isPending} disabled={!email.trim()} />
    </AuthScreen>
  );
}
