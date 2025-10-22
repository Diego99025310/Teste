# Arquitetura de estilos – HidraPink Influenciadoras

## Visão geral
Este documento explica como as páginas HTML da área de influenciadoras da HidraPink utilizam os arquivos de estilo disponíveis no diretório `public/`. O objetivo é orientar o onboarding sobre quais folhas de estilo são carregadas em cada página, qual escopo cada uma cobre e quais impactos essa arquitetura traz para manutenção, performance e organização do projeto.

## Mapa de páginas HTML × folhas de estilo
| Página | Folhas de estilo carregadas | Observações de implementação |
| --- | --- | --- |
| `public/influencer.html` | Nenhum `<link>` externo; os estilos ficam num bloco `<style>` inline na própria página. | Define tokens, layout e componentes diretamente no documento, sem reutilizar CSS externo. |
| `public/pinklovers-influencer.html` | `/style.css` + `/styles/pinklovers-influencer.css` | Usa a folha global para tokens/base do design system e uma folha específica para o painel Pinklovers. |
| `public/influencer-plan.html` | `/styles/plan.css` | Página do planejador; todo o layout e componentes vêm dessa folha dedicada. |
| `public/influencer-performance.html` | `/styles/plan.css` + `/styles/influencer-performance.css` | Reaproveita o layout do planejador e aplica uma camada adicional focada em métricas de desempenho. |

## Papéis dos arquivos de estilo
### `public/style.css`
Folha global com tokens de marca, reset básico, tipografia e componentes reutilizáveis (botões, inputs, estados). Serve como fundação visual para páginas que pertencem ao "núcleo" do painel e prescreve o look&feel padrão.【F:public/style.css†L1-L116】

### `public/styles/pinklovers-influencer.css`
Especializada para o painel Pinklovers. Redefine variáveis de cor, plano de fundo e componentes (`.page-hero`, `.card`, `.primary-button`, etc.) para criar uma experiência diferenciada, mantendo algumas convenções (grid, cards) próprias da marca.【F:public/styles/pinklovers-influencer.css†L1-L116】

### `public/styles/plan.css`
Base compartilhada entre o planejador e o painel de desempenho. Define layout estrutural (`.container`, `.header`, `.filters`), componentes de cartão/listagem e o tratamento visual de botões e filtros. Ao centralizar esse CSS, as telas que tratam de planejamento e acompanhamento herdam um vocabulário visual único.【F:public/styles/plan.css†L1-L122】

### `public/styles/influencer-performance.css`
Extensão que assume que `plan.css` já foi carregado. Trabalha com `body[data-page='influencer-performance']` para alterar o cenário visual (gradiente de fundo, espaçamento) e introduz componentes de métricas e tabelas sem duplicar o cabeçalho nem controles herdados da folha-base.【F:public/styles/influencer-performance.css†L1-L80】

## Relação entre páginas e estilos
- **Painel raiz da influenciadora (`influencer.html`)** usa somente CSS inline. Ele declara variáveis e estilos completos dentro do documento, o que o torna independente, porém isola tokens e componentes que poderiam ser compartilhados.【F:public/influencer.html†L7-L104】
- **Painel Pinklovers (`pinklovers-influencer.html`)** carrega primeiro a base global (`style.css`) e, em seguida, a camada temática Pinklovers. Isso permite herdar tokens e resets sem duplicação, enquanto a folha específica refina o layout para essa experiência.【F:public/pinklovers-influencer.html†L7-L23】
- **Planejamento (`influencer-plan.html`)** aponta exclusivamente para `plan.css`. A folha já inclui resets e componentes necessários para o fluxo de agendamento, sem depender do estilo global. A página também reutiliza elementos (header, botões) com as classes fornecidas por `plan.css`.【F:public/influencer-plan.html†L4-L37】【F:public/styles/plan.css†L23-L68】
- **Desempenho (`influencer-performance.html`)** começa compartilhando `plan.css` (para cabeçalho, botões e estrutura) e aplica `influencer-performance.css` para estilizar métricas, tabelas e o fundo temático. Também importa a família tipográfica via Google Fonts, diferenciando a leitura desta tela.【F:public/influencer-performance.html†L11-L49】

## Impactos em manutenção, performance e organização
- **Reutilização vs. isolamento**: O uso exclusivo de CSS inline em `influencer.html` facilita ajustes rápidos, mas dificulta reutilização de tokens/componentes e aumenta o risco de inconsistências visuais em relação às demais telas. Mover esses estilos para uma folha compartilhada tornaria a manutenção mais previsível.【F:public/influencer.html†L7-L104】
- **Escopos claros**: `plan.css` serve como camada compartilhada para fluxos operacionais (planejamento + desempenho), reduzindo duplicação e simplificando a manutenção desses fluxos. A extensão por `influencer-performance.css` mantém o núcleo estável enquanto habilita personalizações locais.【F:public/styles/plan.css†L23-L104】【F:public/styles/influencer-performance.css†L5-L60】
- **Camada global opcional**: Apenas o painel Pinklovers consome `style.css`. Caso novas páginas do núcleo precisem da identidade padrão, centralizar tokens nesse arquivo e garantir que as páginas o importem evitará divergências e facilitará evoluções globais (ex.: nova tipografia).【F:public/pinklovers-influencer.html†L7-L23】【F:public/style.css†L1-L116】
- **Performance**: Carregar múltiplas folhas específicas mantém o payload enxuto por página (cada tela baixa apenas o necessário). Entretanto, `style.css` usa `@import` para fontes externas, o que adiciona uma requisição adicional — migrar para `<link rel="preconnect">`/`<link rel="stylesheet">` como em `influencer-performance.html` pode melhorar o carregamento.【F:public/style.css†L1-L4】【F:public/influencer-performance.html†L11-L18】

## Diagnóstico de carregamento
- ✅ `pinklovers-influencer.html` referencia tanto o estilo global quanto o específico, garantindo consistência com o design system e a identidade Pinklovers.【F:public/pinklovers-influencer.html†L7-L23】
- ✅ `influencer-plan.html` importa corretamente `plan.css`, que cobre todo o layout da página do planejador.【F:public/influencer-plan.html†L4-L37】
- ✅ `influencer-performance.html` carrega `plan.css` antes da extensão `influencer-performance.css`, preservando a hierarquia esperada entre base compartilhada e ajustes da página.【F:public/influencer-performance.html†L17-L47】
- ⚠️ `influencer.html` não consome nenhuma folha externa; se a intenção for alinhá-lo ao design system ou compartilhar tokens com outras telas, é recomendável extrair o bloco inline para um CSS dedicado e referenciá-lo via `<link>`.【F:public/influencer.html†L7-L104】

## Recomendações rápidas de evolução
1. Extrair o bloco `<style>` de `influencer.html` para um arquivo (ex.: `styles/influencer.css`) para favorecer reutilização e cache.
2. Avaliar se `style.css` deveria ser consumido por outras telas do painel para centralizar tokens e comportamentos globais.
3. Considerar substituir o `@import` de fontes por `<link>`s no HTML para reduzir o tempo de bloqueio no carregamento.
