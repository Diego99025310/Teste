import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterListPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterList() {
  useLegacyPage({
    pageId: 'master-list',
    initializer: initMasterListPage,
    title: 'Influenciadoras Cadastradas | Sistema Influenciadoras'
  });

  return (
    <div className="container">
      <header>
        <h1>Influenciadoras cadastradas</h1>
        <p>Gerencie os registros já cadastrados.</p>
        <button type="button" data-action="logout">
          Sair
        </button>
      </header>

      <section className="card">
        <div className="link-grid" style={{ marginBottom: '16px' }}>
          <Link className="link-card" to="/master/create">
            Cadastrar
          </Link>
          <Link className="link-card" to="/master/consult">
            Consulta
          </Link>
          <Link className="link-card" to="/master/sales">
            Registrar venda
          </Link>
        </div>
        <div className="flex-row-wrap">
          <div>
            <h2>Lista atual</h2>
            <p className="note">Edite, exclua ou envie as credenciais pelo WhatsApp usando os botoes de acao.</p>
          </div>
          <button type="button" id="reloadInfluencers">
            Recarregar lista
          </button>
        </div>
        <div id="influencersList" className="influencers-list"></div>
        <div id="listMessage" className="message" aria-live="polite"></div>
      </section>
    </div>
  );
}
