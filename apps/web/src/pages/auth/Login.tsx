import { isEmail } from '@dyc/core';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { useSession } from '../../app/session';
import { PasswordField, TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Los errores de un campo aparecen al salir de él (o al enviar), no mientras se escribe.
  const [touched, setTouched] = useState({ email: false, password: false });
  const form = useRef<HTMLFormElement>(null);
  const login = useMutation({ mutationFn: api.auth.login, onSuccess: signIn });

  const emailOk = isEmail(email);
  const emailError = touched.email && !emailOk ? (email.trim() ? 'Ingresa un correo válido, como nombre@correo.com.' : 'Escribe tu correo.') : null;
  const passwordError = touched.password && !password ? 'Escribe tu contraseña.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    if (!emailOk || !password) {
      form.current?.querySelector<HTMLInputElement>(!emailOk ? 'input[type=email]' : 'input[autocomplete=current-password]')?.focus();
      return;
    }
    login.mutate({ email: email.trim(), password });
  };

  return (
    <AuthLayout
      title="Hola de nuevo"
      lead="Entra para seguir con tus pilares."
      footer={
        <p>
          ¿Aún no tienes cuenta? <Link to="/registro">Crea una</Link>
        </p>
      }
    >
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        {login.isError && (
          <div className="alert alert--danger" role="alert">
            {errorMessage(login.error)}
          </div>
        )}
        <TextField
          label="Correo"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="nombre@correo.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email && setTouched((t) => ({ ...t, email: true }))}
          error={emailError}
          valid={emailOk}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={passwordError}
        />
        <button className="btn btn--block" type="submit" disabled={login.isPending} aria-busy={login.isPending}>
          {login.isPending ? 'Entrando…' : 'Entrar'}
        </button>
        <Link to="/recuperar" className="auth__link">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </AuthLayout>
  );
}
