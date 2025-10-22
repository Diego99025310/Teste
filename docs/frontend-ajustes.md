# Ajustes estruturais no frontend

Esta rodada implementa a consolidação de layout, tokens de design e semântica em todo o conjunto de páginas HTML públicas.

## Layout e semântica
- Todos os painéis agora encapsulam o conteúdo principal em `<main id="conteudo-principal">`, facilitando navegação assistiva e o uso de landmarks.
- As grades de atalhos de ação foram promovidas a `<nav aria-label="…">`, refletindo a função de navegação e eliminando estilos inline repetidos.
- Botões e tabelas adjacentes passaram a usar utilitários (`.page-toolbar`, `.spaced-above-*`, `.section-nav`) para espaçamento consistente em vez de atributos `style` específicos.

## Unificação de estilos
- O arquivo `public/style.css` recebeu novos utilitários de espaçamento, layout e tokens de espaçamento (`--space-*`), além de classes compartilhadas para barras de ação.
- As páginas `master`, `login` e `index` foram atualizadas para usar o mesmo contêiner base, garantindo margens e sombras uniformes.
- Páginas especializadas (influencer e Pinklovers) migraram seus estilos inline para folhas dedicadas (`styles/influencer-dashboard.css`, `styles/pinklovers-master.css`) com escopo por `data-page`, evitando colisões globais.
- Os estilos preexistentes de `plan.css` e `influencer-performance.css` passaram a herdar `var(--font-base)`, alinhando tipografia com o tema principal.

## Ajustes específicos por área
- **Painel Master**: links rápidos e toolbars convertidos para componentes reutilizáveis; todos os cards removem margens inline e utilizam utilitários de espaçamento.
- **Painel Influenciadora**: o CSS inline foi extraído para `styles/influencer-dashboard.css`, preservando gradientes, cards e contadores e permitindo reaproveitamento de tokens de cor.
- **Fluxo de planejamento e desempenho**: inclusão do `style.css` base para compartilhar tokens e padronização de scripts relativos (`main.js`, `scripts/plan.js`).
- **Pinklovers**: ambos os dashboards agora usam `data-page` dedicado, carregam apenas `style.css` mais a folha específica e eliminam estilos inline; o botão de fechamento de ciclo utiliza o utilitário `.spaced-above-md`.

## Organização e acessibilidade
- Scripts que dependiam de caminhos absolutos (`/main.js`) foram normalizados para referências relativas, simplificando deploys em subdiretórios.
- Elementos de navegação receberam rótulos ARIA explícitos, reforçando acessibilidade para leitores de tela.
- A nova documentação captura o conjunto de ajustes para referência futura.

