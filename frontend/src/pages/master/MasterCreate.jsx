import React from 'react';
import { Link } from 'react-router-dom';
import { initMasterCreatePage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterCreate() {
  useLegacyPage({
    pageId: 'master-create',
    initializer: initMasterCreatePage,
    title: 'Cadastrar Influenciadora | Sistema Influenciadoras'
  });

  return (
    <div className="container">
      <header>
        <h1>Cadastrar influenciadora</h1>
        <p>Crie um novo cadastro ou edite um existente.</p>
        <button type="button" data-action="logout">
          Sair
        </button>
      </header>

      <section className="card">
        <div className="link-grid" style={{ marginBottom: '16px' }}>
          <Link className="link-card" to="/master/consult">
            Consulta
          </Link>
          <Link className="link-card" to="/master/list">
            Lista cadastrada
          </Link>
          <Link className="link-card" to="/master/sales">
            Registrar venda
          </Link>
        </div>

        <form id="createInfluencerForm" data-form="create-influencer">
          <span className="section-title">Informacoes basicas</span>
          <div className="form-grid compact">
            <label>
              Nome*
              <input name="nome" type="text" required />
            </label>
            <label>
              Instagram*
              <input name="instagram" type="text" placeholder="@perfil" required />
            </label>
            <label>
              CPF
              <input name="cpf" type="text" placeholder="000.000.000-00" />
            </label>
            <label>
              Email*
              <input name="email" type="email" required />
            </label>
            <label>
              Contato*
              <input name="contato" type="text" placeholder="(00) 00000-0000" required />
            </label>
            <label>
              Cupom
              <input name="cupom" type="text" />
            </label>
            <label>
              Comissao (%)
              <input name="commissionPercent" type="number" min="0" max="100" step="0.01" />
            </label>
          </div>

          <div className="form-checkbox">
            <label className="checkbox-field">
              <input name="contractSignatureWaived" type="checkbox" />
              Dispensar assinatura eletrônica do contrato
            </label>
            <p className="note">
              Ao dispensar, a influenciadora conseguirá acessar o sistema sem assinar o termo.
            </p>
          </div>

          <span className="section-title">Endereco</span>
          <div className="form-grid compact">
            <label>
              CEP
              <input name="cep" type="text" placeholder="00000-000" />
            </label>
            <label>
              Numero
              <input name="numero" type="text" />
            </label>
            <label>
              Complemento
              <input name="complemento" type="text" />
            </label>
            <label>
              Logradouro
              <input name="logradouro" type="text" />
            </label>
            <label>
              Bairro
              <input name="bairro" type="text" />
            </label>
            <label>
              Cidade
              <input name="cidade" type="text" />
            </label>
            <label>
              Estado
              <input name="estado" type="text" maxLength={2} />
            </label>
          </div>

          <div className="credentials-group">
            <span className="section-title">Credenciais de acesso</span>
            <p className="credentials-hint">
              O e-mail e a senha provisória fixa seguem a regra: três primeiras letras do nome + quatro últimos dígitos do telefone.
              Clique abaixo para aplicar novamente se precisar ou use o botão no final do formulário durante uma edição.
            </p>
            <label>
              Email de acesso*
              <input name="loginEmail" type="email" placeholder="login@influencer.com" required readOnly />
            </label>
            <label>
              Senha de acesso*
              <input
                name="loginPassword"
                type="text"
                placeholder="Senha fixa: 3 primeiras letras do nome + 4 últimos dígitos do telefone"
                required
                minLength={6}
                readOnly
              />
            </label>
            <button type="button" className="secondary-button" id="generatePasswordButton">
              Aplicar regra da senha provisória
            </button>
            <label>
              Código do contrato*
              <input name="signatureCode" type="text" placeholder="Gerado automaticamente após o cadastro" readOnly />
            </label>
          </div>

          <section id="generatedCredentials" className="credentials-summary" hidden>
            <span className="section-title">Compartilhe com a influenciadora</span>
            <p className="credentials-summary__description">
              Entregue estes dados de acesso e o código de assinatura para que ela conclua o aceite do termo.
            </p>
            <div className="form-grid compact">
              <label>
                Código de assinatura
                <input id="generatedSignatureCode" type="text" readOnly />
              </label>
              <label>
                Email de acesso
                <input id="generatedLoginEmail" type="text" readOnly />
              </label>
              <label>
                Senha provisória
                <input id="generatedPassword" type="text" readOnly />
              </label>
            </div>
            <div className="credentials-summary__message">
              <label>
                Mensagem padrão para WhatsApp
                <textarea id="whatsappMessagePreview" rows={8} readOnly></textarea>
              </label>
              <p className="note" id="whatsappMessageHint">
                Revise os dados antes de enviar. O link abaixo abre o WhatsApp com a mensagem preenchida.
              </p>
              <div className="button-row credentials-summary__actions">
                <button type="button" className="secondary-button" id="copyWhatsappMessageButton">
                  Copiar mensagem
                </button>
                <button type="button" className="secondary-button" id="openWhatsappButton">
                  Abrir WhatsApp com mensagem
                </button>
              </div>
            </div>
          </section>

          <section id="contractRecordSection" className="contract-summary" hidden>
            <span className="section-title">Contrato assinado</span>
            <p id="contractRecordMessage" className="note"></p>
            <div id="contractRecordDetails" className="contract-summary__details"></div>
            <div className="contract-summary__actions">
              <button type="button" id="viewContractRecordButton" disabled>
                Visualizar contrato assinado
              </button>
              <button type="button" id="downloadContractRecordButton" className="secondary-button" disabled>
                Baixar contrato
              </button>
            </div>
          </section>

          <div className="button-row">
            <button type="submit">Cadastrar</button>
            <button type="button" className="secondary-button" id="regeneratePasswordButton" hidden>
              Aplicar novamente a regra da senha provisória para esta influenciadora
            </button>
            <button type="button" className="secondary-button" id="cancelEditButton">
              Cancelar edicao
            </button>
          </div>
        </form>
        <div id="masterMessage" className="message" aria-live="polite"></div>
      </section>
    </div>
  );
}
