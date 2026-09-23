import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { useSession } from '../../app/session';
import { TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Login() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: api.auth.login, onSuccess: signIn });

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
      <form className="stack" onSubmit={submit} noValidate>
        {login.isError && (
          <div className="alert alert--danger" role="alert">
            {errorMessage(login.error)}
          </div>
        )}
        <TextField label="Correo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="btn btn--block" type="submit" disabled={login.isPending || !email || !password} aria-busy={login.isPending}>
          Entrar
        </button>
        <Link to="/recuperar" className="auth__link">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </AuthLayout>
  );
}
