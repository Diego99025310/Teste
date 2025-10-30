import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterConsultPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterConsult() {
  useLegacyPage({
    pageId: 'master-consult',
    initializer: initMasterConsultPage,
    title: 'Consulta de Influenciadoras | Sistema Influenciadoras'
  });

  return (
    <div className="container">
      <header>
        <h1>Consulta de influenciadoras</h1>
        <p>Visualize vendas por influenciadora e clique para editar o cadastro.</p>
        <button type="button" data-action="logout">
          Sair
        </button>
      </header>

      <section className="card">
        <div className="link-grid" style={{ marginBottom: '16px' }}>
          <Link className="link-card" to="/master/create">
            Cadastrar
          </Link>
          <Link className="link-card" to="/master/list">
            Lista cadastrada
          </Link>
          <Link className="link-card" to="/master/sales">
            Registrar venda
          </Link>
        </div>
        <div className="flex-row-wrap">
          <div>
            <h2>Resumo</h2>
            <p className="note">Clique em uma linha para abrir o cadastro correspondente.</p>
          </div>
          <button type="button" id="reloadConsultButton">
            Recarregar
          </button>
        </div>
        <div className="table-wrapper">
          <table id="consultTable">
            <thead>
              <tr>
                <th>Conta</th>
                <th>Nome</th>
                <th>Cupom</th>
                <th>Vendas</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div id="consultMessage" className="message" aria-live="polite"></div>
      </section>
    </div>
  );
}
