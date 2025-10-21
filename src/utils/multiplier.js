const MULTIPLIER_BANDS = [
  { min: 1, max: 4, multiplier: 1.0, label: '1 a 4 stories validados (100%)' },
  { min: 5, max: 10, multiplier: 1.25, label: '5 a 10 stories validados (125%)' },
  { min: 11, max: 15, multiplier: 1.5, label: '11 a 15 stories validados (150%)' },
  { min: 16, max: 20, multiplier: 1.75, label: '16 a 20 stories validados (175%)' },
  { min: 21, max: 30, multiplier: 2.0, label: '21 a 30 stories validados (200%)' }
];

const { roundPoints } = require('./points');

const calculateCommissionMultiplier = (validatedDays) => {
  const days = Number(validatedDays);
  if (!Number.isFinite(days) || days <= 0) {
    return {
      multiplier: 0,
      band: null,
      label: 'Sem stories validados no ciclo',
      validatedDays: 0
    };
  }

  const band = MULTIPLIER_BANDS.find((entry) => days >= entry.min && days <= entry.max);
  if (band) {
    return {
      multiplier: band.multiplier,
      band,
      label: band.label,
      validatedDays: days
    };
  }

  const lastBand = MULTIPLIER_BANDS[MULTIPLIER_BANDS.length - 1];
  if (!lastBand) {
    return {
      multiplier: 0,
      band: null,
      label: 'Sem configuracao de multiplicador',
      validatedDays: days
    };
  }

  const multiplier = days >= lastBand.min ? lastBand.multiplier : 0;
  const label = days >= lastBand.min
    ? `Acima de ${lastBand.max} stories validados (${Math.round(multiplier * 100)}%)`
    : 'Sem configuracao de multiplicador';
  return {
    multiplier,
    band: lastBand,
    label,
    validatedDays: days
  };
};

const summarizePoints = (basePoints, validatedDays) => {
  const base = Number(basePoints) > 0 ? roundPoints(basePoints) : 0;
  const multiplierData = calculateCommissionMultiplier(validatedDays);
  const total = roundPoints(base * multiplierData.multiplier);
  return {
    basePoints: base,
    multiplier: multiplierData.multiplier,
    label: multiplierData.label,
    validatedDays: multiplierData.validatedDays,
    totalPoints: total
  };
};

module.exports = {
  MULTIPLIER_BANDS,
  calculateCommissionMultiplier,
  summarizePoints
};
