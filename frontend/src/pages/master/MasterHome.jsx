import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterHomePage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterHome() {
  useLegacyPage({ pageId: 'master-home', initializer: initMasterHomePage, title: 'Painel Master | Sistema Influenciadoras' });

  return (
    <div className="container">
      <header>
        <h1>Painel do Master</h1>
        <p>Escolha a funcao desejada para gerenciar o sistema.</p>
        <button type="button" data-action="logout">
          Sair
        </button>
      </header>

      <section className="card">
        <h2>Acessos rapidos</h2>
        <div className="link-grid">
          <Link className="link-card" to="/master/create">
            Cadastrar influenciadora
          </Link>
          <Link className="link-card" to="/master/consult">
            Consulta de influenciadoras
          </Link>
          <Link className="link-card" to="/master/list">
            Influenciadoras cadastradas
          </Link>
          <Link className="link-card" to="/master/sku-points">
            Pontos por SKU
          </Link>
          <Link className="link-card" to="/master/sales">
            Registrar venda
          </Link>
          <Link className="link-card" to="/master/scripts">
            Gerenciar roteiros
          </Link>
          <Link className="link-card" to="/pinklovers/master">
            Painel Pinklovers
          </Link>
        </div>
      </section>
    </div>
  );
}
