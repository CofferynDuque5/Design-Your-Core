import { Link } from 'react-router';
import { PageHeader } from '../components/AppShell';

export function NotFound() {
  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Error 404" title="Esta página no existe" />
      <p className="lead">Puede que el enlace esté mal o que la página se haya movido.</p>
      <p>
        <Link to="/" className="btn">
          Volver a Hoy
        </Link>
      </p>
    </div>
  );
}
