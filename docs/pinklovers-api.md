# Pinklovers – HidraPink

Este documento descreve a modelagem de dados, endpoints e fluxos principais implementados para atender aos requisitos do programa Pinklovers.

## Estrutura de banco de dados

O banco SQLite utilizado pela aplicação recebeu as seguintes tabelas adicionais:

### `monthly_cycles`
Guarda o ciclo mensal corrente e o histórico anterior.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `id` | INTEGER PK | Identificador do ciclo |
| `cycle_year` | INTEGER | Ano de referência |
| `cycle_month` | INTEGER | Mês de referência (1–12) |
| `status` | TEXT | `open` ou `closed` |
| `started_at` | DATETIME | Data de início do ciclo |
| `closed_at` | DATETIME | Preenchido no fechamento |
| `created_at`/`updated_at` | DATETIME | Auditoria |

### `influencer_plans`
Agenda de stories planejados pelas influenciadoras.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `cycle_id` | FK `monthly_cycles` | Ciclo associado |
| `influencer_id` | FK `influenciadoras` | Influenciadora |
| `scheduled_date` | TEXT (YYYY-MM-DD) | Dia planejado |
| `content_script_id` | FK `content_scripts` | Roteiro sugerido opcional |
| `status` | TEXT | `scheduled`, `posted`, `validated` ou `missed` |
| `notes` | TEXT | Observações internas |

### `story_submissions`
Registra os stories postados.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `plan_id` | FK `influencer_plans` | Agendamento associado (opcional) |
| `status` | TEXT | `pending`, `approved`, `rejected` |
| `validation_type` | TEXT | `manual` ou `auto` |
| `auto_detected` | INTEGER | 1 se a marcação oficial identificou o story |
| `proof_url` / `proof_notes` | TEXT | Comprovantes enviados |
| `validated_at` / `validated_by` | DATETIME / FK `users` | Auditoria de aprovação |
| `rejection_reason` | TEXT | Motivo da rejeição |

### `monthly_commissions`
Histórico consolidado após o fechamento do ciclo.

| Coluna | Tipo | Descrição |
| --- | --- | --- |
| `validated_days` | INTEGER | Quantidade de stories aprovados |
| `multiplier` | REAL | Fator aplicado conforme a faixa |
| `base_commission` | REAL | Comissão base calculada (vendas) |
| `total_commission` | REAL | Comissão final após multiplicador |
| `deliveries_planned`/`deliveries_completed` | INTEGER | Indicadores do mês |
| `validation_summary` | TEXT | JSON com evidências aprovadas |

Índices e chaves estrangeiras garantem unicidade por ciclo e integridade referencial.

## Regras de multiplicador

A função utilitária `summarizeCommission()` aplica o multiplicador de acordo com a quantidade de dias validados:

| Dias validados | Multiplicador |
| --- | --- |
| 1–4 | 1.00x |
| 5–10 | 1.25x |
| 11–15 | 1.50x |
| 16–20 | 1.75x |
| 21–30 | 2.00x |

Valores superiores a 30 permanecem em 2.00x. O resultado arredonda valores monetários para duas casas decimais.

## Endpoints principais

Todos os endpoints retornam JSON e exigem autenticação por Bearer Token. As rotas de influenciadora requerem aceite do termo (middleware `verificarAceite`).

### Planejamento (`/influencer/plan`)
- `GET /influencer/plan`: retorna ciclo atual, agenda do mês e lista de roteiros sugeridos.
- `POST /influencer/plan`: substitui a agenda pendente por novas datas (array `days`). Datas devem pertencer ao mês vigente.
- `PUT /influencer/plan/:id`: altera data, roteiro ou observações de um agendamento não validado.

### Submissões (`/influencer/submissions`)
- `GET /influencer/submissions`: lista os stories enviados no ciclo.
- `POST /influencer/submissions`: registra um story. Aceita `planId`, `proofUrl`, `proofNotes` e `autoDetected` (true indica validação automática por marcação). Stories automáticos entram como aprovados imediatamente.
- `PUT /influencer/submissions/:id`: atualiza um envio pendente, anexando novo comprovante.

### Dashboard da influenciadora
- `GET /influencer/dashboard`: consolida agenda, submissões, alertas de dias vencidos e estimativa de comissão.
- `GET /influencer/history`: histórico de comissões fechadas por ciclo.

### Painel master
- `GET /master/dashboard`: resumo do ciclo, pendências de validação e agenda consolidada de todas as influenciadoras.
- `GET /master/validations`: lista os stories aguardando aprovação manual.
- `POST /master/validations/:id/approve`: aprova um story pendente.
- `POST /master/validations/:id/reject`: rejeita um story com motivo opcional.
- `GET /master/cycles`: histórico de ciclos cadastrados.
- `GET /master/ranking`: ranking de ciclos fechados (filtrável por `cycleId`).
- `POST /master/cycles/:id/close`: fecha o ciclo informado. Calcula dias validados, aplica multiplicadores, gera registros em `monthly_commissions` e marca agendamentos não entregues como `missed`.

### Outras rotas
As rotas pré-existentes de cadastro, login, roteiros e vendas permanecem ativas e foram reaproveitadas no fechamento mensal.

## Fluxo mensal consolidado
1. **Criação automática do ciclo**: ao carregar o servidor ou acessar endpoints do mês, um ciclo aberto é criado caso não exista.
2. **Planejamento**: influenciadoras definem datas do mês com base em roteiros sugeridos pelo master.
3. **Execução**: stories são enviados diariamente com comprovantes ou marcados automaticamente.
4. **Validação**: master acompanha pendências, aprovando/rejeitando via painel. Stories com marcação automática já entram aprovados.
5. **Multiplicador**: a quantidade de dias aprovados determina o multiplicador aplicado sobre a comissão base calculada a partir das vendas (`sales`).
6. **Fechamento**: o master dispara `POST /master/cycles/:id/close`, que salva o histórico em `monthly_commissions`, marca pendências não entregues e encerra o ciclo.
7. **Consulta**: influenciadoras consultam seu histórico em `/influencer/history`; o master acompanha ranking e relatórios no dashboard.

## Interfaces mínimas

Duas páginas estáticas foram adicionadas em `public/`:

- `public/pinklovers-influencer.html`: agenda mensal, envio de stories e acompanhamento do multiplicador.
- `public/pinklovers-master.html`: visão consolidada de agendas, pendências e fechamento do ciclo.

Ambas utilizam o token armazenado em `sessionStorage` após o login nas páginas existentes do sistema.

## Como acessar e operar os painéis

### 1. Preparar o ambiente
1. Instale as dependências com `npm install`.
2. Defina as credenciais do usuário master via variáveis de ambiente `MASTER_EMAIL` e `MASTER_PASSWORD` se desejar sobrescrever os padrões (`master@example.com` / `master123`).
3. (Opcional) Ajuste `DATABASE_PATH` para definir o arquivo SQLite desejado.
4. Inicie o servidor com `npm start`. O Express levantará os painéis estáticos e a API na porta `3000` por padrão.

### 2. Fluxo do administrador (master)
1. Acesse `http://localhost:3000/login.html` e autentique-se com o login do master (e-mail + senha definidos acima).
2. Ao efetuar login, o token JWT é salvo automaticamente em `sessionStorage`.
3. Clique no atalho **Painel Pinklovers** disponível na home do master (`master.html`) ou navegue diretamente até `http://localhost:3000/pinklovers-master.html` para abrir o painel:
   - **Agenda consolidada**: exibe os agendamentos de todas as influenciadoras e permite filtrar por dia.
   - **Validações pendentes**: lista stories que aguardam aprovação manual; use os botões Aprovar/Rejeitar para atualizar o status.
   - **Roteiros**: utilize o formulário de cadastro/edição para gerir o cronograma de conteúdo.
   - **Fechamento mensal**: acione o botão de fechamento para aplicar os multiplicadores, encerrar o ciclo vigente e gerar o histórico.
4. Use o menu de cadastro de influenciadoras (páginas já existentes) para convidá-las. Ao salvar, cada influenciadora recebe um login (e-mail ou telefone) e uma senha provisória de 6 dígitos.

### 3. Fluxo da influenciadora
1. A influenciadora faz login em `http://localhost:3000/login.html` usando o e-mail/telefone disponibilizado pelo master e a senha provisória recebida.
2. Após o primeiro acesso, recomenda-se alterar a senha em `http://localhost:3000/perfil.html` (página existente do sistema).
3. Com o token carregado no navegador, acesse `http://localhost:3000/pinklovers-influencer.html` para abrir o painel:
   - **Agenda mensal**: selecione todos os dias planejados de uma só vez ou ajuste dias individuais antes da publicação.
   - **Envio de stories**: registre o link/comprovante logo após postar o story e marque se houve detecção automática.
   - **Progresso**: acompanhe o número de dias validados, multiplicador estimado e checklist de entregas obrigatórias.
4. Caso o story não seja reconhecido automaticamente, envie o comprovante manualmente pela mesma tela. O item aparecerá como pendente até a aprovação do master.

### 4. Boas práticas operacionais
- Efetue o agendamento logo no início do ciclo para que os alertas de pendências sejam precisos.
- Oriente as influenciadoras a manter os comprovantes salvos até o fechamento do mês.
- Utilize os relatórios de ranking no painel do master para identificar influenciadoras com melhor desempenho e preparar as premiações.
- Antes de fechar o ciclo, verifique se todos os stories pendentes foram avaliados para garantir a aplicação correta do multiplicador.
