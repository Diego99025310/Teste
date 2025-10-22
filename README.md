# Sistema HidraPink – Visão Geral e Arquitetura

## Visão geral do projeto
O sistema HidraPink combina uma API Express, páginas estáticas e um banco SQLite para gerir o relacionamento com influenciadoras. O backend expõe rotas REST protegidas por JWT, processa importações de vendas e controla ciclos mensais de stories. O frontend é servido do diretório `public/` e reutiliza a mesma API para cadastros, dashboards e painéis especializados. A aplicação também inclui utilitários de linha de comando e documentação auxiliar em `docs/` para operar o programa Pinklovers de ponta a ponta.

## Estrutura de diretórios
```text
├── src/
│   ├── server.js          # Aplicação Express com rotas, autenticação e regras de negócio
│   ├── database.js        # Inicialização do SQLite, migrações e índices
│   ├── config/env.js      # Carregamento de variáveis de ambiente (.env)
│   ├── middlewares/       # Middleware de aceite contratual
│   ├── routes/            # Rotas modulares (por exemplo, aceite de termos)
│   └── utils/             # Utilidades de hash, pontuação e multiplicadores
├── public/                # Interfaces estáticas (login, dashboards, cadastros, planner)
├── docs/                  # Guias funcionais, integrações e fluxos operacionais
├── scripts/               # Ferramentas CLI (ex.: filtro de pedidos Shopify)
├── tests/                 # Testes automatizados usando `node --test`
├── data/                  # Arquivos auxiliares (ex.: cupons válidos)
├── package.json           # Scripts npm e dependências do projeto
└── README.md              # Este documento
```

## Dependências e execução
- **Runtime**: Node.js 18+.
- **Backend**: [Express 5](https://expressjs.com/) para rotas HTTP, [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) para persistência, [bcryptjs](https://github.com/dcodeIO/bcrypt.js) e [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) para segurança.
- **Ferramentas**: `supertest` para testes end-to-end.
- **Scripts npm**:
  - `npm install` – instala dependências (compilando `better-sqlite3` se necessário).
  - `npm start` – inicia `src/server.js` com hot reload manual.
  - `npm test` – executa a suíte `node --test` com banco isolado.
- **Configuração**: as variáveis de ambiente são carregadas automaticamente de `.env` por `src/config/env.js`, permitindo definir `DATABASE_PATH`, credenciais do usuário master (`MASTER_EMAIL`, `MASTER_PASSWORD`) e parâmetros de token (`JWT_SECRET`, `JWT_EXPIRATION`). O banco padrão (`database.sqlite`) é criado/migrado no primeiro start.

## Fluxo de autenticação e autorização
1. **Login** – `POST /login` aceita e-mail ou telefone + senha. O serviço localiza o usuário (`findUserByIdentifier`), valida a senha com `bcrypt.compare` e gera um JWT com `userId` e `role` usando o segredo configurado.
2. **Proteção de rotas** – o middleware `authenticate` verifica o token Bearer, carrega o usuário e injeta `req.auth`. Rotas master reutilizam `authorizeMaster` para restringir operações administrativas.
3. **Aceite contratual** – após autenticar, o middleware `verificarAceite` bloqueia influenciadoras sem aceite ativo, respondendo com HTTP 428 ou redirecionando para `/aceite-termos`. A rota modular `routes/aceite.js` registra hash do termo, IP, canal de autenticação e data na tabela `aceite_termos`, bem como o código de assinatura ou dispensa concedidos pelo master.
4. **Sessões no frontend** – as páginas públicas salvam o JWT em `sessionStorage` e anexam o header `Authorization: Bearer` em cada chamada XHR.

## Banco de dados SQLite
`src/database.js` inicializa o arquivo SQLite (modo WAL, foreign keys) e garante migrações idempotentes. O esquema principal cobre:
- **`users`** – credenciais master/influenciadora, telefone normalizado, flag `must_change_password` e índices exclusivos por e-mail/telefone.
- **`influenciadoras`** – dados pessoais, endereço, CPF, cupom, comissão, vínculo com `users`, hash/código de assinatura e dispensas contratuais. Índices garantem unicidade de Instagram, CPF, e-mail, telefone e cupom.
- **`sales`**, **`sale_sku_points`** e **`sku_points`** – registro de pedidos, itens por SKU e catálogo de pontuação com chaves estrangeiras e checagens de valor.
- **`aceite_termos`** – histórico de aceite com hash SHA-256 do contrato.
- **`content_scripts`**, **`influencer_plans`**, **`story_submissions`** e **`monthly_commissions`** – sustentam o planner mensal, validações (manuais ou automatizadas) e fechamento com multiplicadores, preservando rastreabilidade por ciclo.
Durante a inicialização, as funções `ensure*` migram colunas legadas, recalculam campos derivados (ex.: pontos a partir da comissão) e criam índices compostos para integridade transacional.

## Validação de CPF
A normalização de influenciadoras sanitiza CPF com `normalizeDigits`, exige 11 dígitos e rejeita sequências repetidas. O backend calcula os dois dígitos verificadores (método módulo 11) e retorna erro “CPF invalido” em caso de divergência. O campo é persistido formatado (`000.000.000-00`) e protegido tanto por validação de payload quanto por índice único (`idx_influenciadoras_cpf`).

## Integração com APIs externas
### Shopify
- O endpoint de importação aceita CSV bruto (`orders_export.csv`) ou colagens tabulares. `tryParseShopifySalesImport` detecta cabeçalhos do Shopify, converte SKUs em pontos consultando `sku_points`, agrupa linhas por pedido e calcula a pontuação total por cupom.
- O relatório prévio marca erros (pedido duplicado, cupom desconhecido, data ausente) e só permite confirmação após todas as linhas válidas. `insertImportedSales` persiste pedidos e itens em transação, evitando duplicidades por `uniq_sales_order_number`.
- Para uso offline/CI, `scripts/filter_orders.py` consome o mesmo CSV, reutiliza `data/valid_coupons.json` e emite um arquivo filtrado apenas com pedidos aprovados.

### Instagram
- O cadastro exige handle único (`@perfil`), gera links clicáveis para `https://www.instagram.com/<handle>` nas interfaces e armazena o contato normalizado para reuso em convites.
- A modelagem de `story_submissions` prepara campos como `proof_url`, `validation_type` e `auto_detected` para conciliar evidências vindas do Instagram (por exemplo, webhooks da Graph API) com validações manuais do master.
- As validações consolidam dados no planner (`influencer_plans`) e no histórico mensal (`monthly_commissions`), permitindo associar cada story à postagem real da influenciadora e acompanhar o status em dashboards.

## Fluxo de gerenciamento de influenciadores
1. **Onboarding** – `POST /influenciadora` normaliza payload (nomes, CEP, telefone, comissão), valida CPF, e-mail, cupom e telefone, gera senha provisória e código de assinatura (quando a dispensa não foi concedida) e cria usuário + influenciadora dentro de uma transação. A resposta devolve login, senha temporária e eventual código de assinatura.
2. **Atualização** – `PUT /influenciadora/:id` repete as validações, sincroniza alterações de contato e e-mail com o usuário vinculado, recalcula dispensas contratuais e, se necessário, emite novo código de assinatura. Atualizações honram permissões: masters editam qualquer registro; influenciadoras só alteram a si mesmas.
3. **Remoção** – `DELETE /influenciadora/:id` executa transação que exclui a influenciadora e o usuário relacionado para evitar órfãos.
4. **Importação em massa** – uploads CSV criam registros com senhas automáticas, vinculação opcional de login e geração em lote de códigos de assinatura, garantindo unicidade durante todo o processo.
5. **Planejamento e validação** – endpoints `/influencer/plan`, `/influencer/dashboard` e `/master/*` orquestram agendas mensais, cálculo de multiplicadores (`utils/multiplier.js`) e fechamento com persistência em `monthly_commissions`. Alerts e estatísticas alimentam painéis de master e influenciadora.

## Conexão entre componentes
- **Frontend ↔ Backend**: páginas HTML consomem JSON das rotas Express e atualizam a UI (cadastros, planner, dashboards) mantendo o token na sessão.
- **Autenticação ↔ Aceite**: o middleware de aceite lê `aceite_termos`/`influenciadoras` para redirecionar influenciadoras até validarem contrato ou registrarem dispensa.
- **Banco ↔ Importações**: as rotinas de importação e cadastros usam transações SQLite e índices únicos para garantir consistência (sem duplicar pedidos, CPFs, cupons ou logins).
- **Pontuação ↔ Comissões**: `utils/points.js` e `utils/multiplier.js` centralizam regras de conversão e multiplicador, evitando divergências entre cálculos exibidos na interface e valores gravados ao fechar ciclos.

Com essa arquitetura, o sistema HidraPink oferece um pipeline completo: cadastro seguro de influenciadoras, aceite contratual, planejamento e validação de stories, importação de vendas com origem Shopify e preparação para automações vindas do Instagram, culminando em comissões calculadas de forma consistente.
