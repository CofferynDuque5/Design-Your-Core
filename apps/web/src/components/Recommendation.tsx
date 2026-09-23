import type { Recommendation } from '@dyc/api-client';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { api } from '../app/api';
import { useRefresh } from '../app/queries';
import { useToast } from '../app/toast';
import { PillarIcon } from './PillarIcon';
import { errorMessage } from './States';

const ACTION_LABEL = {
  'start-challenge': 'Aceptar reto',
  'switch-challenge': 'Cambiar de nivel',
  'check-in': 'Hacer check-in',
} as const;

export function RecommendationCard({ rec }: { rec: Recommendation }) {
  const refresh = useRefresh();
  const toast = useToast();
  const navigate = useNavigate();

  const act = useMutation({
    mutationFn: async () => {
      const a = rec.action;
      if (!a) return null;
      if (a.type === 'start-challenge') return api.challenges.start(a.challengeKey);
      if (a.type === 'switch-challenge') return api.challenges.start(a.challengeKey, a.userChallengeId);
      return null;
    },
    onSuccess: (c) => {
      if (c) toast(`Reto aceptado: ${c.title}`);
      return refresh('challenges');
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const dismiss = useMutation({
    mutationFn: () => api.recommendations.dismiss(rec.key),
    onSuccess: () => {
      toast('La ocultamos durante una semana.');
      return refresh();
    },
    onError: (e) => toast(errorMessage(e), { tone: 'error' }),
  });

  const onAction = () => (rec.action?.type === 'check-in' ? navigate('/check-in') : act.mutate());

  return (
    <article className="card rec" data-pillar={rec.pillar ?? undefined}>
      <div className="rec__head">
        <span className="rec__icon">{rec.pillar ? <PillarIcon pillar={rec.pillar} /> : <Lightbulb size={20} aria-hidden="true" />}</span>
        <h3 className="rec__title">{rec.title}</h3>
        <button type="button" className="icon-btn" onClick={() => dismiss.mutate()} disabled={dismiss.isPending} aria-label={`Ocultar «${rec.title}»`}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p>{rec.body}</p>
      <p className="rec__reason">
        <span className="eyebrow">Por qué</span> {rec.reason}
      </p>
      {rec.action && (
        <div>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onAction} disabled={act.isPending} aria-busy={act.isPending}>
            {ACTION_LABEL[rec.action.type]}
          </button>
        </div>
      )}
    </article>
  );
}
