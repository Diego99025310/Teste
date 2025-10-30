import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterSkuPointsPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterSkuPoints() {
  useLegacyPage({
    pageId: 'master-sku-points',
    initializer: initMasterSkuPointsPage,
    title: 'Pontos por SKU | Sistema Influenciadoras'
  });

  return (
    <div className="container">
      <header>
        <h1>Gerenciar pontos por SKU</h1>
        <p>Cadastre os produtos com a pontuação atribuída a cada unidade.</p>
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
          <Link className="link-card" to="/master/list">
            Lista cadastrada
          </Link>
          <Link className="link-card" to="/master/sales">
            Registrar vendas
          </Link>
        </div>

        <form id="skuPointsForm">
          <div className="form-grid compact">
            <label>
              SKU*
              <input name="sku" type="text" required />
            </label>
            <label>
              Descrição
              <input name="description" type="text" />
            </label>
            <label>
              Pontos por unidade*
              <input name="points" type="number" min="0" step="1" required />
            </label>
            <label className="checkbox-inline">
              <input name="active" type="checkbox" defaultChecked /> Ativo
            </label>
          </div>
          <div className="button-row">
            <button type="submit">Cadastrar SKU</button>
            <button type="button" className="secondary-button" id="cancelSkuEditButton">
              Cancelar edição
            </button>
          </div>
        </form>
        <div id="skuPointsMessage" className="message" aria-live="polite"></div>

        <div className="flex-row-wrap" style={{ marginTop: '16px' }}>
          <div>
            <h2>SKUs cadastrados</h2>
            <p className="note">Edite ou inative os SKUs para ajustar a pontuação das vendas.</p>
          </div>
          <button type="button" id="reloadSkuPointsButton">
            Recarregar lista
          </button>
        </div>

        <div className="table-wrapper">
          <table id="skuPointsTable">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Descrição</th>
                <th>Pontos/un.</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
