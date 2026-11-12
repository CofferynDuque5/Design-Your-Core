import { AVATARS, avatarById, MEALS, MEAL_LABEL, WATER_EVERY, waterTimes, positiveMessage, PLAN_NAME, CLASS_LEADS, COMMON_TIMEZONES, CONTACT_EMAIL, PILLAR_IDS, type NotifyPrefs, isStrongPassword, passwordChecks, type PillarId } from '@dyc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BellRing, Download, LogOut, Mail, Pencil } from 'lucide-react';
import { AvatarArt, UserAvatar } from '../components/Avatar';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
import { useShowCycle } from '../app/prefs';
import { keys, useProfile } from '../app/queries';
import { useSession } from '../app/session';
import { useTheme, type ThemePreference } from '../app/theme';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Dialog } from '../components/Dialog';
import { PasswordField, Segmented, TextArea, TextField } from '../components/Form';
import { pillarShort } from '../components/Pillar';
import { ErrorState, errorMessage, Loading } from '../components/States';
import { disablePush, enablePush, playAlarm, pushSupported, readAlarmPrefs, saveAlarmPrefs } from '../lib/alarms';
import { deviceTimeZone } from '../lib/format';

export function Profile() {
  const { user, signOut } = useSession();

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow="Perfil" title="Tu perfil" />
      <div className="stack-lg">
        <ProfileHero name={user?.name ?? ''} email={user?.email ?? ''} />
        <PlanSection />
        <FocusSection />
        <PreferencesSection />
        <AlarmsSection />
        <PartnerSection />
        <SecuritySection />
        <DataSection />
        <Link to="/mas" className="card link-card">
          <span>
            <strong>Más herramientas</strong>
            <span className="muted"> · agenda, materias, finanzas, metas, ejercicio, sueño, diario y el resto de herramientas</span>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <div>
          <button type="button" className="btn btn--secondary" onClick={signOut}>
            <LogOut size={18} aria-hidden="true" /> Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tu personaje (foto de perfil dibujada) y tu nombre; se cambia tocándolo. */
function ProfileHero({ name, email }: { name: string; email: string }) {
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const current = profile.data?.avatar ?? '';
  const save = useMutation({
    mutationFn: (avatar: string) => api.profile.update({ avatar }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      const a = avatarById(p.avatar);
      toast(a ? `Ahora eres ${a.name}.` : 'Vuelves a tus iniciales.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const shown = save.isPending ? (save.variables ?? current) : current;
  return (
    <section className="card profile-hero" aria-labelledby="hero-name">
      <button type="button" className="profile-hero__art" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="avatar-picker" aria-label="Cambiar tu personaje">
        <UserAvatar avatar={shown} name={name} size={112} />
        <span className="profile-hero__edit" aria-hidden="true">
          <Pencil size={14} />
        </span>
      </button>
      <div className="profile-hero__who">
        <h2 id="hero-name" className="profile-hero__name">
          {name || 'Tu perfil'}
        </h2>
        <p className="muted small">{email}</p>
        <button type="button" className="btn btn--secondary btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="avatar-picker">
          {avatarById(shown) ? 'Cambiar personaje' : 'Elegir personaje'}
        </button>
      </div>
      {open && (
        <div id="avatar-picker" className="avatar-picker" role="radiogroup" aria-label="Elige tu personaje">
          {AVATARS.map((a) => (
            <button key={a.id} type="button" role="radio" aria-checked={shown === a.id} className={`avatar-picker__item${shown === a.id ? ' is-on' : ''}`} onClick={() => save.mutate(a.id)} disabled={save.isPending}>
              <AvatarArt avatar={a} size={72} />
              <span>{a.name}</span>
            </button>
          ))}
          <button type="button" role="radio" aria-checked={!avatarById(shown)} className={`avatar-picker__item${!avatarById(shown) ? ' is-on' : ''}`} onClick={() => save.mutate('')} disabled={save.isPending}>
            <UserAvatar name={name} size={72} />
            <span>Iniciales</span>
          </button>
        </div>
      )}
    </section>
  );
}

/** Tu plan y el acceso a pagar (y a administrar pagos si eres administración). */
function PlanSection() {
  const billing = useQuery({ queryKey: ['billing'], queryFn: api.billing.get });
  const b = billing.data;
  const pending = b?.requests.some((r) => r.status === 'pendiente');
  return (
    <section className="card stack-sm" aria-labelledby="plan-title">
      <h2 id="plan-title" className="section-title">
        Tu plan{b ? `: ${PLAN_NAME[b.plan]}` : ''}
      </h2>
      <p className="muted small">
        {!b
          ? 'Planes Pro, Pareja y Estudiante.'
          : pending
            ? 'Tu pago está en revisión. Te avisamos en «Planes» cuando se apruebe.'
            : b.plan === 'gratis'
              ? 'Pásate a Pro para tener todas las herramientas sin límites.'
              : `Activo hasta el ${new Date(b.planUntil ?? '').toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}.`}
      </p>
      <div className="row">
        <Link to="/planes" className="btn btn--sm">
          {b?.plan === 'gratis' || !b ? 'Ver planes' : 'Renovar o cambiar'}
        </Link>
        {b?.admin && (
          <Link to="/admin/pagos" className="btn btn--secondary btn--sm">
            Administrar pagos
          </Link>
        )}
      </div>
    </section>
  );
}

function FocusSection() {
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const [focus, setFocus] = useState<PillarId[]>([]);
  const [intention, setIntention] = useState('');

  useEffect(() => {
    if (!profile.data) return;
    setFocus(profile.data.focusPillars);
    setIntention(profile.data.intention ?? '');
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => api.profile.update({ focusPillars: focus, intention: intention.trim() }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast('Enfoque guardado.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  if (profile.isPending) return <Loading />;
  if (profile.isError) return <ErrorState error={profile.error} retry={() => profile.refetch()} />;

  const toggle = (p: PillarId) => setFocus((f) => (f.includes(p) ? f.filter((x) => x !== p) : f.length >= 3 ? f : [...f, p]));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form className="card stack" onSubmit={submit} aria-labelledby="focus-title">
      <h2 id="focus-title" className="section-title">
        Tus prioridades
      </h2>
      <fieldset className="field">
        <legend className="field__label">Pilares que son tu prioridad (hasta 3)</legend>
        <div className="chips">
          {PILLAR_IDS.map((p) => (
            <label key={p} className="chip-radio" data-pillar={p}>
              <input type="checkbox" checked={focus.includes(p)} onChange={() => toggle(p)} disabled={!focus.includes(p) && focus.length >= 3} />
              <span>{pillarShort(p)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <TextArea label="Tu intención" rows={2} maxLength={280} value={intention} onChange={(e) => setIntention(e.target.value)} />
      <div>
        <button type="submit" className="btn btn--secondary" disabled={save.isPending} aria-busy={save.isPending}>
          Guardar
        </button>
      </div>
    </form>
  );
}

function timeZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return [];
  }
}

function PreferencesSection() {
  const [theme, setTheme] = useTheme();
  const profile = useProfile();
  const qc = useQueryClient();
  const toast = useToast();
  const zones = useMemo(timeZones, []);
  const device = deviceTimeZone();

  const saveTz = useMutation({
    mutationFn: (timezone: string) => api.profile.update({ timezone }),
    onSuccess: (p) => {
      qc.setQueryData(keys.profile, p);
      qc.invalidateQueries();
      toast('Zona horaria actualizada.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const tz = profile.data?.timezone ?? 'UTC';
  return (
    <section className="card stack" aria-labelledby="prefs-title">
      <h2 id="prefs-title" className="section-title">
        Preferencias
      </h2>
      <div className="field">
        <span className="field__label">Apariencia</span>
        <Segmented<ThemePreference>
          label="Apariencia"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'light', label: 'Claro' },
            { value: 'dark', label: 'Oscuro' },
          ]}
        />
      </div>
      <div className="field">
        <label className="field__label" htmlFor="tz">
          Zona horaria
        </label>
        {zones.length ? (
          <select id="tz" className="input" value={tz} onChange={(e) => saveTz.mutate(e.target.value)} disabled={saveTz.isPending}>
            {!zones.includes(tz) && !COMMON_TIMEZONES.some((c) => c.id === tz) && <option value={tz}>{tz}</option>}
            <optgroup label="Latinoamérica y España">
              {COMMON_TIMEZONES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Todas las zonas">
              {zones
                .filter((z) => !COMMON_TIMEZONES.some((c) => c.id === z))
                .map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, ' ')}
                  </option>
                ))}
            </optgroup>
          </select>
        ) : (
          <input id="tz" className="input" value={tz} readOnly />
        )}
        <span className="field__hint">Decide cuándo empieza tu día para check-ins, hábitos y retos.</span>
        {tz !== device && (
          <div>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => saveTz.mutate(device)}>
              Usar la de este dispositivo ({device.replace(/_/g, ' ')})
            </button>
          </div>
        )}
      </div>
      <CycleSetting />
    </section>
  );
}

function CycleSetting() {
  const { showCycle, setShowCycle } = useShowCycle();
  return (
    <div className="setting-row">
      <span className="setting-row__text">
        <span className="field__label" id="cycle-setting">
          Ciclo menstrual
        </span>
        <span className="field__hint" id="cycle-setting-hint">
          Muestra Ciclo en el menú y tus días de regla en el Calendario. Siempre puedes abrirlo desde Más.
        </span>
      </span>
      <label className="switch">
        <input type="checkbox" role="switch" checked={showCycle} onChange={() => setShowCycle(!showCycle)} aria-labelledby="cycle-setting" aria-describedby="cycle-setting-hint" />
        <span aria-hidden="true" />
      </label>
    </div>
  );
}

/** Alarmas de clases, recordatorios y tareas en este navegador, también con el panel cerrado. */
function AlarmsSection() {
  const toast = useToast();
  const [prefs, setPrefs] = useState(readAlarmPrefs);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const apply = (p: NotifyPrefs) => {
    setPrefs(p);
    saveAlarmPrefs(p);
  };
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      if (!enabled) {
        apply({ ...prefs, enabled });
        await disablePush();
        setNote(null);
        return;
      }
      apply({ ...prefs, enabled });
      const r = await enablePush().catch(() => 'unsupported' as const);
      if (r === 'on') {
        setNote('Listo: suenan con el panel abierto y llegan como aviso aunque lo cierres.');
        toast('Alarmas activadas.');
      } else if (r === 'denied') setNote('El navegador no dio permiso para avisos: solo sonarán con el panel abierto. Puedes darlo en el candado de la barra de direcciones.');
      else setNote('Este navegador no recibe avisos con el panel cerrado: sonarán con el panel abierto. En iPhone, instala el panel en la pantalla de inicio.');
    } finally {
      setBusy(false);
    }
  };
  const test = () => {
    const stop = playAlarm(3);
    window.setTimeout(stop, 3200);
    if (pushSupported() && Notification.permission === 'granted')
      void navigator.serviceWorker.ready
        .then((r) =>
          r.showNotification('Prueba de alarma', {
            body: 'Así te avisará Design Your Core.',
            icon: '/icon-192.png',
            tag: 'dyc-prueba',
          }),
        )
        .catch(() => undefined);
  };
  const row = (label: string, checked: boolean, onChange: (v: boolean) => void) => (
    <label className="setting-row">
      <span>{label}</span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} disabled={busy} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" />
      </span>
    </label>
  );
  return (
    <section className="card stack" aria-labelledby="alarms-title">
      <h2 id="alarms-title" className="section-title">
        Alarmas
      </h2>
      <p className="muted small">Suenan a la hora de tus clases y cursos del Horario, los recordatorios del Calendario y las tareas de la Agenda con aviso. También te recuerdan comer, tomar agua y te dejan un mensaje positivo cada día. En el teléfono se activan en su app, en Perfil.</p>
      {row('Alarmas en este navegador', prefs.enabled, (v) => void toggle(v))}
      {note && (
        <p className="small muted" role="status">
          {note}
        </p>
      )}
      {prefs.enabled && (
        <div className="stack">
          {row('Clases y cursos del Horario', prefs.classes, (classes) => apply({ ...prefs, classes }))}
          {prefs.classes && (
            <div className="field">
              <span className="field__label">Avisarme antes de empezar</span>
              <Segmented<string>
                label="Avisarme antes de empezar"
                value={String(prefs.classLead)}
                onChange={(v) => apply({ ...prefs, classLead: Number(v) })}
                options={CLASS_LEADS.map((m) => ({
                  value: String(m),
                  label: m === 0 ? 'A la hora' : `${m} min`,
                }))}
              />
            </div>
          )}
          {row('Recordatorios del Calendario', prefs.reminders, (reminders) => apply({ ...prefs, reminders }))}
          {row('Tareas de la Agenda con aviso', prefs.tasks, (tasks) => apply({ ...prefs, tasks }))}
          {row('Rutinas y cuidados de mascotas', prefs.routines, (routines) => apply({ ...prefs, routines }))}
          <h3 className="planner__title">Cuidarte</h3>
          {row('Recordarme comer a mis horas', prefs.meals, (meals) => apply({ ...prefs, meals }))}
          {prefs.meals && (
            <div className="care-times">
              {MEALS.map((m) => (
                <TextField
                  key={m}
                  label={MEAL_LABEL[m]}
                  type="time"
                  value={prefs.mealTimes[m]}
                  onChange={(e) => apply({ ...prefs, mealTimes: { ...prefs.mealTimes, [m]: e.target.value } })}
                  hint={prefs.mealTimes[m] ? undefined : 'Sin aviso'}
                />
              ))}
            </div>
          )}
          {row('Recordarme tomar agua', prefs.water, (water) => apply({ ...prefs, water }))}
          {prefs.water && (
            <div className="stack-sm">
              <div className="field">
                <span className="field__label">Cada cuánto</span>
                <Segmented<string>
                  label="Cada cuánto tomar agua"
                  value={String(prefs.waterEvery)}
                  onChange={(v) => apply({ ...prefs, waterEvery: Number(v) })}
                  options={WATER_EVERY.map((h) => ({ value: String(h), label: h === 1 ? 'Cada hora' : `Cada ${h} horas` }))}
                />
              </div>
              <div className="care-times">
                <TextField label="Desde" type="time" value={prefs.waterFrom} onChange={(e) => e.target.value && apply({ ...prefs, waterFrom: e.target.value })} />
                <TextField label="Hasta" type="time" value={prefs.waterTo} onChange={(e) => e.target.value && apply({ ...prefs, waterTo: e.target.value })} />
              </div>
              <p className="small muted">{waterTimes(prefs.waterFrom, prefs.waterTo, prefs.waterEvery).join(' · ') || 'Elige un «Hasta» después del «Desde».'}</p>
            </div>
          )}
          {row('Un mensaje positivo cada día', prefs.cheers, (cheers) => apply({ ...prefs, cheers }))}
          {prefs.cheers && (
            <div className="care-times">
              <TextField label="A qué hora" type="time" value={prefs.cheerTime} onChange={(e) => e.target.value && apply({ ...prefs, cheerTime: e.target.value })} hint={`Hoy: «${positiveMessage()}»`} />
            </div>
          )}
          <div>
            <button type="button" className="btn btn--secondary btn--sm" onClick={test}>
              <BellRing size={16} aria-hidden="true" /> Probar el sonido
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function PartnerSection() {
  const partner = useQuery({ queryKey: keys.partner, queryFn: api.partner.get });
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [myCode, setMyCode] = useState<string | null>(null);
  const done = () => qc.invalidateQueries({ queryKey: keys.partner });

  const invite = useMutation({ mutationFn: api.partner.invite, onSuccess: (r) => setMyCode(r.code), onError: (e) => toast(errorMessage(e), { tone: 'error' }) });
  const inviteEmail = useMutation({
    mutationFn: () => api.partner.inviteByEmail(email.trim(), window.location.origin + '/perfil'),
    onSuccess: (r) => {
      setMyCode(r.code);
      toast(r.sent ? 'Invitación enviada.' : 'No pudimos enviar el correo; comparte el código a mano.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const accept = useMutation({
    mutationFn: () => api.partner.accept(code.trim().toUpperCase()),
    onSuccess: (r) => {
      toast(`Ahora estás vinculada/o con ${r.partner.name}.`);
      setCode('');
      return done();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const unlink = useMutation({
    mutationFn: api.partner.remove,
    onSuccess: () => {
      toast('Vínculo eliminado.');
      return done();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  // Un enlace de invitación trae ?invite=XXXXXX.
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get('invite');
    if (c && /^[A-Za-z0-9]{6}$/.test(c)) setCode(c.toUpperCase());
  }, []);

  return (
    <section className="card stack" aria-labelledby="partner-title">
      <div className="stack-xs">
        <h2 id="partner-title" className="section-title">
          Pareja
        </h2>
        <p className="muted">Comparte tus hábitos con una persona para acompañaros. Solo ve el nombre de tus hábitos y si los cumpliste.</p>
      </div>
      {partner.isPending ? (
        <Loading />
      ) : partner.isError ? (
        <ErrorState error={partner.error} retry={() => partner.refetch()} />
      ) : partner.data.partner ? (
        <div className="stack">
          <p>
            Vinculada/o con <strong>{partner.data.partner.name}</strong>
            {partner.data.total ? ` · hoy cumplió ${partner.data.doneToday} de ${partner.data.total} hábitos` : ''}.
          </p>
          <div className="row wrap">
            <Link to="/pareja" className="btn btn--sm">
              Abrir su espacio en pareja <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <button type="button" className="btn btn--ghost btn--sm danger-text" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
              Desvincular
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {myCode ? (
            <div className="alert" role="status">
              Tu código es <strong className="code">{myCode}</strong>. Compártelo con tu pareja para que lo escriba en su perfil.
            </div>
          ) : (
            <div className="grid-2 align-end">
              <TextField label="Invitar por correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <div className="row">
                <button type="button" className="btn btn--secondary" onClick={() => inviteEmail.mutate()} disabled={!email || inviteEmail.isPending}>
                  Enviar
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => invite.mutate()} disabled={invite.isPending}>
                  Solo el código
                </button>
              </div>
            </div>
          )}
          <form
            className="grid-2 align-end"
            onSubmit={(e) => {
              e.preventDefault();
              accept.mutate();
            }}
          >
            <TextField label="¿Te dieron un código?" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} autoCapitalize="characters" />
            <div>
              <button type="submit" className="btn btn--secondary" disabled={code.trim().length !== 6 || accept.isPending}>
                Vincular
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function SecuritySection() {
  const { replaceToken } = useSession();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const change = useMutation({
    mutationFn: () => api.auth.changePassword(current, next),
    onSuccess: (r) => {
      replaceToken(r.token);
      setCurrent('');
      setNext('');
      toast('Contraseña cambiada. Cerramos las demás sesiones.');
    },
  });
  const logoutOthers = useMutation({
    mutationFn: api.auth.logoutOthers,
    onSuccess: (r) => {
      replaceToken(r.token);
      toast('Cerramos la sesión en tus otros dispositivos.');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  return (
    <section className="card stack" aria-labelledby="security-title">
      <h2 id="security-title" className="section-title">
        Seguridad
      </h2>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          change.mutate();
        }}
      >
        {change.isError && (
          <div className="alert alert--danger" role="alert">
            {errorMessage(change.error)}
          </div>
        )}
        <div className="grid-2">
          <PasswordField label="Contraseña actual" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          <PasswordField
            label="Nueva contraseña"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            checks={next ? passwordChecks(next) : undefined}
            valid={isStrongPassword(next)}
          />
        </div>
        <div className="row">
          <button type="submit" className="btn btn--secondary" disabled={!current || !isStrongPassword(next) || change.isPending} aria-busy={change.isPending}>
            Cambiar contraseña
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => logoutOthers.mutate()} disabled={logoutOthers.isPending}>
            Cerrar sesión en otros dispositivos
          </button>
        </div>
      </form>
    </section>
  );
}

function DataSection() {
  const { signOut } = useSession();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const exportData = useMutation({
    mutationFn: api.account.export,
    onSuccess: (data) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `design-your-core-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });
  const remove = useMutation({
    mutationFn: () => api.account.remove(password),
    onSuccess: () => {
      setConfirming(false);
      signOut();
    },
  });

  return (
    <section className="card stack" aria-labelledby="data-title">
      <h2 id="data-title" className="section-title">
        Tus datos
      </h2>
      <p className="muted">Tus datos son tuyos. Puedes descargarlos todos en un archivo o borrar tu cuenta.</p>
      <p className="muted">
        <Mail size={16} aria-hidden="true" style={{ verticalAlign: '-3px' }} /> ¿Dudas o sugerencias? Escríbenos a <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
      <div className="row">
        <button type="button" className="btn btn--secondary" onClick={() => exportData.mutate()} disabled={exportData.isPending} aria-busy={exportData.isPending}>
          <Download size={18} aria-hidden="true" /> Descargar mis datos
        </button>
        <button type="button" className="btn btn--ghost danger-text" onClick={() => setConfirming(true)}>
          Borrar mi cuenta
        </button>
      </div>
      <Dialog open={confirming} onClose={() => setConfirming(false)} title="Borrar tu cuenta">
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <p>Se borrarán tu perfil, check-ins, hábitos, retos y los datos de todas tus herramientas. No se puede deshacer.</p>
          {remove.isError && (
            <div className="alert alert--danger" role="alert">
              {errorMessage(remove.error)}
            </div>
          )}
          <TextField label="Escribe tu contraseña para confirmar" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn btn--danger" disabled={!password || remove.isPending} aria-busy={remove.isPending}>
              Borrar definitivamente
            </button>
          </div>
        </form>
      </Dialog>
    </section>
  );
}
