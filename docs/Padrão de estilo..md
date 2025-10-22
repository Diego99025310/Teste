Ótimo! Abaixo está uma estrutura inicial para o padrão frontend do HidraPink, já adaptado para responsividade e melhor práticas de mercado:

***

**1. Design Tokens (CSS custom properties no :root):**

```css
:root {
  /* Cores principais da marca */
  --color-primary: #e4447a;
  --color-secondary: #f07999;
  --color-background: #fbd3db;
  --color-white: #fff;
  --color-grey-light: #f5f5f5;
  --color-grey: #b0b0b0;
  --color-black: #222;
  --color-error: #d32f2f;
  --color-success: #388e3c;

  /* Tipografia */
  --font-title: 'Agency', Arial, sans-serif;
  --font-body: 'Qurova', Arial, sans-serif;

  /* Tamanhos */
  --fs-title: 2rem;
  --fs-subtitle: 1.25rem;
  --fs-body: 1rem;

  /* Espaçamento */
  --space-xs: 8px;
  --space-sm: 16px;
  --space-md: 24px;
  --space-lg: 32px;

  /* Bordas */
  --border-radius: 8px;
  --box-shadow: 0 2px 8px rgba(0,0,0,0.07);
}
```


***

**2. Estrutura base de componentes:**

*Exemplo de botões:*

```css
.button {
  font-family: var(--font-title);
  background: var(--color-primary);
  color: var(--color-white);
  border: none;
  border-radius: var(--border-radius);
  padding: var(--space-xs) var(--space-sm);
  font-size: var(--fs-body);
  cursor: pointer;
  box-shadow: var(--box-shadow);
  transition: background 0.2s;

  /* Responsivo */
  min-width: 120px;
}

.button:hover {
  background: var(--color-secondary);
}

/* Botão secundário */
.button-secondary {
  background: var(--color-white);
  color: var(--color-primary);
  border: 2px solid var(--color-primary);
}

.button:disabled,
.button-secondary:disabled {
  background: var(--color-grey-light);
  color: var(--color-grey);
  cursor: not-allowed;
}
```


***

*Exemplo de título principal:*

```css
h1, .title {
  font-family: var(--font-title);
  font-size: var(--fs-title);
  color: var(--color-primary);
  margin-bottom: var(--space-md);
}
```


***

**3. Layout responsivo - Mobile First**

```css
body {
  font-family: var(--font-body);
  background: var(--color-background);
  color: var(--color-black);
  margin: 0;
  padding: var(--space-sm);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--space-sm);
}

@media (max-width: 900px) {
  .container { padding: var(--space-xs); }
  h1, .title { font-size: 1.5rem; }
  .button { min-width: 100px; padding: var(--space-xs); }
}

@media (max-width: 600px) {
  h1, .title { font-size: 1.2rem; }
  .container { padding: var(--space-xs); }
  .button { font-size: 0.95rem; min-width: 90px; }
}
```


***

**4. Componentização sugestão:**

- Cards, inputs, navbar, modal, etc. devem seguir o padrão de fontes, cores, espaçamentos e bordas acima.
- Recomendo criar um arquivo `base.css`, importar em todas páginas e sempre usar classes ou variáveis.
- Para ícones: Material Icons ou SVGs da cor principal.

***

**5. Orientações gerais:**

- Estruture HTML semântico (header, nav, main, section, etc.).
- Organize o CSS por tokens, componentes e utilitários.
- Documente cada padrão em um guia visual.
- Priorize acessibilidade: contraste de cores, navegação por teclado, labels acessíveis.

***
