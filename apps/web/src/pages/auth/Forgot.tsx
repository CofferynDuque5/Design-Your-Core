import { isEmail } from '@dyc/core';
import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Forgot() {
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const forgot = useMutation({ mutationFn: api.auth.forgotPassword });
  const emailOk = isEmail(email);
  const emailError = touched && !emailOk ? (email.trim() ? 'Ingresa un correo válido, como nombre@correo.com.' : 'Escribe tu correo.') : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!emailOk) return;
    forgot.mutate(email.trim());
  };

  return (
    <AuthLayout
      title="Recupera tu contraseña"
      lead="Escribe tu correo y te enviaremos un enlace para elegir una nueva."
      footer={<Link to="/entrar">Volver a entrar</Link>}
    >
      {forgot.isSuccess ? (
        <div className="alert alert--success" role="status">
          {forgot.data.message} Revisa también la carpeta de spam.
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {forgot.isError && (
            <div className="alert alert--danger" role="alert">
              {errorMessage(forgot.error)}
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
            onBlur={() => email && setTouched(true)}
            error={emailError}
            valid={emailOk}
          />
          <button className="btn btn--block" type="submit" disabled={forgot.isPending} aria-busy={forgot.isPending}>
            Enviar enlace
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
