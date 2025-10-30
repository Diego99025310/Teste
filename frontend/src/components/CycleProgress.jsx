import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import Lottie from 'lottie-react';

import confettiAnimation from '../assets/confetti.json';
import { apiFetch } from '../lib/api.js';

const LEVELS = [
  { threshold: 0, name: 'Bronze', gradient: 'from-pink-400 to-pink-600', multiplier: '1.00x' },
  { threshold: 25, name: 'Prata', gradient: 'from-violet-400 to-pink-500', multiplier: '1.25x' },
  { threshold: 50, name: 'Ouro', gradient: 'from-amber-300 to-pink-500', multiplier: '1.50x' },
  { threshold: 75, name: 'Diamante', gradient: 'from-cyan-300 to-pink-500', multiplier: '2.00x' }
];

const MONTH_LABELS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const ensurePositiveNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const ensureNonNegativeNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const formatCycleLabel = (cycle) => {
  if (!cycle) {
    return 'Ciclo em andamento';
  }

  const month = Number(cycle?.month ?? cycle?.cycle_month);
  const year = Number(cycle?.year ?? cycle?.cycle_year);

  if (!Number.isFinite(month) || !Number.isFinite(year)) {
    return 'Ciclo em andamento';
  }

  const monthLabel = MONTH_LABELS[Math.max(0, Math.min(11, month - 1))];
  if (!monthLabel) {
    return `${year}`;
  }

  return `${monthLabel}/${year}`;
};

const determineLevel = (progress) => {
  const capped = Math.max(0, progress);
  return LEVELS.reduce((current, level) => (capped >= level.threshold ? level : current), LEVELS[0]);
};

export default function CycleProgress({
  validatedDays: initialValidatedDays = 0,
  totalTarget: initialTotalTarget = 16,
  cycleId,
  influencerId
}) {
  const [cycleData, setCycleData] = useState({
    validatedDays: ensureNonNegativeNumber(initialValidatedDays),
    totalTarget: ensurePositiveNumber(initialTotalTarget, 16),
    multiplier: null,
    multiplierLabel: null,
    cycle: null
  });
  const [status, setStatus] = useState({ loading: true, error: null });

  useEffect(() => {
    setCycleData((previous) => ({
      ...previous,
      validatedDays: ensureNonNegativeNumber(initialValidatedDays, previous.validatedDays),
      totalTarget: ensurePositiveNumber(initialTotalTarget, previous.totalTarget)
    }));
  }, [initialValidatedDays, initialTotalTarget]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (cycleId != null && cycleId !== '') {
      params.set('cycleId', String(cycleId));
    }
    if (influencerId != null && influencerId !== '') {
      params.set('influencerId', String(influencerId));
    }
    const query = params.toString();
    return query ? `?${query}` : '';
  }, [cycleId, influencerId]);

  useEffect(() => {
    let cancelled = false;

    async function loadCycleProgress() {
      try {
        setStatus((previous) => ({ ...previous, loading: true }));
        const response = await apiFetch(`/dashboard/cycle${queryString}`);
        if (cancelled) return;

        const validatedFromResponse =
          response?.validatedDays ?? response?.validated_days ?? response?.progress?.validatedDays;
        const targetFromResponse =
          response?.totalTarget ??
          response?.total_target ??
          response?.progress?.totalTarget ??
          response?.progress?.target ??
          response?.target;

        setCycleData((previous) => {
          const validatedDays = ensureNonNegativeNumber(validatedFromResponse, previous.validatedDays);
          const totalTarget = ensurePositiveNumber(targetFromResponse, previous.totalTarget);

          return {
            validatedDays,
            totalTarget,
            multiplier: response?.multiplier ?? response?.multiplierValue ?? null,
            multiplierLabel: response?.multiplierLabel ?? response?.multiplier_label ?? null,
            cycle: response?.cycle ?? {
              id: response?.cycle_id,
              month: response?.cycle_month,
              year: response?.cycle_year,
              status: response?.status
            }
          };
        });
        setStatus({ loading: false, error: null });
      } catch (error) {
        if (cancelled) return;
        console.error('Erro ao carregar evolução do ciclo:', error);
        setStatus({ loading: false, error: 'Não foi possível atualizar os dados do ciclo.' });
      }
    }

    loadCycleProgress();

    return () => {
      cancelled = true;
    };
  }, [initialValidatedDays, initialTotalTarget, queryString]);

  const safeTarget = ensurePositiveNumber(cycleData.totalTarget, 1);
  const progress = safeTarget > 0 ? (cycleData.validatedDays / safeTarget) * 100 : 0;
  const cappedProgress = Math.min(progress, 100);
  const remaining = Math.max(0, Math.ceil(safeTarget - cycleData.validatedDays));

  const level = useMemo(() => determineLevel(progress), [progress]);

  const multiplier = useMemo(() => {
    if (cycleData.multiplier) {
      const value = Number(cycleData.multiplier);
      if (Number.isFinite(value) && value > 0) {
        return `${value.toFixed(2)}x`;
      }
      if (typeof cycleData.multiplier === 'string') {
        return cycleData.multiplier;
      }
    }
    return level.multiplier;
  }, [cycleData.multiplier, level.multiplier]);

  const cycleLabel = useMemo(() => formatCycleLabel(cycleData.cycle), [cycleData.cycle]);
  const showConfetti = cappedProgress >= 100;

  return (
    <section className="relative overflow-hidden rounded-3xl bg-white/90 shadow-xl shadow-pink-strong/10">
      <div className="absolute inset-0 bg-gradient-to-br from-white via-pink-soft/40 to-white" aria-hidden="true" />

      {showConfetti && (
        <Lottie
          animationData={confettiAnimation}
          loop={false}
          className="absolute inset-0 w-full h-full scale-110 pointer-events-none"
        />
      )}

      <div className="relative z-10 px-6 py-8 sm:px-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-pink-600">
              <Sparkles className="h-5 w-5 animate-pulse" />
              <span className="text-xs font-semibold uppercase tracking-[0.3em] text-pink-medium/80">
                Jornada do ciclo
              </span>
            </div>
            <h2 className="mt-1 text-2xl font-semibold text-pink-700 sm:text-3xl">Evolução do Ciclo</h2>
            <motion.p
              key={remaining > 0 ? 'remaining' : 'completed'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-3 text-sm text-ink/70"
            >
              {remaining > 0 ? (
                <>
                  Faltam{' '}
                  <span className="text-pink-600 font-semibold">{remaining}</span>{' '}
                  ativações para o próximo nível!
                </>
              ) : (
                <span className="text-pink-600 font-semibold">Nível máximo alcançado! 🎉</span>
              )}
            </motion.p>
            <p className="mt-2 text-xs uppercase tracking-[0.25em] text-pink-medium/60">{cycleLabel}</p>
            {status.loading && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-pink-soft/70 px-4 py-1 text-xs font-semibold text-pink-700 shadow-sm"
              >
                Atualizando progresso...
              </motion.span>
            )}
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex items-center gap-3 rounded-2xl bg-gradient-to-r from-pink-100 to-white px-4 py-3 text-sm font-semibold text-pink-700 shadow-inner"
          >
            <span className="text-xs uppercase tracking-[0.25em] text-pink-500/80">Nível</span>
            <span className="text-base font-semibold text-pink-700">{level.name}</span>
            <span className="hidden h-5 w-px bg-pink-200 sm:block" />
            <span className="text-xs uppercase tracking-[0.25em] text-pink-500/80">Multiplicador</span>
            <span className="text-base font-semibold text-pink-700">{multiplier}</span>
          </motion.div>
        </div>

        <div className="mt-8">
          <div className="relative h-4 w-full overflow-hidden rounded-full bg-pink-100">
            <motion.div
              className={`absolute inset-y-0 left-0 h-full bg-gradient-to-r ${level.gradient}`}
              initial={{ width: 0 }}
              animate={{ width: `${cappedProgress}%` }}
              transition={{ duration: 1.2, ease: 'easeInOut' }}
            />
          </div>
          <div className="mt-3 flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-pink-medium/80 sm:flex-row sm:items-center sm:justify-between">
            <span>{Math.round(cappedProgress)}% de progresso</span>
            <span>
              {ensureNonNegativeNumber(cycleData.validatedDays)} / {Math.round(safeTarget)} ativações validadas
            </span>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-6 grid gap-3 text-sm text-ink/70 sm:grid-cols-3"
        >
          <div className="rounded-2xl border border-pink-100 bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-medium/70">Dias validados</p>
            <p className="mt-2 text-xl font-semibold text-pink-700">{ensureNonNegativeNumber(cycleData.validatedDays)}</p>
          </div>
          <div className="rounded-2xl border border-pink-100 bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-medium/70">Meta do ciclo</p>
            <p className="mt-2 text-xl font-semibold text-pink-700">{Math.round(safeTarget)} ativações</p>
          </div>
          <div className="rounded-2xl border border-pink-100 bg-white/90 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pink-medium/70">Mensagem</p>
            <p className="mt-2 text-sm">
              {cycleData.multiplierLabel || 'Mantenha a constância para desbloquear novos bônus!'}
            </p>
          </div>
        </motion.div>

        {status.error && (
          <p className="mt-4 text-xs text-rose-500">
            {status.error}
          </p>
        )}
      </div>
    </section>
  );
}
