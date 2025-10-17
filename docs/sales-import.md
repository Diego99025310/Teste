# Importacao de vendas de influenciadoras

Este guia mostra onde importar os dados de vendas e explica como o sistema utiliza cada registro. Ele complementa o `docs/local-development.md`, que descreve como executar o projeto localmente.

## 1. Preparar o CSV

1. Exporte o arquivo `orders_export.csv` diretamente do Shopify.
2. Não é necessário editar ou filtrar o conteúdo manualmente: o backend ignora automaticamente todas as linhas que não atendem aos critérios de importação (pedido numerado, pagamento confirmado, cupom cadastrado e subtotal válido).

### Validação opcional via script

Caso precise conferir os dados fora da interface (por exemplo, em uma automação), o script `scripts/filter_orders.py` aplica os mesmos filtros e gera um CSV apenas com os pedidos aprovados:

```bash
scripts/filter_orders.py --input orders_export.csv --output orders_valid.csv
```

Cole diretamente no terminal, se preferir:

```bash
scripts/filter_orders.py --stdin --output orders_valid.csv
# cole o conteúdo do CSV e pressione Ctrl+D (Linux/macOS) ou Ctrl+Z + Enter (Windows)
```

## 2. Importar pelo painel (recomendado)

1. Acesse o painel master (`master-sales.html`).
2. Na seção **Importar vendas em massa**, clique em **Arquivo CSV** e selecione o `orders_export.csv` exportado do Shopify.
3. O sistema lê o arquivo, envia o conteúdo bruto para o backend e exibe o resultado da análise. Se alguma linha tiver problema, os erros aparecerão na tabela e o painel avisará que elas serão ignoradas ao salvar.
4. Quando estiver satisfeito com os pedidos prontos, clique em **Salvar pedidos importados** para concluir o cadastro. As linhas com erro permanecem listadas apenas para consulta.

## 3. Autenticar como master

A importação é protegida. Autentique-se com as credenciais de master configuradas no `.env`:

```bash
curl -X POST http://localhost:3000/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"MASTER_EMAIL","password":"MASTER_PASSWORD"}'
```

Anote o token `JWT` retornado (campo `token`), pois ele será usado nas próximas chamadas.

## 4. Enviar para analise (`/sales/import/preview`)

A etapa de análise confirma se todas as vendas podem ser importadas com segurança. Envie o conteúdo do `orders_export.csv` original (ou o CSV filtrado pelo script, se preferir) no corpo da requisição:

```bash
curl -X POST http://localhost:3000/sales/import/preview \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"$(cat orders_export.csv)"}'
```

A resposta traz, para cada linha, os valores normalizados, o nome da influenciadora identificada e a lista de erros, se existirem. O resumo (`summary`) exibe o total bruto, descontos, líquido e comissão calculados.

## 5. Confirmar a importacao (`/sales/import/confirm`)

Quando a análise indicar pelo menos um pedido pronto (`validCount > 0`), finalize a importação:

```bash
curl -X POST http://localhost:3000/sales/import/confirm \
  -H 'Authorization: Bearer <TOKEN>' \
  -H 'Content-Type: application/json' \
  -d '{"text":"$(cat orders_export.csv)"}'
```

O endpoint grava apenas as linhas aprovadas e responde com o total de vendas importadas (`inserted`) e de linhas ignoradas (`ignored`). Se nenhuma linha estiver pronta (por exemplo, todos os pedidos com erro), ele retorna HTTP 409 informando o motivo.

## 6. Como o registro de vendas é calculado

Durante a análise e a confirmação, o backend executa as seguintes validações adicionais:

1. **Cruzamento com a base de influenciadoras**: o cupom informado precisa estar cadastrado (`findInfluencerByCouponStmt`).
2. **Checagem de duplicidade**: o sistema bloqueia pedidos repetidos no arquivo e pedidos que já estejam salvos (`findSaleByOrderNumberStmt`).
3. **Normalização de valores**: o campo de data é convertido para ISO (`parseImportDate`) e os valores bruto/desconto passam por conversão numérica resiliente (`parseImportDecimal`).
4. **Cálculo de totais**: a aplicação calcula o valor líquido `gross - discount` e aplica o percentual de comissão da influenciadora (`computeSaleTotals`).

Somente os registros sem erros seguem para `insertImportedSales`, que grava a venda com número do pedido, cupom relacionado, valores líquido/bruto, desconto e comissão. As linhas com erro são ignoradas automaticamente durante a confirmação.

## 7. Consultar as vendas importadas

Após a confirmação, você pode consultar os resultados via API autenticada:

```bash
curl -X GET http://localhost:3000/sales/<influencerId> \
  -H 'Authorization: Bearer <TOKEN>'
```

A resposta inclui cada venda com o cupom utilizado, valores brutos, descontos, líquido e comissão registrados.

Com essas etapas você consegue importar os dados diretamente a partir do CSV exportado, com a mesma lógica de validação combinada e com o registro das vendas calculado automaticamente pelo backend.
