import { ApiError, type Profile } from '@dyc/api-client';
import { ACTIVITY_LEVELS, PILLAR_IDS, starterChallenge, type PillarId, type ProfileInput } from '@dyc/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../app/api';
import { keys, useProfile } from '../app/queries';
import { useSession } from '../app/session';
import { useToast } from '../app/toast';
import { Scale, Segmented, TextArea, TextField } from '../components/Form';
import { Logo } from '../components/Logo';
import { pillarDescription, pillarName } from '../components/Pillar';
import { PillarIcon } from '../components/PillarIcon';
import { errorMessage } from '../components/States';
import { deviceTimeZone, firstName } from '../lib/format';

const STEPS = ['Bienvenida', 'Tus pilares', 'Punto de partida', 'Tu ritmo', 'Primer reto'] as const;
const MAX_FOCUS = 3;

const ACTIVITY_LABELS: Record<(typeof ACTIVITY_LEVELS)[number], string> = {
  sedentaria: 'Poca',
  ligera: 'Ligera',
  moderada: 'Moderada',
  alta: 'Alta',
};

/** Pilar para el primer reto: el de enfoque con el punto de partida más bajo. */
export function suggestedPillar(focus: PillarId[], baseline: Partial<Record<PillarId, number>>): PillarId {
  const pool = focus.length ? focus : [...PILLAR_IDS];
  return [...pool].sort((a, b) => (baseline[a] ?? 3) - (baseline[b] ?? 3))[0];
}

export function Onboarding() {
  const profile = useProfile();
  const { user } = useSession();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [focus, setFocus] = useState<PillarId[]>([]);
  const [baseline, setBaseline] = useState<Partial<Record<PillarId, number>>>({});
  const [energy, setEnergy] = useState<number | null>(null);
  const [activity, setActivity] = useState<(typeof ACTIVITY_LEVELS)[number]>('ligera');
  const [wake, setWake] = useState('07:00');
  const [bed, setBed] = useState('23:00');
  const [intention, setIntention] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  // Retoma lo que la persona ya había respondido.
  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setFocus(p.focusPillars);
    setBaseline(p.baseline);
    if (p.energyLevel) setEnergy(p.energyLevel);
    if (p.activityLevel) setActivity(p.activityLevel);
    if (p.wakeTime) setWake(p.wakeTime);
    if (p.bedTime) setBed(p.bedTime);
    if (p.intention) setIntention(p.intention);
  }, [profile.data]);

  useEffect(() => {
    document.title = `${STEPS[step]} · Design Your Core`;
    heading.current?.focus();
  }, [step]);

  const save = useMutation({
    mutationFn: (input: ProfileInput) => api.profile.update(input),
    onSuccess: (p: Profile) => qc.setQueryData(keys.profile, p),
  });

  const finish = useMutation({
    mutationFn: async (challengeKey: string | null) => {
      // Un 409 aquí es un reintento: el reto ya quedó creado la primera vez.
      if (challengeKey) await api.challenges.start(challengeKey).catch((e) => {
        if (!(e instanceof ApiError && e.status === 409)) throw e;
      });
      return api.profile.update({ completeOnboarding: true });
    },
    onSuccess: (p, challengeKey) => {
      qc.setQueryData(keys.profile, p);
      toast(challengeKey ? 'Listo. Tu primer reto empieza hoy.' : 'Listo. Empecemos por hoy.');
      navigate('/', { replace: true });
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const next = async (input?: ProfileInput) => {
    if (input) {
      try {
        await save.mutateAsync(input);
      } catch (e) {
        toast(errorMessage(e), { tone: 'error' });
        return;
      }
    }
    setStep((s) => s + 1);
  };

  const pillar = suggestedPillar(focus, baseline);
  const options = [...new Set([pillar, ...focus])].map(starterChallenge);
  useEffect(() => {
    if (step === 4 && chosen === null) setChosen(starterChallenge(pillar).key);
  }, [step, pillar, chosen]);

  const toggleFocus = (p: PillarId) =>
    setFocus((f) => (f.includes(p) ? f.filter((x) => x !== p) : f.length >= MAX_FOCUS ? f : [...f, p]));

  const busy = save.isPending || finish.isPending;

  return (
    <div className="onboarding">
      <header className="onboarding__top">
        <Logo />
        {step > 0 && (
          <div className="onboarding__progress">
            <span className="muted numeric">
              Paso {step} de {STEPS.length - 1}
            </span>
            <div className="steps" aria-hidden="true">
              {STEPS.slice(1).map((s, i) => (
                <span key={s} className={i < step ? 'steps__done' : ''} />
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="onboarding__main" id="main">
        {step === 0 && (
          <section className="stack-lg onboarding__welcome">
            <p className="eyebrow">Bienvenida</p>
            <h1 ref={heading} tabIndex={-1} className="display">
              {user?.name ? `Hola, ${firstName(user.name)}.` : 'Hola.'} Diseñemos tu forma de estar bien.
            </h1>
            <p className="lead">
              Design Your Core organiza tu bienestar en seis pilares. Cada día registras cómo estás en menos de un minuto, sumas hábitos pequeños y aceptas retos a tu medida. Con eso te mostramos tu progreso y qué te conviene probar después.
            </p>
            <ul className="pillar-grid" aria-label="Los seis pilares">
              {PILLAR_IDS.map((p) => (
                <li key={p} className="pillar-mini" data-pillar={p}>
                  <PillarIcon pillar={p} />
                  <span>{pillarName(p)}</span>
                </li>
              ))}
            </ul>
            <div>
              <button className="btn" type="button" onClick={() => next({ timezone: deviceTimeZone() })} disabled={busy} aria-busy={busy}>
                Empezar
              </button>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="stack-lg">
            <div className="stack-sm">
              <h1 ref={heading} tabIndex={-1} className="page-title">
                ¿En qué quieres enfocarte ahora?
              </h1>
              <p className="lead">Elige hasta tres pilares. Los demás siguen ahí; esto solo decide por dónde empezamos.</p>
            </div>
            <fieldset className="choice-grid">
              <legend className="visually-hidden">Pilares de enfoque (hasta tres)</legend>
              {PILLAR_IDS.map((p) => {
                const on = focus.includes(p);
                return (
                  <label key={p} className={`choice${on ? ' choice--on' : ''}`} data-pillar={p}>
                    <input type="checkbox" checked={on} onChange={() => toggleFocus(p)} disabled={!on && focus.length >= MAX_FOCUS} />
                    <span className="choice__icon">
                      <PillarIcon pillar={p} size={22} />
                    </span>
                    <span className="choice__text">
                      <strong>{pillarName(p)}</strong>
                      <span className="muted">{pillarDescription(p)}</span>
                    </span>
                    {on && <Check className="choice__check" size={20} aria-hidden="true" />}
                  </label>
                );
              })}
            </fieldset>
            <p className="muted" aria-live="polite">
              {focus.length === MAX_FOCUS ? 'Tienes tres pilares elegidos.' : `Elegidos: ${focus.length} de ${MAX_FOCUS}.`}
            </p>
            <StepNav onBack={() => setStep(0)} onNext={() => next({ focusPillars: focus })} disabled={!focus.length} busy={busy} />
          </section>
        )}

        {step === 2 && (
          <section className="stack-lg">
            <div className="stack-sm">
              <h1 ref={heading} tabIndex={-1} className="page-title">
                ¿Cómo te sientes hoy en cada pilar?
              </h1>
              <p className="lead">Sin pensarlo mucho: 1 es «me cuesta mucho», 5 es «lo tengo resuelto». Puedes saltarte los que no sepas.</p>
            </div>
            <div className="stack">
              {PILLAR_IDS.map((p) => (
                <div key={p} className="card baseline-row" data-pillar={p}>
                  <div className="baseline-row__title">
                    <PillarIcon pillar={p} className="pillar-color" />
                    <strong>{pillarName(p)}</strong>
                  </div>
                  <Scale legend={`Tu punto de partida en ${pillarName(p)}`} value={baseline[p]} onChange={(v) => setBaseline((b) => ({ ...b, [p]: v ?? undefined }))} low="Me cuesta" high="Resuelto" />
                </div>
              ))}
            </div>
            <StepNav
              onBack={() => setStep(1)}
              onNext={() => next({ baseline: Object.fromEntries(Object.entries(baseline).filter(([, v]) => v)) as ProfileInput['baseline'] })}
              busy={busy}
            />
          </section>
        )}

        {step === 3 && (
          <section className="stack-lg">
            <div className="stack-sm">
              <h1 ref={heading} tabIndex={-1} className="page-title">
                Tu ritmo
              </h1>
              <p className="lead">Nos ayuda a proponerte retos que quepan en tu día.</p>
            </div>
            <div className="card stack">
              <Scale legend="¿Cómo suele estar tu energía?" value={energy} onChange={setEnergy} low="Baja" high="Alta" />
              <div className="field">
                <span className="field__label" id="activity-label">
                  ¿Cuánta actividad física haces?
                </span>
                <Segmented label="Actividad física" value={activity} onChange={setActivity} options={ACTIVITY_LEVELS.map((a) => ({ value: a, label: ACTIVITY_LABELS[a] }))} />
              </div>
              <div className="grid-2">
                <TextField label="Sueles despertar a las" type="time" value={wake} onChange={(e) => setWake(e.target.value)} />
                <TextField label="Y dormir a las" type="time" value={bed} onChange={(e) => setBed(e.target.value)} />
              </div>
              <TextArea
                label="Tu intención (opcional)"
                hint="Una frase para recordar por qué empiezas. La verás en tu perfil."
                placeholder="Por ejemplo: quiero terminar el día con energía para mi familia."
                value={intention}
                maxLength={280}
                rows={3}
                onChange={(e) => setIntention(e.target.value)}
              />
            </div>
            <StepNav
              onBack={() => setStep(2)}
              onNext={() =>
                next({
                  activityLevel: activity,
                  intention: intention.trim(),
                  ...(energy ? { energyLevel: energy } : {}),
                  ...(/^\d{2}:\d{2}$/.test(wake) ? { wakeTime: wake } : {}),
                  ...(/^\d{2}:\d{2}$/.test(bed) ? { bedTime: bed } : {}),
                })
              }
              busy={busy}
            />
          </section>
        )}

        {step === 4 && (
          <section className="stack-lg">
            <div className="stack-sm">
              <h1 ref={heading} tabIndex={-1} className="page-title">
                Tu primer reto
              </h1>
              <p className="lead">Pequeño a propósito: lo importante es cumplirlo. Si te queda corto o largo, luego lo ajustas.</p>
            </div>
            <fieldset className="stack">
              <legend className="visually-hidden">Elige tu primer reto</legend>
              {options.map((c) => (
                <label key={c.key} className={`choice${chosen === c.key ? ' choice--on' : ''}`} data-pillar={c.pillar}>
                  <input type="radio" name="first-challenge" checked={chosen === c.key} onChange={() => setChosen(c.key)} />
                  <span className="choice__icon">
                    <PillarIcon pillar={c.pillar} size={22} />
                  </span>
                  <span className="choice__text">
                    <strong>{c.title}</strong>
                    <span className="muted">{c.description}</span>
                    <span className="eyebrow">
                      {pillarName(c.pillar)} · {c.durationDays} días
                    </span>
                  </span>
                  {chosen === c.key && <Check className="choice__check" size={20} aria-hidden="true" />}
                </label>
              ))}
            </fieldset>
            <div className="step-nav">
              <button type="button" className="btn btn--ghost" onClick={() => setStep(3)} disabled={busy}>
                <ArrowLeft size={18} aria-hidden="true" /> Atrás
              </button>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => finish.mutate(null)}
                  disabled={busy}
                >
                  Ahora no
                </button>
                <button type="button" className="btn" onClick={() => finish.mutate(chosen)} disabled={busy || !chosen} aria-busy={finish.isPending}>
                  Empezar este reto
                </button>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function StepNav({ onBack, onNext, disabled, busy }: { onBack: () => void; onNext: () => void; disabled?: boolean; busy: boolean }) {
  return (
    <div className="step-nav">
      <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
        <ArrowLeft size={18} aria-hidden="true" /> Atrás
      </button>
      <button type="button" className="btn" onClick={onNext} disabled={disabled || busy} aria-busy={busy}>
        Continuar
      </button>
    </div>
  );
}
