import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterSalesPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterSales() {
  useLegacyPage({
    pageId: 'master-sales',
    initializer: initMasterSalesPage,
    title: 'Registrar venda | Sistema Influenciadoras'
  });

  return (
    <div className="container">
      <header>
        <h1>Registrar venda</h1>
        <p>Associe as vendas aos cupons das influenciadoras.</p>
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
          <Link className="link-card" to="/master/sku-points">
            Pontos por SKU
          </Link>
        </div>
        <form id="createSaleForm">
          <div className="form-grid compact">
            <label>
              Pedido*
              <input name="orderNumber" type="text" required />
            </label>
            <label>
              Cupom*
              <select name="saleCoupon" id="saleCouponSelect" required>
                <option value="">Selecione um cupom</option>
              </select>
            </label>
            <label>
              Data*
              <input name="saleDate" type="date" required />
            </label>
            <label>
              Pontos calculados
              <input name="points" type="number" min="0" step="1" readOnly />
            </label>
            <label>
              Valor estimado (R$)
              <input name="pointsValue" type="number" min="0" step="0.01" readOnly />
            </label>
          </div>
          <div className="card" style={{ marginTop: '16px' }}>
            <h2>Itens da venda</h2>
            <p className="note">Selecione o SKU e informe a quantidade vendida para calcular os pontos.</p>
            <div className="table-wrapper" style={{ marginTop: '12px' }}>
              <table id="saleItemsTable">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Descrição</th>
                    <th>Qtd.</th>
                    <th>Pontos/un.</th>
                    <th>Pontos</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody></tbody>
              </table>
            </div>
            <div className="button-row" style={{ marginTop: '12px' }}>
              <button type="button" id="addSaleItemButton">
                Adicionar item
              </button>
            </div>
          </div>
          <div className="button-row" style={{ marginTop: '16px' }}>
            <button type="submit">Registrar venda</button>
            <button type="button" className="secondary-button" id="cancelSaleEditButton">
              Cancelar edicao
            </button>
          </div>
        </form>
        <div id="salesMessage" className="message" aria-live="polite"></div>
        <div className="flex-row-wrap" style={{ marginTop: '16px' }}>
          <div>
            <h2>Vendas cadastradas</h2>
            <p className="note">Use os botoes para editar ou excluir.</p>
          </div>
          <button type="button" id="reloadSalesButton">
            Recarregar vendas
          </button>
        </div>
        <div className="table-wrapper">
          <table id="salesTable">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Cupom</th>
                <th>Data</th>
                <th>Pontos</th>
                <th>Valor (R$)</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div id="salesSummary" className="summary"></div>
      </section>

      <section className="card" id="bulkSalesSection">
        <h2>Importar vendas em massa</h2>
        <p className="note">
          Importe o arquivo CSV exportado do Shopify ou cole os dados seguindo as colunas: Pedido, Cupom, Data e Pontos. Em seguida, analise os resultados e confirme o salvamento quando estiver tudo certo.
        </p>
        <label>
          Arquivo CSV
          <input id="salesImportFile" type="file" accept=".csv,text/csv" />
        </label>
        <label className="stacked">
          Dados das vendas
          <textarea id="salesImportInput" rows={8} placeholder="Pedido&#9;Cupom&#9;Data&#9;Pontos"></textarea>
        </label>
        <div className="button-row">
          <button type="button" id="analyzeSalesImportButton">
            Analisar dados
          </button>
          <button type="button" className="secondary-button" id="clearSalesImportButton">
            Limpar
          </button>
        </div>
        <div id="salesImportMessage" className="message" aria-live="polite"></div>
        <div className="table-wrapper">
          <table id="salesImportTable">
            <thead>
              <tr>
                <th>Status</th>
                <th>Pedido</th>
                <th>Cupom</th>
                <th>Data</th>
                <th>Pontos</th>
                <th>Valor (R$)</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>
        <div id="salesImportSummary" className="summary"></div>
        <div className="button-row">
          <button type="button" id="confirmSalesImportButton" disabled>
            Salvar pedidos importados
          </button>
        </div>
      </section>
    </div>
  );
}
