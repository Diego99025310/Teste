import React from 'react';
import { initMasterScriptsPage } from '../../legacy/main.js';
import { useLegacyPage } from '../../hooks/useLegacyPage.js';

export default function MasterScripts() {
  useLegacyPage({
    pageId: 'master-scripts',
    initializer: initMasterScriptsPage,
    title: 'Roteiros | Painel Master HidraPink'
  });

  return (
    <div className="container">
      <header>
        <div>
          <h1>Roteiros de Conteúdo</h1>
          <p>Cadastre orientações para inspirar as influenciadoras da HidraPink.</p>
        </div>
        <button type="button" data-action="logout">
          Sair
        </button>
      </header>

      <section className="card">
        <h2>Cadastrar novo roteiro</h2>
        <p className="note">
          Estruture o roteiro informando duração estimada, contexto, tarefa principal, pontos importantes, forma de finalização e observações adicionais para apoiar a influenciadora.
        </p>
        <form id="scriptForm">
          <label>
            <span className="section-title">Título</span>
            <input type="text" name="title" placeholder="Ex.: Rotina pós-treino" required maxLength={180} />
          </label>

          <label>
            <span className="section-title">Duração</span>
            <input
              type="text"
              name="duration"
              maxLength={120}
              placeholder="Ex.: 60 segundos | 3 stories"
              required
            />
          </label>

          <label>
            <span className="section-title">Contexto</span>
            <textarea
              name="context"
              rows={4}
              placeholder="Explique o cenário, objetivo da comunicação e por que o conteúdo é relevante."
              required
              maxLength={6000}
            ></textarea>
          </label>

          <label>
            <span className="section-title">Tarefa</span>
            <textarea
              name="task"
              rows={4}
              placeholder="Detalhe o passo a passo principal que a influenciadora deve seguir."
              required
              maxLength={6000}
            ></textarea>
          </label>

          <label>
            <span className="section-title">Pontos importantes</span>
            <textarea
              name="importantPoints"
              rows={4}
              placeholder="Liste tópicos essenciais, diferenciais do produto ou alertas de linguagem."
              required
              maxLength={6000}
            ></textarea>
          </label>

          <label>
            <span className="section-title">Finalização</span>
            <textarea
              name="closing"
              rows={3}
              placeholder="Oriente como encerrar o conteúdo, chamada para ação ou reforço de marca."
              required
              maxLength={4000}
            ></textarea>
          </label>

          <label>
            <span className="section-title">Notas adicionais (opcional)</span>
            <textarea
              name="additionalNotes"
              rows={3}
              placeholder="Compartilhe observações extras, avisos de produto ou referências."
              maxLength={6000}
            ></textarea>
          </label>

          <div className="form-actions">
            <button type="submit">Salvar roteiro</button>
            <button type="button" id="cancelScriptEditButton" className="secondary" hidden>
              Cancelar edição
            </button>
          </div>
        </form>
        <div id="scriptFormMessage" className="message" aria-live="polite" hidden></div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2>Roteiros cadastrados</h2>
          <button type="button" id="newScriptShortcutButton" className="secondary">
            Novo roteiro
          </button>
        </div>
        <div id="scriptListMessage" className="message" aria-live="polite" hidden></div>
        <div id="scriptList" className="script-management-list" aria-live="polite"></div>
      </section>
    </div>
  );
}
