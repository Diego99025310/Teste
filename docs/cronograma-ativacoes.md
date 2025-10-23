# Cronograma de ativações e roteiros

Este documento descreve como o sistema organiza o cronograma mensal de ativações (stories, posts ou entregas validadas), destacando responsabilidades da influenciadora e do master, os pontos de integração entre backend e frontend e como os dados são persistidos ao longo do ciclo.

## Entidades e consultas principais

- **monthly_cycles** guarda o período vigente e controla datas de abertura/fechamento do ciclo. O backend expõe seletores e atualizações por meio de `findCycleByIdStmt`, `listCyclesStmt`, `insertMonthlyCycleStmt`, `closeCycleStmt` e `touchCycleStmt`, que atualiza o `updated_at` sempre que algum plano é alterado.【F:src/server.js†L461-L479】
- **influencer_plans** registra cada agendamento (data, roteiro, notas e status). Há comandos de inserção, atualização, remoção e listagens com junção em `content_scripts` para entregar títulos/descrições junto das agendas.【F:src/server.js†L481-L600】
- **content_scripts** concentra os roteiros cadastrados pelo master e é consultada tanto diretamente (`listContentScriptsStmt`) quanto por joins nas agendas para exibir títulos e descrições.【F:src/server.js†L517-L545】【F:src/server.js†L2432-L2490】
- **monthly_commissions** armazena o fechamento do ciclo, recebendo ativações validadas, fator aplicado, pontos e valores consolidados. O `insertMonthlyCommissionStmt` faz *upsert* e mantém histórico para ranking e relatórios futuros.【F:src/server.js†L631-L699】

## Faixas de ativações e cálculo de comissão

As faixas de fator são baseadas na contagem de ativações validadas dentro do ciclo. `getMultiplier` converte o volume em `{ factor, label, activations }`, enquanto `summarizePoints` arredonda os pontos-base e calcula o total multiplicado. O mesmo objeto alimenta o dashboard e o fechamento mensal.【F:src/utils/multiplier.js†L1-L82】

## Fluxo operacional da influenciadora

### Resolução do perfil e autorização

Antes de qualquer ação, o backend identifica qual influenciadora está associada à requisição. `resolveInfluencerForRequest` valida se o usuário autenticado tem permissão para manipular o perfil solicitado (masters informam o ID, influenciadoras só acessam o próprio registro).【F:src/server.js†L2204-L2219】

### Consulta de agenda e roteiros

`GET /influencer/plan` recupera o ciclo atual (ou o selecionado), todos os planos agendados e até 15 roteiros sugeridos. A resposta combina as informações vindas de `collectInfluencerPlanData`, que consulta planos e roteiros em conjunto para facilitar a montagem da agenda na interface.【F:src/server.js†L3147-L3168】【F:src/server.js†L2432-L2437】

### Cadastro e manutenção do cronograma

`normalizePlanEntriesPayload` aceita diferentes formatos de payload (arrays, chaves alternativas, flags de *append*) e garante que as datas pertençam ao ciclo, eliminando duplicidades e coletando listas de remoção. Em seguida, `POST /influencer/plan` processa exclusões, atualizações e inserções dentro de uma transação; sempre que algo muda, `touchCycleStmt` marca o ciclo como atualizado.【F:src/server.js†L2221-L2395】【F:src/server.js†L3171-L3332】【F:src/server.js†L479-L515】

A versão `/api/influencer/plan` segue a mesma lógica e retorna uma resposta estendida com metadados formatados, reutilizando os mesmos validadores de payload.【F:src/server.js†L3348-L3508】

### Edição pontual de um dia

`PUT /influencer/plan/:id` permite ajustar data, roteiro ou anotação específicos. O endpoint valida conflitos de data dentro do ciclo, exige roteiros válidos e sempre volta o status para `scheduled`, além de atualizar o carimbo do ciclo com `touchCycleStmt`.【F:src/server.js†L3511-L3583】

### Painel e indicadores da influenciadora

`GET /influencer/dashboard` agrega dados do ciclo: planos agendados, ativações validadas, pendências, alertas (datas vencidas) e o resumo de comissão calculado via `summarizePoints`. O payload também inclui roteiros sugeridos e o próximo agendamento futuro.【F:src/server.js†L3585-L3646】

No frontend, `initInfluencerPage` consome esse payload para preencher cabeçalhos de ciclo, contadores (planejado, validado, pendente), fator/label do ciclo e cards do cronograma ordenados por data e status. Labels amigáveis para cada status (`Pendente`, `Validado`, `Em validação`, `Não entregue`) são aplicados na renderização do quadro.【F:public/main.js†L3932-L4099】

## Fluxo operacional do master

### Gestão de roteiros

O master administra os roteiros via endpoints dedicados: `POST /scripts` cria novas sugestões após validar título e descrição; `PUT /scripts/:id` atualiza os dados existentes; `DELETE /scripts/:id` remove registros, e `GET /scripts`/`GET /scripts/:id` disponibilizam a listagem para consumo. Todas as operações exigem autenticação de master.【F:src/server.js†L3835-L3945】

### Montagem e ajuste de cronogramas

O master usa os mesmos endpoints de agenda da influenciadora, passando `influencerId` no corpo ou query-string. Como `resolveInfluencerForRequest` aceita perfis alternativos para masters, o fluxo de criação/edição em lote reutiliza `normalizePlanEntriesPayload` e as operações transacionais descritas anteriormente.【F:src/server.js†L2204-L2219】【F:src/server.js†L3171-L3332】

### Validação de ativações

`GET /master/validations` lista todas as entregas pendentes de validação no ciclo. `POST /master/validations/:id/approve` muda o status para `validated` e `POST /master/validations/:id/reject` reabre o plano como `scheduled`, sempre atualizando o ciclo para sinalizar mudanças.【F:src/server.js†L3662-L3715】

### Painel gerencial

`GET /master/dashboard` consolida planos do ciclo, pendências, alertas de datas vencidas e estatísticas agregadas (posts planejados, validados, pendentes), calculando também o total de influenciadoras monitoradas.【F:src/server.js†L3718-L3749】

### Fechamento mensal

Ao finalizar o ciclo, `POST /master/cycles/:id/close` percorre todas as influenciadoras, conta ativações validadas, aplica `summarizePoints`, grava o histórico em `monthly_commissions` e marca planos pendentes como `missed`. O resumo retornado inclui pontos, valores e entregas planejadas versus concluídas.【F:src/server.js†L3765-L3833】

## Sincronização e histórico

Sempre que planos são criados, atualizados, aprovados ou rejeitados, `touchCycleStmt` atualiza o `updated_at` do ciclo, permitindo que outras telas detectem alterações recentes.【F:src/server.js†L479-L515】【F:src/server.js†L3320-L3322】【F:src/server.js†L3497-L3499】【F:src/server.js†L3574-L3575】【F:src/server.js†L3683-L3685】【F:src/server.js†L3706-L3708】

Durante o fechamento, ativações não validadas até a data de corte são marcadas como `missed` por `markMissedPlansStmt`, garantindo que o histórico reflita exatamente o fator usado na comissão. O conjunto de ativações validadas é serializado e salvo junto do registro mensal para auditoria futura.【F:src/server.js†L509-L515】【F:src/server.js†L3779-L3822】

