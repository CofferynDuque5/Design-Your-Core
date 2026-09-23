import type { CheckIn as CheckInData } from '@dyc/api-client';
import { addDays, todayIn, type CheckInInput, type Day, type PillarId } from '@dyc/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../app/api';
import { keys, useProfile, useRefresh } from '../app/queries';
import { useToast } from '../app/toast';
import { PageHeader } from '../components/AppShell';
import { Scale, TextArea, TextField } from '../components/Form';
import { pillarName } from '../components/Pillar';
import { PillarIcon } from '../components/PillarIcon';
import { ErrorState, errorMessage, Loading } from '../components/States';
import { longDay } from '../lib/format';

type Values = { [K in keyof CheckInInput]-?: CheckInInput[K] | null };

const EMPTY: Values = {
  mood: null,
  energy: null,
  stress: null,
  sleepHours: null,
  sleepQuality: null,
  activeMinutes: null,
  nutrition: null,
  water: null,
  connection: null,
  purpose: null,
  note: null,
  gratitude: null,
};

export function fromCheckIn(c: CheckInData | undefined): Values {
  if (!c) return EMPTY;
  return Object.fromEntries(Object.keys(EMPTY).map((k) => [k, c[k as keyof Values] ?? null])) as Values;
}

/** Lo que se envía: vacíos como null (la API los borra), textos recortados. */
export function toPayload(v: Values) {
  const text = (s: string | null) => (s && s.trim() ? s.trim() : null);
  return { ...v, note: text(v.note), gratitude: text(v.gratitude) };
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !Number.isFinite(n) ? null : n;
};

export function CheckIn() {
  const profile = useProfile();
  const [params, setParams] = useSearchParams();
  const today = todayIn(profile.data?.timezone ?? 'UTC');
  const param = params.get('fecha');
  const date: Day = param && /^\d{4}-\d{2}-\d{2}$/.test(param) && param <= today ? param : today;

  const existing = useQuery({ queryKey: keys.checkIns(date, date), queryFn: () => api.checkIns.list(date, date) });
  const setDate = (d: Day) => setParams(d === today ? {} : { fecha: d }, { replace: true });

  return (
    <div className="page page--narrow">
      <PageHeader eyebrow={date === today ? 'Check-in de hoy' : 'Check-in'} title={longDay(date)}>
        <div className="row">
          <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, -1))} aria-label="Día anterior">
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Día siguiente">
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      </PageHeader>
      {existing.isPending ? (
        <Loading />
      ) : existing.isError ? (
        <ErrorState error={existing.error} retry={() => existing.refetch()} />
      ) : (
        <CheckInForm key={date} date={date} initial={fromCheckIn(existing.data.checkIns[0])} isToday={date === today} />
      )}
    </div>
  );
}

function Section({ pillar, title, children }: { pillar: PillarId; title?: string; children: ReactNode }) {
  return (
    <section className="card stack checkin-section" data-pillar={pillar} aria-labelledby={`sec-${pillar}`}>
      <h2 id={`sec-${pillar}`} className="checkin-section__title">
        <PillarIcon pillar={pillar} className="pillar-color" />
        {title ?? pillarName(pillar)}
      </h2>
      {children}
    </section>
  );
}

function CheckInForm({ date, initial, isToday }: { date: Day; initial: Values; isToday: boolean }) {
  const [v, setV] = useState<Values>(initial);
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();
  const set = <K extends keyof Values>(k: K) => (value: Values[K]) => setV((s) => ({ ...s, [k]: value }));

  const save = useMutation({
    mutationFn: () => api.checkIns.save(date, toPayload(v)),
    onSuccess: async () => {
      await refresh('checkins');
      toast('Check-in guardado.');
      navigate(isToday ? '/' : '/progreso');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form className="stack-lg" onSubmit={submit}>
      <p className="muted">Todo es opcional. Registra lo que te sirva hoy; lo que dejes en blanco no cuenta en tu puntuación.</p>

      <Section pillar="enfoque" title="Ánimo y mente">
        <Scale legend="Ánimo" value={v.mood} onChange={set('mood')} low="Bajo" high="Muy bien" />
        <Scale legend="Estrés" value={v.stress} onChange={set('stress')} low="Tranquila/o" high="Mucho" />
      </Section>

      <Section pillar="movimiento">
        <Scale legend="Energía" value={v.energy} onChange={set('energy')} low="Muy baja" high="Muy alta" />
        <TextField
          label="Minutos de actividad"
          type="number"
          inputMode="numeric"
          min={0}
          max={1440}
          value={v.activeMinutes ?? ''}
          onChange={(e) => set('activeMinutes')(num(e.target.value))}
          hint="Caminar cuenta. La referencia son 30 minutos."
        />
      </Section>

      <Section pillar="descanso">
        <TextField label="Horas de sueño" type="number" inputMode="decimal" step={0.5} min={0} max={24} value={v.sleepHours ?? ''} onChange={(e) => set('sleepHours')(num(e.target.value))} />
        <Scale legend="Calidad del sueño" value={v.sleepQuality} onChange={set('sleepQuality')} low="Mala" high="Reparador" />
      </Section>

      <Section pillar="alimentacion">
        <Scale legend="¿Cómo comiste?" value={v.nutrition} onChange={set('nutrition')} low="Desordenado" high="Muy bien" />
        <TextField label="Vasos de agua" type="number" inputMode="numeric" min={0} max={40} value={v.water ?? ''} onChange={(e) => set('water')(num(e.target.value))} hint="Referencia: 8 vasos." />
      </Section>

      <Section pillar="relaciones">
        <Scale legend="Conexión con otras personas" value={v.connection} onChange={set('connection')} low="Aislada/o" high="Muy conectada/o" />
      </Section>

      <Section pillar="proposito" title="Propósito y reflexión">
        <Scale legend="Sentido de lo que hiciste hoy" value={v.purpose} onChange={set('purpose')} low="Poco" high="Mucho" />
        <TextArea label="Algo que agradeces" rows={2} maxLength={1000} value={v.gratitude ?? ''} onChange={(e) => set('gratitude')(e.target.value)} />
        <TextArea label="Reflexión del día" rows={4} maxLength={4000} value={v.note ?? ''} onChange={(e) => set('note')(e.target.value)} hint="Solo tú la ves." />
      </Section>

      <div className="form-actions">
        <Link to="/" className="btn btn--ghost">
          Cancelar
        </Link>
        <button type="submit" className="btn" disabled={save.isPending} aria-busy={save.isPending}>
          Guardar check-in
        </button>
      </div>
    </form>
  );
}
