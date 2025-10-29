const ACTIVATION_BANDS = [
  { min: 1, max: 4, factor: 1.0, label: '1 a 4 ativações validadas (100%)' },
  { min: 5, max: 9, factor: 1.25, label: '5 a 9 ativações validadas (125%)' },
  { min: 10, max: 14, factor: 1.5, label: '10 a 14 ativações validadas (150%)' },
  { min: 15, max: 19, factor: 1.75, label: '15 a 19 ativações validadas (175%)' },
  { min: 20, max: Infinity, factor: 2.0, label: '20 ou mais ativações validadas (200%)' }
];

const { roundPoints } = require('./points');

const getMultiplier = (activations) => {
  const count = Number(activations);
  if (!Number.isFinite(count) || count <= 0) {
    return {
      factor: 0,
      label: 'Sem ativações validadas no ciclo',
      band: null,
      activations: 0
    };
  }

  const band = ACTIVATION_BANDS.find((entry) => count >= entry.min && count <= entry.max);
  if (band) {
    return {
      factor: band.factor,
      label: band.label,
      band,
      activations: count
    };
  }

  const lastBand = ACTIVATION_BANDS[ACTIVATION_BANDS.length - 1];
  if (!lastBand) {
    return {
      factor: 0,
      label: 'Sem configuração de multiplicador',
      band: null,
      activations: count
    };
  }

  return {
    factor: lastBand.factor,
    label: lastBand.label,
    band: lastBand,
    activations: count
  };
};

const calculateCommissionMultiplier = (activations) => {
  const multiplierData = getMultiplier(activations);
  return {
    multiplier: multiplierData.factor,
    factor: multiplierData.factor,
    band: multiplierData.band,
    label: multiplierData.label,
    activations: multiplierData.activations,
    validatedDays: multiplierData.activations
  };
};

const summarizePoints = (basePoints, activations) => {
  const base = Number(basePoints) > 0 ? roundPoints(basePoints) : 0;
  const multiplierData = calculateCommissionMultiplier(activations);
  const total = roundPoints(base * multiplierData.factor);
  return {
    basePoints: base,
    multiplier: multiplierData.multiplier,
    factor: multiplierData.factor,
    label: multiplierData.label,
    activations: multiplierData.activations,
    validatedDays: multiplierData.validatedDays,
    totalPoints: total
  };
};

module.exports = {
  ACTIVATION_BANDS,
  getMultiplier,
  calculateCommissionMultiplier,
  summarizePoints
};
