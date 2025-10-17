# System Documentation

## Visão geral
- **Propósito**: plataforma HidraPink para gestão de influenciadoras, centralizando cadastro, planejamento de conteúdos, importação de vendas e acompanhamento de comissões.
- **Stack principal**: servidor Express 5 atendendo API REST e arquivos estáticos, com autenticação JWT e integração a SQLite via `better-sqlite3`. O servidor também carrega variáveis de ambiente automaticamente e garante a criação do usuário master padrão na inicialização.【F:src/server.js†L1-L40】【F:src/server.js†L604-L632】
- **Execução e testes**: use `npm start` para subir o servidor e `npm test` para rodar a suíte automatizada baseada em `node --test`.【F:package.json†L1-L20】

## Estrutura do projeto
- `src/`: código do backend (configuração de ambiente, inicialização do banco, middlewares, utilitários e servidor Express principal).【F:src/config/env.js†L1-L107】【F:src/database.js†L1-L120】【F:src/middlewares/verificarAceite.js†L1-L67】【F:src/utils/multiplier.js†L1-L71】【F:src/server.js†L1-L3156】
- `public/`: front-end estático (HTMLs para masters e influenciadoras) e `main.js`, responsável por persistir credenciais locais, montar requisições e renderizações dinâmicas no navegador.【F:public/main.js†L1-L200】
- `docs/`: guias operacionais, incluindo instruções de desenvolvimento local e importação de vendas que complementam este documento.【F:docs/local-development.md†L1-L80】
- `scripts/`: utilitários de linha de comando, como o filtro de pedidos Shopify reutilizado pelos fluxos de importação em massa.【F:scripts/filter_orders.py†L1-L160】
- `data/`: artefatos de suporte (ex.: lista de cupons válidos consumida pelo filtro e pelo backend).【F:data/valid_coupons.json†L1-L18】
- `tests/`: suíte `node:test` que cobre fluxos críticos (autenticação, CRUD de influenciadoras, validações de unicidade) e regras de comissão.【F:tests/app.test.js†L1-L200】【F:tests/multiplier.test.js†L1-L26】

## Arquitetura

### Backend HTTP e assets estáticos
- O Express instancia middlewares globais (`express.json`) e publica arquivos de `frontend/` ou `public/`, servindo `index.html` como fallback.【F:src/server.js†L13-L40】【F:src/server.js†L3144-L3156】
- Uma rota dedicada entrega `/aceite-termos`, garantindo acesso ao HTML do termo vigente direto do diretório público.【F:src/server.js†L33-L40】

### Configuração e infraestrutura
- `src/config/env.js` resolve automaticamente `.env` (ou caminho customizado) e aplica chaves somente se não estiverem definidas, permitindo sobrescrita por variáveis do ambiente de execução.【F:src/config/env.js†L4-L106】
- `src/database.js` instancia `better-sqlite3`, habilita WAL/foreign keys e intercepta instruções mutáveis para disparar checkpoints. A mesma unidade cuida de migrações incrementais das tabelas (`users`, `influenciadoras`, `sales`, entre outras), tratando colunas legadas e normalizando telefones/unicidade de campos.【F:src/database.js†L1-L208】【F:src/database.js†L212-L399】
- Durante o boot, `ensureMasterUser` garante a existência do usuário master padrão, inclusive migrando hashes ausentes quando necessário.【F:src/server.js†L604-L632】

### Middlewares e rotas auxiliares
- `verificarAceite` intercepta requisições de influenciadoras, checando se há aceite vigente ou dispensa de contrato. Quando ausente, retorna HTTP 428 com redirecionamento para `/aceite-termos` ou executa `res.redirect`, conforme cabeçalhos da requisição.【F:src/middlewares/verificarAceite.js†L3-L63】
- `routes/aceite.js` expõe o fluxo de aceite via `/api`, permitindo enviar tokens de assinatura, validar códigos, consultar e baixar comprovantes HTML. Ele também trata casos em que a assinatura foi dispensada no cadastro da influenciadora.【F:src/routes/aceite.js†L1-L200】【F:src/routes/aceite.js†L535-L766】

### Utilitários compartilhados
- `utils/hash.js` calcula o hash SHA-256 do termo HTML para registrar imutabilidade do conteúdo aceito.【F:src/utils/hash.js†L1-L19】
- `utils/multiplier.js` concentra a lógica de multiplicadores por faixas de stories validados e a função `summarizeCommission`, reaproveitada em endpoints e na finalização de ciclos.【F:src/utils/multiplier.js†L1-L71】

### Front-end estático
- `public/main.js` mantém tokens em `sessionStorage`, persiste credenciais provisórias de influenciadoras no `localStorage`, normaliza entradas (telefone, texto) e converte blocos de texto para HTML seguro antes de enviar ao servidor. Essa camada coordena o consumo da API REST e o preenchimento das telas HTML distribuídas no diretório `public/`.【F:public/main.js†L1-L200】

### Ferramentas e dados auxiliares
- `scripts/filter_orders.py` replica as regras de importação de vendas (pedido numerado, data de pagamento, cupom válido, subtotal positivo) e pode ser usado em pipelines para validar CSVs antes de enviá-los ao backend.【F:scripts/filter_orders.py†L1-L160】
- `data/valid_coupons.json` centraliza a lista de cupons aceitos, compartilhada entre script e backend para garantir consistência das validações.【F:data/valid_coupons.json†L1-L18】

## Fluxos de dados principais

### Autenticação e autorização
```
Login (POST /login) -> findUserByIdentifier -> bcrypt.compare -> JWT emitido -> Authorization: Bearer em chamadas
```
- O login aceita e normaliza email ou telefone, buscando o usuário em múltiplas chaves (email, telefone normalizado ou contato cadastrado da influenciadora). Após validar a senha, gera JWT com `userId` e `role`. O middleware `authenticate` verifica o token e injeta `req.auth.user`, enquanto `authorizeMaster` restringe rotas administrativas.【F:src/server.js†L766-L833】【F:src/server.js†L2113-L2133】
- Os testes automatizados cobrem login master, autenticação via email/telefone de influenciadora e bloqueios quando credenciais estão incorretas.【F:tests/app.test.js†L55-L169】

### Aceite de termos e assinatura contratual
```
Influencer autenticada -> verificarAceite -> (se pendente) 428/redirect -> fluxo /api/aceite para token -> registro em aceite_termos
```
- O middleware impede acesso à API sem aceite vigente, enquanto o router `/api/aceite` registra hash do termo, IP, user agent e canal de autenticação, além de validar códigos de assinatura ou dispensas cadastradas.【F:src/middlewares/verificarAceite.js†L3-L63】【F:src/routes/aceite.js†L9-L200】【F:src/routes/aceite.js†L535-L766】

### Cadastro e gestão de influenciadoras
```
Master -> POST /influenciadora -> valida payload/duplicidades -> cria usuário + influenciadora -> retorna senha e código
Influencer/Master -> GET/PUT/DELETE /influenciadora/:id com checagens de acesso e atualizações encadeadas
```
- O backend normaliza booleanos (dispensa de contrato), telefones e CPF, bloqueia duplicidades em email/cupom/contato/Instagram e gera senhas/códigos de assinatura conforme necessidade. Atualizações respeitam permissões (master ou a própria influenciadora) e sincronizam mudanças de contato/login no banco. Exclusões atomizam remoção da influenciadora e do usuário vinculado.【F:src/server.js†L835-L2405】
- Testes cobrem cadastro completo, login com senha provisória, atualização de telefone/senha e regras de unicidade de CPF/email/cupom/contato.【F:tests/app.test.js†L88-L200】

### Importação em massa
```
Master -> POST /influenciadoras/import/preview -> análise CSV -> (sem erros) POST /confirm -> transação cria registros/usuarios
Master -> POST /sales/import/preview -> valida linhas -> POST /confirm -> grava vendas aprovadas
```
- O preview retorna estatísticas, erros linha a linha e somente permite confirmação quando todos os registros são válidos. A confirmação prepara senhas/códigos individualmente (respeitando dispensas) e utiliza operações transacionais para inserir dados. O fluxo de vendas replica validações (pedido único, datas válidas, cupom conhecido) antes de persistir a comissão calculada.【F:src/server.js†L2413-L2550】
- Para validações off-line, utilize `scripts/filter_orders.py`, que reaproveita as mesmas regras do backend.【F:scripts/filter_orders.py†L1-L160】

### Planejamento de conteúdos, validações e comissões
-```
Influencer -> GET /influencer/plan (lista ciclo vigente + roteiros recentes)
Influencer -> seleciona roteiro sugerido -> aciona botão “+” para definir data -> POST /influencer/plan
Influencer -> ajustes pontuais (trocar data/roteiro) -> PUT /influencer/plan/:id
Master -> /master/validations aprova/rejeita -> dashboard consolida métricas
Fechamento -> POST /master/cycles/:id/close -> calcula multiplicadores e grava monthly_commissions
```
- O sistema mantém ciclos mensais (`monthly_cycles`), planos por influenciadora e scripts de conteúdo reutilizáveis. A tela de planejamento consome `/influencer/plan`, que entrega os roteiros mais recentes; dali, a influenciadora escolhe o roteiro desejado e, pelo botão “+”, seleciona a data correspondente antes de confirmar o envio em lote para o ciclo corrente (POST). Edições posteriores permitem trocar o roteiro vinculado ou reagendar diretamente pela mesma tela via `PUT /influencer/plan/:id`.【F:src/server.js†L2552-L2698】
- Funções utilitárias garantem coerência (ex.: impedir datas fora do ciclo, verificar conflito de agenda e validar existência do roteiro) e mantêm registros sincronizados ao aprovar/rejeitar stories.【F:src/server.js†L2616-L2698】【F:src/server.js†L2776-L2854】

### Gestão de roteiros e vendas pontuais
- Masters podem cadastrar novos roteiros de conteúdo com HTML sanitizado, e ambos (masters/influenciadoras) podem listá-los para sugestão de posts.【F:src/server.js†L2926-L2959】
- Operações individuais de vendas (`POST/PUT/DELETE /sales`) recalculam valores líquidos e comissões com base na taxa configurada, impedindo duplicidade de pedidos e validando cupons existentes antes de persistir os dados.【F:src/server.js†L2962-L3091】

## Componentes complementares
- A lista consolidada de influenciadoras e seus indicadores pode ser consultada via `/influenciadoras/consulta`, oferecendo resumo de vendas e taxas já normalizado para exibição no painel master.【F:src/server.js†L3108-L3142】
- Os endpoints de histórico (`/influencer/history`, `/sales/summary/:id`, `/sales/:id`) fornecem dados consolidados para gráficos e relatórios no front-end.【F:src/server.js†L2693-L3100】
- A documentação existente em `docs/` explica a execução local, fluxo de aceite e integração de importação; use-a como complemento operacional deste guia técnico.【F:docs/local-development.md†L1-L80】

## Referências cruzadas e testes
- `tests/app.test.js` atua como especificação viva dos fluxos críticos descritos acima, garantindo que o backend permaneça aderente ao fluxo de cadastro, autenticação, aceite e exclusão.【F:tests/app.test.js†L55-L200】
- `tests/multiplier.test.js` valida a matemática dos multiplicadores, evitando regressões no cálculo de comissões durante o fechamento de ciclos.【F:tests/multiplier.test.js†L4-L26】
- Mantenha o script `filter_orders.py` alinhado às regras de importação; qualquer alteração nos cupons ou filtros deve atualizar simultaneamente o backend, o script e os testes para preservar consistência ponta a ponta.【F:scripts/filter_orders.py†L1-L160】【F:data/valid_coupons.json†L1-L18】

