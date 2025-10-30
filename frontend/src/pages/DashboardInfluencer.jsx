import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getInfluencerDashboard, getStoredRole, getToken, logout as logoutSession } from '../services/api.js';

const influencerStyles = `
:root {
  font-family: 'Outfit', sans-serif;
  --color-primary: #e4447a;
  --color-secondary: #f07999;
  --color-soft: #ffe5ef;
  --color-soft-strong: #ffc4da;
  --color-text: #2f2530;
  --color-muted: rgba(47, 37, 48, 0.7);
  --color-surface: #fff;
  --color-border: rgba(228, 68, 122, 0.18);
  --radius-lg: 1.75rem;
  --radius-md: 1.25rem;
  --shadow-soft: 0 1.5rem 3rem rgba(228, 68, 122, 0.18);
  --shadow-card: 0 1rem 2.5rem rgba(228, 68, 122, 0.12);
  --transition: 0.25s ease;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  width: 100%;
  background: linear-gradient(180deg, var(--color-soft) 0%, #ffeef7 35%, #fff 100%);
  color: var(--color-text);
  display: flex;
  justify-content: center;
  align-items: stretch;
  padding: clamp(1.25rem, 5vw, 3rem);
}

body[data-page='influencer'] {
  font-family: inherit;
}

h1,
h2,
h3 {
  margin: 0;
  font-weight: 600;
  line-height: 1.2;
}

p,
small {
  margin: 0;
  line-height: 1.6;
}

a {
  color: inherit;
}

.container {
  width: min(100%, 80rem);
  display: grid;
  gap: clamp(1.5rem, 4vw, 2.5rem);
}

.hero {
  background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  border-radius: var(--radius-lg);
  color: #fff;
  padding: clamp(2.25rem, 6vw, 3.25rem);
  display: grid;
  gap: clamp(1.5rem, 4vw, 2rem);
  box-shadow: var(--shadow-soft);
}

.hero__content {
  display: grid;
  gap: 0.5rem;
}

.hero__eyebrow {
  font-size: clamp(0.85rem, 2.3vw, 1rem);
  letter-spacing: 0.18em;
  text-transform: uppercase;
  opacity: 0.85;
}

.hero__heading {
  font-size: clamp(2.25rem, 5vw, 3.15rem);
  font-weight: 700;
}

.hero__greeting {
  font-size: clamp(1.1rem, 2.8vw, 1.35rem);
  opacity: 0.9;
}

.card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  padding: clamp(1.75rem, 4vw, 2.5rem);
  display: grid;
  gap: clamp(1.25rem, 3vw, 1.75rem);
}

.card-headline {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.card-headline h2 {
  color: var(--color-primary);
  font-size: clamp(1.6rem, 3vw, 2rem);
}

.card-headline p {
  color: var(--color-muted);
  font-size: clamp(0.95rem, 2.1vw, 1.05rem);
}

.info-grid {
  display: grid;
  gap: 1.25rem;
}

.info-grid--contract {
  border-top: 1px solid rgba(228, 68, 122, 0.12);
  padding-top: 1rem;
  margin-top: 0.5rem;
}

.info-item {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: flex-start;
}

.info-item dt {
  font-weight: 600;
  color: var(--color-muted);
  letter-spacing: 0.01em;
}

.info-item dd {
  margin: 0;
  width: 100%;
  color: var(--color-primary);
  font-weight: 600;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.65rem;
  word-break: break-word;
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.detail-link {
  color: inherit;
  text-decoration: none;
  word-break: break-word;
}

.copy-button {
  border: none;
  background: rgba(228, 68, 122, 0.12);
  color: var(--color-primary);
  font-weight: 600;
  border-radius: 999px;
  padding: 0.45rem 1.15rem;
  cursor: pointer;
  transition: background var(--transition), color var(--transition), transform var(--transition);
}

.copy-button:hover,
.copy-button:focus-visible {
  background: var(--color-primary);
  color: #fff;
  transform: translateY(-1px);
  outline: none;
}

.copy-button.copied {
  background: rgba(52, 211, 153, 0.2);
  color: #0f5132;
}

.copy-button.error {
  background: rgba(248, 113, 113, 0.2);
  color: #7f1d1d;
}

.card-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13.75rem, 1fr));
  gap: 1.25rem;
  align-items: stretch;
}

.card-actions nav {
  display: contents;
}

.action-chip {
  --chip-bg: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(255, 242, 248, 0.95));
  --chip-border: linear-gradient(135deg, rgba(228, 68, 122, 0.35), rgba(240, 121, 153, 0.18));
  --chip-icon-bg: linear-gradient(135deg, rgba(228, 68, 122, 0.18), rgba(240, 121, 153, 0.32));
  --chip-icon-color: var(--color-primary);
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 1.05rem 1.35rem;
  border-radius: 1.75rem;
  border: 1px solid transparent;
  background: var(--chip-bg) padding-box, var(--chip-border) border-box;
  box-shadow: 0 1.1rem 2.6rem rgba(228, 68, 122, 0.12);
  color: var(--color-text);
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
  transition: transform var(--transition), box-shadow var(--transition), background var(--transition);
}

.action-chip__icon {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--chip-icon-bg);
  color: var(--chip-icon-color);
  font-size: 1.35rem;
  box-shadow: inset 0 0.25rem 0.85rem rgba(228, 68, 122, 0.16);
  flex-shrink: 0;
}

.action-chip__text {
  display: grid;
  gap: 0.3rem;
}

.action-chip__title {
  font-size: 1rem;
  line-height: 1.2;
  color: inherit;
}

.action-chip__subtitle {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-muted);
}

.action-chip:not([disabled]):hover,
.action-chip:not([disabled]):focus-visible {
  transform: translateY(-3px);
  box-shadow: 0 1.35rem 2.9rem rgba(228, 68, 122, 0.18);
  outline: none;
}

.action-chip:focus-visible {
  outline: 3px solid rgba(228, 68, 122, 0.28);
  outline-offset: 3px;
}

.action-chip[disabled] {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.action-chip[disabled] .action-chip__icon {
  filter: saturate(0.6);
}

.action-chip--contract {
  --chip-border: linear-gradient(135deg, rgba(228, 68, 122, 0.28), rgba(240, 121, 153, 0.12));
}

.action-chip--planner {
  --chip-border: linear-gradient(135deg, rgba(144, 97, 241, 0.32), rgba(144, 97, 241, 0.12));
  --chip-icon-bg: linear-gradient(135deg, rgba(144, 97, 241, 0.2), rgba(144, 97, 241, 0.35));
  --chip-icon-color: #7055f9;
}

.action-chip--performance {
  --chip-border: linear-gradient(135deg, rgba(66, 193, 168, 0.3), rgba(66, 193, 168, 0.12));
  --chip-icon-bg: linear-gradient(135deg, rgba(66, 193, 168, 0.24), rgba(66, 193, 168, 0.38));
  --chip-icon-color: #1d9d83;
}

.action-chip--logout {
  --chip-bg: linear-gradient(145deg, rgba(228, 68, 122, 0.95), rgba(240, 121, 153, 0.92));
  --chip-border: linear-gradient(135deg, rgba(228, 68, 122, 0.95), rgba(240, 121, 153, 0.95));
  color: #fff;
  box-shadow: 0 1.4rem 3rem rgba(228, 68, 122, 0.28);
}

.action-chip--logout .action-chip__subtitle {
  color: rgba(255, 255, 255, 0.72);
}

.action-chip--logout .action-chip__icon {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  box-shadow: none;
}

.action-chip--logout:not([disabled]):hover,
.action-chip--logout:not([disabled]):focus-visible {
  box-shadow: 0 1.6rem 3.4rem rgba(228, 68, 122, 0.32);
}

.message {
  padding: 0.85rem 1.25rem;
  border-radius: 999px;
  background: rgba(255, 245, 248, 0.85);
  border: 1px solid rgba(228, 68, 122, 0.18);
  font-size: 0.95rem;
  color: var(--color-muted);
  text-align: center;
}

.info-status {
  text-align: center;
  padding: 1rem 1.25rem;
  border-radius: var(--radius-md);
  background: rgba(255, 245, 248, 0.7);
  color: var(--color-muted);
  font-weight: 500;
}

.message[data-type='error'] {
  background: rgba(248, 113, 113, 0.15);
  border-color: rgba(248, 113, 113, 0.35);
  color: #7f1d1d;
}

.message[data-type='success'] {
  background: rgba(52, 211, 153, 0.2);
  border-color: rgba(16, 185, 129, 0.35);
  color: #0f5132;
}

.message[data-type='warning'] {
  background: rgba(250, 204, 21, 0.2);
  border-color: rgba(250, 204, 21, 0.35);
  color: #92400e;
}

.highlight-grid {
  display: grid;
  gap: 1.1rem;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
}

.highlight-card {
  border-radius: var(--radius-md);
  padding: 1.35rem 1.5rem;
  background: linear-gradient(160deg, #fff, rgba(255, 218, 235, 0.6));
  border: 1px solid rgba(228, 68, 122, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
  display: grid;
  gap: 0.4rem;
}

.highlight-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-muted);
}

.highlight-value {
  font-size: clamp(1.65rem, 3vw, 2.1rem);
  font-weight: 700;
  color: var(--color-primary);
}

.highlight-helper {
  font-size: 0.95rem;
  color: var(--color-muted);
}

.metric-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
}

.metric-card {
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.92), #fff5f9);
  border: 1px solid rgba(228, 68, 122, 0.2);
  border-radius: 1.1rem;
  padding: 1.5rem;
  box-shadow: 0 1rem 2rem rgba(228, 68, 122, 0.1);
}

.metric-card h4 {
  margin: 0;
  font-size: 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-secondary);
}

.metric-card p {
  margin: 0.35rem 0 0;
  font-size: 1.7rem;
  font-weight: 700;
  color: var(--color-primary);
}

.metric-card .metric-helper {
  display: block;
  margin-top: 0.4rem;
  color: var(--color-muted);
  font-size: 0.9rem;
  font-weight: 500;
}

.schedule-headline {
  gap: 1rem;
}

@media (min-width: 720px) {
  .schedule-headline {
    flex-direction: row;
    justify-content: space-between;
    align-items: center;
  }
}

.schedule-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.schedule-count {
  display: grid;
  gap: 0.25rem;
  padding: 0.65rem 1rem;
  border-radius: 999px;
  background: rgba(228, 68, 122, 0.12);
  color: var(--color-primary);
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.schedule-count strong {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: normal;
}

.schedule-count small {
  font-size: 0.7rem;
  letter-spacing: 0.12em;
}

.schedule-count--validated {
  background: rgba(52, 211, 153, 0.18);
  color: #047857;
}

.schedule-count--pending {
  background: rgba(250, 204, 21, 0.2);
  color: #92400e;
}

.schedule-board {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
}

.schedule-card {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.75rem 1rem;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-radius: var(--radius-md);
  border: 1px solid rgba(228, 68, 122, 0.16);
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.65);
  position: relative;
  overflow: hidden;
}

.schedule-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  pointer-events: none;
  transition: opacity var(--transition);
  opacity: 0;
}

.schedule-card:hover::before,
.schedule-card:focus-within::before {
  opacity: 1;
  background: linear-gradient(135deg, rgba(228, 68, 122, 0.12), rgba(240, 121, 153, 0.08));
}

.schedule-card__icon {
  width: 3rem;
  height: 3rem;
  border-radius: 1rem;
  display: grid;
  place-items: center;
  font-size: 1.65rem;
  background: rgba(228, 68, 122, 0.12);
  color: var(--color-primary);
}

.schedule-card__content {
  display: grid;
  gap: 0.35rem;
}

.schedule-card__title {
  font-size: 1rem;
  font-weight: 600;
}

.schedule-card__subtitle {
  font-size: 0.85rem;
  color: var(--color-muted);
}

.schedule-card__date {
  font-size: 0.8rem;
  color: rgba(47, 37, 48, 0.6);
}

.card-helper {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.card-helper__link {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: underline;
}

@media (max-width: 600px) {
  body {
    padding: 1.25rem;
  }

  .hero,
  .card {
    padding: 1.85rem;
  }
}
`;

const currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numberFormatter = new Intl.NumberFormat('pt-BR');

const formatCurrency = (value) => {
  if (value == null || Number.isNaN(Number(value))) return currencyFormatter.format(0);
  return currencyFormatter.format(Number(value));
};

const formatNumber = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '0';
  return numberFormatter.format(Number(value));
};

const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('pt-BR');
};

const formatCyclePeriod = (cycle) => {
  if (!cycle) return '–';
  if (cycle.start_date && cycle.end_date) {
    return `${formatDate(cycle.start_date)} • ${formatDate(cycle.end_date)}`;
  }
  const month = String(cycle.cycle_month ?? '').padStart(2, '0');
  const year = cycle.cycle_year ?? '';
  if (!month || !year) return 'Ciclo atual';
  return `${month}/${year}`;
};

const resolvePlanIcon = (status) => {
  switch (status) {
    case 'validated':
      return '✅';
    case 'scheduled':
      return '🗓️';
    case 'pending':
      return '⏳';
    default:
      return '📌';
  }
};

function DashboardInfluencer() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [scheduleMessage, setScheduleMessage] = useState('');
  const [scheduleMessageType, setScheduleMessageType] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    const role = getStoredRole();
    if (role === 'master') {
      navigate('/dashboard/master', { replace: true });
      return;
    }

    const loadDashboard = async () => {
      setIsLoading(true);
      setMessage('');
      setScheduleMessage('');
      try {
        const data = await getInfluencerDashboard();
        setDashboard(data);
        if (data?.alerts?.length) {
          setMessage('Você possui entregas pendentes ou atrasadas. Revise seu calendário.');
          setMessageType('warning');
        } else {
          setMessage('Tudo certo! Nenhuma entrega pendente.');
          setMessageType('success');
        }
        if (data?.progress?.pendingValidations) {
          setScheduleMessage(
            `${data.progress.pendingValidations} entrega(s) aguardando validação do master.`,
          );
          setScheduleMessageType('warning');
        } else {
          setScheduleMessage('Nenhuma entrega pendente para validação.');
          setScheduleMessageType('success');
        }
      } catch (error) {
        setMessage(error.message || 'Não foi possível carregar o painel da influenciadora.');
        setMessageType('error');
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboard();
  }, [navigate]);

  const influencerDetails = useMemo(() => {
    if (!dashboard?.influencer) {
      return [];
    }
    const { influencer } = dashboard;
    return [
      { label: 'Nome', value: influencer.nome },
      { label: 'Instagram', value: influencer.instagram ? `@${influencer.instagram.replace(/^@/, '')}` : '—' },
      { label: 'Comissão', value: influencer.commission_rate != null ? `${Number(influencer.commission_rate).toFixed(2)}%` : '—' },
      { label: 'Total em vendas', value: influencer.vendas_valor != null ? formatCurrency(influencer.vendas_valor) : formatCurrency(0) },
    ];
  }, [dashboard]);

  const metrics = useMemo(() => {
    if (!dashboard) return [];
    const pending = dashboard.progress?.pendingValidations ?? 0;
    const nextPlan = dashboard.nextPlan;
    return [
      {
        title: 'Comissão estimada',
        value: dashboard.commission ? formatCurrency(dashboard.commission.totalValue) : formatCurrency(0),
        helper: dashboard.commission?.label || 'Aguardando validações',
      },
      {
        title: 'Pontos acumulados',
        value: dashboard.commission ? formatNumber(dashboard.commission.totalPoints) : '0',
        helper: `Base: ${dashboard.commission ? formatNumber(dashboard.commission.basePoints) : '0'} pontos`,
      },
      {
        title: 'Validações pendentes',
        value: formatNumber(pending),
        helper: pending > 0 ? 'Aguarde a aprovação do master' : 'Nenhuma pendência',
      },
      {
        title: 'Próxima entrega',
        value: nextPlan ? formatDate(nextPlan.scheduled_date) : '—',
        helper: nextPlan ? `Status: ${nextPlan.status}` : 'Sem entregas futuras',
      },
    ];
  }, [dashboard]);

  const schedulePlans = useMemo(() => {
    if (!dashboard?.plans) return [];
    return dashboard.plans.map((plan) => ({
      id: plan.id,
      date: plan.scheduled_date,
      status: plan.status,
      description: plan.notes || plan.description || 'Entrega planejada',
    }));
  }, [dashboard]);

  const handleLogout = () => {
    logoutSession();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <style>{influencerStyles}</style>
      <div className="container" id="influencerPage" data-page="influencer">
        <header className="hero">
          <div className="hero__content">
            <p className="hero__eyebrow">Clube Pinklovers</p>
            <h1 className="hero__heading">Seu painel de influenciadora</h1>
            <p className="hero__greeting" id="influencerGreeting">
              {dashboard?.influencer?.nome
                ? `Bem-vinda, ${dashboard.influencer.nome} 💗`
                : 'Bem-vinda, Pinklover 💗'}
            </p>
          </div>
        </header>

        <section className="card" aria-labelledby="influencer-info-title">
          <div className="card-headline">
            <h2 id="influencer-info-title">Seus dados</h2>
            <p>Informações essenciais da sua conta.</p>
          </div>
          <div id="influencerDetails" className="info-grid" aria-live="polite">
            {influencerDetails.length === 0 && (
              <p className="info-status">{isLoading ? 'Carregando dados...' : 'Nenhuma informação disponível.'}</p>
            )}
            {influencerDetails.map((detail) => (
              <dl className="info-item" key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
              </dl>
            ))}
          </div>

          <p
            id="influencerContractMessage"
            className="message"
            hidden={!message}
            data-auto-hide="true"
            data-hide-on-success="true"
            data-type={messageType || undefined}
          >
            {message || (isLoading ? 'Carregando painel...' : '')}
          </p>
          <div className="card-actions" role="group" aria-label="Ações rápidas do painel">
            <button
              type="button"
              id="viewSignedContractButton"
              className="action-chip action-chip--contract"
              disabled
            >
              <span className="action-chip__icon" aria-hidden="true">
                📝
              </span>
              <span className="action-chip__text">
                <span className="action-chip__title">Contrato</span>
                <span className="action-chip__subtitle">Consultar assinatura</span>
              </span>
            </button>

            <nav className="card-actions__nav" aria-label="Navegação do painel">
              <a className="action-chip action-chip--planner" href="influencer-plan.html">
                <span className="action-chip__icon" aria-hidden="true">
                  🗓️
                </span>
                <span className="action-chip__text">
                  <span className="action-chip__title">Roteiros</span>
                  <span className="action-chip__subtitle">Organize suas entregas</span>
                </span>
              </a>
              <a className="action-chip action-chip--performance" href="influencer-performance.html">
                <span className="action-chip__icon" aria-hidden="true">
                  📈
                </span>
                <span className="action-chip__text">
                  <span className="action-chip__title">Desempenho</span>
                  <span className="action-chip__subtitle">Resultados e metas</span>
                </span>
              </a>
            </nav>

            <button
              type="button"
              className="action-chip action-chip--logout button-logout"
              data-action="logout"
              onClick={handleLogout}
            >
              <span className="action-chip__icon" aria-hidden="true">
                🚪
              </span>
              <span className="action-chip__text">
                <span className="action-chip__title">Sair</span>
                <span className="action-chip__subtitle">Encerrar sessão</span>
              </span>
            </button>
          </div>
        </section>

        <section className="card" aria-labelledby="cycle-summary-title">
          <div className="card-headline">
            <h2 id="cycle-summary-title">Resumo do ciclo</h2>
            <p>Veja como está seu desempenho geral neste mês.</p>
          </div>
          <div className="highlight-grid">
            <article className="highlight-card">
              <span className="highlight-label">Período do ciclo</span>
              <span className="highlight-value" id="planCyclePeriod" data-plan-cycle>
                {dashboard?.cycle ? formatCyclePeriod(dashboard.cycle) : '–'}
              </span>
              <span className="highlight-helper" id="planCycleHelper" data-plan-cycle-helper>
                {dashboard?.cycle?.status || 'Estamos preparando seus dados.'}
              </span>
            </article>
            <article className="highlight-card">
              <span className="highlight-label">Multiplicador atual</span>
              <span className="highlight-value" id="planMultiplierValue" data-plan-multiplier>
                {dashboard?.commission ? dashboard.commission.multiplier : '–'}
              </span>
              <span className="highlight-helper" id="planMultiplierLabel" data-plan-multiplier-label>
                {dashboard?.progress?.multiplierLabel || 'Multiplicador do ciclo'}
              </span>
            </article>
            <article className="highlight-card">
              <span className="highlight-label">Dias planejados</span>
              <span className="highlight-value" id="planPlannedCount" data-plan-planned>
                {formatNumber(dashboard?.progress?.plannedDays || 0)}
              </span>
              <span className="highlight-helper">Entregas cadastradas</span>
            </article>
            <article className="highlight-card">
              <span className="highlight-label">Dias validados</span>
              <span className="highlight-value" id="planValidatedCount" data-plan-validated>
                {formatNumber(dashboard?.progress?.validatedDays || 0)}
              </span>
              <span className="highlight-helper">Histórico aprovado</span>
            </article>
          </div>
          <div className="metric-grid" id="influencerSalesSummary" aria-live="polite">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.title}>
                <h4>{metric.title}</h4>
                <p>{metric.value}</p>
                <span className="metric-helper">{metric.helper}</span>
              </article>
            ))}
          </div>
          <p
            id="influencerSalesMessage"
            className="message"
            hidden={!scheduleMessage}
            data-auto-hide="true"
            data-type={scheduleMessageType || undefined}
          >
            {scheduleMessage}
          </p>
        </section>

        <section className="card" aria-labelledby="schedule-title">
          <div className="card-headline schedule-headline">
            <div>
              <h2 id="schedule-title">Celendário</h2>
              <p>Confira seus agendamento.</p>
            </div>
          </div>
          <div id="planScheduleBoard" className="schedule-board" aria-live="polite">
            {schedulePlans.length === 0 && (
              <p className="info-status">{isLoading ? 'Carregando agenda...' : 'Nenhum agendamento encontrado.'}</p>
            )}
            {schedulePlans.map((plan) => (
              <article className="schedule-card" key={plan.id}>
                <div className="schedule-card__icon" aria-hidden="true">
                  {resolvePlanIcon(plan.status)}
                </div>
                <div className="schedule-card__content">
                  <span className="schedule-card__title">{formatDate(plan.date)}</span>
                  <span className="schedule-card__subtitle">{plan.description}</span>
                  <span className="schedule-card__date">Status: {plan.status}</span>
                </div>
              </article>
            ))}
          </div>
          <p
            id="planMessage"
            className="message"
            hidden={!scheduleMessage}
            data-auto-hide="true"
            data-type={scheduleMessageType || undefined}
          >
            {scheduleMessage}
          </p>
          <p className="card-helper">
            Precisa ajustar datas ou roteiros? Abra o{' '}
            <a href="influencer-plan.html" className="card-helper__link">
              planejador completo
            </a>
            .
          </p>
        </section>
      </div>
    </>
  );
}

export default DashboardInfluencer;
