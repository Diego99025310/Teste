# HidraPink Influence Manager

![GitHub last commit](https://img.shields.io/github/last-commit/Diego99025310/Teste?style=for-the-badge)
![GitHub repo size](https://img.shields.io/github/repo-size/Diego99025310/Teste?color=ff69b4&style=for-the-badge)
![Node.js CI](https://img.shields.io/badge/tests-node--test-blueviolet?style=for-the-badge)
![License: MIT](https://img.shields.io/badge/license-MIT-green?style=for-the-badge)

Plataforma full-stack desenvolvida em **Node.js + Express + SQLite**, com front-end web responsivo pronto para empacotamento em Electron. O sistema foi projetado para **gestão operacional de influenciadoras**: cadastro completo, agendamento de roteiros, acompanhamento de stories e cálculo de comissões. O público-alvo são equipes de marketing e operações que precisam de um fluxo auditável, colaborativo e centralizado para suas campanhas recorrentes.

---

## 📚 Sumário

- [🚀 Visão Geral](#-visão-geral)
- [🧰 Tecnologias](#-tecnologias)
- [🖥️ Pré-requisitos](#️-pré-requisitos)
- [⚙️ Instalação](#️-instalação)
- [▶️ Execução e Uso](#️-execução-e-uso)
- [🗂️ Estrutura de Pastas](#️-estrutura-de-pastas)
- [📊 Fluxos Principais](#-fluxos-principais)
  - [Master (Admin)](#master-admin)
  - [Influenciadora](#influenciadora)
- [🗺️ Roadmap](#️-roadmap)
- [🤝 Contribuição](#-contribuição)
- [📄 Licença](#-licença)
- [📎 Recursos Complementares](#-recursos-complementares)

---

## 🚀 Visão Geral

O HidraPink centraliza toda a jornada operacional de uma campanha de influência digital. Com ele é possível:

- Realizar onboarding de influenciadoras com controle de contratos e termos de aceite.
- Planejar e validar roteiros de conteúdo em ciclos mensais.
- Registrar submissões de stories, aprovações e ajustes diretamente na plataforma.
- Importar vendas via CSV, aplicar regras de pontuação e fechar comissões automaticamente.
- Oferecer painéis separados para **masters** (time de operações) e **influenciadoras** (usuárias finais).

A aplicação pode ser executada como servidor web (Express) ou embalada em um wrapper desktop (Electron) utilizando o front-end estático presente em `public/`.

---

## 🧰 Tecnologias

- 🟢 **Node.js 18+** — runtime e scripts CLI.
- ⚡ **Express 5** — camada HTTP, rotas REST e middlewares.
- 🗄️ **SQLite + better-sqlite3** — banco relacional embutido com WAL habilitado.
- 🔐 **jsonwebtoken & bcryptjs** — autenticação baseada em JWT e hashing seguro.
- 🎨 **HTML5, CSS3 e JavaScript** — front-end responsivo servido por arquivos estáticos.
- 🧪 **node:test & SuperTest** — testes automatizados de API.
- 🖥️ **Electron (opcional)** — empacotamento desktop do front-end para operação local.

---

## 🖥️ Pré-requisitos

Certifique-se de possuir os seguintes itens antes de iniciar:

- [Node.js](https://nodejs.org/) **18.0.0 ou superior**
- npm (instalado com o Node.js)
- Python 3.x (opcional, para scripts auxiliares em `scripts/`)
- Sistema operacional macOS, Linux ou Windows

---

## ⚙️ Instalação

```bash
# 1. Clonar o repositório
git clone https://github.com/Diego99025310/Teste.git
cd Teste

# 2. Instalar dependências
npm install

# 3. Configurar variáveis de ambiente
cp .env.example .env            # se disponível; caso contrário, crie um novo arquivo .env
```

Configurações importantes (arquivo `.env`):

| Variável             | Descrição                                                                 |
|----------------------|---------------------------------------------------------------------------|
| `DATABASE_PATH`      | Caminho para o arquivo SQLite (padrão `./database.sqlite`).               |
| `MASTER_EMAIL`       | Email do usuário master inicial.                                          |
| `MASTER_PASSWORD`    | Senha do usuário master inicial.                                          |
| `JWT_SECRET`         | Chave de assinatura dos tokens JWT.                                       |
| `JWT_EXPIRATION`     | Tempo de expiração (ex.: `1d`, `12h`).                                    |

---

## ▶️ Execução e Uso

```bash
# Executar em modo desenvolvimento
npm start

# Rodar testes automatizados
npm test
```

Durante o primeiro `npm start`, o servidor Express:

1. Inicializa/migra o banco SQLite, incluindo índices e dados padrão.
2. Garante a existência do usuário master com as credenciais definidas.
3. Publica o front-end estático em `http://localhost:3000`.

### Acesso rápido

1. Abra `http://localhost:3000` no navegador.
2. Realize login como **master** utilizando as credenciais do `.env`.
3. Cadastre influenciadoras manualmente ou importe um CSV.
4. Compartilhe o acesso com as influenciadoras para que planejem roteiros e submetam entregas.

### Exemplos de uso

- **Agendamento de roteiros**: masters criam roteiros reutilizáveis e disponibilizam para o ciclo corrente; influenciadoras selecionam datas e enviam para aprovação.
- **Importação de vendas**: painel master permite upload de relatórios Shopify (`orders_export.csv`) para cálculo de comissões em tempo real.
- **Dashboard pessoal**: cada influenciadora acompanha pontos, entregas validadas e histórico financeiro.

> ![Interface da dashboard (placeholder)](docs/img/dashboard-placeholder.png)

> ![Planner de roteiros (placeholder)](docs/img/planner-placeholder.png)

Para empacotar via Electron, utilize os arquivos em `public/` como front-end e configure um processo principal que consuma a API local (ex.: `http://localhost:3000`).

---

## 🗂️ Estrutura de Pastas

```text
├── public/                # Front-end responsivo (HTML, CSS e JS)
│   └── main.js            # Consumo da API e interações de UI
├── src/
│   ├── server.js          # Servidor Express, rotas REST e regras de negócio
│   ├── database.js        # Setup SQLite, migrações e transações
│   ├── config/
│   │   └── env.js         # Carregamento de variáveis de ambiente
│   ├── middlewares/       # Autenticação, autorização e aceite contratual
│   ├── routes/            # Fluxo de aceite e rotas segmentadas
│   └── utils/             # Funções utilitárias (hash, pontuação, multiplicadores)
├── scripts/               # Scripts auxiliares para CSVs e auditoria
├── docs/                  # Documentação operacional detalhada
├── tests/                 # Testes automatizados com node:test + SuperTest
├── data/                  # Artefatos de apoio (cupons válidos, templates)
├── package.json           # Dependências e scripts npm
└── README.md              # Guia técnico principal
```

---

## 📊 Fluxos Principais

### Master (Admin)

1. **Onboarding** — cadastra influenciadoras via formulário ou importação em massa (CSV) com validações de CPF, e-mail e cupom.
2. **Gestão contratual** — monitora termos de aceite e gera códigos de assinatura únicos por influenciadora.
3. **Curadoria de roteiros** — publica roteiros ativos por ciclo, configurando descrições, links e metas de entrega.
4. **Validação de stories** — avalia submissões, solicita ajustes e aprova entregas para liberar pontuação.
5. **Importação de vendas** — importa relatórios Shopify, associa SKUs a pontos e calcula comissões automaticamente.
6. **Fechamento mensal** — consolida multiplicadores, bônus e exporta relatórios financeiros por influenciadora.

### Influenciadora

1. **Primeiro acesso** — recebe credenciais, troca senha e aceita termos antes de acessar dashboards.
2. **Planner de roteiros** — agenda entregas nas datas sugeridas, atualiza agendamentos e acompanha status.
3. **Submissão de stories** — envia evidências (links, imagens) para aprovação do master.
4. **Painel de desempenho** — consulta pontos acumulados, vendas atribuídas ao cupom e histórico de comissões.
5. **Notificações e suporte** — visualiza pendências, solicita revisões e mantém comunicação com a equipe master.

---

## 🗺️ Roadmap

- [ ] Empacotamento oficial em Electron com auto-atualização.
- [ ] Integração com serviços de armazenamento de mídia (S3, Cloudinary).
- [ ] Notificações push via Firebase/OneSignal.
- [ ] Dashboard analítico com gráficos e exportação para BI.
- [ ] Integração nativa com plataformas de e-commerce além de Shopify.

---

## 🤝 Contribuição

1. Faça um fork deste repositório.
2. Crie uma branch de feature: `git checkout -b feature/minha-feature`.
3. Commit suas alterações: `git commit -m "feat: minha feature"`.
4. Faça push para a branch: `git push origin feature/minha-feature`.
5. Abra um Pull Request descrevendo as alterações e cenários de teste.

Siga o padrão de commits semânticos e garanta que os testes passem antes de enviar seu PR.

---

## 📄 Licença

Este projeto é distribuído sob a licença MIT. Você é livre para usar, clonar e adaptar conforme as condições descritas.

---

## 📎 Recursos Complementares

- [Guia de agendamento de roteiros](docs/INSTRUCOES_AGENDAMENTO_ROTEIROS.md.md)
- [Estrutura visual e estilos](estrutura-estilos.md)
- [Exemplo de exportação Shopify](orders_export.csv)
- [Dataset de pedidos validados](orders_valid.csv)
- [Scripts de apoio para CSV](scripts/)

Para dúvidas adicionais, abra uma issue ou entre em contato com o mantenedor.
