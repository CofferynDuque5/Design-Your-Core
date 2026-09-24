import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../../app/api';
import { TextField } from '../../components/Form';
import { errorMessage } from '../../components/States';
import { AuthLayout } from './AuthLayout';

export function Forgot() {
  const [email, setEmail] = useState('');
  const forgot = useMutation({ mutationFn: api.auth.forgotPassword });

  const submit = (e: FormEvent) => {
    e.preventDefault();
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
          <TextField label="Correo" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn btn--block" type="submit" disabled={forgot.isPending || !email} aria-busy={forgot.isPending}>
            Enviar enlace
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
