import { CLASS_LEADS, CONTACT_EMAIL, PILLAR_IDS, type NotifyPrefs, isStrongPassword, passwordChecks, type PillarId } from '@dyc/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BellRing, Download, LogOut, Mail } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { api } from '../app/api';
import { useShowCycle } from '../app/prefs';
import { keys, useProfile } from '../app/queries';
import { useSession } from '../app/session';
import { FONT_OPTIONS, loadAllFonts, useFont } from '../app/font';
import { PALETTE_OPTIONS, usePalette } from '../app/palette';
import { STYLE_OPTIONS, useStyle } from '../app/style';
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
      <PageHeader eyebrow="Perfil" title={user?.name || 'Tu perfil'} />
      <div className="stack-lg">
        {user && <p className="muted">{user.email}</p>}
        <FocusSection />
        <PreferencesSection />
        <AlarmsSection />
        <PartnerSection />
        <SecuritySection />
        <DataSection />
        <Link to="/mas" className="card link-card">
          <span>
            <strong>Más herramientas</strong>
            <span className="muted"> · agenda, materias, finanzas, metas, ejercicio, sueño, diario y el resto de la app anterior</span>
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
        Tu enfoque
      </h2>
      <fieldset className="field">
        <legend className="field__label">Pilares en los que te enfocas (hasta 3)</legend>
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
  const [style, setStyle] = useStyle();
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
      <fieldset className="field">
        <legend className="field__label">Estilo visual</legend>
        <div className="style-picker">
          {STYLE_OPTIONS.map((o) => (
            <label key={o.value} className="style-option">
              <input type="radio" name="visual-style" value={o.value} checked={style === o.value} onChange={() => setStyle(o.value)} aria-describedby={`style-hint-${o.value}`} />
              <span className="style-option__preview" data-preview={o.value} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="style-option__label">{o.label}</span>
              <span className="style-option__hint" id={`style-hint-${o.value}`}>
                {o.hint}
              </span>
            </label>
          ))}
        </div>
        <span className="field__hint">Se aplica al momento, en claro y en oscuro, y se recuerda en este navegador.</span>
      </fieldset>
      <FontPicker />
      <PalettePicker />
      <div className="field">
        <label className="field__label" htmlFor="tz">
          Zona horaria
        </label>
        {zones.length ? (
          <select id="tz" className="input" value={tz} onChange={(e) => saveTz.mutate(e.target.value)} disabled={saveTz.isPending}>
            {!zones.includes(tz) && <option value={tz}>{tz}</option>}
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replace(/_/g, ' ')}
              </option>
            ))}
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

function FontPicker() {
  const [font, setFont] = useFont();
  // Cada opción se muestra con su letra: se cargan todas (el navegador solo descarga lo que pinta).
  useEffect(() => {
    void loadAllFonts();
  }, []);
  return (
    <fieldset className="field">
      <legend className="field__label">Tipografía</legend>
      <div className="style-picker">
        {FONT_OPTIONS.map((o) => (
          <label key={o.value} className="style-option" data-font-option={o.value}>
            <input type="radio" name="font" value={o.value} checked={font === o.value} onChange={() => setFont(o.value)} aria-describedby={`font-hint-${o.value}`} />
            <span className="font-option__sample" aria-hidden="true">
              <b>Tu día</b>
              <span>Pasos pequeños, cada día.</span>
            </span>
            <span className="style-option__label">{o.label}</span>
            <span className="style-option__hint" id={`font-hint-${o.value}`}>
              {o.hint}
            </span>
          </label>
        ))}
      </div>
      <span className="field__hint">Letra de los títulos y del texto. Funciona con cualquier estilo y se recuerda en este navegador.</span>
    </fieldset>
  );
}

function PalettePicker() {
  const [palette, setPalette] = usePalette();
  return (
    <fieldset className="field">
      <legend className="field__label">Color</legend>
      <div className="style-picker">
        {PALETTE_OPTIONS.map((o) => (
          <label key={o.value} className="style-option">
            <input type="radio" name="palette" value={o.value} checked={palette === o.value} onChange={() => setPalette(o.value)} aria-describedby={`palette-hint-${o.value}`} />
            <span className="palette-swatch" data-swatch={o.value} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="style-option__label">{o.label}</span>
            <span className="style-option__hint" id={`palette-hint-${o.value}`}>
              {o.hint}
            </span>
          </label>
        ))}
      </div>
      <span className="field__hint">Color de botones, enlaces y selección, con su versión clara y oscura, en cualquier estilo. Se recuerda en este navegador.</span>
    </fieldset>
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
          Muestra Ciclo en el menú y tus días de regla en el Calendario. Es el mismo ajuste que usa la app anterior. Siempre puedes abrirlo desde Más.
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
      <p className="muted small">Suenan a la hora de tus clases y cursos del Horario, los recordatorios del Calendario y las tareas de la Agenda con aviso. En el teléfono se activan en su app, en Perfil.</p>
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
          <div>
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
          <p>Se borrarán tu perfil, check-ins, hábitos, retos y los datos de la app anterior. No se puede deshacer.</p>
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
