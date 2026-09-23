import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { useSession } from '../../app/session';
import { TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Register() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const register = useMutation({ mutationFn: api.auth.register, onSuccess: signIn });

  const shortPassword = password.length > 0 && password.length < 8;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < 8) return;
    register.mutate({ name: name.trim() || undefined, email: email.trim(), password });
  };

  return (
    <AuthLayout
      title="Crea tu cuenta"
      lead="Te tomará un minuto. Después te haremos unas preguntas para adaptar la experiencia a ti."
      footer={
        <p>
          ¿Ya tienes cuenta? <Link to="/entrar">Entra</Link>
        </p>
      }
    >
      <form className="stack" onSubmit={submit} noValidate>
        {register.isError && (
          <div className="alert alert--danger" role="alert">
            {errorMessage(register.error)}
          </div>
        )}
        <TextField label="Tu nombre" autoComplete="given-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <TextField label="Correo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField
          label="Contraseña"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="Al menos 8 caracteres."
          error={touched && (shortPassword || !password) ? 'La contraseña necesita al menos 8 caracteres.' : null}
        />
        <button className="btn btn--block" type="submit" disabled={register.isPending || !email} aria-busy={register.isPending}>
          Crear cuenta
        </button>
      </form>
    </AuthLayout>
  );
}
