# Sistema HidraPink

Manual técnico-operacional da plataforma utilizada para gerir influenciadoras, ciclos mensais de conteúdo, importação de vendas e cálculo de comissões. Este README centraliza arquitetura, configuração e os fluxos práticos para usuários master e influenciadoras.

## Sumário

1. [Visão geral da arquitetura](#visão-geral-da-arquitetura)
2. [Estrutura de diretórios](#estrutura-de-diretórios)
3. [Configuração, dependências e execução](#configuração-dependências-e-execução)
4. [Base de dados e modelos](#base-de-dados-e-modelos)
5. [Papéis e rotinas de uso](#papéis-e-rotinas-de-uso)
   - [Master (admin)](#master-admin)
   - [Influenciadora](#influenciadora)
6. [Agendamento de roteiros e ciclo editorial](#agendamento-de-roteiros-e-ciclo-editorial)
7. [Importação de vendas e integração com Shopify](#importação-de-vendas-e-integração-com-shopify)
8. [Ferramentas complementares e automações](#ferramentas-complementares-e-automações)
9. [Testes automatizados e garantia de qualidade](#testes-automatizados-e-garantia-de-qualidade)
10. [Documentação complementar](#documentação-complementar)

---

## Visão geral da arquitetura

- **Backend**: servidor Express 5 (`src/server.js`) com rotas REST protegidas por JWT, manipulação de ciclo mensal, agendamento de roteiros, importação de vendas e cálculo de comissões.【F:src/server.js†L1-L3156】
- **Banco de dados**: SQLite via `better-sqlite3`, com migrações idempotentes, índices de unicidade e checkpoints WAL, inicializado em `src/database.js`. O banco padrão é `database.sqlite` e pode ser realocado via `DATABASE_PATH`.【F:src/database.js†L1-L399】
- **Front-end**: páginas estáticas em `public/` consumindo a API por `fetch` (gerenciado por `public/main.js`), com telas independentes para masters e influenciadoras (login, planner, dashboards e aceite contratual).【F:public/main.js†L1-L200】
- **Middlewares e rotas auxiliares**: autenticação JWT, autorização master (`authorizeMaster`), verificação de aceite (`verificarAceite`) e fluxo dedicado de assinatura em `src/routes/aceite.js`.【F:src/middlewares/verificarAceite.js†L1-L67】【F:src/routes/aceite.js†L1-L766】

O servidor é responsável por manter a consistência entre cadastros de influenciadoras, planejamentos de conteúdo, submissões de stories, validações de master e fechamento mensal com multiplicadores de comissão.【F:src/server.js†L604-L3091】

## Estrutura de diretórios

```text
├── src/
│   ├── server.js          # API Express e regras de negócio
│   ├── database.js        # Inicialização SQLite, migrações, índices
│   ├── config/env.js      # Carregamento de variáveis de ambiente (.env)
│   ├── middlewares/       # Autenticação, autorização e aceite de termos
│   ├── routes/            # Rotas auxiliares (ex.: aceite)
│   └── utils/             # Hash, pontuação, multiplicadores e formatações
├── public/                # Interfaces HTML/CSS/JS (dashboards, planner, aceite)
├── docs/                  # Guias operacionais e especificações
├── scripts/               # Scripts CLI (ex.: filtro de pedidos Shopify)
├── tests/                 # Testes automatizados (`node --test`)
├── data/                  # Artefatos de apoio (ex.: lista de cupons válidos)
├── package.json           # Scripts npm e dependências
└── README.md              # Este manual
```

## Configuração, dependências e execução

1. **Pré-requisitos**
   - Node.js 18 ou superior.
   - Python 3.x (opcional, para executar scripts auxiliares).
2. **Instalação**
   ```bash
   npm install
   ```
3. **Variáveis de ambiente** (carregadas por `src/config/env.js`)
   - `DATABASE_PATH`: caminho para o arquivo SQLite (padrão `database.sqlite`).
   - `MASTER_EMAIL` / `MASTER_PASSWORD`: credenciais do usuário master inicial.【F:src/server.js†L604-L632】
   - `JWT_SECRET` / `JWT_EXPIRATION`: assinatura e expiração do token.
4. **Execução**
   ```bash
   npm start   # sobe o servidor Express em modo desenvolvimento
   ```
5. **Testes**
   ```bash
   npm test    # roda node --test com banco isolado
   ```

Ao iniciar, o backend cria/migra o banco, garante o usuário master e publica os assets estáticos em `public/`, com fallback para `index.html` e rota dedicada para o termo de aceite (`/aceite-termos`).【F:src/server.js†L13-L40】【F:src/server.js†L3144-L3156】

## Base de dados e modelos

`src/database.js` habilita WAL, foreign keys e checkpoints automáticos, além de aplicar migrações incrementais. Entidades principais:

- **users**: credenciais master/influenciadora, flags de senha obrigatória e normalização de telefone.【F:src/database.js†L124-L208】
- **influenciadoras**: dados pessoais, cupom, comissionamento, vínculo com usuário, hash/código de assinatura e controles de aceite/dispensa.【F:src/database.js†L212-L399】
- **content_scripts**: roteiros reutilizáveis para planejamento editorial.【F:src/server.js†L2926-L2959】
- **influencer_plans**: agenda do ciclo vigente com data, roteiro selecionado e status de validação.【F:src/server.js†L2552-L2698】
- **story_submissions**: evidências de stories (links, validação automática/manual, histórico de ajustes).【F:src/server.js†L2700-L2854】
- **monthly_cycles / monthly_commissions**: abertura, acompanhamento e fechamento de ciclos com multiplicadores calculados em `utils/multiplier.js`.【F:src/server.js†L2860-L3091】【F:src/utils/multiplier.js†L1-L71】
- **sales / sale_sku_points / sku_points**: importação de pedidos, associação de SKUs a pontos e consolidação de comissões por cupom.【F:src/server.js†L2962-L3091】【F:src/server.js†L2413-L2550】
- **aceite_termos**: registro de aceite contratual com hash SHA-256 do HTML assinado e metadados de autenticação.【F:src/routes/aceite.js†L9-L200】【F:src/utils/hash.js†L1-L19】

Validações de CPF (`normalizeDigits`, cálculo de dígitos verificadores) e unicidade de email/telefone/cupom/Instagram são executadas antes de persistir dados, bloqueando duplicidades na camada de aplicação e no banco.【F:src/server.js†L835-L1463】

## Papéis e rotinas de uso

### Master (admin)

Responsável por configurar o ecossistema, acompanhar resultados e validar entregas.

1. **Acesso inicial**
   - Realizar login via `/login` com as credenciais master definidas no `.env`. O token JWT será armazenado pelo front-end e reaproveitado nas demais rotas.【F:src/server.js†L766-L833】【F:public/main.js†L1-L200】
2. **Onboarding de influenciadoras**
   - Cadastro individual: `POST /influenciadora` com dados completos (CPF validado, contatos, cupom, endereço). A resposta retorna senha provisória e eventual código de assinatura para repasse seguro.【F:src/server.js†L835-L1206】
   - Importação em massa: carregar CSV na tela master correspondente, que usa `/influenciadoras/import/preview` para validar e `/confirm` para gravar dados, gerando credenciais automaticamente.【F:src/server.js†L2413-L2550】
3. **Gestão contratual**
   - Monitorar aceite de termos via `/api/aceite/*`, conceder dispensas quando necessário e reenviar códigos de assinatura para influenciadoras pendentes.【F:src/routes/aceite.js†L535-L766】
4. **Curadoria de roteiros**
   - Criar e revisar roteiros em `/master/scripts`, persistindo-os em `content_scripts`. Cada roteiro pode ser marcado como ativo/inativo, descrito em HTML sanitizado e fica disponível no planner das influenciadoras.【F:src/server.js†L2926-L2959】
5. **Validação de stories e fechamento**
   - Acompanhar `story_submissions` no painel master: aprovar, solicitar ajustes ou rejeitar, atualizando automaticamente o status no planejamento.【F:src/server.js†L2700-L2854】
   - Fechar ciclo mensal pela rota `/master/cycles/:id/close`, que consolida pontos, aplica multiplicadores e grava `monthly_commissions`. O resumo inclui totais de stories validados, bônus e valores monetários.【F:src/server.js†L2860-L3091】【F:src/utils/multiplier.js†L1-L71】
6. **Importação e auditoria de vendas**
   - Realizar preview de CSV via `/sales/import/preview`, corrigir erros sinalizados e confirmar com `/sales/import/confirm`, garantindo unicidade por número de pedido. Dashboards de resumo (`/sales/summary/:id`) exibem comissões geradas por cupom e período.【F:src/server.js†L2413-L2550】【F:src/server.js†L2962-L3091】
7. **Relatórios e suporte**
   - Consultar `/influenciadoras/consulta` para visão consolidada por influenciadora (dados cadastrais, vendas e pontos).【F:src/server.js†L3108-L3142】
   - Acionar scripts auxiliares (ex.: `scripts/filter_orders.py`) para pré-validar arquivos antes do upload corporativo.【F:scripts/filter_orders.py†L1-L160】

### Influenciadora

Usuária final responsável por planejar, comprovar e acompanhar suas entregas.

1. **Primeiro acesso**
   - Recebe e-mail ou mensagem com login (email/telefone) e senha provisória gerados pelo master. O front-end força a troca de senha caso `must_change_password` esteja ativo.【F:src/server.js†L1066-L1206】【F:public/main.js†L1-L200】
2. **Aceite de termos**
   - Após login, o middleware `verificarAceite` bloqueia o acesso a rotas protegidas até que a influenciadora aceite o termo vigente ou insira o código de assinatura fornecido. O fluxo `/aceite-termos` registra hash do documento, canal, IP e timestamp para auditoria.【F:src/middlewares/verificarAceite.js†L1-L67】【F:src/routes/aceite.js†L9-L200】
3. **Planejamento de roteiros**
   - Na tela “Agendar Roteiros”, a usuária consome `/influencer/plan` para visualizar o ciclo atual e a lista de roteiros disponíveis, filtrando entre agendados e disponíveis. Cada card possui ações para escolher a data (via date picker nativo) ou editar uma data existente.【F:src/server.js†L2552-L2698】【F:docs/INSTRUCOES_AGENDAMENTO_ROTEIROS.md.md†L12-L80】
   - Ao confirmar, o front-end monta um lote e envia para `POST /influencer/plan`; ajustes posteriores usam `PUT /influencer/plan/:id`.
4. **Entrega de stories**
   - Submete comprovantes (links, prints) pela tela de submissões, alimentando `story_submissions` com status inicial “pendente”. Pode acompanhar aprovações ou retornos do master em tempo real.【F:src/server.js†L2700-L2854】
5. **Dashboard pessoal**
   - `/influencer/dashboard` apresenta indicadores de pontos, entregas e vendas atribuídas ao cupom da influenciadora, incluindo totais confirmados e pendentes por ciclo.【F:src/server.js†L2693-L2750】
6. **Histórico e notificações**
   - Histórico de ciclos anteriores disponível em `/influencer/history`, garantindo transparência sobre stories aprovados, multiplicadores aplicados e comissões recebidas.【F:src/server.js†L2752-L2854】

## Agendamento de roteiros e ciclo editorial

O planejamento mensal segue uma rotina predefinida:

1. **Preparação do ciclo**
   - Masters criam ou atualizam o ciclo corrente (datas de início/fim) e publicam roteiros ativos. Os roteiros são armazenados com HTML sanitizado para exibição no mobile e desktop.【F:src/server.js†L2926-L2959】
2. **Seleção pela influenciadora**
   - Ao acessar a tela de planner, a API retorna: informações do ciclo, backlog de roteiros sugeridos, agendamentos anteriores e bloqueios de data (ex.: datas passadas ou fora da janela). O front-end identifica roteiros já vinculados para destacar status visual (agendado, disponível).【F:src/server.js†L2552-L2698】【F:docs/INSTRUCOES_AGENDAMENTO_ROTEIROS.md.md†L16-L80】
3. **Agendamento e edição**
   - Cada card possui ação “Agendar” que abre input `type="date"`. Ao escolher a data, o agendamento é registrado localmente e o botão “Salvar Agendamentos” envia o lote ao backend. O servidor valida conflitos (mesma data/roteiro duplicado), limites por ciclo e garante atomicidade via transação antes de gravar em `influencer_plans` e `monthly_cycles`.
4. **Validação e acompanhamento**
   - Masters visualizam os agendamentos agregados, aprovam ou reprovam entregas via `/master/validations`. Aprovações vinculam o `story_submission` correspondente, atualizam o planner e alimentam os cálculos de multiplicador.
5. **Fechamento do ciclo**
   - No fim do mês, o fechamento executa `summarizeCommission` para cada influenciadora, cruzando pontos base, multiplicador por faixa de stories e bônus adicionais. Os resultados são persistidos em `monthly_commissions`, liberando indicadores no dashboard da influenciadora.【F:src/utils/multiplier.js†L1-L71】【F:src/server.js†L2860-L3091】

Recomendações mobile-first (implementadas no planner atual): lista vertical de roteiros, botão flutuante de salvar, filtros rápidos, e uso de date picker nativo para acelerar a seleção no celular.【F:docs/INSTRUCOES_AGENDAMENTO_ROTEIROS.md.md†L16-L80】

## Importação de vendas e integração com Shopify

1. **Preparação do arquivo**
   - Exportar relatórios do Shopify (CSV) ou utilizar o script `scripts/filter_orders.py` para limpar linhas inválidas antes do upload. O script reaproveita as regras de validação do backend (data de pagamento, subtotal positivo, cupom válido).【F:scripts/filter_orders.py†L1-L160】【F:data/valid_coupons.json†L1-L18】
2. **Preview no painel master**
   - A tela master envia o arquivo para `/sales/import/preview`. O backend detecta o layout, normaliza SKUs, cruza com `sku_points` e devolve relatório linha a linha com erros (pedido duplicado, cupom inexistente, data ausente) e totais por cupom.【F:src/server.js†L2413-L2489】
3. **Confirmação**
   - Apenas quando todas as linhas são válidas é possível chamar `/sales/import/confirm`, que grava pedidos e itens em transação, mantendo unicidade por número de pedido (`uniq_sales_order_number`). Pontos e comissões resultantes são imediatamente refletidos nos dashboards.【F:src/server.js†L2489-L2550】【F:src/server.js†L2962-L3091】
4. **Operações pontuais**
   - Masters podem ajustar vendas individuais via `POST/PUT/DELETE /sales`, recalculando comissões conforme regras vigentes (taxa base e multiplicadores). Relatórios por influenciadora e por ciclo ficam disponíveis em `/sales/summary/:id`.

## Ferramentas complementares e automações

- **Aceite contratual**: `/api/aceite` gera tokens, valida códigos de assinatura e disponibiliza comprovantes HTML com hash SHA-256, garantindo auditoria completa do fluxo de assinatura.【F:src/routes/aceite.js†L9-L200】【F:src/utils/hash.js†L1-L19】
- **Scripts CLI**: `scripts/filter_orders.py` processa relatórios Shopify e pode ser integrado em pipelines CI/CD para pré-validação automática.【F:scripts/filter_orders.py†L1-L160】
- **Docs operacionais**: `docs/pinklovers-api.md`, `docs/pinklovers-influencer-planner.md` e `docs/INSTRUCOES_AGENDAMENTO_ROTEIROS.md.md` detalham endpoints, layouts de telas e instruções mobile-first complementares.
- **Ambiente local**: `docs/local-development.md` descreve como executar migrations, seeds e scripts de manutenção durante o desenvolvimento.【F:docs/local-development.md†L1-L80】

## Testes automatizados e garantia de qualidade

- `npm test` executa a suíte `node --test` apontando para um banco isolado, validando autenticação, CRUD de influenciadoras, aceite contratual, importação e cálculo de multiplicadores.【F:package.json†L1-L20】【F:tests/app.test.js†L55-L200】【F:tests/multiplier.test.js†L1-L26】
- Os testes atuam como especificação viva: alterações em regras de negócio devem ser acompanhadas de atualizações na suíte para evitar regressões (por exemplo, mudanças em validação de CPF, limites de agendamento ou cálculo de multiplicadores).

## Documentação complementar

- `docs/SYSTEM_DOCUMENTATION.md`: visão arquitetural detalhada, incluindo diagramas de fluxo e relacionamentos entre módulos.
- `docs/pinklovers-influencer-planner.md`: guia funcional do planner com referências de UI e fluxos de aprovação.
- `docs/sales-import.md`: passo a passo específico da importação de vendas.
- `docs/cronograma-ativacoes.md`: cronograma sugerido para campanhas e eventos.

Utilize estes materiais em conjunto com o README para treinar novos masters, orientar influenciadoras e padronizar processos internos.
