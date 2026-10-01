import { isEmail, isStrongPassword, passwordChecks } from '@dyc/core';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { useSession } from '../../app/session';
import { PasswordField, TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Register() {
  const { signIn } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState({ email: false, password: false });
  // Los requisitos se ven desde que se entra al campo: la ayuda llega antes que el error.
  const [showRules, setShowRules] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const register = useMutation({ mutationFn: api.auth.register, onSuccess: signIn });

  const emailOk = isEmail(email);
  const strong = isStrongPassword(password);
  const emailError = touched.email && !emailOk ? (email.trim() ? 'Ingresa un correo válido, como nombre@correo.com.' : 'Escribe tu correo.') : null;
  const passwordError = touched.password && !strong ? 'La contraseña todavía no cumple los requisitos.' : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true });
    setShowRules(true);
    if (!emailOk || !strong) {
      form.current?.querySelector<HTMLInputElement>(!emailOk ? 'input[type=email]' : 'input[autocomplete=new-password]')?.focus();
      return;
    }
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
      <form ref={form} className="stack" onSubmit={submit} noValidate>
        {register.isError && (
          <div className="alert alert--danger" role="alert">
            {errorMessage(register.error)}
          </div>
        )}
        <TextField
          label="Tu nombre"
          autoComplete="given-name"
          placeholder="Cómo quieres que te llamemos"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          valid={name.trim().length > 0}
        />
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
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setShowRules(true)}
          onBlur={() => password && setTouched((t) => ({ ...t, password: true }))}
          checks={showRules || password ? passwordChecks(password) : undefined}
          error={passwordError}
          valid={strong}
        />
        <button className="btn btn--block" type="submit" disabled={register.isPending} aria-busy={register.isPending}>
          {register.isPending ? 'Creando tu cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthLayout>
  );
}
