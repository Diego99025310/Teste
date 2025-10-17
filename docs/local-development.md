# Ambiente de desenvolvimento local

Este guia descreve os passos necessarios para subir o sistema HidraPink em um computador local, incluindo a configuracao das variaveis de ambiente e o fluxo de aceite do termo.

## 1. Dependencias

- Node.js 18 ou superior
- npm (instalado junto com o Node.js)

Execute `npm install` na raiz do projeto para instalar as dependencias. Caso esteja utilizando Windows, pode ser necessario executar o terminal como administrador para permitir a construcao do `better-sqlite3`.

## 2. Arquivo `.env`

1. Copie o arquivo `.env.example` para `.env` na raiz do projeto:
   ```bash
   cp .env.example .env
   ```
2. Atualize os valores conforme sua necessidade:
   - `MASTER_EMAIL` e `MASTER_PASSWORD`: credenciais iniciais do usuario master criado automaticamente.

O carregamento do arquivo `.env` e automatico sempre que o servidor eh iniciado, portanto nao ha necessidade de exportar as variaveis manualmente no terminal.

## 3. Inicializacao do banco de dados

Nenhuma etapa adicional e necessaria. Ao iniciar o servidor, o banco SQLite sera criado (ou migrado) automaticamente no arquivo `database.sqlite` localizado na raiz do projeto. Um usuario master padrao tambem sera cadastrado usando as variaveis definidas na etapa anterior.

## 4. Executando o servidor

Inicie o servidor com:

```bash
npm start
```

O aplicativo ficara disponivel em `http://localhost:3000`.

Durante a inicializacao, o console exibira as credenciais do usuario master configurado nas variaveis de ambiente. Utilize-as para realizar o primeiro login na interface web.

## 5. Fluxo de aceite do termo em desenvolvimento

1. Realize login com o usuario master e cadastre a influenciadora (ou utilize um usuario existente).
2. Ao efetuar login como influenciadora, o middleware `verificarAceite` redirecionara automaticamente para `/aceite-termos` caso o termo vigente ainda nao tenha sido aceito.
3. Clique em **Continuar** para liberar o campo de confirmacao.
4. Informe o codigo de assinatura fornecido pela equipe HidraPink e finalize o processo. O registro sera gravado na tabela `aceite_termos` do SQLite, juntamente com o hash do termo, IP e user agent.

## 6. Testes automatizados

Para validar o funcionamento end-to-end execute:

```bash
npm test
```

Os testes usam um banco SQLite isolado (`test.sqlite`) e garantem que o fluxo de aceite e as demais funcionalidades principais continuem operando.

## 7. Resolucao de problemas

- **Codigo de assinatura nao e reconhecido**: confira se o codigo informado corresponde ao registrado para a influenciadora cadastrada.
- **Problemas para compilar o `better-sqlite3` no Windows**: instale o [Windows Build Tools](https://github.com/felixrieseberg/windows-build-tools) ou utilize o WSL.

## 8. Importando pedidos de influenciadoras

O painel master em `master-sales.html` permite carregar diretamente o CSV exportado do Shopify (`orders_export.csv`). Basta selecionar o arquivo em **Importar vendas em massa** – o frontend envia o conteúdo bruto para o backend, que aplica automaticamente as regras combinadas (pedido numerado, data de pagamento preenchida, cupom cadastrado e subtotal válido) antes de exibir a análise. Ao confirmar, apenas as linhas aprovadas são gravadas; as que permanecerem com erro são ignoradas.

Se quiser validar o arquivo manualmente fora da interface (por exemplo, em pipelines de CI), utilize o script opcional `scripts/filter_orders.py`. Ele reutiliza a mesma lista de cupons (`data/valid_coupons.json`) e gera um CSV somente com pedidos aprovados:

```bash
# lendo do arquivo padrão
scripts/filter_orders.py

# lendo de um caminho específico
scripts/filter_orders.py --input caminho/para/orders_export.csv --output caminho/para/orders_valid.csv

# colando o conteúdo manualmente (encerre com Ctrl+D)
scripts/filter_orders.py --stdin --output orders_valid.csv
```

Consulte `docs/sales-import.md` para o passo a passo completo da importação e para entender como o registro das vendas é calculado internamente.

Com essas configuracoes o projeto estara pronto para rodar localmente, permitindo que o fluxo de aceite e as demais funcionalidades sejam exercitadas sem dependencia de infraestrutura externa.
