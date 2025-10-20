# Guia de Interface – Painel de Influenciadora

Este documento descreve a estrutura completa da página pública **`public/pinklovers-influencer.html`**, responsável por exibir o planejamento de stories da influenciadora, juntamente com o resumo do ciclo vigente.

## Estrutura Geral da Página

| Seção | Descrição | Elementos-chave |
| ----- | --------- | --------------- |
| **`<header>`** | Faixa superior com o título do painel e resumo textual. | Fundo sólido `#E4447A`, tipografia branca. |
| **Resumo do Ciclo (`#status`)** | Bloco com métricas do ciclo corrente apresentado em grade responsiva. | 6 métricas (período, multiplicador, dias planejados, dias validados, pendências e comissão). |
| **Alertas (`#alerts`)** | Lista dinâmica de mensagens importantes. | Cards laranja translúcidos destacando stories sem validação. |
| **Planejamento de Stories (`.planner-card`)** | Card principal com descrição do fluxo, CTA para o planejador completo e grade de agendamentos. | Botão redondo rosa “Abrir planejador de roteiros” e grade de cartões diários. |
| **Legenda de Status (`.plan-legend`)** | Apresenta a paleta das badges usadas nos agendamentos. | Pontos circulares com cores consistentes com as badges. |

### Layout Responsivo
- O corpo da página usa um **background em degradê** `linear-gradient(180deg, #FFE0EC 0%, #FFFFFF 100%)` e fonte `Outfit`/`Segoe UI`.
- `main` é delimitado por largura máxima de `1100px` e possui `display: grid` com espaçamento de `1.5rem`.
- A grade `.grid.two-columns` alterna para duas colunas a partir de `900px`, garantindo leitura confortável tanto em mobile quanto desktop.

## Cartões de Planejamento (`.plan-card`)
Cada agendamento é renderizado como um cartão translúcido com brilho radial suave.

```html
<article class="plan-card status-pendente">
  <header>
    <span class="plan-date">
      <strong>12</strong>
      <small>mar</small>
    </span>
    <span class="status-badge status-pendente">Pendente</span>
  </header>
  <h3>Story: Bastidores do recebidos</h3>
  <p>Explorar a caixa de recebidos destacando os produtos HidraPink.</p>
</article>
```

### Estilos Principais
- **Container**: degradê suave `linear-gradient(135deg, rgba(255,255,255,0.95), rgba(255,236,244,0.9))`, borda `1px` translúcida e `box-shadow` `0 18px 36px rgba(228, 68, 122, 0.12)`.
- **Brilho**: pseudo-elemento `::after` com `radial-gradient(circle, rgba(228, 68, 122, 0.22) 0%, rgba(228, 68, 122, 0) 65%)` que adiciona profundidade sem saturação excessiva.
- **Tipografia**: título (`h3`) em `#C72B60` e descrição com cor `rgba(55,65,81,0.75)`.

## Badges de Status

| Status interno | Rótulo exibido | Classe CSS | Cor de fundo | Cor do texto |
| -------------- | -------------- | ---------- | ------------ | ------------ |
| `validated` | **Validado** | `.status-validado` | `rgba(34, 197, 94, 0.15)` | `#166534` |
| `scheduled` | **Pendente** | `.status-pendente` | `rgba(250, 204, 21, 0.20)` | `#854D0E` |
| `posted` | **Em validação** | `.status-andamento` | `rgba(59, 130, 246, 0.20)` | `#1D4ED8` |
| `missed` | **Não entregue** | `.status-atrasado` | `rgba(248, 113, 113, 0.22)` | `#B91C1C` |

> Todas as badges compartilham a base `.status-badge`, que aplica `border-radius: 999px`, `padding` reduzido, `box-shadow` rosa suave e um **ponto indicador** (pseudo-elemento `::before`) usando `background: currentColor`.

A legenda fixa no fim da seção utiliza os mesmos códigos hexadecimais para reforçar a coerência visual.

## Lógica de Renderização

A camada de script no final da página é responsável por buscar os dados da API autenticada e montar o conteúdo dinamicamente.

1. Recupera o token salvo no `sessionStorage`. Na ausência, substitui o `body` por um aviso de login.
2. Define mapeamentos de status (`statusLabels`, `statusClasses`) e utilitários de formatação de datas.
3. `renderPlans()` constrói a grade a partir de `state.plans`, criando elementos DOM para cada agendamento.
4. `renderStatus(dashboard)` preenche os indicadores do ciclo, gera alertas e aciona `renderPlans()`.
5. `loadDashboard()` chama `GET /influencer/dashboard` com cabeçalhos autenticados e alimenta o estado.
6. Em caso de erro na requisição, exibe mensagem de falha em tela cheia.

### Estrutura de Dados Esperada

```json
{
  "cycle": {
    "cycle_month": "03",
    "cycle_year": "2024"
  },
  "progress": {
    "multiplier": 1.4,
    "multiplierLabel": "Multiplicador Prime",
    "plannedDays": 12,
    "validatedDays": 5,
    "pendingValidations": 3
  },
  "commission": {
    "total": 1325.50
  },
  "alerts": [
    { "date": "2024-03-10" }
  ],
  "plans": [
    {
      "scheduled_date": "2024-03-12",
      "status": "scheduled",
      "script_title": "Story: Bastidores do recebidos",
      "script_description": "Explorar a caixa de recebidos destacando os produtos HidraPink."
    }
  ]
}
```

## Fluxo de Navegação
- O botão **“Abrir planejador de roteiros”** leva para `influencer-plan.html`, onde acontece o agendamento completo.
- A mensagem auxiliar `#plan-helper-text` orienta a influenciadora a usar o planejador caso precise editar datas.
- Quando não há agendamentos, a grade recebe um *empty state* com texto em tom `muted` (`rgba(107, 114, 128, 0.85)`).

## Paleta de Cores Complementar

| Elemento | Cor | Hex / RGBA |
| -------- | --- | ----------- |
| Plano de fundo global | Rosa claro → branco | `linear-gradient(180deg, #FFE0EC 0%, #FFFFFF 100%)` |
| Cartões principais | Branco puro | `#FFFFFF` |
| Título das seções | Rosa vibrante | `#E4447A` |
| Texto auxiliar (`.muted`) | Cinza suave | `#6B7280` |
| Botão CTA | Rosa sólido | `#E4447A` (hover com sombra `rgba(228, 68, 122, 0.25)`) |
| Alertas | Laranja translúcido | `background: rgba(249, 115, 22, 0.15)` com borda esquerda `#F97316` |

## Boas Práticas de Implementação
- **Acessibilidade**: badges com texto em caixa alta e contraste reforçado; `aria-live="polite"` na grade para comunicar atualizações.
- **Fallbacks**: strings padrão quando scripts ou descrições não existem, prevenindo cartões vazios.
- **Modularidade**: mapeamentos de status centralizados (`statusLabels`/`statusClasses`) evitam divergências entre layout e legenda.

## Próximos Passos Sugeridos
1. Internacionalização da legenda e mensagens auxiliares.
2. Inclusão de filtros por status diretamente na grade.
3. Exportação dos agendamentos para PDF/PNG a partir deste layout visual.

