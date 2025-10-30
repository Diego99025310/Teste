import React from 'react';
import { Link } from 'react-router-dom';
import { initInfluencerPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function InfluencerDashboard() {
  useLegacyPage({
    pageId: 'influencer',
    initializer: initInfluencerPage,
    title: 'Painel Influenciadora | HidraPink'
  });

  return (
    <div className="container" id="influencerPage">
      <header className="hero">
        <div className="hero__content">
          <p className="hero__eyebrow">Clube Pinklovers</p>
          <h1 className="hero__heading">Seu painel de influenciadora</h1>
          <p className="hero__greeting" id="influencerGreeting">
            Bem-vinda, Pinklover 💗
          </p>
        </div>
      </header>

      <section className="card" aria-labelledby="influencer-info-title">
        <div className="card-headline">
          <h2 id="influencer-info-title">Seus dados</h2>
          <p>Informações essenciais da sua conta.</p>
        </div>
        <div id="influencerDetails" className="info-grid" aria-live="polite"></div>

        <p
          id="influencerContractMessage"
          className="message"
          hidden
          data-auto-hide="true"
          data-hide-on-success="true"
        ></p>
        <div className="card-actions" role="group" aria-label="Ações rápidas do painel">
          <button type="button" id="viewSignedContractButton" className="action-chip action-chip--contract" disabled>
            <span className="action-chip__icon" aria-hidden="true">
              📝
            </span>
            <span className="action-chip__text">
              <span className="action-chip__title">Contrato</span>
              <span className="action-chip__subtitle">Consultar assinatura</span>
            </span>
          </button>

          <nav className="card-actions__nav" aria-label="Navegação do painel">
            <Link className="action-chip action-chip--planner" to="/influencer/plan">
              <span className="action-chip__icon" aria-hidden="true">🗓️</span>
              <span className="action-chip__text">
                <span className="action-chip__title">Roteiros</span>
                <span className="action-chip__subtitle">Organize suas entregas</span>
              </span>
            </Link>
            <Link className="action-chip action-chip--performance" to="/influencer/performance">
              <span className="action-chip__icon" aria-hidden="true">📈</span>
              <span className="action-chip__text">
                <span className="action-chip__title">Desempenho</span>
                <span className="action-chip__subtitle">Resultados e metas</span>
              </span>
            </Link>
          </nav>

          <button type="button" className="action-chip action-chip--logout button-logout" data-action="logout">
            <span className="action-chip__icon" aria-hidden="true">🚪</span>
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
              –
            </span>
            <span className="highlight-helper" id="planCycleHelper" data-plan-cycle-helper>
              Estamos preparando seus dados.
            </span>
          </article>
          <article className="highlight-card">
            <span className="highlight-label">Multiplicador atual</span>
            <span className="highlight-value" id="planMultiplierValue" data-plan-multiplier>
              –
            </span>
            <span className="highlight-helper" id="planMultiplierLabel" data-plan-multiplier-label>
              Multiplicador do ciclo
            </span>
          </article>
          <article className="highlight-card">
            <span className="highlight-label">Dias planejados</span>
            <span className="highlight-value" id="planPlannedCount" data-plan-planned>
              0
            </span>
            <span className="highlight-helper">Entregas cadastradas</span>
          </article>
          <article className="highlight-card">
            <span className="highlight-label">Dias validados</span>
            <span className="highlight-value" id="planValidatedCount" data-plan-validated>
              0
            </span>
            <span className="highlight-helper">Histórico aprovado</span>
          </article>
        </div>
        <div className="metric-grid" id="influencerSalesSummary" aria-live="polite"></div>
        <p id="influencerSalesMessage" className="message" hidden data-auto-hide="true"></p>
      </section>

      <section className="card" aria-labelledby="schedule-title">
        <div className="card-headline schedule-headline">
          <div>
            <h2 id="schedule-title">Celendário</h2>
            <p>Confira seus agendamento.</p>
          </div>
        </div>
        <div id="planScheduleBoard" className="schedule-board" aria-live="polite"></div>
        <p id="planMessage" className="message" hidden data-auto-hide="true"></p>
        <p className="card-helper">
          Precisa ajustar datas ou roteiros? Abra o
          <Link to="/influencer/plan" className="card-helper__link">
            planejador completo
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
